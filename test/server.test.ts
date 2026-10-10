import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { readFileSync } from 'node:fs';
import type { NetworkInterfaceInfo } from 'node:os';
import { lanUrls, resolvePort, startServer, wantsLan } from '../src/server/http.ts';

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

  it('privacy: refuses requests addressed to another host name', async () => {
    server = await startServer({ port: 0, staticDir: staticDir() });
    const { port } = server.address() as AddressInfo;
    const { request } = await import('node:http');
    const status = await new Promise<number>((done) => {
      request({ host: '127.0.0.1', port, path: '/', headers: { host: 'attacker.example' } }, (res) => done(res.statusCode!)).end();
    });
    expect(status).toBe(403);
  });

  it('#2 AC1 does not serve files outside the static folder', async () => {
    server = await startServer({ port: 0, staticDir: staticDir() });
    const { port } = server.address() as AddressInfo;
    const res = await fetch(`http://127.0.0.1:${port}/..%2f..%2fetc%2fpasswd`);
    expect(res.status).toBe(404);
  });
});

function statusFor(port: number, host: string) {
  return import('node:http').then(({ request }) => new Promise<number>((done) => {
    request({ host: '127.0.0.1', port, path: '/', headers: { host } }, (res) => { res.resume(); done(res.statusCode!); }).end();
  }));
}

const nic = (address: string, family: 'IPv4' | 'IPv6', internal = false) =>
  ({ address, family, internal, netmask: '', mac: '', cidr: null }) as NetworkInterfaceInfo;
const interfaces = {
  lo: [nic('127.0.0.1', 'IPv4', true), nic('::1', 'IPv6', true)],
  eth0: [nic('192.168.1.50', 'IPv4'), nic('fe80::1', 'IPv6')],
  wlan0: [nic('10.0.0.7', 'IPv4')],
};

describe('#12 LAN access', () => {
  it('#12 AC1 without the flag, listens on 127.0.0.1 and refuses this machine\'s LAN address as Host', async () => {
    expect(wantsLan([], {})).toBe(false);
    server = await startServer({ port: 0, staticDir: staticDir(), addresses: ['192.168.1.50'] });
    const { address, port } = server.address() as AddressInfo;
    expect(address).toBe('127.0.0.1');
    expect(await statusFor(port, `192.168.1.50:${port}`)).toBe(403);
  });

  it('#12 AC2 --lan or LAN=1 turns it on', () => {
    expect(wantsLan(['node', 'agent-office', '--lan'], {})).toBe(true);
    expect(wantsLan(['node', 'agent-office'], { LAN: '1' })).toBe(true);
    expect(wantsLan(['node', 'agent-office'], { LAN: '0' })).toBe(false);
  });

  it('#12 AC2 in LAN mode listens on all interfaces', async () => {
    server = await startServer({ port: 0, staticDir: staticDir(), lan: true });
    expect((server.address() as AddressInfo).address).toBe('0.0.0.0');
  });

  it('#12 AC2 prints one "On your network" line per non-internal IPv4 address', () => {
    expect(lanUrls(4321, interfaces)).toEqual([
      'On your network: http://192.168.1.50:4321',
      'On your network: http://10.0.0.7:4321',
    ]);
  });

  it('#12 AC3 in LAN mode serves localhost, 127.0.0.1 and own addresses; any other Host gets 403', async () => {
    server = await startServer({ port: 0, staticDir: staticDir(), lan: true, addresses: ['192.168.1.50', 'fe80::1'] });
    const { port } = server.address() as AddressInfo;
    for (const host of [`localhost:${port}`, `127.0.0.1:${port}`, `192.168.1.50:${port}`, '192.168.1.50', `[fe80::1]:${port}`]) {
      expect(await statusFor(port, host), host).toBe(200);
    }
    for (const host of [`attacker.example:${port}`, `192.168.1.51:${port}`]) {
      expect(await statusFor(port, host), host).toBe(403);
    }
  });

  it('#12 AC4 README documents --lan / LAN=1 and that anyone on the network can view and press Got it', () => {
    const readme = readFileSync('README.md', 'utf8');
    expect(readme).toContain('--lan');
    expect(readme).toContain('LAN=1');
    expect(readme).toMatch(/anyone on (your|the) network can (see|view) the office and press \*{0,2}Got it/i);
    const privacy = readme.split('## Privacy')[1].split('\n## ')[0];
    expect(privacy).toMatch(/By default the server listens on 127\.0\.0\.1 only/);
    expect(privacy).toContain('--lan');
  });
});
