import { describe, expect, it } from 'vitest';
import type { OfficeState } from '../src/shared/agent.ts';
import { SCREEN_SIZE, paintScreen, type ScreenContent } from '../src/client/screen.ts';
import { BOARD_CANVAS, boardModel, paintBoard, tileRects } from '../src/client/board.ts';

const CHAR = 8;

/** A 2D context that records where text and rects land, in canvas pixels (translate and scale applied). */
function recorder() {
  const drawn: { text?: string; x0: number; x1: number; y0: number; y1: number }[] = [];
  const state = { textAlign: 'left', dx: 0, dy: 0, sx: 1, sy: 1 };
  const stack: (typeof state)[] = [];
  const handlers: Record<string, (...args: never[]) => unknown> = {
    measureText: (text: string) => ({ width: text.length * CHAR }),
    fillText: (text: string, x: number, y: number) => {
      const w = text.length * CHAR;
      const left = state.textAlign === 'center' ? x - w / 2 : x;
      drawn.push({ text, x0: state.dx + left * state.sx, x1: state.dx + (left + w) * state.sx, y0: state.dy + (y - 16) * state.sy, y1: state.dy + y * state.sy });
    },
    fillRect: (x: number, y: number, w: number, h: number) => {
      drawn.push({ x0: state.dx + x * state.sx, x1: state.dx + (x + w) * state.sx, y0: state.dy + y * state.sy, y1: state.dy + (y + h) * state.sy });
    },
    save: () => { stack.push({ ...state }); },
    restore: () => { Object.assign(state, stack.pop()); },
    translate: (x: number, y: number) => { state.dx += x * state.sx; state.dy += y * state.sy; },
    scale: (x: number, y: number) => { state.sx *= x; state.sy *= y; },
  };
  const g = new Proxy({} as Record<string, unknown>, {
    get: (target, key) => handlers[key as string] ?? (key in target ? target[key as string] : () => undefined),
    set: (target, key, value) => {
      if (key === 'textAlign') state.textAlign = value;
      target[key as string] = value;
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
  return { g, drawn, texts: () => drawn.flatMap((d) => (d.text == null ? [] : [d.text])) };
}

const LONG = 'Bash npm run build && npx vitest run test/screens.test.ts test/board.test.ts --reporter verbose';
const SHORT = ['Read src/client/card.ts', 'Edit src/client/markdown.ts', 'Bash npm test'];
const GIANT_WORD = 'x'.repeat(300);
const LONG_NAME = 'a-very-long-agent-name-that-keeps-going-and-going';

const cases: ScreenContent[] = [
  { name: 'agent', state: 'working', lines: [...SHORT, LONG] },
  { name: LONG_NAME, state: 'working', lines: Array.from({ length: 12 }, (_, i) => `${LONG} ${i}`) },
  ...(['needs', 'done', 'finished'] as OfficeState[]).flatMap((state) => [
    { name: LONG_NAME, state, lines: [GIANT_WORD] },
    { name: 'agent', state, lines: [`${'word '.repeat(80)}${GIANT_WORD}`] },
  ]),
  { name: LONG_NAME, state: 'stale', lines: ['zz'] },
];

const inside = (d: { x0: number; x1: number; y0: number; y1: number }, r: { x: number; y: number; w: number; h: number }) =>
  d.x0 >= r.x - 0.01 && d.x1 <= r.x + r.w + 0.01 && d.y0 >= r.y - 0.01 && d.y1 <= r.y + r.h + 0.01;

describe('#37 AC1 working lines fit the card', () => {
  it('#37 AC1 a working line too long for the card is cut to fit and ends with …', () => {
    const { g, drawn } = recorder();
    paintScreen(g, { name: 'agent', state: 'working', lines: [LONG] });
    const line = drawn.find((d) => d.text?.startsWith('Bash npm run'))!;
    expect(line.text!.endsWith('…')).toBe(true);
    expect(LONG.startsWith(line.text!.slice(0, -1))).toBe(true);
    expect(line.x1).toBeLessThanOrEqual(SCREEN_SIZE.width);
  });

  it('#37 AC1 a long line that is still typing in stays inside the card, cursor included', () => {
    for (const typed of [0.3, 0.9, 0.99]) {
      const { g, drawn } = recorder();
      paintScreen(g, { name: 'agent', state: 'working', lines: [LONG] }, typed);
      for (const d of drawn) expect(inside(d, { x: 0, y: 0, ...{ w: SCREEN_SIZE.width, h: SCREEN_SIZE.height } }), `typed ${typed}: ${d.text ?? 'rect'}`).toBe(true);
    }
  });
});

describe('#37 AC2 nothing is painted outside the card', () => {
  const card = { x: 0, y: 0, w: SCREEN_SIZE.width, h: SCREEN_SIZE.height };
  for (const content of cases) {
    it(`#37 AC2 ${content.state}: ${content.name.slice(0, 12)}, ${content.lines.length} line(s) of up to ${Math.max(...content.lines.map((l) => l.length))} chars`, () => {
      const { g, drawn } = recorder();
      paintScreen(g, content);
      expect(drawn.length).toBeGreaterThan(0);
      for (const d of drawn) expect(inside(d, card), d.text ?? 'rect').toBe(true);
    });
  }

  it('#37 AC2 on the big board, no tile draws onto its neighbour', () => {
    const records = cases.map((c, i) => ({
      id: `a${i}`, sessionId: `s${i}`, name: c.name, project: 'p', cwd: '/p', state: c.state, branch: null,
      lastMessage: c.state === 'working' || c.state === 'stale' ? null : c.lines[0], activity: c.state === 'working' ? c.lines : [],
    }));
    const model = boardModel(new Map(records.map((r, i) => [i, r])));
    const { g, drawn } = recorder();
    paintBoard(g, model);
    const tiles = tileRects(model.tiles.length);
    const background = drawn.shift()!; // the board's own backdrop
    expect(background).toMatchObject({ x0: 0, y0: 0, x1: BOARD_CANVAS.width, y1: BOARD_CANVAS.height });
    for (const d of drawn) expect(tiles.some((t) => inside(d, t)), d.text ?? 'rect').toBe(true);
    // Every long working line on the board was cut.
    for (const text of drawn.map((d) => d.text).filter((t) => t?.startsWith('Bash npm run'))) expect(text!.endsWith('…')).toBe(true);
  });
});

describe('#37 AC3 lines that fit are unchanged', () => {
  it('#37 AC3 short working lines are drawn exactly as given', () => {
    const { g, texts } = recorder();
    paintScreen(g, { name: 'agent', state: 'working', lines: SHORT });
    for (const line of SHORT) expect(texts()).toContain(line);
  });

  it('#37 AC3 a short name and message are drawn unchanged', () => {
    const { g, texts } = recorder();
    paintScreen(g, { name: 'agent 7', state: 'done', lines: ['All tests pass.'] });
    expect(texts()).toContain('agent 7');
    expect(texts().join(' ')).toContain('All tests pass.');
  });
});
