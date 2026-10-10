import { afterEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { createAckStore, acknowledgedFile } from '../src/server/acknowledged.ts';
import { loadAgents } from '../src/server/load.ts';
import { createFeed } from '../src/server/feed.ts';
import { createApi } from '../src/server/api.ts';
import { startServer } from '../src/server/http.ts';
import type { AgentEntry } from '../src/server/agents.ts';

const home = () => mkdtempSync(join(tmpdir(), 'office-home-'));
const cwd = '/home/alex/projects/demo-app';
// session-2 has ended (no pid): only ended sessions can be dismissed (#20).
const entries: AgentEntry[] = [
  { pid: 1, id: 'a1', cwd, sessionId: 'session-1', name: 'one', state: 'working' },
  { id: 'a2', cwd, sessionId: 'session-2', name: 'two', state: 'done' },
];

/** A Claude config dir with a fresh transcript for each session, so ended ones stay listed. */
function configWithTranscripts(...sessionIds: string[]) {
  const config = mkdtempSync(join(tmpdir(), 'office-config-'));
  const dir = join(config, 'projects', '-home-alex-projects-demo-app');
  mkdirSync(dir, { recursive: true });
  for (const id of sessionIds) writeFileSync(join(dir, `${id}.jsonl`), '');
  return { env: { CLAUDE_CONFIG_DIR: config } };
}
const paths = configWithTranscripts('session-1', 'session-2');

let server: Server | undefined;
afterEach(() => server?.close());

async function serveWith(store: ReturnType<typeof createAckStore>) {
  const feed = createFeed(() => loadAgents({ list: async () => entries, paths, now: Date.now(), acknowledged: store }));
  await feed.refresh();
  const staticDir = mkdtempSync(join(tmpdir(), 'office-static-'));
  writeFileSync(join(staticDir, 'index.html'), 'page');
  server = await startServer({ port: 0, staticDir, api: createApi(feed, store) });
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

const post = (base: string, body: string, type = 'application/json') =>
  fetch(`${base}/api/acknowledge`, { method: 'POST', headers: { 'content-type': type }, body });

describe('#6 AC3 Got it', () => {
  it('#6 AC3 the file lives at ~/.agent-office/acknowledged.json', () => {
    expect(acknowledgedFile('/home/alex')).toBe(join('/home/alex', '.agent-office', 'acknowledged.json'));
  });

  it('#6 AC3 adds the id to the file, creating the folder', () => {
    const file = join(home(), '.agent-office', 'acknowledged.json');
    const store = createAckStore(file);
    store.add('session-1');
    expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual(['session-1']);
    store.add('session-1');
    store.add('session-2');
    expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual(['session-1', 'session-2']);
  });

  it('#6 AC3 POST /api/acknowledge hides the session from /api/agents, also after a restart', async () => {
    const file = join(home(), '.agent-office', 'acknowledged.json');
    let base = await serveWith(createAckStore(file));
    expect((await (await fetch(`${base}/api/agents`)).json()).map((a: { id: string }) => a.id)).toEqual(['a1', 'a2']);
    expect((await post(base, JSON.stringify({ sessionId: 'session-2' }))).status).toBe(204);
    expect((await (await fetch(`${base}/api/agents`)).json()).map((a: { id: string }) => a.id)).toEqual(['a1']);

    server!.close();
    base = await serveWith(createAckStore(file)); // restart: reads the file again
    expect((await (await fetch(`${base}/api/agents`)).json()).map((a: { id: string }) => a.id)).toEqual(['a1']);
    expect(existsSync(file)).toBe(true);
  });

  it('#6 AC3 rejects bad requests', async () => {
    const base = await serveWith(createAckStore(join(home(), '.agent-office', 'acknowledged.json')));
    expect((await post(base, 'session-1', 'text/plain')).status).toBe(415);
    expect((await post(base, '{nope')).status).toBe(400);
    expect((await post(base, JSON.stringify({ sessionId: 42 }))).status).toBe(400);
    expect((await post(base, JSON.stringify({ sessionId: 'x'.repeat(500) }))).status).toBe(400);
  });

  it('#6 AC3 a damaged file is treated as empty', () => {
    const dir = home();
    const file = join(dir, 'acknowledged.json');
    writeFileSync(file, 'not json');
    expect(createAckStore(file).has('session-1')).toBe(false);
  });
});

describe('#20 a dismissed session comes back when it runs again', () => {
  const ids = (records: { id: string }[]) => records.map((r) => r.id);
  const entry = (state: string, pid?: number): AgentEntry => ({ ...(pid ? { pid } : {}), id: 'a2', cwd, sessionId: 'session-2', name: 'two', state });
  const load = (store: ReturnType<typeof createAckStore>, e: AgentEntry) =>
    loadAgents({ list: async () => [e], paths, now: Date.now(), acknowledged: store });
  const dismissed = () => {
    const file = join(home(), 'acknowledged.json');
    const store = createAckStore(file);
    store.add('session-2');
    return { file, store };
  };

  it('#20 AC1 a dismissed session stays hidden while it is finished or stale', async () => {
    const { file, store } = dismissed();
    expect(await load(store, entry('done'))).toEqual([]); // finished
    expect(await load(store, entry('stopped'))).toEqual([]); // stale
    expect(await load(store, entry('working'))).toEqual([]); // stale: no pid
    expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual(['session-2']);
  });

  for (const [label, live] of [['working', entry('working', 7)], ['needs', entry('blocked', 7)], ['done with a pid', entry('done', 7)]] as const) {
    it(`#20 AC2 when it shows up ${label}, it is listed again and removed from the store on disk`, async () => {
      const { file, store } = dismissed();
      expect(ids(await load(store, live))).toEqual(['a2']);
      expect(store.has('session-2')).toBe(false);
      expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual([]);
      expect(createAckStore(file).has('session-2')).toBe(false);
    });
  }

  it('#20 AC3 when it ends again it stays until Got it is pressed again', async () => {
    const { store } = dismissed();
    await load(store, entry('working', 7));
    expect((await load(store, entry('done'))).map((r) => [r.id, r.state])).toEqual([['a2', 'finished']]);
    store.add('session-2');
    expect(await load(store, entry('done'))).toEqual([]);
  });
});
