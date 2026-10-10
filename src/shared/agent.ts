export type OfficeState = 'working' | 'needs' | 'done' | 'finished' | 'stale';

/** What `claude agents` tells us about a session. */
export interface SessionRecord {
  id: string;
  sessionId: string;
  name: string;
  project: string;
  cwd: string;
  state: OfficeState;
}

/** A session plus what its transcript adds. */
export interface AgentRecord extends SessionRecord {
  lastMessage: string | null;
  branch: string | null;
}

/** What /api/agents returns and the event stream sends. */
export type FeedPayload = AgentRecord[] | { error: string };
