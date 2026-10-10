import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, resolve, sep } from 'node:path';
import { networkInterfaces } from 'node:os';

export const HOST = '127.0.0.1';
const ALL_INTERFACES = '0.0.0.0';
const DEFAULT_PORT = 4321;

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

export function resolvePort(env: NodeJS.ProcessEnv): number {
  const port = Number(env.PORT);
  return Number.isInteger(port) && port > 0 && port < 65536 ? port : DEFAULT_PORT;
}

/** LAN mode is opt-in: `agent-office --lan` or `LAN=1`. */
export const wantsLan = (argv: string[], env: NodeJS.ProcessEnv) => argv.includes('--lan') || env.LAN === '1';

type Interfaces = ReturnType<typeof networkInterfaces>;

/** Every address this machine answers to (used to accept LAN requests addressed to us). */
export const ownAddresses = (interfaces: Interfaces = networkInterfaces()) =>
  Object.values(interfaces).flatMap((list) => list ?? []).map((i) => i.address);

export const lanUrls = (port: number, interfaces: Interfaces = networkInterfaces()) =>
  Object.values(interfaces).flatMap((list) => list ?? [])
    .filter((i) => i.family === 'IPv4' && !i.internal)
    .map((i) => `On your network: http://${i.address}:${port}`);

/** The host name of a Host header, without port or IPv6 brackets. */
const hostName = (header = '') => header.match(/^\[(.*)\](?::\d+)?$/)?.[1] ?? header.replace(/:\d+$/, '');

export type ApiHandler = (req: IncomingMessage, res: ServerResponse) => boolean | Promise<boolean>;

export interface ServerOptions {
  port: number;
  staticDir: string;
  api?: ApiHandler;
  /** Listen on all interfaces and accept requests addressed to this machine's own IPs. */
  lan?: boolean;
  addresses?: string[];
}

export function startServer({ port, staticDir, api, lan = false, addresses = ownAddresses() }: ServerOptions): Promise<Server> {
  // Only answer requests addressed to this machine (blocks DNS rebinding).
  const allowedHosts = new Set([HOST, 'localhost', ...(lan ? addresses : [])]);
  const server = createServer(async (req, res) => {
    if (!allowedHosts.has(hostName(req.headers.host))) {
      res.writeHead(403, { 'content-type': 'text/plain' });
      return res.end('Forbidden');
    }
    try {
      if (api && (await api(req, res))) return;
      await serveStatic(staticDir, req, res);
    } catch (error) {
      if (!res.headersSent) res.writeHead(500, { 'content-type': 'text/plain' });
      res.end(String(error));
    }
  });
  return new Promise((done, fail) => {
    server.once('error', fail);
    server.listen(port, lan ? ALL_INTERFACES : HOST, () => done(server));
  });
}

async function serveStatic(staticDir: string, req: IncomingMessage, res: ServerResponse) {
  const root = resolve(staticDir);
  const urlPath = decodeURIComponent(new URL(req.url ?? '/', 'http://local').pathname);
  const file = resolve(join(root, urlPath === '/' ? 'index.html' : urlPath));
  if (!file.startsWith(root + sep)) return notFound(res);
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    notFound(res);
  }
}

function notFound(res: ServerResponse) {
  res.writeHead(404, { 'content-type': 'text/plain' });
  res.end('Not found');
}
