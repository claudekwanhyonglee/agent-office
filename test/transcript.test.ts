import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readDetails, parseDetails, transcriptPath, transcriptFinder } from '../src/server/transcript.ts';
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

  it('#11 AC1 is the full message, up to a 20,000 character safety cap', () => {
    const long = 'word '.repeat(2000); // 10,000 characters
    expect(parseDetails(assistant([text(long)])).lastMessage).toBe(long);
    expect(parseDetails(assistant([text('x'.repeat(25_000))])).lastMessage).toHaveLength(20_000);
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
    expect(readDetails(join(tmpdir(), 'no-such-dir', 'missing.jsonl'))).toEqual({ lastMessage: null, branch: null, activity: [] });
  });

  it('#4 AC4 empty file', () => {
    const dir = mkdtempSync(join(tmpdir(), 'office-t-'));
    writeFileSync(join(dir, 'empty.jsonl'), '');
    expect(readDetails(join(dir, 'empty.jsonl'))).toEqual({ lastMessage: null, branch: null, activity: [] });
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
    expect(details).toEqual({ lastMessage: 'valid text', branch: 'dev', activity: ['AskUserQuestion'] });
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

describe('#19 transcripts that moved into a worktree', () => {
  const cwd = '/home/alex/projects/demo-app';
  const worktreeFolder = '-home-alex-projects-demo-app--claude-worktrees-tk-epic-9';
  function configWith(folder: string, sessionId: string, content: string) {
    const config = mkdtempSync(join(tmpdir(), 'office-config-'));
    mkdirSync(join(config, 'projects', folder), { recursive: true });
    mkdirSync(join(config, 'projects', 'some-other-project'), { recursive: true });
    writeFileSync(join(config, 'projects', folder, `${sessionId}.jsonl`), content);
    return config;
  }

  it('#19 AC1 finds <sessionId>.jsonl in any folder under $CLAUDE_CONFIG_DIR/projects when it is not under the start cwd', () => {
    const config = configWith(worktreeFolder, SESSION, 'x');
    const find = transcriptFinder({ env: { CLAUDE_CONFIG_DIR: config } });
    expect(find(cwd, SESSION)).toBe(join(config, 'projects', worktreeFolder, `${SESSION}.jsonl`));
    expect(find(cwd, 'session-missing')).toBeNull();
  });

  it('#19 AC1 the start cwd folder still wins when the transcript is there', () => {
    const config = configWith('-home-alex-projects-demo-app', SESSION, 'x');
    const find = transcriptFinder({ env: { CLAUDE_CONFIG_DIR: config } });
    expect(find(cwd, SESSION)).toBe(transcriptPath(cwd, SESSION, { env: { CLAUDE_CONFIG_DIR: config } }));
  });

  it('#19 AC1 a missing projects folder means no transcript', () => {
    const find = transcriptFinder({ env: { CLAUDE_CONFIG_DIR: join(tmpdir(), 'office-no-such-config') } });
    expect(find(cwd, SESSION)).toBeNull();
  });

  it('#19 AC2 an ended session whose transcript is under a worktree folder stays, with its last message and branch', async () => {
    const config = configWith(worktreeFolder, SESSION, assistant([text('Built it')], { gitBranch: 'tk/epic-9' }));
    const entries: AgentEntry[] = [{ id: 'a1', cwd, sessionId: SESSION, name: 'one', state: 'done' }];
    const agents = await loadAgents({ list: async () => entries, paths: { env: { CLAUDE_CONFIG_DIR: config } }, now: Date.now() });
    expect(agents.map((a) => [a.id, a.state, a.lastMessage, a.branch])).toEqual([['a1', 'finished', 'Built it', 'tk/epic-9']]);
  });

  it('#19 AC3 an ended session with no transcript anywhere is left out', async () => {
    const config = configWith(worktreeFolder, SESSION, assistant([text('Built it')]));
    const entries: AgentEntry[] = [
      { id: 'a1', cwd, sessionId: 'session-gone', name: 'gone', state: 'done' },
      { id: 'a2', cwd, sessionId: 'session-gone-2', name: 'gone too', state: 'stopped' },
    ];
    const agents = await loadAgents({ list: async () => entries, paths: { env: { CLAUDE_CONFIG_DIR: config } }, now: Date.now() });
    expect(agents).toEqual([]);
  });
});
