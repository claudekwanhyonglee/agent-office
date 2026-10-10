import path from 'node:path';
import os from 'node:os';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { recentActivity, type ToolCall } from './activity.ts';

type PathApi = Pick<typeof path, 'join'>;

export interface Paths {
  env?: NodeJS.ProcessEnv;
  homedir?: string;
  /** `path.win32` or `path.posix`; defaults to this OS. */
  pathApi?: PathApi;
}

export function claudeConfigDir({ env = process.env, homedir = os.homedir(), pathApi = path }: Paths = {}) {
  return env.CLAUDE_CONFIG_DIR || pathApi.join(homedir, '.claude');
}

export const encodeCwd = (cwd: string) => cwd.replace(/[/\\:.]/g, '-');

export function transcriptPath(cwd: string, sessionId: string, paths: Paths = {}) {
  const pathApi = paths.pathApi ?? path;
  return pathApi.join(claudeConfigDir(paths), 'projects', encodeCwd(cwd), `${sessionId}.jsonl`);
}

/**
 * Finds a session's transcript. `claude agents` reports the cwd a session started in, but a session
 * that moved into a worktree writes under the worktree's folder, so fall back to any project folder.
 * Session ids are UUIDs, so a match elsewhere is unambiguous.
 */
export function transcriptFinder(paths: Paths = {}) {
  const pathApi = paths.pathApi ?? path;
  const projects = pathApi.join(claudeConfigDir(paths), 'projects');
  let folders: string[] | undefined;
  return (cwd: string, sessionId: string): string | null => {
    const direct = transcriptPath(cwd, sessionId, paths);
    if (existsSync(direct)) return direct;
    // ponytail: one stat per project folder per missing transcript; index folder listings if that gets slow.
    folders ??= listFolders(projects);
    return folders.map((folder) => pathApi.join(projects, folder, `${sessionId}.jsonl`)).find((file) => existsSync(file)) ?? null;
  };
}

function listFolders(dir: string) {
  try {
    return readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);
  } catch {
    return [];
  }
}

export function modifiedTime(file: string | null): number | null {
  if (!file) return null;
  try {
    return statSync(file).mtimeMs;
  } catch {
    return null;
  }
}

export interface TranscriptDetails {
  lastMessage: string | null;
  branch: string | null;
  activity: string[];
}

/** Safety cap only: the card collapses long messages itself. */
const MAX_MESSAGE = 20_000;
const NONE: TranscriptDetails = { lastMessage: null, branch: null, activity: [] };

interface Block { type?: string; text?: string; name?: string; input?: { questions?: { question?: unknown }[] } & Record<string, unknown> }

function parseLine(raw: string): Record<string, any> | null {
  try {
    const value = JSON.parse(raw);
    return value && typeof value === 'object' ? value : null;
  } catch {
    return null;
  }
}

/** Assistant content blocks that matter: text and tool calls (thinking is never shown). */
function visibleBlocks(entry: Record<string, any>): Block[] {
  const content = entry.type === 'assistant' ? entry.message?.content : null;
  if (!Array.isArray(content)) return [];
  return content.filter((b: Block) => b && (b.type === 'tool_use' || (b.type === 'text' && typeof b.text === 'string' && b.text.trim())));
}

function questionOf(blocks: Block[]) {
  const ask = blocks.find((b) => b.type === 'tool_use' && b.name === 'AskUserQuestion');
  const question = ask?.input?.questions?.[0]?.question;
  return typeof question === 'string' ? question : null;
}

/** Tool calls in the order they were made; `cwd` is the session's, unless the entry says where it was. */
function toolCalls(entries: Record<string, any>[], cwd: string | undefined): ToolCall[] {
  return entries.flatMap((entry) => visibleBlocks(entry)
    .filter((b) => b.type === 'tool_use' && typeof b.name === 'string')
    .map((b) => ({ name: b.name!, input: b.input ?? {}, cwd: typeof entry.cwd === 'string' ? entry.cwd : cwd })));
}

export function parseDetails(transcript: string, cwd?: string): TranscriptDetails {
  const entries = transcript.split('\n').map(parseLine).filter((e) => e !== null).reverse();

  const branch = entries.find((e) => typeof e.gitBranch === 'string' && e.gitBranch)?.gitBranch ?? null;

  const latest = entries.map(visibleBlocks).find((blocks) => blocks.length);
  let message = latest ? questionOf(latest) : null;
  if (message == null) {
    for (const blocks of entries.map(visibleBlocks)) {
      const textBlock = blocks.findLast((b) => b.type === 'text');
      if (textBlock) { message = textBlock.text!; break; }
    }
  }
  const activity = recentActivity(toolCalls([...entries].reverse(), cwd));
  return { lastMessage: message == null ? null : message.slice(0, MAX_MESSAGE), branch, activity };
}

const cache = new Map<string, { stamp: string; details: TranscriptDetails }>();

/** Details from a transcript file; re-reads only when the file changed. Never throws. */
export function readDetails(file: string | null, cwd?: string): TranscriptDetails {
  if (!file) return NONE;
  try {
    const { mtimeMs, size } = statSync(file);
    const stamp = `${mtimeMs}:${size}`;
    const hit = cache.get(file);
    if (hit?.stamp === stamp) return hit.details;
    // ponytail: reads the whole file on change; read only the tail if huge transcripts get slow.
    const details = parseDetails(readFileSync(file, 'utf8'), cwd);
    cache.set(file, { stamp, details });
    return details;
  } catch {
    return NONE;
  }
}
