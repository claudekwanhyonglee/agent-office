// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { boot } from '../src/client/main.ts';
import type { AgentRecord, OfficeState } from '../src/shared/agent.ts';

const body = readFileSync('index.html', 'utf8').match(/<body>([\s\S]*)<\/body>/)![1];

const rec = (n: number, state: OfficeState): AgentRecord => ({
  id: `a${n}`, sessionId: `session-${n}`, name: `demo-app #${n} · Add search`, project: 'demo-app',
  cwd: '/home/alex/projects/demo-app', state, lastMessage: `Message ${n}`, branch: `feature/${n}`,
});

function start(records: AgentRecord[]) {
  let pick: (key: string | null) => void = () => {};
  let hover: (key: string | null, x: number, y: number) => void = () => {};
  const app = boot({
    createOffice: () => ({ show() {}, onPick: (cb) => { pick = cb; }, onHover: (cb) => { hover = cb; } }),
  })!;
  app.applyFeed(records);
  return { app, pick: (key: string | null) => pick(key), hover: (key: string | null, x = 10, y = 10) => hover(key, x, y) };
}

const card = () => document.getElementById('card')!;
const button = (label: RegExp) => [...card().querySelectorAll('button')].find((b) => label.test(b.textContent ?? '') || label.test(b.getAttribute('aria-label') ?? ''));

beforeEach(() => {
  document.body.innerHTML = body.replace(/<script[\s\S]*?<\/script>/g, '');
});

describe('#6 AC1 card', () => {
  it('#6 AC1 clicking an agent shows name, project, branch, state, last message and attach command', () => {
    const { pick } = start([rec(1, 'needs')]);
    expect(card().hidden).toBe(true);
    pick('session-1');
    expect(card().hidden).toBe(false);
    const text = card().textContent!;
    for (const part of ['demo-app #1 · Add search', 'demo-app', 'feature/1', 'Needs you', 'Message 1', 'claude attach a1']) {
      expect(text).toContain(part);
    }
  });

  it('#6 AC1 Copy puts the command on the clipboard', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    const { pick } = start([rec(1, 'working')]);
    pick('session-1');
    button(/copy/i)!.click();
    expect(writeText).toHaveBeenCalledWith('claude attach a1');
  });

  it('#6 AC1 the close button and clicking the floor close the card', () => {
    const { pick } = start([rec(1, 'working')]);
    pick('session-1');
    button(/close/i)!.click();
    expect(card().hidden).toBe(true);
    pick('session-1');
    pick(null); // clicked the floor
    expect(card().hidden).toBe(true);
  });

  it('#6 AC1 the card follows live changes and closes when the agent leaves', () => {
    const { app, pick } = start([rec(1, 'working')]);
    pick('session-1');
    app.applyFeed([{ ...rec(1, 'done'), lastMessage: 'All done' }]);
    expect(card().textContent).toContain('All done');
    app.applyFeed([]);
    expect(card().hidden).toBe(true);
  });
});

describe('#6 AC2 hover label', () => {
  it('#6 AC2 hovering shows name and project; leaving hides it', () => {
    const { hover } = start([rec(1, 'working')]);
    const tooltip = document.getElementById('tooltip')!;
    hover('session-1', 100, 50);
    expect(tooltip.hidden).toBe(false);
    expect(tooltip.textContent).toContain('demo-app #1 · Add search');
    expect(tooltip.textContent).toContain('demo-app');
    hover(null);
    expect(tooltip.hidden).toBe(true);
  });
});

describe('#6 AC3 Got it button', () => {
  it('#6 AC3 finished and stale agents have Got it; it posts the session id', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);
    const { pick } = start([rec(1, 'finished'), rec(2, 'stale'), rec(3, 'working'), rec(4, 'done'), rec(5, 'needs')]);
    for (const n of [3, 4, 5]) { pick(`session-${n}`); expect(button(/got it/i)).toBeUndefined(); }
    pick('session-2');
    expect(button(/got it/i)).toBeDefined();
    pick('session-1');
    button(/got it/i)!.click();
    expect(fetchMock).toHaveBeenCalledWith('/api/acknowledge', expect.objectContaining({
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sessionId: 'session-1' }),
    }));
    vi.unstubAllGlobals();
  });
});

describe('#6 AC4 header counts', () => {
  it('#6 AC4 shows live counts of needs you, working and done', () => {
    const { app } = start([rec(1, 'needs'), rec(2, 'needs'), rec(3, 'working'), rec(4, 'done'), rec(5, 'finished')]);
    const counts = () => document.getElementById('counts')!.textContent!.replace(/\s+/g, ' ').trim();
    expect(counts()).toBe('2 need you · 1 working · 1 done');
    app.applyFeed([rec(1, 'needs')]);
    expect(counts()).toBe('1 needs you · 0 working · 0 done');
  });
});

describe('#6 AC5 phone width', () => {
  it('#6 AC5 card and header fit the screen; long text wraps or scrolls inside', () => {
    const css = readFileSync('src/client/style.css', 'utf8');
    const rule = (selector: string, source = css) => source.match(new RegExp(`(^|\\n)\\s*${selector.replace('.', '\\.')}\\s*\\{([^}]*)\\}`))?.[2] ?? '';
    expect(rule('.brand')).toMatch(/max-width:\s*calc\(100% - 32px\)/);
    expect(rule('.brand')).toMatch(/flex-wrap:\s*wrap/);
    expect(rule('.card')).toMatch(/max-width:\s*calc\(100% - 32px\)/);
    expect(rule('.command code')).toMatch(/overflow-x:\s*auto/);
    const phone = css.match(/@media \(max-width: 700px\) \{([\s\S]*?)\n\}/)![1];
    expect(rule('.card', phone)).toMatch(/left:\s*16px/);
    expect(rule('.card', phone)).toMatch(/right:\s*16px/);
    expect(rule('.card', phone)).toMatch(/width:\s*auto/);
  });
});

describe('#17 AC1 the card shows the last message as Markdown', () => {
  it('#17 AC1 the card renders **hi** as <strong>hi</strong>', () => {
    const { pick } = start([{ ...rec(1, 'done'), lastMessage: '**hi** <b>no</b>' }]);
    pick('session-1');
    expect(card().querySelector('.desc strong')!.textContent).toBe('hi');
    expect(card().querySelector('.desc b')).toBeNull();
  });
});

describe('#11 expandable last message', () => {
  const withMessage = (lastMessage: string) => ({ ...rec(1, 'done'), lastMessage });
  const desc = () => card().querySelector('.desc')!.textContent!.trim();
  const longText = 'A'.repeat(200) + ' ' + 'B'.repeat(200);
  const manyLines = ['one', 'two', 'three', 'four', 'five'].join('\n');

  it('#11 AC2 a message over 280 characters shows a preview and Show more / Show less', () => {
    const { pick } = start([withMessage(longText)]);
    pick('session-1');
    expect(desc().length).toBeLessThan(longText.length);
    expect(longText.startsWith(desc().replace(/…$/, ''))).toBe(true);
    button(/show more/i)!.click();
    expect(desc()).toBe(longText);
    expect(button(/show more/i)).toBeUndefined();
    button(/show less/i)!.click();
    expect(desc().length).toBeLessThan(longText.length);
    expect(button(/show more/i)).toBeDefined();
  });

  it('#11 AC2 a message over 4 lines shows a preview of the first 4 lines', () => {
    const { pick } = start([withMessage(manyLines)]);
    pick('session-1');
    expect(desc()).not.toContain('five');
    expect(desc()).toContain('four');
    button(/show more/i)!.click();
    expect(desc()).toBe(manyLines);
  });

  it('#11 AC3 a message within the limits shows in full with no button', () => {
    const fits = ['one', 'two', 'three', 'four'].join('\n') + ' ' + 'x'.repeat(250);
    expect(fits.length).toBeLessThanOrEqual(280);
    const { pick } = start([withMessage(fits)]);
    pick('session-1');
    expect(desc()).toBe(fits);
    expect(button(/show (more|less)/i)).toBeUndefined();
  });

  it('#11 AC4 the expanded state survives live updates for the same agent, not a different one', () => {
    const { app, pick } = start([withMessage(longText), { ...rec(2, 'done'), lastMessage: longText }]);
    pick('session-1');
    button(/show more/i)!.click();
    app.applyFeed([{ ...withMessage(longText), state: 'finished' }, { ...rec(2, 'done'), lastMessage: longText }]);
    expect(desc()).toBe(longText);
    expect(button(/show less/i)).toBeDefined();
    pick('session-2');
    expect(button(/show more/i)).toBeDefined();
  });
});
