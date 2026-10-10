import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import type { AgentRecord, OfficeState } from '../src/shared/agent.ts';
import { OfficeController } from '../src/client/controller.ts';
import { INITIAL_ROWS } from '../src/client/layout.ts';
import { buildOffice, updateScreens } from '../src/client/office.ts';
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

describe('#27 AC1 screens on the camera side, readable from the camera', () => {
  it('#27 AC1 every desk has its screen on the camera side of the desk', () => {
    const { seats } = buildOffice(INITIAL_ROWS);
    for (const seat of seats) {
      const forward = { x: Math.sin(seat.yaw), z: Math.cos(seat.yaw) };
      const ahead = (seat.screen.root.position.x - seat.desk.x) * forward.x + (seat.screen.root.position.z - seat.desk.z) * forward.z;
      expect(ahead, `seat ${seat.index}`).toBeGreaterThan(0.4);
    }
  });

  for (const [w, h] of [[1440, 900], [390, 844]]) {
    it(`#27 AC1 each screen faces the camera and its text runs left to right on a ${w}×${h} screen`, () => {
      const { group, seats } = buildOffice(INITIAL_ROWS);
      const camera = new THREE.PerspectiveCamera(34, w / h, 0.1, 150);
      const orbit = initialOrbit();
      frameFloor(camera, orbit, INITIAL_ROWS);
      placeCamera(camera, orbit);
      camera.updateProjectionMatrix();
      updateScreens(seats, new Map(seats.map((s) => [s.index, rec(s.index, 'working', { activity: ACTIVITY })])), 0, camera.position);
      group.updateMatrixWorld(true);
      for (const seat of seats) {
        const pane = seat.screen.pane;
        const centre = pane.localToWorld(new THREE.Vector3(0, 0, 0));
        const normal = pane.localToWorld(new THREE.Vector3(0, 0, 1)).sub(centre);
        expect(normal.dot(camera.position.clone().sub(centre)), `seat ${seat.index} faces the camera`).toBeGreaterThan(0);
        const right = pane.localToWorld(new THREE.Vector3(0.4, 0, 0)).project(camera).x - centre.clone().project(camera).x;
        expect(right, `seat ${seat.index} reads left to right`).toBeGreaterThan(0);
        expect(pane.matrixWorld.determinant(), 'not mirrored by a negative scale').toBeGreaterThan(0);
      }
      // The texture's left edge (u = 0) is on the plane's left (-x).
      const { uv, position } = seats[0].screen.pane.geometry.attributes;
      for (let i = 0; i < uv.count; i++) expect(Math.sign(uv.getX(i) - 0.5)).toBe(Math.sign(position.getX(i)));
    });
  }
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

describe('#27 AC3 screens follow the feed', () => {
  it('#27 AC3 a screen changes on the next refresh after its agent\'s state, activity or message changes', () => {
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
});

describe('#27 AC4 empty desks', () => {
  it('#27 AC4 an empty desk shows no screen content', () => {
    const { seats } = buildOffice(INITIAL_ROWS);
    updateScreens(seats, new Map([[0, rec(1, 'working', { activity: ACTIVITY })]]), 0);
    expect(seats[0].screen.pane.visible).toBe(true);
    for (const seat of seats.slice(1)) {
      expect(seat.screen.content).toBeNull();
      expect(seat.screen.pane.visible).toBe(false);
    }
    updateScreens(seats, new Map(), 1); // the agent left
    expect(seats[0].screen.content).toBeNull();
    expect(seats[0].screen.pane.visible).toBe(false);
  });
});
