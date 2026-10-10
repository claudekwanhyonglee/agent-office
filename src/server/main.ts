import { fileURLToPath } from 'node:url';
import { HOST, resolvePort, startServer } from './http.ts';

const staticDir = fileURLToPath(new URL('../../client', import.meta.url));
const port = resolvePort(process.env);

await startServer({ port, staticDir });
console.log(`Agent Office is running at http://${HOST}:${port}`);
