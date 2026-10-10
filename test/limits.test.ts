import { describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { limitsFile, readLimits } from '../src/server/limits.ts';

const script = fileURLToPath(new URL('../bin/statusline.js', import.meta.url));
const config = () => mkdtempSync(join(tmpdir(), 'office-config-'));
const HOUR = 3600;
const nowSeconds = Math.floor(Date.now() / 1000);

const window = (used: number, resetsIn: number) => ({ used_percentage: used, resets_at: nowSeconds + resetsIn });
const status = (rateLimits?: object) => JSON.stringify({ session_id: 's', model: { display_name: 'Opus' }, ...(rateLimits && { rate_limits: rateLimits }) });

function runStatusLine(dir: string, stdin: string) {
  return spawnSync(process.execPath, [script], { input: stdin, env: { ...process.env, CLAUDE_CONFIG_DIR: dir }, encoding: 'utf8' });
}
const saved = (dir: string) => JSON.parse(readFileSync(limitsFile({ env: { CLAUDE_CONFIG_DIR: dir } }), 'utf8'));

describe('#45 status-line script', () => {
  it('#45 AC1 writes both windows and a saved-at time to a file in the Claude config folder', () => {
    const dir = config();
    const before = Date.now();
    const result = runStatusLine(dir, status({ five_hour: window(42, 2 * HOUR), seven_day: window(18, 48 * HOUR) }));
    expect(result.status).toBe(0);
    expect(limitsFile({ env: { CLAUDE_CONFIG_DIR: dir } }).startsWith(dir)).toBe(true);
    const file = saved(dir);
    expect(file.five_hour).toEqual(window(42, 2 * HOUR));
    expect(file.seven_day).toEqual(window(18, 48 * HOUR));
    expect(file.saved_at).toBeGreaterThanOrEqual(before);
  });

  it('#45 AC2 prints nothing and exits 0', () => {
    const result = runStatusLine(config(), status({ five_hour: window(42.4, HOUR), seven_day: window(18, 48 * HOUR) }));
    expect(result.status).toBe(0);
    expect(result.stdout).toBe('');
  });

  it('#45 AC2 a missing window keeps the saved one', () => {
    const dir = config();
    runStatusLine(dir, status({ five_hour: window(42, HOUR), seven_day: window(18, 48 * HOUR) }));
    const result = runStatusLine(dir, status({ five_hour: window(50, HOUR) }));
    expect(result.status).toBe(0);
    expect(saved(dir).five_hour.used_percentage).toBe(50);
    expect(saved(dir).seven_day).toEqual(window(18, 48 * HOUR));
  });

  it('#45 AC2 with no rate_limits it exits 0 and leaves saved windows alone', () => {
    const dir = config();
    runStatusLine(dir, status({ five_hour: window(42, HOUR), seven_day: window(18, 48 * HOUR) }));
    const result = runStatusLine(dir, status());
    expect(result.status).toBe(0);
    expect(saved(dir).five_hour).toEqual(window(42, HOUR));
    expect(saved(dir).seven_day).toEqual(window(18, 48 * HOUR));
  });

  it('#45 AC2 exits 0 on input that is not JSON', () => {
    expect(runStatusLine(config(), 'nonsense').status).toBe(0);
  });
});

describe('#45 limits from the saved file', () => {
  const now = Date.now();
  const write = (content: string) => {
    const dir = config();
    const file = join(dir, 'limits.json');
    writeFileSync(file, content);
    return file;
  };

  it('#45 AC3 returns both windows with used % and reset time', () => {
    const file = write(JSON.stringify({ five_hour: window(42, HOUR), seven_day: window(18, 48 * HOUR), saved_at: now }));
    expect(readLimits(file, now)).toEqual({
      session: { usedPercentage: 42, resetsAt: (nowSeconds + HOUR) * 1000 },
      weekly: { usedPercentage: 18, resetsAt: (nowSeconds + 48 * HOUR) * 1000 },
    });
  });

  it('#45 AC3 a window whose reset time has passed is unknown', () => {
    const file = write(JSON.stringify({ five_hour: window(42, -10), seven_day: window(18, HOUR) }));
    expect(readLimits(file, now).session).toBeNull();
    expect(readLimits(file, now).weekly).not.toBeNull();
  });

  it('#45 AC3 a missing or unreadable file is unknown', () => {
    expect(readLimits(join(config(), 'nope.json'), now)).toEqual({ session: null, weekly: null });
    expect(readLimits(write('{not json'), now)).toEqual({ session: null, weekly: null });
    expect(readLimits(write(JSON.stringify({ five_hour: { used_percentage: 'x' } })), now)).toEqual({ session: null, weekly: null });
  });
});
