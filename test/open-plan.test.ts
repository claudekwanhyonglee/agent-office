import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import type { AgentRecord, OfficeState } from '../src/shared/agent.ts';
import { OfficeController, INITIAL_PODS, type OfficeEvent } from '../src/client/controller.ts';
import { DESKS_PER_POD, PODS_PER_ROW, DOOR, arrivalPath, departurePath, seatLayout, type SeatSpot } from '../src/client/layout.ts';
import { buildOffice } from '../src/client/office.ts';
import { Character } from '../src/client/character.ts';
import { lookFor } from '../src/client/look.ts';
import { POSES } from '../src/client/poses.ts';
import { collisions, inside, obstaclesIn, type Obstacle } from './geometry.ts';

const rec = (n: number, state: OfficeState = 'working'): AgentRecord => ({
  id: `a${n}`, sessionId: `session-${n}`, name: `agent ${n}`, project: 'demo-app',
  cwd: '/home/alex/projects/demo-app', state, lastMessage: null, branch: null,
});
const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => rec(from + i));
const ofType = <T extends OfficeEvent['type']>(events: OfficeEvent[], type: T) =>
  events.filter((e): e is Extract<OfficeEvent, { type: T }> => e.type === type);

/** The agent's own chair: the last hop into it (and the first hop out) lands inside its footprint. */
function ownChair(seat: SeatSpot, obstacles: Obstacle[]) {
  return obstacles.find((o) => o.kind === 'chair' && inside(seat.sit, o.box, 0))!.object;
}

describe('#13 AC1 desk pods in a grid', () => {
  it('#13 AC1 pods of 4 desks, 2 facing 2, back to back', () => {
    const seats = seatLayout(INITIAL_PODS);
    expect(DESKS_PER_POD).toBe(4);
    for (let pod = 0; pod < INITIAL_PODS; pod++) {
      const desks = seats.slice(pod * 4, pod * 4 + 4);
      const back = desks.filter((s) => s.facing === 1), front = desks.filter((s) => s.facing === -1);
      expect(back).toHaveLength(2);
      expect(front).toHaveLength(2);
      // Facing each other: same x pairs, front desks just in front of the back desks.
      expect(back.map((s) => s.x).sort()).toEqual(front.map((s) => s.x).sort());
      expect(front[0].deskZ - back[0].deskZ).toBeLessThan(1);
      expect(front[0].deskZ).toBeGreaterThan(back[0].deskZ);
    }
  });

  it('#13 AC1 pods sit in a grid of rows and columns with walkways between them', () => {
    const { group } = buildOffice(6);
    group.updateMatrixWorld(true);
    const pods = group.children.filter((c) => c.userData.kind === 'pod').map((p) => new THREE.Box3().setFromObject(p));
    expect(pods).toHaveLength(6);
    const xs = new Set(pods.map((b) => b.getCenter(new THREE.Vector3()).x.toFixed(2)));
    const zs = new Set(pods.map((b) => b.getCenter(new THREE.Vector3()).z.toFixed(2)));
    expect([xs.size, zs.size]).toEqual([PODS_PER_ROW, 3]);
    for (let i = 0; i < pods.length; i++) {
      for (let j = i + 1; j < pods.length; j++) {
        const a = pods[i], b = pods[j];
        const gap = Math.max(b.min.x - a.max.x, a.min.x - b.max.x, b.min.z - a.max.z, a.min.z - b.max.z);
        expect(gap, `pods ${i} and ${j}`).toBeGreaterThanOrEqual(1.0);
      }
    }
  });

  it('#13 AC1 seats at least 16 agents before growing, then grows by a whole pod row', () => {
    const c = new OfficeController();
    c.update(range(1, 16));
    expect(c.podCount).toBe(INITIAL_PODS);
    expect(INITIAL_PODS * DESKS_PER_POD).toBeGreaterThanOrEqual(16);
    const events = c.update(range(1, 17));
    expect(c.podCount).toBe(INITIAL_PODS + PODS_PER_ROW);
    expect(ofType(events, 'pods')).toEqual([{ type: 'pods', count: INITIAL_PODS + PODS_PER_ROW }]);
    expect(c.agents.get('session-17')!.seat.index).toBe(16);
    const seats = seatLayout(INITIAL_PODS + PODS_PER_ROW);
    expect(seats[16].deskZ).toBeGreaterThan(Math.max(...seatLayout(INITIAL_PODS).map((s) => s.deskZ)));
  });
});

describe('#13 AC2 routes avoid furniture', () => {
  for (const podCount of [INITIAL_PODS, INITIAL_PODS + PODS_PER_ROW]) {
    it(`#13 AC2 every seat's arrival and departure routes miss every desk, chair and decor piece (${podCount} pods)`, () => {
      const { group, seats } = buildOffice(podCount);
      const obstacles = obstaclesIn(group);
      expect(obstacles.filter((o) => o.kind === 'desk')).toHaveLength(podCount * DESKS_PER_POD);
      for (const seat of seats) {
        const chair = ownChair(seat, obstacles);
        const arrive = arrivalPath(seat), depart = departurePath(seat);
        // Only the hop between the approach spot and the seat may enter the agent's own chair.
        expect(collisions(arrive, obstacles, (i) => new Set(i === arrive.length - 2 ? [chair] : [])), `arrive seat ${seat.index}`).toEqual([]);
        expect(collisions(depart, obstacles, (i) => new Set(i === 0 ? [chair] : [])), `depart seat ${seat.index}`).toEqual([]);
      }
    });
  }

  it('#13 AC2 the checker does catch a route through a desk', () => {
    const { group, seats } = buildOffice(INITIAL_PODS);
    const seat = seats[0];
    expect(collisions([{ x: seat.x, z: seat.deskZ - 2 }, { x: seat.x, z: seat.deskZ + 2 }], obstaclesIn(group))).not.toEqual([]);
  });
});

describe('#13 AC3 zones and props', () => {
  const kindsUnder = (root: THREE.Object3D) => {
    const kinds: string[] = [];
    root.traverse((o) => { if (o.userData.kind) kinds.push(o.userData.kind); });
    return kinds;
  };
  const find = (root: THREE.Object3D, kind: string) => {
    const found: THREE.Object3D[] = [];
    root.traverse((o) => { if (o.userData.kind === kind) found.push(o); });
    return found;
  };

  it('#13 AC3 has a glass-walled meeting room with a table, a lounge with sofa and rug, and a kitchen', () => {
    const { group } = buildOffice(INITIAL_PODS);
    const [meeting] = find(group, 'meeting-room');
    expect(kindsUnder(meeting)).toEqual(expect.arrayContaining(['glass-wall', 'meeting-table']));
    const glass = find(meeting, 'glass-wall')[0] as THREE.Mesh;
    expect((glass.material as THREE.Material).transparent).toBe(true);
    const [lounge] = find(group, 'lounge');
    expect(kindsUnder(lounge)).toEqual(expect.arrayContaining(['sofa', 'rug']));
    expect(find(group, 'kitchen')).toHaveLength(1);
  });

  it('#13 AC3 has a whiteboard, a bookshelf, wall art and at least 8 plants', () => {
    const { group } = buildOffice(INITIAL_PODS);
    for (const kind of ['whiteboard', 'bookshelf', 'wall-art']) expect(find(group, kind).length, kind).toBeGreaterThan(0);
    expect(find(group, 'plant').length).toBeGreaterThanOrEqual(8);
  });

  it('#13 AC3 decor pieces stay on the floor and do not overlap desks or each other', () => {
    const { group } = buildOffice(INITIAL_PODS + PODS_PER_ROW);
    group.updateMatrixWorld(true);
    const floor = new THREE.Box3().setFromObject(find(group, 'floor')[0]);
    const standing = obstaclesIn(group).filter((o) => !['wall', 'window', 'wall-art', 'glass-wall', 'monitor'].includes(o.kind));
    for (const o of standing) {
      expect(o.box.min.x >= floor.min.x - 0.01 && o.box.max.x <= floor.max.x + 0.01, `${o.kind} x`).toBe(true);
      expect(o.box.min.z >= floor.min.z - 0.01 && o.box.max.z <= floor.max.z + 0.01, `${o.kind} z`).toBe(true);
    }
    const desks = standing.filter((o) => o.kind === 'desk' || o.kind === 'chair');
    const decor = standing.filter((o) => o.kind !== 'desk' && o.kind !== 'chair');
    for (const d of decor) for (const k of desks) expect(d.box.intersectsBox(k.box), `${d.kind} vs ${k.kind}`).toBe(false);
  });
});

describe('#13 AC4 agents in the new layout', () => {
  const run = (character: Character, until: () => boolean) => {
    for (let t = 0; t < 60 && !until(); t += 0.05) character.update(t, 0.05);
  };

  it('#13 AC4 walk in from the door, sit, change pose and bubble, and walk out on Got it, at any desk', () => {
    const c = new OfficeController();
    c.update([]);
    const events = c.update(range(1, 17));
    for (const arrive of ofType(events, 'arrive').filter((_, i) => [0, 7, 15, 16].includes(i))) {
      expect(arrive.walk).toBe(true);
      expect(arrive.path[0]).toEqual(DOOR);
      const character = new Character(lookFor(arrive.key));
      character.arrive(arrive.seat, 'working', arrive.path);
      run(character, () => character.mode === 'seated');
      expect(character.mode).toBe('seated');
      expect(character.root.position.x).toBeCloseTo(arrive.seat.sit.x);
      expect(character.root.position.z).toBeCloseTo(arrive.seat.sit.z);

      character.setState('needs');
      character.update(100, 0.016);
      expect([character.pose, character.bubbleKind]).toEqual([POSES.needs.pose, POSES.needs.bubble]);
      character.setState('finished');
      run(character, () => character.mode === 'standing');
      expect([character.pose, character.bubbleKind]).toEqual(['standing', 'finished']);

      character.leave(departurePath(arrive.seat));
      run(character, () => character.mode === 'gone');
      expect(character.mode).toBe('gone');
      expect(Math.hypot(character.root.position.x - DOOR.x, character.root.position.z - DOOR.z)).toBeLessThan(0.6);
    }
  });
});
