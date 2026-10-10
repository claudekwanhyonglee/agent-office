import path from 'node:path';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { projectName } from './agents.ts';
import type { LimitWindow } from './limits.ts';

const WEEK = 7 * 24 * 3600 * 1000;

export interface ProjectTokens {
  project: string;
  tokens: number;
}

/** One model reply, as counted toward the weekly total. */
interface Reply {
  id: string | null;
  project: string;
  time: number;
  tokens: number;
}

/** When the current weekly window started; the last 7 days when it isn't known. */
export const weekStart = (weekly: LimitWindow | null, now: number) => (weekly ? weekly.resetsAt : now) - WEEK;

/** Cache reads are left out: cheap re-reads that would dwarf everything else. */
function countedTokens(usage: Record<string, unknown>) {
  const count = (key: string) => (typeof usage[key] === 'number' ? (usage[key] as number) : 0);
  return count('input_tokens') + count('output_tokens') + count('cache_creation_input_tokens');
}

function parseReplies(transcript: string): Reply[] {
  return transcript.split('\n').flatMap((line) => {
    let entry;
    try {
      entry = JSON.parse(line);
    } catch {
      return [];
    }
    const usage = entry?.type === 'assistant' ? entry.message?.usage : null;
    const time = Date.parse(entry?.timestamp);
    if (!usage || typeof entry.cwd !== 'string' || Number.isNaN(time)) return [];
    return [{ id: entry.message.id ?? null, project: projectName(entry.cwd), time, tokens: countedTokens(usage) }];
  });
}

const cache = new Map<string, { stamp: string; replies: Reply[] }>();

/** Replies in a transcript; re-parsed only when the file changed. */
function repliesIn(file: string, mtimeMs: number, size: number) {
  const stamp = `${mtimeMs}:${size}`;
  const hit = cache.get(file);
  if (hit?.stamp === stamp) return hit.replies;
  // ponytail: parses whole transcripts on change; keep a per-file read offset if big ones get slow.
  const replies = parseReplies(readFileSync(file, 'utf8'));
  cache.set(file, { stamp, replies });
  return replies;
}

function transcripts(projectsDir: string): string[] {
  try {
    return readdirSync(projectsDir, { recursive: true, encoding: 'utf8' })
      .filter((name) => name.endsWith('.jsonl'))
      .map((name) => path.join(projectsDir, name));
  } catch {
    return [];
  }
}

/** Tokens per project since `since`, from every transcript (subagents too), highest first. */
export function weeklyTokens(projectsDir: string, since: number): ProjectTokens[] {
  const totals = new Map<string, number>();
  // Claude Code logs a reply once per content block, and resumed sessions copy history: count each id once.
  const seen = new Set<string>();
  for (const file of transcripts(projectsDir)) {
    let stat;
    try {
      stat = statSync(file);
      if (stat.mtimeMs < since) continue;
      for (const reply of repliesIn(file, stat.mtimeMs, stat.size)) {
        if (reply.time < since || (reply.id && seen.has(reply.id))) continue;
        if (reply.id) seen.add(reply.id);
        totals.set(reply.project, (totals.get(reply.project) ?? 0) + reply.tokens);
      }
    } catch {
      // A transcript removed mid-read: skip it.
    }
  }
  return [...totals].filter(([, tokens]) => tokens > 0)
    .map(([project, tokens]) => ({ project, tokens }))
    .sort((a, b) => b.tokens - a.tokens);
}
