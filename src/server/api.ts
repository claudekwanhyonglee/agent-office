import type { ApiHandler } from './http.ts';
import type { Feed } from './feed.ts';

export function createApi(feed: Feed): ApiHandler {
  return (req, res) => {
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

    return false;
  };
}
