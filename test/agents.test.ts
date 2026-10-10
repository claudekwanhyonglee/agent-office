import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { buildAgentList, mapState, projectName, toRecord, type AgentEntry } from '../src/server/agents.ts';

const entries: AgentEntry[] = JSON.parse(readFileSync('test/fixtures/agents.json', 'utf8'));
const byId = (id: string) => entries.find((e) => e.id === id)!;
const HOUR = 3600_000;
const NOW = 1_800_000_000_000;

describe('#3 AC1 entry → record', () => {
  it('#3 AC1 maps each state as in the epic', () => {
    expect(mapState({ pid: 1, state: 'working' })).toBe('working');
    expect(mapState({ pid: 1, state: 'blocked' })).toBe('needs');
    expect(mapState({ pid: 1, state: 'done' })).toBe('done');
    expect(mapState({ state: 'done' })).toBe('finished');
    expect(mapState({ pid: 1, state: 'stopped' })).toBe('stale');
    expect(mapState({ state: 'stopped' })).toBe('stale');
    expect(mapState({ state: 'working' })).toBe('stale');
    expect(mapState({ state: 'blocked' })).toBe('stale');
  });

  it('#3 AC1 builds { id, sessionId, name, project, cwd, state }', () => {
    const entry = byId('aaaa0002');
    expect(toRecord(entry)).toEqual({
      id: 'aaaa0002',
      sessionId: entry.sessionId,
      name: 'demo-app #3 · Add search',
      project: 'demo-app',
      cwd: '/home/alex/projects/demo-app/.claude/worktrees/tk-epic-3',
      state: 'needs',
    });
  });
});

describe('#3 AC2 project name', () => {
  it('#3 AC2 resolves worktree paths to the repo folder', () => {
    expect(projectName('/home/alex/projects/demo-app/.claude/worktrees/tk-epic-3')).toBe('demo-app');
    expect(projectName('/home/alex/projects/demo-app')).toBe('demo-app');
    expect(projectName('/home/alex/projects/demo-app/')).toBe('demo-app');
    expect(projectName('C:\\Users\\alex\\projects\\demo-app\\.claude\\worktrees\\x')).toBe('demo-app');
  });
});

describe('#3 AC3 ended sessions', () => {
  it('#3 AC3 keeps ended sessions only if their transcript changed in the last 24 h', () => {
    const modified: Record<string, number> = {
      aaaa0004: NOW - 2 * HOUR, // finished, recent
      aaaa0005: NOW - 23 * HOUR, // stale, recent
      aaaa0006: NOW - 25 * HOUR, // stale, old
      // aaaa0007: no transcript at all
    };
    const list = buildAgentList(entries, {
      now: NOW,
      transcriptModified: (entry) => modified[entry.id] ?? null,
    });
    expect(list.map((a) => a.id)).toEqual(['aaaa0001', 'aaaa0002', 'aaaa0003', 'aaaa0004', 'aaaa0005']);
  });

  it('#3 AC3 never checks transcripts of running sessions', () => {
    const list = buildAgentList(entries.filter((e) => e.pid), { now: NOW, transcriptModified: () => null });
    expect(list).toHaveLength(3);
  });
});
