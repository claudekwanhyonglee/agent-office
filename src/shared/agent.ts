export type OfficeState = 'working' | 'needs' | 'done' | 'finished' | 'stale';

export interface AgentRecord {
  id: string;
  sessionId: string;
  name: string;
  project: string;
  cwd: string;
  state: OfficeState;
}

/** What /api/agents returns and the event stream sends. */
export type FeedPayload = AgentRecord[] | { error: string };
