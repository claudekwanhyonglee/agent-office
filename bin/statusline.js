#!/usr/bin/env node
// Claude Code status line installed by Agent Office: silently saves the plan's rate limits.
// Standalone on purpose (no build needed). Prints nothing, adds nothing to Claude's context,
// and always exits 0 so the status line never breaks.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

// Keep in step with limitsFile() in src/server/limits.ts.
const file = join(process.env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude'), 'agent-office-limits.json');
const WINDOWS = ['five_hour', 'seven_day'];

const readJson = (read) => { try { return JSON.parse(read()); } catch { return null; } };
const isWindow = (w) => typeof w?.used_percentage === 'number' && typeof w?.resets_at === 'number';

try {
  const input = readJson(() => readFileSync(0, 'utf8'));
  const fresh = Object.fromEntries(WINDOWS
    .map((k) => [k, input?.rate_limits?.[k]])
    .filter(([, w]) => isWindow(w))
    .map(([k, w]) => [k, { used_percentage: w.used_percentage, resets_at: w.resets_at }]));
  if (Object.keys(fresh).length) {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify({ ...readJson(() => readFileSync(file, 'utf8')), ...fresh, saved_at: Date.now() }));
  }
} catch {
  // A failed save must not break the status line.
}
process.exit(0);
