import path from 'node:path';
import os from 'node:os';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { claudeConfigDir, type Paths } from './transcript.ts';

/** Is limit tracking (our status line in Claude's settings.json) set up? */
export type TrackingStatus = 'enabled' | 'off' | 'other' | 'unreadable';

export interface TrackingFiles {
  /** Claude Code's user settings. */
  settingsFile: string;
  /** Our copy of the status-line script, at a path that survives Agent Office updates. */
  scriptFile: string;
  /** bin/statusline.js in this package. */
  scriptSource: string;
}

export function trackingFiles(paths: Paths & { homedir?: string } = {}): Omit<TrackingFiles, 'scriptSource'> {
  const pathApi = paths.pathApi ?? path;
  return {
    settingsFile: pathApi.join(claudeConfigDir(paths), 'settings.json'),
    scriptFile: pathApi.join(paths.homedir ?? os.homedir(), '.agent-office', 'statusline.js'),
  };
}

export const statusLineCommand = (scriptFile: string) => `node "${scriptFile}"`;

type Settings = Record<string, unknown> & { statusLine?: { command?: unknown } };

/** settings.json as an object; {} when missing, null when it can't be read safely. */
function readSettings(file: string): Settings | null {
  if (!existsSync(file)) return {};
  try {
    const settings = JSON.parse(readFileSync(file, 'utf8'));
    return settings && typeof settings === 'object' && !Array.isArray(settings) ? settings : null;
  } catch {
    return null;
  }
}

function statusOf(settings: Settings | null, { scriptFile }: Pick<TrackingFiles, 'scriptFile'>): TrackingStatus {
  if (!settings) return 'unreadable';
  if (!settings.statusLine) return 'off';
  if (settings.statusLine.command !== statusLineCommand(scriptFile)) return 'other';
  return existsSync(scriptFile) ? 'enabled' : 'off';
}

/** Checked fresh every time: the user may have removed the entry or the script since. */
export const trackingStatus = (files: Pick<TrackingFiles, 'settingsFile' | 'scriptFile'>) =>
  statusOf(readSettings(files.settingsFile), files);

/** Installs the script and our statusLine entry; never touches another status line or an unreadable file. */
export function enableTracking(files: TrackingFiles): TrackingStatus {
  const settings = readSettings(files.settingsFile);
  const status = statusOf(settings, files);
  if (status === 'other' || status === 'unreadable') return status;
  copyScript(files);
  if (!settings!.statusLine) {
    const statusLine = { type: 'command', command: statusLineCommand(files.scriptFile) };
    mkdirSync(path.dirname(files.settingsFile), { recursive: true });
    writeFileSync(files.settingsFile, JSON.stringify({ ...settings, statusLine }, null, 2) + '\n');
  }
  return 'enabled';
}

/** On startup: bring an installed script up to date with this version of Agent Office. */
export function refreshScript(files: TrackingFiles) {
  try {
    if (trackingStatus(files) === 'enabled') copyScript(files);
  } catch {
    // The old copy keeps working; never stop Agent Office from starting over it.
  }
}

function copyScript({ scriptSource, scriptFile }: TrackingFiles) {
  mkdirSync(path.dirname(scriptFile), { recursive: true });
  copyFileSync(scriptSource, scriptFile);
}

/** Only requests from this machine may change its settings, even in LAN mode. */
export const isThisMachine = (remoteAddress: string | undefined) =>
  remoteAddress === '127.0.0.1' || remoteAddress === '::1' || remoteAddress === '::ffff:127.0.0.1';
