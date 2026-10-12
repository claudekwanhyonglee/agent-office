import type { AgentRecord, OfficeState } from '../shared/agent.ts';

/** The parts of a Claude Code cloud session (from the Claude Code Remote `list_sessions` tool) the office uses. */
export interface CloudSession {
  id: string;
  title?: string;
  session_status?: string;
  status_bucket?: string;
  updated_at?: string;
  session_context?: {
    sources?: { git_repository?: { url?: string } }[];
    outcomes?: { git_repository?: { git_info?: { repo?: string; branches?: string[] } } }[];
  };
  post_turn_summary?: { status_detail?: string; recent_action?: string; needs_action?: string };
  external_metadata?: { current_branches?: Record<string, string | null> };
}

const DAY = 24 * 3600_000;

export function mapCloudState({ status_bucket: bucket, session_status: status }: CloudSession): OfficeState {
  const archived = status === 'SESSION_STATUS_ARCHIVED';
  switch (bucket) {
    case 'SESSION_STATUS_BUCKET_WORKING': return archived ? 'stale' : 'working';
    case 'SESSION_STATUS_BUCKET_BLOCKED': return archived ? 'stale' : 'needs';
    case 'SESSION_STATUS_BUCKET_REVIEW_READY': return archived ? 'finished' : 'done';
    case 'SESSION_STATUS_BUCKET_COMPLETED': return archived ? 'finished' : 'done';
    case 'SESSION_STATUS_BUCKET_FAILED': return 'stale';
    // ponytail: unknown buckets of a live session show as done; map them here if new ones appear.
    default: return archived ? 'finished' : 'done';
  }
}

/** Repo name (`owner/repo` → `repo`), or "Claude" for sessions without one. */
export function cloudProject(session: CloudSession) {
  const repo = session.session_context?.outcomes?.find((o) => o.git_repository?.git_info?.repo)?.git_repository?.git_info?.repo
    ?? session.session_context?.sources?.find((s) => s.git_repository?.url)?.git_repository?.url;
  return repo?.replace(/\.git$/, '').split('/').filter(Boolean).at(-1) ?? 'Claude';
}

function cloudBranch(session: CloudSession) {
  const current = Object.values(session.external_metadata?.current_branches ?? {}).find(Boolean);
  return current ?? session.session_context?.outcomes?.[0]?.git_repository?.git_info?.branches?.[0] ?? null;
}

export function toCloudRecord(session: CloudSession): AgentRecord {
  const state = mapCloudState(session);
  const summary = session.post_turn_summary ?? {};
  const lastMessage = (state === 'needs' && summary.needs_action) || summary.status_detail || summary.recent_action || null;
  return {
    id: session.id,
    sessionId: session.id,
    name: session.title || 'Untitled session',
    project: cloudProject(session),
    cwd: '',
    state,
    lastMessage,
    branch: cloudBranch(session),
    activity: [summary.recent_action, summary.status_detail].filter((line): line is string => !!line),
  };
}

/** Live sessions, plus ended ones touched in the last day (like the local office). */
export function buildCloudList(sessions: CloudSession[], now: number) {
  return sessions.map(toCloudRecord).filter((record, i) => {
    // Idle sessions pile up for weeks; keep only ones working, waiting on you, or touched in the last day.
    if (record.state === 'working' || record.state === 'needs') return true;
    const updated = Date.parse(sessions[i].updated_at ?? '');
    return Number.isFinite(updated) && now - updated < DAY;
  });
}

/** Pulls the session list out of a `list_sessions` payload, whatever wrapping it arrives in. */
export function sessionsFromPayload(payload: unknown): CloudSession[] {
  let value = payload;
  if (typeof value === 'string') {
    const start = value.indexOf('{');
    const end = value.lastIndexOf('}');
    try { value = JSON.parse(value.slice(start, end + 1)); } catch { return []; }
  }
  if (Array.isArray(value)) return value as CloudSession[];
  const v = value as { ccr?: { data?: unknown }; data?: unknown } | null;
  const list = v?.ccr?.data ?? v?.data;
  return Array.isArray(list) ? (list as CloudSession[]) : [];
}

/** Code-session ids (cse_…) and session ids (session_…) name the same session; claude.ai links use the latter. */
export const sessionUrl = (record: AgentRecord) => `https://claude.ai/code/${encodeURIComponent(record.sessionId.replace(/^cse_/, 'session_'))}`;
