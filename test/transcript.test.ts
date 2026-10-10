import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readDetails, parseDetails, transcriptPath } from '../src/server/transcript.ts';
import { loadAgents } from '../src/server/load.ts';
import type { AgentEntry } from '../src/server/agents.ts';

const SESSION = 'session-one';
const line = (o: object) => JSON.stringify(o);
const assistant = (content: object[], extra: object = {}) => line({ type: 'assistant', message: { role: 'assistant', content }, ...extra });
const user = (text: string, extra: object = {}) => line({ type: 'user', message: { role: 'user', content: text }, ...extra });
const text = (t: string) => ({ type: 'text', text: t });
const thinking = () => ({ type: 'thinking', thinking: '', signature: 'sig' });
const ask = (question: string) => ({ type: 'tool_use', id: 't1', name: 'AskUserQuestion', input: { questions: [{ question, header: 'Pick', multiSelect: false, options: [] }, { question: 'second?' }] } });
const bash = () => ({ type: 'tool_use', id: 't2', name: 'Bash', input: { command: 'ls' } });

describe('#4 AC1 transcript location', () => {
  it('#4 AC1 Linux cwd under ~/.claude', () => {
    expect(transcriptPath('/home/alex/projects/demo-app', SESSION, { env: {}, homedir: '/home/alex', pathApi: path.posix }))
      .toBe('/home/alex/.claude/projects/-home-alex-projects-demo-app/session-one.jsonl');
  });

  it('#4 AC1 macOS cwd with dots, under $CLAUDE_CONFIG_DIR', () => {
    expect(transcriptPath('/Users/alex/code/demo.app/.claude/worktrees/tk-epic-3', SESSION, {
      env: { CLAUDE_CONFIG_DIR: '/Users/alex/claude-config' }, homedir: '/Users/alex', pathApi: path.posix,
    })).toBe('/Users/alex/claude-config/projects/-Users-alex-code-demo-app--claude-worktrees-tk-epic-3/session-one.jsonl');
  });

  it('#4 AC1 Windows cwd', () => {
    expect(transcriptPath('C:\\Users\\alex\\projects\\demo-app', SESSION, { env: {}, homedir: 'C:\\Users\\alex', pathApi: path.win32 }))
      .toBe('C:\\Users\\alex\\.claude\\projects\\C--Users-alex-projects-demo-app\\session-one.jsonl');
  });
});

describe('#4 AC2 lastMessage', () => {
  it('#4 AC2 is the latest assistant text, ignoring thinking and later tool calls', () => {
    const details = parseDetails([
      assistant([text('first')]),
      user('ok'),
      assistant([thinking(), text('latest words')]),
      assistant([thinking()]),
      assistant([bash()]),
    ].join('\n'));
    expect(details.lastMessage).toBe('latest words');
  });

  it('#4 AC2 is cut to 300 characters', () => {
    const details = parseDetails(assistant([text('x'.repeat(500))]));
    expect(details.lastMessage).toHaveLength(300);
  });

  it('#4 AC2 is the first question when the latest assistant entry asks one', () => {
    const details = parseDetails([
      assistant([text('Before I go on:')]),
      assistant([ask('Which database should I use?')]),
      assistant([thinking()]),
    ].join('\n'));
    expect(details.lastMessage).toBe('Which database should I use?');
  });

  it('#4 AC2 an older question no longer wins once there is newer text', () => {
    const details = parseDetails([assistant([ask('Old question?')]), user('answer'), assistant([text('Thanks, done.')])].join('\n'));
    expect(details.lastMessage).toBe('Thanks, done.');
  });
});

describe('#4 AC3 branch', () => {
  it('#4 AC3 is the gitBranch of the latest line that has one', () => {
    const details = parseDetails([
      user('hi', { gitBranch: 'main' }),
      assistant([text('a')], { gitBranch: 'feature/search' }),
      line({ type: 'summary', summary: 'x' }),
    ].join('\n'));
    expect(details.branch).toBe('feature/search');
  });
});

describe('#4 AC4 bad transcripts', () => {
  it('#4 AC4 missing file', () => {
    expect(readDetails(join(tmpdir(), 'no-such-dir', 'missing.jsonl'))).toEqual({ lastMessage: null, branch: null });
  });

  it('#4 AC4 empty file', () => {
    const dir = mkdtempSync(join(tmpdir(), 'office-t-'));
    writeFileSync(join(dir, 'empty.jsonl'), '');
    expect(readDetails(join(dir, 'empty.jsonl'))).toEqual({ lastMessage: null, branch: null });
  });

  it('#4 AC4 partly invalid lines keep values from the valid ones', () => {
    const details = parseDetails([
      assistant([text('valid text')], { gitBranch: 'dev' }),
      '{not json',
      line({ type: 'assistant', message: null }),
      line({ type: 'assistant', message: { content: 'plain string' } }),
      line({ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'AskUserQuestion', input: {} }] } }),
      '',
    ].join('\n'));
    expect(details).toEqual({ lastMessage: 'valid text', branch: 'dev' });
  });
});

describe('#4 AC5 API records', () => {
  it('#4 AC5 records include lastMessage and branch', async () => {
    const config = mkdtempSync(join(tmpdir(), 'office-config-'));
    const cwd = '/home/alex/projects/demo-app';
    const dir = join(config, 'projects', '-home-alex-projects-demo-app');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, `${SESSION}.jsonl`), assistant([text('Working on it')], { gitBranch: 'main' }));
    const entries: AgentEntry[] = [
      { pid: 1, id: 'a1', cwd, sessionId: SESSION, name: 'one', state: 'working' },
      { pid: 2, id: 'a2', cwd, sessionId: 'session-two', name: 'two', state: 'working' },
    ];
    const agents = await loadAgents({ list: async () => entries, paths: { env: { CLAUDE_CONFIG_DIR: config } }, now: Date.now() });
    expect(agents.map((a) => [a.id, a.lastMessage, a.branch])).toEqual([['a1', 'Working on it', 'main'], ['a2', null, null]]);
  });
});
