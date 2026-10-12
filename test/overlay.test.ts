// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { boot } from '../src/client/main.ts';
import type { AgentRecord, OfficeState } from '../src/shared/agent.ts';

const html = readFileSync('index.html', 'utf8');
const body = html.match(/<body>([\s\S]*)<\/body>/)![1];
const css = readFileSync('src/client/style.css', 'utf8');
const rule = (selector: string, source = css) =>
  source.match(new RegExp(`(^|\\n)\\s*${selector.replace(/\./g, '\\.')}\\s*\\{([^}]*)\\}`))?.[2] ?? '';

const rec = (n: number, state: OfficeState): AgentRecord => ({
  id: `a${n}`, sessionId: `session-${n}`, name: `agent ${n}`, project: 'demo-app',
  cwd: '/home/alex/projects/demo-app', state, lastMessage: null, branch: null, activity: [],
});

beforeEach(() => {
  document.body.innerHTML = body.replace(/<script[\s\S]*?<\/script>/g, '');
});

describe('#52 AC1 the header is just the logo', () => {
  it('#52 AC1 the header shows only "Agent Office", with no counts line, even with agents in every state', () => {
    const app = boot({ createOffice: () => ({ show() {}, onPick() {}, onHover() {} }) })!;
    app.applyFeed((['needs', 'working', 'done', 'finished'] as OfficeState[]).map((s, i) => rec(i, s)));
    const header = document.querySelector('header.brand')!;
    expect(header.textContent!.trim()).toBe('Agent Office');
    expect(header.children.length).toBe(1);
    expect(document.body.textContent).not.toMatch(/needs? you ·|\d+ working|\d+ done/);
  });
});

describe('#52 AC2 the logo is centred at the top', () => {
  it('#52 AC2 the logo sits on its own at the top centre, at every width', () => {
    expect(html).not.toMatch(/class="left"[\s\S]*class="brand"[\s\S]*id="usage"/);
    const brand = rule('.brand');
    expect(brand).toMatch(/position:\s*absolute/);
    expect(brand).toMatch(/left:\s*50%/);
    expect(brand).toMatch(/transform:\s*translateX\(-50%\)/);
    expect(brand).toMatch(/top:\s*calc\(16px/);
    // Keeps clear of the reset button (16px from the right, 44px wide) on both sides.
    expect(brand).toMatch(/max-width:\s*calc\(100% - 1(2[0-9]|[3-9][0-9])px\)/);
    // No media query moves it.
    for (const media of css.match(/@media[^{]*\{[\s\S]*?\n\}/g) ?? []) expect(rule('.brand', media)).toBe('');
  });

  it('#52 AC2 where the centred logo would meet the usage panel, the panel starts below it', () => {
    const narrow = css.match(/@media \(max-width: (\d+)px\) \{([\s\S]*?)\n\}/g)!
      .map((m) => ({ width: Number(m.match(/max-width: (\d+)px/)![1]), body: m }))
      .find((m) => /top:\s*calc\(7\dpx/.test(rule('.left', m.body)));
    // A 260px panel at 16px meets a logo up to 200px wide centred on screens narrower than 2 × (276 + 100).
    expect(narrow!.width).toBeGreaterThanOrEqual(752);
  });
});

describe('#52 AC3 no controls hint', () => {
  it('#52 AC3 the bottom hint is not on the page at any width', () => {
    expect(html).not.toMatch(/class="hint"/);
    expect(html).not.toMatch(/Drag to move/);
  });
});

describe('#52 AC4 the counter and hint are deleted, not hidden', () => {
  it('#52 AC4 no code, styles or tests for the counter or the hint remain', () => {
    const sources = [
      ...readdirSync('src/client').filter((f) => /\.(ts|css)$/.test(f)).map((f) => `src/client/${f}`),
      ...readdirSync('test').filter((f) => f.endsWith('.ts') && f !== 'overlay.test.ts').map((f) => `test/${f}`),
      'index.html',
    ];
    for (const file of sources) {
      const text = readFileSync(file, 'utf8');
      expect(text, file).not.toMatch(/renderCounts|id="counts"|getElementById\('counts'\)|class="(hint|count)|^\s*\.(hint|count)\b|\{ \.hint|header counts/m);
    }
  });
});
