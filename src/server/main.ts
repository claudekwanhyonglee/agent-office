import { fileURLToPath } from 'node:url';
import { HOST, lanUrls, resolvePort, startServer, wantsLan } from './http.ts';
import { createApi } from './api.ts';
import { createFeed } from './feed.ts';
import { listClaudeAgents } from './claude.ts';
import { loadAgents } from './load.ts';
import { createAckStore } from './acknowledged.ts';
import { limitsFile, readLimits } from './limits.ts';
import { enableTracking, refreshScript, trackingFiles, trackingStatus } from './tracking.ts';

const POLL_MS = 2000;
const staticDir = fileURLToPath(new URL('../../client', import.meta.url));
const port = resolvePort(process.env);
const lan = wantsLan(process.argv, process.env);

const acknowledged = createAckStore();
const tracking = { ...trackingFiles(), scriptSource: fileURLToPath(new URL('../../../bin/statusline.js', import.meta.url)) };
refreshScript(tracking);
const readUsage = () => ({ tracking: trackingStatus(tracking), limits: readLimits(limitsFile(), Date.now()) });
const usage = { read: readUsage, enable: () => (enableTracking(tracking), readUsage()) };
const feed = createFeed(() => loadAgents({ list: listClaudeAgents, now: Date.now(), acknowledged }));
await feed.poll(POLL_MS);

try {
  await startServer({ port, staticDir, api: createApi(feed, acknowledged, usage), lan });
} catch (error) {
  const inUse = (error as NodeJS.ErrnoException).code === 'EADDRINUSE';
  console.error(inUse ? `Port ${port} is already in use. Start with another port, e.g. PORT=${port + 1}.` : String(error));
  process.exit(1);
}
console.log(`Agent Office is running at http://${HOST}:${port}`);
if (lan) lanUrls(port).forEach((line) => console.log(line));

const startup = feed.current();
if (!Array.isArray(startup)) console.error(startup.error);
