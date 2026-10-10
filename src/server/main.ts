import { fileURLToPath } from 'node:url';
import { HOST, resolvePort, startServer } from './http.ts';
import { createApi } from './api.ts';
import { createFeed } from './feed.ts';
import { listClaudeAgents } from './claude.ts';
import { buildAgentList } from './agents.ts';
import { modifiedTime, transcriptPath } from './transcript.ts';

const POLL_MS = 2000;
const staticDir = fileURLToPath(new URL('../../client', import.meta.url));
const port = resolvePort(process.env);

const feed = createFeed(async () =>
  buildAgentList(await listClaudeAgents(), {
    now: Date.now(),
    transcriptModified: (entry) => modifiedTime(transcriptPath(entry.cwd, entry.sessionId)),
  }),
);
await feed.poll(POLL_MS);

await startServer({ port, staticDir, api: createApi(feed) });
console.log(`Agent Office is running at http://${HOST}:${port}`);
