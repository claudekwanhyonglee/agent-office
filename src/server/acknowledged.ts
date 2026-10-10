import path from 'node:path';
import os from 'node:os';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

type PathApi = Pick<typeof path, 'join'>;

export function acknowledgedFile(homedir = os.homedir(), pathApi: PathApi = path) {
  return pathApi.join(homedir, '.agent-office', 'acknowledged.json');
}

/** Session ids the user dismissed with "Got it", kept in a JSON list on disk. */
export function createAckStore(file = acknowledgedFile()) {
  const ids = new Set<string>(readIds(file));
  function save() {
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify([...ids], null, 2));
  }
  return {
    has: (sessionId: string) => ids.has(sessionId),
    add(sessionId: string) {
      if (ids.has(sessionId)) return;
      ids.add(sessionId);
      save();
    },
    remove(sessionId: string) {
      if (ids.delete(sessionId)) save();
    },
  };
}

export type AckStore = ReturnType<typeof createAckStore>;

function readIds(file: string): string[] {
  try {
    const list = JSON.parse(readFileSync(file, 'utf8'));
    return Array.isArray(list) ? list.filter((id) => typeof id === 'string') : [];
  } catch {
    return [];
  }
}
