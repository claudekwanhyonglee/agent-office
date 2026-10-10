import { describe, expect, it } from 'vitest';
import type { AgentRecord, OfficeState } from '../src/shared/agent.ts';
import { OfficeController } from '../src/client/controller.ts';
import { INITIAL_ROWS } from '../src/client/layout.ts';
import { buildOffice, updateScreens } from '../src/client/office.ts';
import { screenContent } from '../src/client/screen.ts';
import { BOARD_CANVAS, boardModel, paintBoard, tileRects } from '../src/client/board.ts';

const rec = (n: number, state: OfficeState = 'working', extra: Partial<AgentRecord> = {}): AgentRecord => ({
  id: `a${n}`, sessionId: `session-${n}`, name: `agent ${n}`, project: 'demo-app',
  cwd: '/home/alex/projects/demo-app', state, lastMessage: `Message ${n}`, branch: null, activity: [`Bash step ${n}`], ...extra,
});
const STATES: OfficeState[] = ['working', 'needs', 'done', 'finished', 'stale'];

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
  return { g, texts };
}

describe('#28 AC1 one tile per agent, in desk order, like its screen', () => {
  it('#28 AC1 tiles follow desk order, not arrival order, with each agent\'s screen content', () => {
    const occupants = new Map([[5, rec(3, 'needs')], [0, rec(1)], [2, rec(2, 'done')]]);
    expect(boardModel(occupants).tiles).toEqual([0, 2, 5].map((i) => screenContent(occupants.get(i))));
  });

  it('#28 AC1 the board in the office shows what the desk screens show', () => {
    const { seats, board } = buildOffice(INITIAL_ROWS);
    const c = new OfficeController();
    c.update(STATES.map((s, i) => rec(i + 1, s)));
    updateScreens(seats, c.occupants(), 0);
    board.update(c.occupants());
    expect(board.model.tiles).toEqual(seats.filter((s) => s.screen.content).map((s) => s.screen.content));
    expect(board.model.tiles).toHaveLength(5);
  });

  it('#28 AC1 each tile is painted with its agent\'s name and lines', () => {
    const { g, texts } = recorder();
    paintBoard(g, boardModel(new Map([[0, rec(1)], [1, rec(2, 'stale')]])));
    for (const text of ['agent 1', 'Bash step 1', 'agent 2', 'zz']) expect(texts).toContain(text);
  });
});

describe('#28 AC2 summary tile', () => {
  it('#28 AC2 counts agents in each state', () => {
    const occupants = new Map(['working', 'working', 'needs', 'done', 'finished', 'finished', 'finished'].map((s, i) => [i, rec(i, s as OfficeState)]));
    expect(boardModel(occupants).counts).toEqual({ working: 2, needs: 1, done: 1, finished: 3, stale: 0 });
  });

  it('#28 AC2 the summary tile shows each state with its count', () => {
    const { g, texts } = recorder();
    paintBoard(g, boardModel(new Map([[0, rec(1)], [1, rec(2)], [2, rec(3, 'needs')]])));
    const at = (label: string) => texts.lastIndexOf(label); // the summary is painted last
    for (const label of ['Working', 'Needs you', 'Done', 'Finished', 'Stale']) expect(at(label), label).toBeGreaterThan(-1);
    // Each count is drawn just before its label.
    expect(texts[at('Working') - 1]).toBe('2');
    expect(texts[at('Needs you') - 1]).toBe('1');
    expect(texts[at('Stale') - 1]).toBe('0');
  });
});

describe('#28 AC3 room for everyone', () => {
  const overlap = (a: { x: number; y: number; w: number; h: number }, b: typeof a) =>
    a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

  it('#28 AC3 up to 24 agents get full-size tiles; more get smaller tiles, and every agent still has one', () => {
    const full = tileRects(24).tiles[0].w;
    for (let agents = 1; agents <= 24; agents++) expect(tileRects(agents).tiles.every((r) => r.w === full), `${agents} agents`).toBe(true);
    for (const agents of [25, 32, 48, 80]) {
      const { tiles, summary } = tileRects(agents);
      expect(tiles).toHaveLength(agents);
      expect(tiles[0].w, `${agents} agents`).toBeLessThan(full);
      const rects = [...tiles, summary];
      for (const r of rects) {
        expect(r.x >= 0 && r.y >= 0 && r.x + r.w <= BOARD_CANVAS.width && r.y + r.h <= BOARD_CANVAS.height, `${agents}: inside`).toBe(true);
      }
      for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) expect(overlap(rects[i], rects[j])).toBe(false);
    }
  });
});

describe('#28 AC4 leavers drop off', () => {
  it('#28 AC4 when an agent leaves (Got it), its tile goes and the counts change on the next refresh', () => {
    const { board } = buildOffice(INITIAL_ROWS);
    const c = new OfficeController();
    c.update([rec(1), rec(2, 'finished'), rec(3, 'done')]);
    board.update(c.occupants());
    expect(board.model.tiles.map((t) => t.name)).toEqual(['agent 1', 'agent 2', 'agent 3']);
    expect(board.model.counts.finished).toBe(1);
    c.update([rec(1), rec(3, 'done')]);
    board.update(c.occupants());
    expect(board.model.tiles.map((t) => t.name)).toEqual(['agent 1', 'agent 3']);
    expect(board.model.counts).toEqual({ working: 1, needs: 0, done: 1, finished: 0, stale: 0 });
  });
});
