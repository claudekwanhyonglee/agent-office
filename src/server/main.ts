import { fileURLToPath } from 'node:url';
import { HOST, resolvePort, startServer } from './http.ts';
import { createApi } from './api.ts';
import { createFeed } from './feed.ts';
import { listClaudeAgents } from './claude.ts';
import { loadAgents } from './load.ts';
import { createAckStore } from './acknowledged.ts';

const POLL_MS = 2000;
const staticDir = fileURLToPath(new URL('../../client', import.meta.url));
const port = resolvePort(process.env);

const acknowledged = createAckStore();
const feed = createFeed(() => loadAgents({ list: listClaudeAgents, now: Date.now(), acknowledged }));
await feed.poll(POLL_MS);

try {
  await startServer({ port, staticDir, api: createApi(feed, acknowledged) });
} catch (error) {
  const inUse = (error as NodeJS.ErrnoException).code === 'EADDRINUSE';
  console.error(inUse ? `Port ${port} is already in use. Start with another port, e.g. PORT=${port + 1}.` : String(error));
  process.exit(1);
}
console.log(`Agent Office is running at http://${HOST}:${port}`);

const startup = feed.current();
if (!Array.isArray(startup)) console.error(startup.error);
