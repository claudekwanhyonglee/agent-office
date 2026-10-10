import path from 'node:path';
import { readFileSync } from 'node:fs';
import { claudeConfigDir, type Paths } from './transcript.ts';

export interface LimitWindow {
  usedPercentage: number;
  /** Epoch milliseconds. */
  resetsAt: number;
}

export interface Limits {
  /** The 5-hour window; null when unknown. */
  session: LimitWindow | null;
  weekly: LimitWindow | null;
}

/** Where bin/statusline.js saves the limits (keep the two in step). */
export function limitsFile(paths: Paths = {}) {
  return (paths.pathApi ?? path).join(claudeConfigDir(paths), 'agent-office-limits.json');
}

/** The last saved limits; a window that has reset, or anything unreadable, is unknown. */
export function readLimits(file: string, now: number): Limits {
  let saved: Record<string, unknown> | null = null;
  try {
    saved = JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    // unknown
  }
  const window = (raw: unknown): LimitWindow | null => {
    const { used_percentage, resets_at } = (raw ?? {}) as Record<string, unknown>;
    if (typeof used_percentage !== 'number' || typeof resets_at !== 'number') return null;
    const resetsAt = resets_at * 1000;
    return resetsAt > now ? { usedPercentage: used_percentage, resetsAt } : null;
  };
  return { session: window(saved?.five_hour), weekly: window(saved?.seven_day) };
}
