import { afterEach, describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { enableTracking, isThisMachine, refreshScript, statusLineCommand, trackingFiles, trackingStatus } from '../src/server/tracking.ts';
import { createFeed } from '../src/server/feed.ts';
import { createApi } from '../src/server/api.ts';
import { startServer } from '../src/server/http.ts';

const scriptSource = fileURLToPath(new URL('../bin/statusline.js', import.meta.url));

/** A fresh home and Claude config folder. */
function setup() {
  const home = mkdtempSync(join(tmpdir(), 'office-home-'));
  const config = join(home, '.claude');
  mkdirSync(config);
  const files = { ...trackingFiles({ env: { CLAUDE_CONFIG_DIR: config }, homedir: home }), scriptSource };
  const settings = () => JSON.parse(readFileSync(files.settingsFile, 'utf8'));
  const writeSettings = (value: unknown) => writeFileSync(files.settingsFile, typeof value === 'string' ? value : JSON.stringify(value));
  return { home, config, files, settings, writeSettings };
}

describe('#45 AC4 is tracking set up?', () => {
  it('#45 AC4 files: settings.json in the Claude config folder, script in ~/.agent-office', () => {
    const { home, config, files } = setup();
    expect(files.settingsFile).toBe(join(config, 'settings.json'));
    expect(files.scriptFile).toBe(join(home, '.agent-office', 'statusline.js'));
  });

  it('#45 AC4 not enabled with no settings.json, or no statusLine in it', () => {
    const { files, writeSettings } = setup();
    expect(trackingStatus(files)).toBe('off');
    writeSettings({ model: 'opus' });
    expect(trackingStatus(files)).toBe('off');
  });

  it('#45 AC4 enabled when settings.json runs our script and the script exists', () => {
    const { files } = setup();
    enableTracking(files);
    expect(trackingStatus(files)).toBe('enabled');
  });

  it('#45 AC4 removing the entry or the script means it is no longer enabled', () => {
    const { files, settings, writeSettings } = setup();
    enableTracking(files);
    rmSync(files.scriptFile);
    expect(trackingStatus(files)).toBe('off');

    enableTracking(files);
    const { statusLine, ...rest } = settings();
    writeSettings(rest);
    expect(trackingStatus(files)).toBe('off');
  });

  it('#45 AC4 another status line', () => {
    const { files, writeSettings } = setup();
    writeSettings({ statusLine: { type: 'command', command: 'my-own-line.sh' } });
    expect(trackingStatus(files)).toBe('other');
  });

  it('#45 AC4 settings unreadable', () => {
    const { files, writeSettings } = setup();
    writeSettings('{ broken');
    expect(trackingStatus(files)).toBe('unreadable');
    writeSettings('[1, 2]');
    expect(trackingStatus(files)).toBe('unreadable');
  });
});

describe('#45 AC5 enabling', () => {
  it('#45 AC5 copies the script and adds the statusLine entry, creating settings.json', () => {
    const { files, settings } = setup();
    expect(enableTracking(files)).toBe('enabled');
    expect(readFileSync(files.scriptFile, 'utf8')).toBe(readFileSync(scriptSource, 'utf8'));
    expect(settings()).toEqual({ statusLine: { type: 'command', command: statusLineCommand(files.scriptFile) } });
  });

  it('#45 AC5 keeps every other setting', () => {
    const { files, settings, writeSettings } = setup();
    writeSettings({ model: 'opus', permissions: { allow: ['Bash(ls)'] } });
    enableTracking(files);
    expect(settings()).toMatchObject({ model: 'opus', permissions: { allow: ['Bash(ls)'] } });
  });

  it('#45 AC5 never replaces another status line, nor writes a settings.json it cannot read', () => {
    const { files, writeSettings } = setup();
    writeSettings({ statusLine: { type: 'command', command: 'mine.sh' } });
    expect(enableTracking(files)).toBe('other');
    expect(readFileSync(files.settingsFile, 'utf8')).toBe(JSON.stringify({ statusLine: { type: 'command', command: 'mine.sh' } }));
    expect(existsSync(files.scriptFile)).toBe(false);

    writeSettings('{ broken');
    expect(enableTracking(files)).toBe('unreadable');
    expect(readFileSync(files.settingsFile, 'utf8')).toBe('{ broken');
  });

  it('#45 AC5 on startup the script copy is refreshed only when tracking is enabled', () => {
    const { files } = setup();
    refreshScript(files);
    expect(existsSync(files.scriptFile)).toBe(false);

    enableTracking(files);
    writeFileSync(files.scriptFile, '// old version');
    refreshScript(files);
    expect(readFileSync(files.scriptFile, 'utf8')).toBe(readFileSync(scriptSource, 'utf8'));
  });

  it('#45 AC5 only this machine counts, by any of its own addresses', () => {
    const own = ['127.0.0.1', '::1', '192.168.1.5'];
    expect(['127.0.0.1', '::1', '::ffff:127.0.0.1', '192.168.1.5', '::ffff:192.168.1.5'].every((a) => isThisMachine(a, own))).toBe(true);
    expect(['192.168.1.20', '::ffff:192.168.1.20', undefined].some((a) => isThisMachine(a, own))).toBe(false);
  });
});

describe('#45 usage API', () => {
  let server: Server | undefined;
  afterEach(() => server?.close());

  async function serve(files: ReturnType<typeof setup>['files']) {
    const staticDir = mkdtempSync(join(tmpdir(), 'office-static-'));
    writeFileSync(join(staticDir, 'index.html'), 'page');
    const usage = { read: () => ({ tracking: trackingStatus(files) }), enable: () => ({ tracking: enableTracking(files) }) };
    server = await startServer({ port: 0, staticDir, api: createApi(createFeed(async () => []), undefined, usage) });
    return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  }
  const enable = (base: string, type = 'application/json') =>
    fetch(`${base}/api/usage/enable`, { method: 'POST', headers: { 'content-type': type }, body: '{}' });

  it('#45 AC4 GET /api/usage reports tracking, checked on every request', async () => {
    const { files, writeSettings } = setup();
    const base = await serve(files);
    expect((await (await fetch(`${base}/api/usage`)).json()).tracking).toBe('off');
    writeSettings({ statusLine: { type: 'command', command: 'mine.sh' } });
    expect((await (await fetch(`${base}/api/usage`)).json()).tracking).toBe('other');
  });

  it('#45 AC5 POST /api/usage/enable enables tracking from this machine', async () => {
    const { files } = setup();
    const base = await serve(files);
    const res = await enable(base);
    expect(res.status).toBe(200);
    expect((await res.json()).tracking).toBe('enabled');
    expect(trackingStatus(files)).toBe('enabled');
  });

  it('#45 AC5 POST /api/usage/enable only takes JSON (no cross-site form posts)', async () => {
    const { files } = setup();
    const base = await serve(files);
    expect((await enable(base, 'text/plain')).status).toBe(415);
    expect(trackingStatus(files)).toBe('off');
  });
});
