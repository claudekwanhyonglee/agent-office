// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { formatResetIn, formatTokens, mountUsagePanel } from '../src/client/usage.ts';
import type { UsagePayload } from '../src/shared/usage.ts';

const body = readFileSync('index.html', 'utf8').match(/<body>([\s\S]*)<\/body>/)![1];
const css = readFileSync('src/client/style.css', 'utf8');

const MIN = 60_000;
const HOUR = 60 * MIN;
const now = Date.parse('2026-10-11T12:00:00Z');

const payload = (over: Partial<UsagePayload> = {}): UsagePayload => ({
  tracking: 'enabled',
  limits: { session: { usedPercentage: 42, resetsAt: now + 2 * HOUR + 14 * MIN }, weekly: { usedPercentage: 18.4, resetsAt: now + 50 * HOUR } },
  projects: [{ project: 'agent-office', tokens: 4_121_931 }, { project: 'site', tokens: 1_500 }],
  ...over,
});

const panel = () => document.getElementById('usage')!;
const text = () => panel().textContent!.replace(/\s+/g, ' ');
const button = (label: RegExp) => [...panel().querySelectorAll('button')].find((b) => label.test(b.textContent ?? '') || label.test(b.getAttribute('aria-label') ?? ''));
const toggle = () => panel().querySelector<HTMLButtonElement>('[data-toggle]')!;
const expanded = () => toggle().getAttribute('aria-expanded') === 'true';

/** Mounts the panel with a fake server; `enable` answers POST /api/usage/enable. */
async function mount(first: UsagePayload, { phone = false, enable = payload() }: { phone?: boolean; enable?: UsagePayload } = {}) {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const json = url === '/api/usage/enable' && init?.method === 'POST' ? enable : first;
    return new Response(JSON.stringify(json), { status: 200, headers: { 'content-type': 'application/json' } });
  });
  const panelApi = mountUsagePanel(panel(), { fetch: fetchMock as unknown as typeof fetch, now: () => now, isPhone: () => phone });
  await panelApi.refresh();
  return { fetchMock, panelApi };
}

beforeEach(() => {
  document.body.innerHTML = body.replace(/<script[\s\S]*?<\/script>/g, '');
  localStorage.clear();
});

describe('#47 AC1 limits and weekly tokens', () => {
  it('#47 AC1 formats time to reset and token counts', () => {
    expect(formatResetIn(now + 2 * HOUR + 14 * MIN, now)).toBe('resets in 2h 14m');
    expect(formatResetIn(now + 50 * HOUR, now)).toBe('resets in 2d 2h');
    expect(formatResetIn(now + 5 * MIN + 10_000, now)).toBe('resets in 6m');
    expect(formatResetIn(now + 10_000, now)).toBe('resets in 1m');
    expect(formatTokens(4_121_931)).toBe('4.1M');
    expect(formatTokens(1_500)).toBe('1.5K');
    expect(formatTokens(950)).toBe('950');
  });

  it('#47 AC1 shows session and weekly bars with used % and time to reset, then each project', async () => {
    await mount(payload());
    expect(text()).toMatch(/Session\s*42%\s*resets in 2h 14m/);
    expect(text()).toMatch(/Week\s*18%\s*resets in 2d 2h/);
    const bars = [...panel().querySelectorAll<HTMLElement>('[role=progressbar]')];
    expect(bars.map((b) => b.getAttribute('aria-valuenow'))).toEqual(['42', '18']);
    expect(text().indexOf('Week')).toBeLessThan(text().indexOf('agent-office'));
    const rows = [...panel().querySelectorAll('[data-project]')].map((r) => [...r.children].map((c) => c.textContent).join(' '));
    expect(rows).toEqual(['agent-office 4.1M', 'site 1.5K']);
  });

  it('#47 AC1 with no weekly window the tokens are labelled as the last 7 days', async () => {
    await mount(payload({ limits: { session: null, weekly: null } }));
    expect(text()).toMatch(/last 7 days/i);
  });

  it('#47 AC1 escapes project names', async () => {
    await mount(payload({ projects: [{ project: '<img src=x>', tokens: 5 }] }));
    expect(panel().querySelector('img')).toBeNull();
  });
});

describe('#47 AC2 collapse', () => {
  it('#47 AC2 the toggle collapses and expands the panel', async () => {
    await mount(payload());
    expect(expanded()).toBe(true);
    toggle().click();
    expect(expanded()).toBe(false);
    expect(panel().querySelector<HTMLElement>('.usage-body')!.hidden).toBe(true);
    toggle().click();
    expect(expanded()).toBe(true);
    expect(panel().querySelector<HTMLElement>('.usage-body')!.hidden).toBe(false);
  });

  it('#47 AC2 the choice is remembered across reloads', async () => {
    await mount(payload());
    toggle().click();
    document.body.innerHTML = body.replace(/<script[\s\S]*?<\/script>/g, '');
    await mount(payload());
    expect(expanded()).toBe(false);
  });

  it('#47 AC2 a re-render keeps the panel collapsed', async () => {
    const { panelApi } = await mount(payload());
    toggle().click();
    await panelApi.refresh();
    expect(expanded()).toBe(false);
  });
});

describe('#47 AC3 unknown limits and tracking', () => {
  it('#47 AC3 an unknown limit shows "—", not 0%', async () => {
    await mount(payload({ limits: { session: null, weekly: { usedPercentage: 18, resetsAt: now + HOUR } } }));
    expect(text()).toMatch(/Session\s*—/);
    expect(text()).not.toMatch(/Session\s*0%/);
  });

  it('#47 AC3 when tracking is off it offers to enable it, with the note', async () => {
    const { fetchMock } = await mount(payload({ tracking: 'off', limits: { session: null, weekly: null } }));
    expect(text()).toContain("Adds a status line to Claude Code’s settings.json that saves your plan limits for Agent Office. It shows nothing in your terminal and adds nothing to Claude’s context.");
    button(/enable limit tracking/i)!.click();
    await vi.waitFor(() => expect(button(/enable limit tracking/i)).toBeUndefined());
    expect(fetchMock).toHaveBeenCalledWith('/api/usage/enable', expect.objectContaining({ method: 'POST', headers: { 'content-type': 'application/json' } }));
    expect(text()).toMatch(/Session\s*42%/);
  });

  it('#47 AC3 when enabling is refused, it says why', async () => {
    const fetchMock = vi.fn(async (url: string) => url === '/api/usage/enable'
      ? new Response('Limit tracking can only be enabled on this computer.', { status: 403 })
      : new Response(JSON.stringify(payload({ tracking: 'off' }))));
    await mountUsagePanel(panel(), { fetch: fetchMock as unknown as typeof fetch, now: () => now, isPhone: () => false }).refresh();
    button(/enable limit tracking/i)!.click();
    await vi.waitFor(() => expect(text()).toContain('Limit tracking can only be enabled on this computer.'));
  });

  it('#47 AC3 another status line or unreadable settings: says so, no button', async () => {
    await mount(payload({ tracking: 'other', limits: { session: null, weekly: null } }));
    expect(button(/enable/i)).toBeUndefined();
    expect(text()).toMatch(/already have a status line/i);

    await mount(payload({ tracking: 'unreadable', limits: { session: null, weekly: null } }));
    expect(button(/enable/i)).toBeUndefined();
    expect(text()).toMatch(/couldn.t read Claude Code.s settings\.json/i);
  });

  it('#47 AC3 enabled but no limits known yet: they appear after the next reply', async () => {
    await mount(payload({ limits: { session: null, weekly: null } }));
    expect(text()).toContain('Limits appear after your next Claude Code reply (Pro and Max plans only).');
    await mount(payload());
    expect(text()).not.toContain('Limits appear after');
  });
});

describe('#47 AC4 phones and the agent card', () => {
  it('#47 AC4 starts collapsed on phone-width screens, unless the user expanded it', async () => {
    await mount(payload(), { phone: true });
    expect(expanded()).toBe(false);
    toggle().click();
    document.body.innerHTML = body.replace(/<script[\s\S]*?<\/script>/g, '');
    await mount(payload(), { phone: true });
    expect(expanded()).toBe(true);
  });

  const rule = (selector: string, source = css) => source.match(new RegExp(`(^|\\n)\\s*${selector.replace(/\./g, '\\.')}\\s*\\{([^}]*)\\}`))?.[2] ?? '';
  const px = (value: string) => Number(value.match(/(\d+)px/)?.[1]);

  it('#47 AC4 desktop: the panel sits on the left and is narrow enough to clear the card at the widest overlap (701px)', () => {
    expect(rule('.left')).toMatch(/left:\s*16px/);
    const panelWidth = px(rule('.usage').match(/width:\s*\d+px/)![0]);
    const cardWidth = px(rule('.card').match(/(^|\s|;)width:\s*\d+px/)![0]);
    expect(16 + panelWidth + 16 + cardWidth + 16).toBeLessThanOrEqual(701);
  });

  it('#47 AC4 phone: the left column ends above where the bottom card can reach (52% + 12px)', () => {
    const phone = css.match(/@media \(max-width: 700px\) \{([\s\S]*?)\n\}/)![1];
    expect(rule('.card', phone)).toMatch(/max-height:\s*52%/);
    expect(rule('.left', phone)).toMatch(/max-height:\s*calc\(48% - \d+px/);
    expect(rule('.usage')).toMatch(/overflow-y:\s*auto/);
  });
});
