import { afterEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { weekStart, weeklyTokens } from '../src/server/tokens.ts';
import { createFeed } from '../src/server/feed.ts';
import { createApi } from '../src/server/api.ts';
import { startServer } from '../src/server/http.ts';

const DAY = 24 * 3600 * 1000;
const now = Date.parse('2026-10-11T12:00:00Z');
const ago = (days: number) => new Date(now - days * DAY).toISOString();

const usage = { input_tokens: 10, output_tokens: 100, cache_creation_input_tokens: 1000, cache_read_input_tokens: 50_000 };
const reply = (cwd: string, id: string, timestamp: string, u: object = usage) =>
  JSON.stringify({ type: 'assistant', cwd, timestamp, message: { id, role: 'assistant', usage: u, content: [] } });
const user = (cwd: string, timestamp: string) => JSON.stringify({ type: 'user', cwd, timestamp, message: { role: 'user', content: 'hi' } });

/** A Claude projects folder with one transcript per entry of `files`. */
function projectsDir(files: Record<string, string[]>) {
  const dir = mkdtempSync(join(tmpdir(), 'office-projects-'));
  for (const [name, lines] of Object.entries(files)) {
    mkdirSync(join(dir, name, '..'), { recursive: true });
    writeFileSync(join(dir, name), lines.join('\n') + '\n');
  }
  return dir;
}

const app = '/home/alex/projects/app';
const site = '/home/alex/projects/site';

describe('#46 weekly tokens per project', () => {
  it('#46 AC1 counts input + output + cache-write tokens, leaving out cache reads', () => {
    const dir = projectsDir({ 'a/s1.jsonl': [user(app, ago(1)), reply(app, 'm1', ago(1))] });
    expect(weeklyTokens(dir, now - 2 * DAY)).toEqual([{ project: 'app', tokens: 1110 }]);
  });

  it('#46 AC1 only entries since the weekly window started', () => {
    const dir = projectsDir({ 'a/s1.jsonl': [reply(app, 'old', ago(3)), reply(app, 'new', ago(1))] });
    expect(weeklyTokens(dir, now - 2 * DAY)).toEqual([{ project: 'app', tokens: 1110 }]);
  });

  it('#46 AC1 the window starts at seven_day resets_at minus 7 days', () => {
    expect(weekStart({ usedPercentage: 10, resetsAt: now + 2 * DAY }, now)).toBe(now - 5 * DAY);
  });

  it('#46 AC2 with no weekly window known it counts the last 7 days', () => {
    expect(weekStart(null, now)).toBe(now - 7 * DAY);
  });

  it('#46 AC1 a reply logged once per content block is counted once, also across resumed transcripts', () => {
    const dir = projectsDir({
      'a/s1.jsonl': [reply(app, 'm1', ago(1)), reply(app, 'm1', ago(1))],
      'a/s2.jsonl': [reply(app, 'm1', ago(1)), reply(app, 'm2', ago(1))],
    });
    expect(weeklyTokens(dir, now - 2 * DAY)).toEqual([{ project: 'app', tokens: 2220 }]);
  });

  it('#46 AC1 groups by project: worktrees count toward their repo; subagent transcripts count too', () => {
    const dir = projectsDir({
      'a/s1.jsonl': [reply(app, 'm1', ago(1))],
      'b/s2.jsonl': [reply(`${app}/.claude/worktrees/feature`, 'm2', ago(1))],
      'a/s1/subagents/agent-1.jsonl': [reply(app, 'm3', ago(1))],
      'c/s3.jsonl': [reply(site, 'm4', ago(1), { input_tokens: 5, output_tokens: 5 })],
    });
    expect(weeklyTokens(dir, now - 2 * DAY)).toEqual([{ project: 'app', tokens: 3330 }, { project: 'site', tokens: 10 }]);
  });

  it('#46 AC3 sorted by tokens, highest first; projects with 0 tokens left out', () => {
    const dir = projectsDir({
      'a/s1.jsonl': [reply(site, 'm1', ago(1), { input_tokens: 1, output_tokens: 1 })],
      'b/s2.jsonl': [reply(app, 'm2', ago(1))],
      'c/s3.jsonl': [reply('/home/alex/projects/idle', 'm3', ago(1), { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 900 })],
      'd/s4.jsonl': [reply('/home/alex/projects/old', 'm4', ago(9))],
    });
    expect(weeklyTokens(dir, now - 7 * DAY).map((p) => p.project)).toEqual(['app', 'site']);
  });

  it('#46 AC1 ignores broken lines, entries without usage, and a missing folder', () => {
    const dir = projectsDir({ 'a/s1.jsonl': ['{nope', user(app, ago(1)), JSON.stringify({ type: 'assistant', cwd: app, timestamp: ago(1), message: { id: 'x' } }), reply(app, 'm1', ago(1))] });
    expect(weeklyTokens(dir, now - 2 * DAY)).toEqual([{ project: 'app', tokens: 1110 }]);
    expect(weeklyTokens(join(dir, 'missing'), now - 2 * DAY)).toEqual([]);
  });

  it('#46 AC1 picks up new replies in a transcript that changed', () => {
    const dir = projectsDir({ 'a/s1.jsonl': [reply(app, 'm1', ago(1))] });
    expect(weeklyTokens(dir, now - 2 * DAY)).toEqual([{ project: 'app', tokens: 1110 }]);
    const file = join(dir, 'a/s1.jsonl');
    writeFileSync(file, [reply(app, 'm1', ago(1)), reply(app, 'm2', ago(0.5))].join('\n'));
    utimesSync(file, new Date(), new Date(Date.now() + 5000));
    expect(weeklyTokens(dir, now - 2 * DAY)).toEqual([{ project: 'app', tokens: 2220 }]);
  });
});

describe('#46 usage API', () => {
  let server: Server | undefined;
  afterEach(() => server?.close());

  it('#46 AC1 GET /api/usage returns the projects', async () => {
    const dir = projectsDir({ 'a/s1.jsonl': [reply(app, 'm1', new Date().toISOString())] });
    const staticDir = mkdtempSync(join(tmpdir(), 'office-static-'));
    writeFileSync(join(staticDir, 'index.html'), 'page');
    const read = () => ({ projects: weeklyTokens(dir, weekStart(null, Date.now())) });
    server = await startServer({ port: 0, staticDir, api: createApi(createFeed(async () => []), undefined, { read, enable: read }) });
    const res = await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/api/usage`);
    expect((await res.json()).projects).toEqual([{ project: 'app', tokens: 1110 }]);
  });
});
