import type { AgentRecord } from '../shared/agent.ts';
import { buildAgentList, isEnded, mapState, type AgentEntry } from './agents.ts';
import { modifiedTime, readDetails, transcriptFinder, type Paths } from './transcript.ts';

interface LoadOptions {
  list: () => Promise<AgentEntry[]>;
  paths?: Paths;
  now: number;
  /** Sessions dismissed with "Got it" are left out while ended; running again un-dismisses them. */
  acknowledged?: { has(sessionId: string): boolean; remove(sessionId: string): void };
}

/** The agent records the page shows: claude agents entries plus transcript details. */
export async function loadAgents({ list, paths = {}, now, acknowledged }: LoadOptions): Promise<AgentRecord[]> {
  const entries = (await list()).filter((e) => {
    if (!acknowledged?.has(e.sessionId)) return true;
    if (isEnded(mapState(e))) return false;
    acknowledged.remove(e.sessionId);
    return true;
  });
  const find = transcriptFinder(paths);
  const transcriptOf = new Map(entries.map((e) => [e.sessionId, find(e.cwd, e.sessionId)]));
  const records = buildAgentList(entries, { now, transcriptModified: (e) => modifiedTime(transcriptOf.get(e.sessionId) ?? null) });
  return records.map((record) => ({ ...record, ...readDetails(transcriptOf.get(record.sessionId) ?? null) }));
}
