import path from 'node:path';
import os from 'node:os';
import { statSync } from 'node:fs';

type PathApi = Pick<typeof path, 'join'>;

interface Paths {
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
