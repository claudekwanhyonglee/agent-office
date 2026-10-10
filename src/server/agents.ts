import type { AgentRecord, OfficeState } from '../shared/agent.ts';

/** One entry of `claude agents --json --all`. Ended sessions have no pid. */
export interface AgentEntry {
  pid?: number;
  id: string;
  cwd: string;
  sessionId: string;
  name?: string;
  state?: string;
}

const DAY = 24 * 3600_000;

export function mapState({ pid, state }: Pick<AgentEntry, 'pid' | 'state'>): OfficeState {
  const running = pid != null;
  if (state === 'stopped') return 'stale';
  if (state === 'done') return running ? 'done' : 'finished';
  if (!running) return 'stale';
  if (state === 'blocked') return 'needs';
  // ponytail: unknown states of a live session show as working; map them here if new ones appear.
  return 'working';
}

/** Repo folder name; `<repo>/.claude/worktrees/<name>` resolves to `<repo>`. */
export function projectName(cwd: string) {
  const parts = cwd.split(/[\\/]+/).filter(Boolean);
  const claude = parts.lastIndexOf('.claude');
  const inWorktree = claude > 0 && parts[claude + 1] === 'worktrees';
  return (inWorktree ? parts[claude - 1] : parts.at(-1)) ?? cwd;
}

export function toRecord(entry: AgentEntry): AgentRecord {
  return {
    id: entry.id,
    sessionId: entry.sessionId,
    name: entry.name || entry.id,
    project: projectName(entry.cwd),
    cwd: entry.cwd,
    state: mapState(entry),
  };
}

export const isEnded = (state: OfficeState) => state === 'finished' || state === 'stale';

interface ListOptions {
  now: number;
  /** Transcript modified time in ms, or null when there is no transcript. */
  transcriptModified: (entry: AgentEntry) => number | null;
}

export function buildAgentList(entries: AgentEntry[], { now, transcriptModified }: ListOptions) {
  return entries.map((entry) => ({ entry, record: toRecord(entry) })).filter(({ entry, record }) => {
    if (!isEnded(record.state)) return true;
    const modified = transcriptModified(entry);
    return modified != null && now - modified < DAY;
  }).map(({ record }) => record);
}
