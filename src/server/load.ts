import type { AgentRecord } from '../shared/agent.ts';
import { buildAgentList, type AgentEntry } from './agents.ts';
import { modifiedTime, readDetails, transcriptPath, type Paths } from './transcript.ts';

interface LoadOptions {
  list: () => Promise<AgentEntry[]>;
  paths?: Paths;
  now: number;
}

/** The agent records the page shows: claude agents entries plus transcript details. */
export async function loadAgents({ list, paths = {}, now }: LoadOptions): Promise<AgentRecord[]> {
  const entries = await list();
  const transcriptOf = new Map(entries.map((e) => [e.sessionId, transcriptPath(e.cwd, e.sessionId, paths)]));
  const records = buildAgentList(entries, { now, transcriptModified: (e) => modifiedTime(transcriptOf.get(e.sessionId)!) });
  return records.map((record) => ({ ...record, ...readDetails(transcriptOf.get(record.sessionId)!) }));
}
