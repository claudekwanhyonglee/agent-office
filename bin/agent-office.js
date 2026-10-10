#!/usr/bin/env node
// Builds the app on first run (e.g. from a git checkout), then starts the server.
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const server = new URL('../dist/node/server/main.js', import.meta.url);
const client = new URL('../dist/client/index.html', import.meta.url);

if (!existsSync(server) || !existsSync(client)) {
  const build = spawnSync('npm', ['run', 'build'], { cwd: root, stdio: 'inherit', shell: true });
  if (build.status !== 0) process.exit(build.status ?? 1);
}

await import(server.href);
