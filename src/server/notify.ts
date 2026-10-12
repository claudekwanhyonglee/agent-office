import { execFile } from 'node:child_process';
import type { AgentRecord } from '../shared/agent.ts';

/** A macOS notification via osascript; elsewhere it does nothing. */
export function macNotify(title: string, body: string) {
  if (process.platform !== 'darwin') return;
  const clean = (text: string) => text.replace(/[\u0000-\u001f\u007f]+/g, ' ').slice(0, 200);
  [title, body] = [clean(title), clean(body)];
  // JSON string escapes (\" \\ \n) are also valid AppleScript string escapes.
  execFile('osascript', ['-e', `display notification ${JSON.stringify(body)} with title ${JSON.stringify(title)} sound name "Glass"`], () => {});
}

/**
 * Calls `send` when a session starts needing you. The first list only primes it,
 * so starting the office doesn't announce every session already waiting.
 */
export function createNeedsNotifier(send: (title: string, body: string) => void = macNotify) {
  let needing: Set<string> | null = null;
  return (records: AgentRecord[]) => {
    const now = new Set(records.filter((r) => r.state === 'needs').map((r) => r.sessionId));
    if (needing) for (const r of records) if (now.has(r.sessionId) && !needing.has(r.sessionId)) send(`${r.name} needs you`, r.lastMessage ?? r.project);
    needing = now;
  };
}
