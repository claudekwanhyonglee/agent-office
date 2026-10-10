import type { AgentRecord, FeedPayload } from '../shared/agent.ts';

export type { FeedPayload };

/** Holds the latest agent list (or error) and tells subscribers when it changes. */
export function createFeed(load: () => Promise<AgentRecord[]>) {
  let current: FeedPayload = [];
  let currentJson = '';
  const subscribers = new Set<(payload: FeedPayload) => void>();

  async function refresh() {
    let next: FeedPayload;
    try {
      next = await load();
    } catch (error) {
      next = { error: error instanceof Error ? error.message : String(error) };
    }
    const json = JSON.stringify(next);
    if (json === currentJson) return;
    current = next;
    currentJson = json;
    subscribers.forEach((notify) => notify(current));
  }

  return {
    refresh,
    current: () => current,
    subscribe(notify: (payload: FeedPayload) => void) {
      subscribers.add(notify);
      return () => subscribers.delete(notify);
    },
    /** Refreshes every `intervalMs`, never overlapping. */
    poll(intervalMs: number) {
      const tick = () => refresh().finally(() => setTimeout(tick, intervalMs).unref());
      return tick();
    },
  };
}

export type Feed = ReturnType<typeof createFeed>;
