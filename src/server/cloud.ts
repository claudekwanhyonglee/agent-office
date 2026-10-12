// Cloud mode: lists your Claude Code cloud sessions (claude.ai/code, the Claude app, Projects)
// with the login `claude` already saved on this computer. The token is only ever sent to Anthropic's API.
// ponytail: this uses the same unpublished endpoint `claude --teleport` uses, so a Claude Code update may change it.
import { execFile } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { AgentRecord } from '../shared/agent.ts';
import { buildCloudList, type CloudSession } from '../cloud/sessions.ts';
import { claudeConfigDir } from './transcript.ts';

const API = process.env.ANTHROPIC_BASE_URL?.replace(/\/$/, '') || 'https://api.anthropic.com';
const BETA = 'ccr-byoc-2025-07-29';

export const wantsCloud = (argv: string[], env: NodeJS.ProcessEnv) => argv.includes('--cloud') || env.CLOUD === '1';

interface Login { token: string; expiresAt?: number; organization?: string }

const readJson = (read: () => string) => { try { return JSON.parse(read()); } catch { return null; } };

/** Why the keychain gave nothing, shown when no login is found. */
let keychainProblem = '';

function keychainCredentials(): Promise<string | null> {
  if (process.platform !== 'darwin') return Promise.resolve(null);
  return new Promise((resolve) => {
    // Generous timeout: macOS may be waiting for you to click Allow on its keychain prompt.
    execFile('security', ['find-generic-password', '-s', 'Claude Code-credentials', '-w'], { timeout: 120_000, maxBuffer: 32 * 1024 * 1024 }, (error, stdout, stderr) => {
      keychainProblem = error ? (error.killed ? 'the keychain prompt timed out' : String(stderr).trim() || error.message) : '';
      resolve(error ? null : stdout.trim());
    });
  });
}

/** The OAuth login `claude` saved: CLAUDE_CODE_OAUTH_TOKEN (from `claude setup-token`), the macOS keychain, or .credentials.json. */
export async function readLogin(env: NodeJS.ProcessEnv = process.env): Promise<Login | null> {
  const account = readJson(() => readFileSync(join(homedir(), '.claude.json'), 'utf8'));
  const organization: string | undefined = account?.oauthAccount?.organizationUuid;
  if (env.CLAUDE_CODE_OAUTH_TOKEN) return { token: env.CLAUDE_CODE_OAUTH_TOKEN, organization };
  const fromKeychain = await keychainCredentials();
  const raw = fromKeychain ?? readJson(() => readFileSync(join(claudeConfigDir(), '.credentials.json'), 'utf8'));
  const parsed = typeof raw === 'string' ? readJson(() => raw) : raw;
  const oauth = parsed?.claudeAiOauth;
  if (!oauth?.accessToken) {
    // Describe what was found without showing any of it.
    if (fromKeychain != null && !parsed) keychainProblem = `got ${fromKeychain.length} characters that aren't JSON (first character code ${fromKeychain.charCodeAt(0)})`;
    else if (parsed) keychainProblem = `found ${Object.keys(parsed).join(', ')} but no claudeAiOauth.accessToken`;
    else if (!keychainProblem) keychainProblem = fromKeychain == null ? 'nothing returned' : 'empty';
    return null;
  }
  return { token: oauth.accessToken, expiresAt: oauth.expiresAt, organization };
}

const NO_LOGIN = "Couldn't read your Claude login on this computer. Run `claude` and sign in with your Claude account, then restart Agent Office.";
const EXPIRED = 'Your Claude login on this computer has expired. Run `claude` once (it refreshes the login), or set CLAUDE_CODE_OAUTH_TOKEN from `claude setup-token` so it never expires.';

/** Older and newer session APIs name the state differently; this gives the office one status bucket. */
const BUCKET_FOR_STATUS: Record<string, string> = {
  working: 'SESSION_STATUS_BUCKET_WORKING', running: 'SESSION_STATUS_BUCKET_WORKING',
  waiting: 'SESSION_STATUS_BUCKET_BLOCKED', blocked: 'SESSION_STATUS_BUCKET_BLOCKED', requires_action: 'SESSION_STATUS_BUCKET_BLOCKED',
  idle: 'SESSION_STATUS_BUCKET_REVIEW_READY',
  completed: 'SESSION_STATUS_BUCKET_COMPLETED', archived: 'SESSION_STATUS_BUCKET_COMPLETED',
  cancelled: 'SESSION_STATUS_BUCKET_FAILED', rejected: 'SESSION_STATUS_BUCKET_FAILED', failed: 'SESSION_STATUS_BUCKET_FAILED',
};

export function normaliseSession(raw: Record<string, unknown>): CloudSession {
  const session = raw as unknown as CloudSession & {
    status?: string; worker_status?: string; last_event_at?: string;
    config?: CloudSession['session_context'];
    external_metadata?: CloudSession['external_metadata'] & { post_turn_summary?: CloudSession['post_turn_summary'] };
  };
  const status = String(session.session_status ?? session.status ?? '').replace(/^SESSION_STATUS_/, '').toLowerCase();
  // /v1/code/sessions sends lowercase buckets ("working"); a worker waiting on a permission prompt needs you.
  const bucket = session.worker_status === 'requires_action' ? 'blocked' : session.status_bucket;
  return {
    ...session,
    session_status: status === 'archived' ? 'SESSION_STATUS_ARCHIVED' : session.session_status,
    status_bucket: bucket
      ? (bucket.startsWith('SESSION_STATUS_BUCKET_') ? bucket : `SESSION_STATUS_BUCKET_${bucket.toUpperCase()}`)
      : BUCKET_FOR_STATUS[status],
    updated_at: session.updated_at ?? session.last_event_at,
    session_context: session.session_context ?? session.config,
    post_turn_summary: session.post_turn_summary ?? session.external_metadata?.post_turn_summary,
  };
}

export function sessionsFromResponse(body: unknown): CloudSession[] {
  const b = body as { data?: unknown; sessions?: unknown; ccr?: { data?: unknown } } | null;
  const list = Array.isArray(body) ? body : b?.data ?? b?.sessions ?? b?.ccr?.data;
  return Array.isArray(list) ? list.map(normaliseSession) : [];
}

async function request(path: string, login: Login, beta: boolean) {
  return fetch(`${API}${path}`, {
    headers: {
      Authorization: `Bearer ${login.token}`,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
      ...(beta ? { 'anthropic-beta': BETA } : {}),
      ...(login.organization ? { 'x-organization-uuid': login.organization } : {}),
    },
    signal: AbortSignal.timeout(15_000),
  });
}

/** Tries the sessions list endpoints `claude` itself uses, newest first; remembers the one that works. */
let working: { path: string; beta: boolean } | null = null;
const ENDPOINTS = [{ path: '/v1/code/sessions', beta: false }, { path: '/v1/sessions?beta=true', beta: true }];

export async function listCloudSessions(env: NodeJS.ProcessEnv = process.env): Promise<CloudSession[]> {
  const login = await readLogin(env);
  if (!login) throw new Error(keychainProblem ? `${NO_LOGIN} (Keychain: ${keychainProblem}. If macOS asks, click Always Allow.)` : NO_LOGIN);
  let last = '';
  for (const endpoint of working ? [working] : ENDPOINTS) {
    const res = await request(endpoint.path, login, endpoint.beta);
    if (res.ok) {
      working = endpoint;
      return sessionsFromResponse(await res.json());
    }
    if (res.status === 401) throw new Error(login.expiresAt && login.expiresAt < Date.now() ? EXPIRED : `${EXPIRED} (HTTP 401)`);
    last = `${endpoint.path}: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`;
  }
  working = null;
  throw new Error(`Couldn't list your cloud sessions (${last}).`);
}

/** The agent records the page shows in cloud mode. */
export async function loadCloudAgents({ now, acknowledged }: { now: number; acknowledged?: { has(id: string): boolean } }): Promise<AgentRecord[]> {
  const records = buildCloudList(await listCloudSessions(), now);
  return records.filter((r) => !(acknowledged?.has(r.sessionId) && (r.state === 'finished' || r.state === 'stale')));
}
