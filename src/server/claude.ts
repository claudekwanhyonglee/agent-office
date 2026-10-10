import { execFile } from 'node:child_process';
import type { AgentEntry } from './agents.ts';

interface Command { command: string; args: string[] }

export const CLAUDE_AGENTS: Command = { command: 'claude', args: ['agents', '--json', '--all'] };

/** Runs `claude agents --json --all` and returns its entries; throws a readable error. */
export function listClaudeAgents({ command, args }: Command = CLAUDE_AGENTS): Promise<AgentEntry[]> {
  return new Promise((resolve, reject) => {
    execFile(command, args, { timeout: 15_000, maxBuffer: 32 * 1024 * 1024, windowsHide: true }, (error, stdout, stderr) => {
      if (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code === 'ENOENT') return reject(new Error(`\`${command}\` was not found.`));
        const detail = String(stderr).trim() || error.message;
        return reject(new Error(`\`${[command, ...args].join(' ')}\` failed: ${detail}`));
      }
      try {
        const entries = JSON.parse(stdout);
        if (!Array.isArray(entries)) throw new Error('not a list');
        resolve(entries);
      } catch {
        reject(new Error(`Couldn't read the output of \`${[command, ...args].join(' ')}\`.`));
      }
    });
  });
}
