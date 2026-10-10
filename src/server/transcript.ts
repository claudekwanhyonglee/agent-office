import path from 'node:path';
import os from 'node:os';
import { readFileSync, statSync } from 'node:fs';

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

export function modifiedTime(file: string): number | null {
  try {
    return statSync(file).mtimeMs;
  } catch {
    return null;
  }
}

export interface TranscriptDetails {
  lastMessage: string | null;
  branch: string | null;
}

const MAX_MESSAGE = 300;
const NONE: TranscriptDetails = { lastMessage: null, branch: null };

interface Block { type?: string; text?: string; name?: string; input?: { questions?: { question?: unknown }[] } }

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

export function parseDetails(transcript: string): TranscriptDetails {
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
  return { lastMessage: message == null ? null : message.slice(0, MAX_MESSAGE), branch };
}

const cache = new Map<string, { stamp: string; details: TranscriptDetails }>();

/** Details from a transcript file; re-reads only when the file changed. Never throws. */
export function readDetails(file: string): TranscriptDetails {
  try {
    const { mtimeMs, size } = statSync(file);
    const stamp = `${mtimeMs}:${size}`;
    const hit = cache.get(file);
    if (hit?.stamp === stamp) return hit.details;
    // ponytail: reads the whole file on change; read only the tail if huge transcripts get slow.
    const details = parseDetails(readFileSync(file, 'utf8'));
    cache.set(file, { stamp, details });
    return details;
  } catch {
    return NONE;
  }
}
