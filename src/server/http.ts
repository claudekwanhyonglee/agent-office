import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, resolve, sep } from 'node:path';

export const HOST = '127.0.0.1';
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

export type ApiHandler = (req: IncomingMessage, res: ServerResponse) => boolean | Promise<boolean>;

export interface ServerOptions {
  port: number;
  staticDir: string;
  api?: ApiHandler;
}

export function startServer({ port, staticDir, api }: ServerOptions): Promise<Server> {
  const server = createServer(async (req, res) => {
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
    server.listen(port, HOST, () => done(server));
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
