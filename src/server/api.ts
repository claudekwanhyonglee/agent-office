import type { IncomingMessage, ServerResponse } from 'node:http';
import type { ApiHandler } from './http.ts';
import type { Feed } from './feed.ts';
import type { AckStore } from './acknowledged.ts';

const MAX_BODY = 4096;
const MAX_ID = 200;

export function createApi(feed: Feed, acknowledged?: AckStore): ApiHandler {
  return async (req, res) => {
    const path = new URL(req.url ?? '/', 'http://local').pathname;

    if (req.method === 'GET' && path === '/api/agents') {
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
      res.end(JSON.stringify(feed.current()));
      return true;
    }

    if (req.method === 'GET' && path === '/api/events') {
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive' });
      const send = (payload: unknown) => res.write(`data: ${JSON.stringify(payload)}\n\n`);
      send(feed.current());
      const unsubscribe = feed.subscribe(send);
      req.on('close', unsubscribe);
      return true;
    }

    if (req.method === 'POST' && path === '/api/acknowledge' && acknowledged) {
      // JSON only: browsers can't send it cross-site without a preflight we never answer.
      if (!req.headers['content-type']?.startsWith('application/json')) return reply(res, 415, 'Send JSON.');
      let sessionId: unknown;
      try {
        sessionId = JSON.parse(await readBody(req)).sessionId;
      } catch {
        return reply(res, 400, 'Body must be JSON: { "sessionId": "…" }.');
      }
      if (typeof sessionId !== 'string' || !sessionId || sessionId.length > MAX_ID) return reply(res, 400, 'Missing or invalid sessionId.');
      acknowledged.add(sessionId);
      await feed.refresh();
      res.writeHead(204).end();
      return true;
    }

    return false;
  };
}

function reply(res: ServerResponse, status: number, message: string) {
  res.writeHead(status, { 'content-type': 'text/plain; charset=utf-8' }).end(message);
  return true;
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', (chunk: string) => {
      body += chunk;
      if (body.length > MAX_BODY) { reject(new Error('too large')); req.destroy(); }
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}
