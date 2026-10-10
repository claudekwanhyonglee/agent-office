import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import type { AgentRecord, OfficeState } from '../src/shared/agent.ts';
import { OfficeController } from '../src/client/controller.ts';
import { INITIAL_ROWS } from '../src/client/layout.ts';
import { SCREEN_OFF, buildOffice, updateScreens } from '../src/client/office.ts';
import { paintScreen, screenContent } from '../src/client/screen.ts';
import { frameFloor, initialOrbit, placeCamera } from '../src/client/camera.ts';

const rec = (n: number, state: OfficeState = 'working', extra: Partial<AgentRecord> = {}): AgentRecord => ({
  id: `a${n}`, sessionId: `session-${n}`, name: `agent ${n}`, project: 'demo-app',
  cwd: '/home/alex/projects/demo-app', state, lastMessage: null, branch: null, activity: [], ...extra,
});
const ACTIVITY = ['Read src/client/card.ts', 'Edit src/client/markdown.ts', 'Bash npm test', 'Grep "escapeHtml" src'];

/** A 2D context that records the text drawn on it. */
function recorder() {
  const texts: string[] = [];
  const g = new Proxy({} as Record<string, unknown>, {
    get: (target, key) => {
      if (key === 'fillText') return (text: string) => texts.push(text);
      if (key === 'measureText') return (text: string) => ({ width: text.length * 8 });
      if (key in target) return target[key as string];
      return () => undefined;
    },
    set: (target, key, value) => { target[key as string] = value; return true; },
  }) as unknown as CanvasRenderingContext2D;
  return { g, texts, all: () => texts.join(' ') };
}

/** World-space forward of a seat: from the chair towards the desk, the front of the room. */
const forwardOf = (seat: { yaw: number }) => new THREE.Vector3(Math.sin(seat.yaw), 0, Math.cos(seat.yaw));
const kindsUnder = (root: THREE.Object3D, kind: string) => {
  const found: THREE.Object3D[] = [];
  root.traverse((o) => { if (o.userData.kind === kind) found.push(o); });
  return found;
};

// #38 replaced #27's see-through panes (turned to face the camera) with fixed, solid monitors.
describe('#38 AC1 a solid monitor on every desk, facing the front', () => {
  it('#38 AC1 every desk has one dark monitor with a stand, on the camera side of the desk', () => {
    const { group, seats } = buildOffice(INITIAL_ROWS);
    group.updateMatrixWorld(true);
    expect(kindsUnder(group, 'monitor')).toHaveLength(seats.length);
    for (const seat of seats) {
      const monitor = seat.screen.root;
      expect(monitor.userData.kind).toBe('monitor');
      const pos = seat.screen.display.getWorldPosition(new THREE.Vector3());
      const ahead = new THREE.Vector3(pos.x - seat.desk.x, 0, pos.z - seat.desk.z).dot(forwardOf(seat));
      expect(ahead, `seat ${seat.index} on the camera side`).toBeGreaterThan(0.1);
      expect(ahead, `seat ${seat.index} on the desk`).toBeLessThan(0.35);
      const solids = monitor.children.filter((c): c is THREE.Mesh => c instanceof THREE.Mesh && c !== seat.screen.display);
      expect(solids.length, 'body and stand').toBeGreaterThanOrEqual(2);
      for (const m of solids) expect((m.material as THREE.MeshToonMaterial).color.getHSL({ h: 0, s: 0, l: 0 }).l).toBeLessThan(0.35);
    }
  });

  it('#38 AC1 the screen faces the front of the room, the same way as the desk', () => {
    const { group, seats } = buildOffice(INITIAL_ROWS);
    group.updateMatrixWorld(true);
    for (const seat of seats) {
      const normal = new THREE.Vector3(0, 0, 1).transformDirection(seat.screen.display.matrixWorld);
      expect(normal.dot(forwardOf(seat)), `seat ${seat.index}`).toBeGreaterThan(0.99);
    }
  });

  it('#38 AC1 monitors stay fixed when the camera moves', () => {
    const { group, seats } = buildOffice(INITIAL_ROWS);
    const occupants = new Map(seats.map((s) => [s.index, rec(s.index, 'working', { activity: ACTIVITY })]));
    const camera = new THREE.PerspectiveCamera(34, 1.6, 0.1, 150);
    const before: THREE.Matrix4[] = [];
    for (const [i, theta] of [0.22, 2.5, -2].entries()) {
      placeCamera(camera, { ...initialOrbit(), theta });
      updateScreens(seats, occupants, i);
      group.updateMatrixWorld(true);
      seats.forEach((s, n) => {
        if (i === 0) before[n] = s.screen.display.matrixWorld.clone();
        else expect(s.screen.display.matrixWorld.equals(before[n]), `seat ${n}, theta ${theta}`).toBe(true);
      });
    }
  });

  it('#38 AC1 the screen is opaque, and there is no holo pane or projector', () => {
    const { seats } = buildOffice(INITIAL_ROWS);
    updateScreens(seats, new Map([[0, rec(0, 'working', { activity: ACTIVITY })]]), 0);
    for (const seat of seats) {
      seat.screen.root.traverse((o) => {
        if (!(o instanceof THREE.Mesh)) return;
        const material = o.material as THREE.Material;
        expect(material.transparent, 'nothing see-through').toBe(false);
        expect(material.opacity).toBe(1);
        expect(o.geometry, 'no projector').not.toBeInstanceOf(THREE.CylinderGeometry);
      });
      expect(seat.screen.display.visible).toBe(true);
    }
  });
});

describe('#38 AC2 occupied monitors show the agent, readable from the front', () => {
  for (const [w, h] of [[1440, 900], [390, 844]]) {
    it(`#38 AC2 the drawn text runs left to right from the front on a ${w}×${h} screen`, () => {
      const { group, seats } = buildOffice(INITIAL_ROWS);
      const camera = new THREE.PerspectiveCamera(34, w / h, 0.1, 150);
      const orbit = initialOrbit();
      frameFloor(camera, orbit, INITIAL_ROWS);
      placeCamera(camera, orbit);
      camera.updateProjectionMatrix();
      updateScreens(seats, new Map(seats.map((s) => [s.index, rec(s.index, 'working', { activity: ACTIVITY })])), 0);
      group.updateMatrixWorld(true);
      for (const seat of seats) {
        const display = seat.screen.display;
        const centre = display.localToWorld(new THREE.Vector3(0, 0, 0));
        const normal = display.localToWorld(new THREE.Vector3(0, 0, 1)).sub(centre);
        expect(normal.dot(camera.position.clone().sub(centre)), `seat ${seat.index} seen from the front`).toBeGreaterThan(0);
        const right = display.localToWorld(new THREE.Vector3(0.3, 0, 0)).project(camera).x - centre.clone().project(camera).x;
        expect(right, `seat ${seat.index} reads left to right`).toBeGreaterThan(0);
        expect(display.matrixWorld.determinant(), 'not mirrored by a negative scale').toBeGreaterThan(0);
      }
      // The texture's left edge (u = 0) is on the plane's left (-x).
      const { uv, position } = seats[0].screen.display.geometry.attributes;
      for (let i = 0; i < uv.count; i++) expect(Math.sign(uv.getX(i) - 0.5)).toBe(Math.sign(position.getX(i)));
    });
  }

  it('#38 AC2 an occupied monitor shows the same content as before: name, then lines', () => {
    const { seats } = buildOffice(INITIAL_ROWS);
    const records = [rec(1, 'working', { activity: ACTIVITY }), rec(2, 'needs', { lastMessage: 'Which database?' }), rec(3, 'done', { lastMessage: 'All done.' }), rec(4, 'stale')];
    updateScreens(seats, new Map(records.map((r, i) => [i, r])), 0);
    records.forEach((r, i) => expect(seats[i].screen.content).toEqual(screenContent(r)));
  });
});

describe('#27 AC2 content follows the state', () => {
  it('#27 AC2 working shows the activity lines', () => {
    expect(screenContent(rec(1, 'working', { activity: ACTIVITY }))).toEqual({ name: 'agent 1', state: 'working', lines: ACTIVITY });
  });

  it('#27 AC2 needs shows the question, or the last message when there is no question', () => {
    // The transcript reader puts the question in lastMessage when the agent asked one (#4 AC2).
    expect(screenContent(rec(1, 'needs', { lastMessage: 'Which database should I use?', activity: ACTIVITY }))!.lines).toEqual(['Which database should I use?']);
    expect(screenContent(rec(1, 'needs', { lastMessage: 'I need your **approval** to run `rm`.' }))!.lines).toEqual(['I need your approval to run rm.']);
  });

  it('#27 AC2 done and finished show the last message; stale shows zz', () => {
    expect(screenContent(rec(1, 'done', { lastMessage: '## Done\n\nAll tests pass.', activity: ACTIVITY }))!.lines).toEqual(['Done All tests pass.']);
    expect(screenContent(rec(1, 'finished', { lastMessage: 'Opened PR #8.' }))!.lines).toEqual(['Opened PR #8.']);
    expect(screenContent(rec(1, 'stale', { lastMessage: 'hi', activity: ACTIVITY }))!.lines).toEqual(['zz']);
  });

  it('#27 AC2 every screen shows the agent\'s name, and its content is what gets drawn', () => {
    const cases: AgentRecord[] = [
      rec(1, 'working', { activity: ACTIVITY }), rec(2, 'needs', { lastMessage: 'Which database?' }),
      rec(3, 'done', { lastMessage: 'All done.' }), rec(4, 'finished', { lastMessage: 'Exited.' }), rec(5, 'stale'),
    ];
    for (const record of cases) {
      const content = screenContent(record)!;
      expect(content.name).toBe(record.name);
      const { g, texts, all } = recorder();
      paintScreen(g, content);
      expect(texts[0], `${record.state} title`).toBe(record.name);
      for (const line of content.lines) for (const word of line.split(' ')) expect(all(), `${record.state}: ${word}`).toContain(word);
    }
  });

  it('#27 AC2 the newest working line types in', () => {
    const { g, texts } = recorder();
    paintScreen(g, screenContent(rec(1, 'working', { activity: ACTIVITY }))!, 0.5);
    expect(texts).toContain('Edit src/client/markdown.ts');
    expect(texts).not.toContain('Grep "escapeHtml" src');
    expect(texts).toContain('Grep "escap');
  });

  it('#27 AC2 a desk screen shows its occupant', () => {
    const { seats } = buildOffice(INITIAL_ROWS);
    updateScreens(seats, new Map([[0, rec(1, 'needs', { lastMessage: 'Which database?' })], [3, rec(2, 'stale')]]), 0);
    expect(seats[0].screen.content).toEqual({ name: 'agent 1', state: 'needs', lines: ['Which database?'] });
    expect(seats[3].screen.content!.lines).toEqual(['zz']);
  });
});

describe('#27 AC3 / #38 AC4 monitors follow the feed', () => {
  it('#27 AC3 / #38 AC4 a monitor changes on the next refresh after its agent\'s state, activity or message changes', () => {
    const c = new OfficeController();
    const { seats } = buildOffice(INITIAL_ROWS);
    const screenOf = () => seats[c.agents.get('session-1')!.seat.index].screen;
    const refresh = (record: AgentRecord) => { c.update([record]); updateScreens(seats, c.occupants(), 0); return screenOf().content; };

    expect(refresh(rec(1, 'working', { activity: ['Bash ls'] }))!.lines).toEqual(['Bash ls']);
    expect(refresh(rec(1, 'working', { activity: ['Bash ls', 'Read a.ts'] }))!.lines).toEqual(['Bash ls', 'Read a.ts']);
    expect(refresh(rec(1, 'done', { lastMessage: 'First.', activity: ['Bash ls', 'Read a.ts'] }))!.lines).toEqual(['First.']);
    expect(refresh(rec(1, 'done', { lastMessage: 'Second.', activity: ['Bash ls', 'Read a.ts'] }))!.lines).toEqual(['Second.']);
    expect(refresh(rec(1, 'stale', { lastMessage: 'Second.' }))!.lines).toEqual(['zz']);
  });

  it('#38 AC4 the big board still shows every agent, as their monitors do', () => {
    const { seats, board } = buildOffice(INITIAL_ROWS);
    const occupants = new Map([[0, rec(1, 'working', { activity: ACTIVITY })], [4, rec(2, 'needs', { lastMessage: 'Which?' })]]);
    updateScreens(seats, occupants, 0);
    board.update(occupants);
    expect(board.model.tiles).toEqual([seats[0].screen.content, seats[4].screen.content]);
  });
});

describe('#38 AC3 empty desks', () => {
  it('#38 AC3 an empty desk\'s monitor screen is dark, with no content', () => {
    const { seats } = buildOffice(INITIAL_ROWS);
    const dark = (i: number) => {
      const { material } = seats[i].screen.display;
      return material.map === null && `#${material.color.getHexString().toUpperCase()}` === SCREEN_OFF;
    };
    updateScreens(seats, new Map([[0, rec(1, 'working', { activity: ACTIVITY })]]), 0);
    expect(seats[0].screen.content).not.toBeNull();
    expect(dark(0)).toBe(false);
    for (const seat of seats.slice(1)) {
      expect(seat.screen.content).toBeNull();
      expect(dark(seat.index), `seat ${seat.index}`).toBe(true);
    }
    updateScreens(seats, new Map(), 1); // the agent left
    expect(seats[0].screen.content).toBeNull();
    expect(dark(0)).toBe(true);
  });
});
