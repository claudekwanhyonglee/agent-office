import { afterEach, describe, expect, it } from 'vitest';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startServer } from '../src/server/http.ts';
import { createApi } from '../src/server/api.ts';
import { createFeed, type FeedPayload } from '../src/server/feed.ts';
import { listClaudeAgents } from '../src/server/claude.ts';
import type { AgentRecord } from '../src/shared/agent.ts';

const agent = (id: string, state: AgentRecord['state'] = 'working'): AgentRecord => ({
  id, sessionId: `${id}-session`, name: `agent ${id}`, project: 'demo-app', cwd: '/home/alex/projects/demo-app', state,
});

let server: Server | undefined;
afterEach(() => server?.close());

async function serve(load: () => Promise<AgentRecord[]>) {
  const feed = createFeed(load);
  await feed.refresh();
  const staticDir = mkdtempSync(join(tmpdir(), 'office-static-'));
  writeFileSync(join(staticDir, 'index.html'), 'page');
  server = await startServer({ port: 0, staticDir, api: createApi(feed) });
  const { port } = server.address() as AddressInfo;
  return { feed, base: `http://127.0.0.1:${port}` };
}

/** Reads server-sent events until `count` have arrived. */
async function readEvents(url: string, count: number, whileOpen?: () => Promise<void>) {
  const controller = new AbortController();
  const res = await fetch(url, { signal: controller.signal });
  expect(res.headers.get('content-type')).toContain('text/event-stream');
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  const events: unknown[] = [];
  let buffer = '';
  let started = false;
  while (events.length < count) {
    if (events.length === 1 && !started && whileOpen) { started = true; await whileOpen(); }
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let end;
    while ((end = buffer.indexOf('\n\n')) >= 0) {
      const chunk = buffer.slice(0, end);
      buffer = buffer.slice(end + 2);
      const data = chunk.split('\n').filter((l) => l.startsWith('data: ')).map((l) => l.slice(6)).join('\n');
      if (data) events.push(JSON.parse(data));
    }
  }
  controller.abort();
  return events;
}

describe('#3 AC4 API', () => {
  it('#3 AC4 GET /api/agents returns the current list', async () => {
    const { base } = await serve(async () => [agent('a1')]);
    const res = await fetch(`${base}/api/agents`);
    expect(res.headers.get('content-type')).toContain('application/json');
    expect(await res.json()).toEqual([agent('a1')]);
  });

  it('#3 AC4 the event stream sends the list on connect and again only when it changes', async () => {
    let list = [agent('a1')];
    const { feed, base } = await serve(async () => list);
    const events = await readEvents(`${base}/api/events`, 2, async () => {
      await feed.refresh(); // unchanged: nothing sent
      list = [agent('a1', 'needs')];
      await feed.refresh(); // changed: sent
    });
    expect(events).toEqual([[agent('a1')], [agent('a1', 'needs')]]);
  });

  it('#3 AC4 feed notifies subscribers only on change', async () => {
    let list = [agent('a1')];
    const feed = createFeed(async () => list);
    const seen: FeedPayload[] = [];
    feed.subscribe((p) => seen.push(p));
    await feed.refresh();
    await feed.refresh();
    list = [];
    await feed.refresh();
    expect(seen).toEqual([[agent('a1')], []]);
  });
});

describe('#3 AC5 claude agents failures', () => {
  const node = process.execPath;

  it('#3 AC5 parses the JSON list', async () => {
    const out = await listClaudeAgents({ command: node, args: ['-e', 'console.log(JSON.stringify([{id:"x1",state:"done"}]))'] });
    expect(out).toEqual([{ id: 'x1', state: 'done' }]);
  });

  it('#3 AC5 reports a missing command', async () => {
    await expect(listClaudeAgents({ command: 'definitely-not-a-real-command-xyz', args: [] })).rejects.toThrow(/not found/i);
  });

  it('#3 AC5 reports a non-zero exit', async () => {
    await expect(listClaudeAgents({ command: node, args: ['-e', 'console.error("boom"); process.exit(3)'] })).rejects.toThrow(/boom/);
  });

  it('#3 AC5 reports unparseable output', async () => {
    await expect(listClaudeAgents({ command: node, args: ['-e', 'console.log("not json")'] })).rejects.toThrow(/couldn.t read/i);
  });

  it('#3 AC5 /api/agents and the stream carry the error', async () => {
    const { base } = await serve(async () => { throw new Error('claude exploded'); });
    expect(await (await fetch(`${base}/api/agents`)).json()).toEqual({ error: 'claude exploded' });
    expect(await readEvents(`${base}/api/events`, 1)).toEqual([{ error: 'claude exploded' }]);
  });
});
