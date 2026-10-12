import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { INITIAL_ROWS, officeLayout, yawTowards } from '../src/client/layout.ts';
import { buildOffice } from '../src/client/office.ts';
import { Character } from '../src/client/character.ts';
import { lookFor } from '../src/client/look.ts';
import { distance, key, ofType, office } from './office-sim.ts';

const n = (k: string) => Number(k.replace('session-', ''));

/** Agents 1..idle are idle (settled at hangout places); the rest work at their desks. */
function withIdle(idle: number, total: number, seed = 3) {
  const o = office(total, seed);
  for (let i = 1; i <= idle; i++) o.set(i, 'done');
  o.run(15);
  for (let i = 0; i < 400 && [...o.c.agents.values()].some((a) => a.arrivesAt > o.clock.t); i++) o.run(0.25);
  return o;
}
/** Boxes around each visible mesh of a character, from its own vertices (not its children's). */
function meshBoxes(root: THREE.Object3D) {
  root.updateMatrixWorld(true);
  const boxes: THREE.Box3[] = [];
  root.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    for (let p: THREE.Object3D | null = o; p; p = p.parent) if (!p.visible) return;
    const box = new THREE.Box3(), v = new THREE.Vector3(), position = o.geometry.getAttribute('position');
    for (let i = 0; i < position.count; i++) box.expandByPoint(v.fromBufferAttribute(position, i).applyMatrix4(o.matrixWorld));
    boxes.push(box);
  });
  return boxes;
}
/** Whether a sphere touches any solid mesh of `piece`, each tested in its own (rotated) frame. */
function touches(piece: THREE.Object3D, sphere: THREE.Sphere) {
  let hit = false;
  piece.updateMatrixWorld(true);
  piece.traverse((o) => {
    if (hit || !(o instanceof THREE.Mesh) || (o.material as THREE.Material).side === THREE.BackSide) return;
    o.geometry.computeBoundingBox();
    const scale = o.getWorldScale(new THREE.Vector3());
    const local = o.worldToLocal(sphere.center.clone());
    hit = o.geometry.boundingBox!.intersectsSphere(new THREE.Sphere(local, sphere.radius / Math.max(scale.x, scale.y, scale.z)));
  });
  return hit;
}

/** A character as spheres: head (with room for a hat), torso and hands. */
function blobs(c: Character) {
  const torso = c.pivot.children[0];
  return [
    new THREE.Sphere(c.head.getWorldPosition(new THREE.Vector3()), 0.38 + 0.1),
    ...[-0.25, 0, 0.25].map((y) => new THREE.Sphere(torso.localToWorld(new THREE.Vector3(0, y, 0)), 0.36)),
    ...c.hands.map((h) => new THREE.Sphere(h.getWorldPosition(new THREE.Vector3()), 0.13)),
  ];
}
const watchersOf = (o: ReturnType<typeof office>, target: string) =>
  [...o.c.agents].filter(([, a]) => a.reaction?.kind === 'watch' && a.reaction.target === target).map(([k]) => k);

describe('#67 at most one onlooker behind a desk', () => {
  it('#67 AC1 at most one idle agent watches over a given agent\'s shoulder at any time', () => {
    for (const seed of [3, 4, 5]) {
      const o = withIdle(6, 9, seed);
      o.set(7, 'needs');
      o.set(8, 'needs');
      o.run(10 * 60, 0.25, () => {
        for (const target of [key(7), key(8)]) expect(watchersOf(o, target).length, `seed ${seed}`).toBeLessThanOrEqual(1);
      });
      expect(watchersOf(o, key(7)).length + watchersOf(o, key(8)).length).toBeGreaterThan(0);
    }
  });

  it('#67 AC2 while the onlooker is there, no other idle agent is sent to watch that desk; they do other things', () => {
    const o = withIdle(6, 8);
    const first = ofType(o.set(8, 'needs'), 'walk').filter((w) => w.place?.spot === 'over-the-shoulder');
    expect(first).toHaveLength(1);
    const later = o.run(10 * 60);
    const walks = ofType(later, 'walk');
    expect(walks.filter((w) => w.place?.spot === 'over-the-shoulder')).toEqual([]);
    expect(walks.filter((w) => w.key !== first[0].key && w.place).length, 'the others go elsewhere').toBeGreaterThan(5);
  });

  it('#67 AC3 the onlooker stands behind and to one side of the chair, clear of the sitter, chair, desk and neighbours, facing the screen', () => {
    {
      const layout = officeLayout(INITIAL_ROWS);
      const { group } = buildOffice(INITIAL_ROWS);
      group.updateMatrixWorld(true);
      const o = withIdle(1, layout.seats.length);
      for (const seat of layout.seats) {
        const target = [...o.c.agents].find(([, a]) => a.seat.index === seat.index)!;
        if (n(target[0]) === 1) continue; // the idle one
        const events = o.set(n(target[0]), 'needs');
        o.set(n(target[0]), 'stale'); // no errand follows, so the idle agent is free for the next seat
        o.run(1);
        const [walk] = ofType(events, 'walk').filter((w) => w.place?.spot === 'over-the-shoulder');
        const p = walk.place!;
        const back = { x: -Math.sin(seat.yaw), z: -Math.cos(seat.yaw) }, side = { x: Math.cos(seat.yaw), z: -Math.sin(seat.yaw) };
        const rel = { x: p.x - seat.chair.x, z: p.z - seat.chair.z };
        expect(rel.x * back.x + rel.z * back.z, `seat ${seat.index}: behind`).toBeGreaterThan(0.3);
        expect(Math.abs(Math.abs(rel.x * side.x + rel.z * side.z) - 0.5), `seat ${seat.index}: about 0.5 m to the side`).toBeLessThan(0.1);
        expect(distance(p, seat.sit) - 0.36, `seat ${seat.index}: clear of the sitter`).toBeGreaterThanOrEqual(0.6);
        expect(p.yaw).toBeCloseTo(yawTowards(p, seat.desk), 9);
        // The onlooker's body overlaps no chair, desk or monitor, its own or a neighbour's.
        const onlooker = new Character(lookFor(walk.key));
        onlooker.placeAt(seat, 'done', p);
        onlooker.update(0, 0.016);
        onlooker.root.updateMatrixWorld(true);
        const body = blobs(onlooker);
        group.traverse((obj) => {
          if (!['chair', 'desk', 'monitor'].includes(obj.userData.kind)) return;
          const hit = body.findIndex((x) => touches(obj, x));
          expect(hit, `seat ${seat.index} vs a ${obj.userData.kind} (part ${hit})`).toBe(-1);
        });
        const others = layout.seats.filter((s) => s !== seat).map((s) => s.standSpot);
        for (const s of others) expect(distance(p, s), `seat ${seat.index}: a neighbour's stand spot`).toBeGreaterThan(0.8);
      }
    }
  });

  it('#67 AC3 in the watching pose, the onlooker doesn\'t reach the seated agent', () => {
    const o = withIdle(1, 3);
    const events = o.set(3, 'needs');
    const [walk] = ofType(events, 'walk').filter((w) => w.place?.spot === 'over-the-shoulder');
    const seat = o.c.agents.get(key(3))!.seat;
    const onlooker = new Character(lookFor(walk.key)), sitter = new Character(lookFor(key(3)));
    onlooker.placeAt(seat, 'done', walk.place!);
    sitter.sitAt(seat, 'needs');
    for (let t = 0; t < 5; t += 0.1) {
      onlooker.update(t, 0.1);
      sitter.update(t, 0.1);
      onlooker.root.updateMatrixWorld(true);
      sitter.root.updateMatrixWorld(true);
      // None of the onlooker's head, torso or hands touch the sitter's.
      const a = blobs(onlooker), b = blobs(sitter);
      expect(a.some((x) => b.some((y) => x.intersectsSphere(y))), `t=${t.toFixed(1)}`).toBe(false);
    }
  });

  it('#67 AC4 if the onlooker goes back to work while the agent still needs you, one other idle agent takes its place', () => {
    const o = withIdle(4, 6);
    const [first] = ofType(o.set(6, 'needs'), 'walk').filter((w) => w.place?.spot === 'over-the-shoulder');
    o.run(5);
    const events = o.set(n(first.key), 'working');
    const replacement = ofType(events, 'walk').filter((w) => w.place?.spot === 'over-the-shoulder');
    expect(replacement).toHaveLength(1);
    expect(replacement[0].key).not.toBe(first.key);
    expect(watchersOf(o, key(6))).toEqual([replacement[0].key]);
  });

  it('#67 AC4 no replacement once the agent no longer needs you', () => {
    const o = withIdle(4, 6);
    const [first] = ofType(o.set(6, 'needs'), 'walk').filter((w) => w.place?.spot === 'over-the-shoulder');
    o.set(6, 'working');
    o.run(5);
    expect(ofType(o.set(n(first.key), 'working'), 'walk').filter((w) => w.place?.spot === 'over-the-shoulder')).toEqual([]);
  });
});
