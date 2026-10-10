import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
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
const entries: AgentEntry[] = [
  { pid: 1, id: 'a1', cwd: '/home/alex/projects/demo-app', sessionId: 'session-1', name: 'one', state: 'working' },
  { pid: 2, id: 'a2', cwd: '/home/alex/projects/demo-app', sessionId: 'session-2', name: 'two', state: 'done' },
];

let server: Server | undefined;
afterEach(() => server?.close());

async function serveWith(store: ReturnType<typeof createAckStore>) {
  const feed = createFeed(() => loadAgents({ list: async () => entries, now: Date.now(), acknowledged: store }));
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
