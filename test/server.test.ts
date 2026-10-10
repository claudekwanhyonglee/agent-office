import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { resolvePort, startServer } from '../src/server/http.ts';

let server: Server | undefined;
afterEach(() => server?.close());

function staticDir() {
  const dir = mkdtempSync(join(tmpdir(), 'office-static-'));
  writeFileSync(join(dir, 'index.html'), '<!doctype html><title>Agent Office</title>');
  return dir;
}

describe('#2 AC1 server', () => {
  it('#2 AC1 defaults to port 4321 and PORT overrides it', () => {
    expect(resolvePort({})).toBe(4321);
    expect(resolvePort({ PORT: '5000' })).toBe(5000);
  });

  it('#2 AC1 listens on 127.0.0.1 only and serves the page', async () => {
    server = await startServer({ port: 0, staticDir: staticDir() });
    const address = server.address() as AddressInfo;
    expect(address.address).toBe('127.0.0.1');
    const res = await fetch(`http://127.0.0.1:${address.port}/`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');
    expect(await res.text()).toContain('Agent Office');
  });

  it('#2 AC1 does not serve files outside the static folder', async () => {
    server = await startServer({ port: 0, staticDir: staticDir() });
    const { port } = server.address() as AddressInfo;
    const res = await fetch(`http://127.0.0.1:${port}/..%2f..%2fetc%2fpasswd`);
    expect(res.status).toBe(404);
  });
});
