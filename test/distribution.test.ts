import { describe, expect, it } from 'vitest';
import { execFileSync, spawn } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path, { join } from 'node:path';
import { explainClaudeError } from '../src/server/claude.ts';
import { acknowledgedFile } from '../src/server/acknowledged.ts';
import { claudeConfigDir, transcriptPath } from '../src/server/transcript.ts';

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';

describe('#7 AC1 npx from GitHub', () => {
  const pkg = JSON.parse(readFileSync('package.json', 'utf8'));

  it('#7 AC1 builds on install and exposes a bin', () => {
    expect(pkg.scripts.prepare).toMatch(/build/);
    expect(pkg.bin['agent-office']).toBe('bin/agent-office.js');
    expect(readFileSync(pkg.bin['agent-office'], 'utf8').startsWith('#!/usr/bin/env node')).toBe(true);
    expect(pkg.dependencies ?? {}).toEqual({}); // nothing to download at run time
  });

  it('#7 AC1 the packed package installs, starts and prints the localhost URL', async () => {
    const work = mkdtempSync(join(tmpdir(), 'office-pack-'));
    execFileSync(npm, ['pack', '--pack-destination', work, '--silent'], { stdio: 'pipe', shell: process.platform === 'win32' });
    const tarball = readdirSync(work).find((f) => f.endsWith('.tgz'))!;
    const app = join(work, 'app');
    execFileSync(npm, ['install', '--prefix', app, '--no-audit', '--no-fund', '--offline', join(work, tarball)], { stdio: 'pipe', shell: process.platform === 'win32' });

    // A stand-in `claude` so the server has something to list.
    const bin = join(work, 'bin');
    mkdirSync(bin);
    writeFileSync(join(bin, 'claude'), '#!/bin/sh\necho "[]"\n');
    chmodSync(join(bin, 'claude'), 0o755);

    const server = spawn(process.execPath, [join(app, 'node_modules', 'agent-office', 'bin', 'agent-office.js')], {
      env: { ...process.env, PORT: '4377', PATH: `${bin}${path.delimiter}${process.env.PATH}`, CLAUDE_CONFIG_DIR: join(work, 'config') },
    });
    try {
      const output = await new Promise<string>((resolve, reject) => {
        let out = '';
        server.stdout.on('data', (d) => { out += d; if (out.includes('http://')) resolve(out); });
        server.on('exit', () => reject(new Error(`exited: ${out}`)));
        setTimeout(() => reject(new Error(`timed out: ${out}`)), 20_000);
      });
      expect(output).toContain('http://127.0.0.1:4377');
      const page = await (await fetch('http://127.0.0.1:4377/')).text();
      expect(page).toContain('<title>Agent Office</title>');
    } finally {
      server.kill();
    }
  }, 180_000);
});

describe('#7 AC2 missing or old Claude Code', () => {
  it('#7 AC2 explains a missing claude command', () => {
    for (const error of [
      Object.assign(new Error('spawn claude ENOENT'), { code: 'ENOENT' }),
      Object.assign(new Error('Command failed'), { code: 1, stderr: "'claude' is not recognized as an internal or external command,\r\noperable program or batch file." }),
      Object.assign(new Error('Command failed'), { code: 127, stderr: 'sh: 1: claude: not found' }),
    ]) {
      const message = explainClaudeError(error);
      expect(message).toMatch(/Claude Code isn.t installed/);
      expect(message).toMatch(/install/i);
      expect(message.split('\n')).toHaveLength(1);
    }
  });

  it('#7 AC2 explains a Claude Code without `claude agents --json`', () => {
    for (const stderr of ["error: unknown command 'agents'", "error: unknown option '--json'", "error: unknown option '--all'"]) {
      const message = explainClaudeError(Object.assign(new Error('Command failed'), { code: 1, stderr }));
      expect(message).toMatch(/doesn.t support `claude agents --json`/);
      expect(message).toMatch(/claude update/);
      expect(message.split('\n')).toHaveLength(1);
    }
  });

  it('#7 AC2 other failures keep their own message', () => {
    const message = explainClaudeError(Object.assign(new Error('Command failed'), { code: 2, stderr: 'rate limited' }));
    expect(message).toContain('rate limited');
  });
});

describe('#7 AC3 paths come from the OS', () => {
  it('#7 AC3 Windows acknowledgements file', () => {
    expect(acknowledgedFile('C:\\Users\\alex', path.win32)).toBe('C:\\Users\\alex\\.agent-office\\acknowledged.json');
  });

  it('#7 AC3 Windows transcript location, with and without CLAUDE_CONFIG_DIR', () => {
    const win = { homedir: 'C:\\Users\\alex', pathApi: path.win32 };
    expect(claudeConfigDir({ ...win, env: {} })).toBe('C:\\Users\\alex\\.claude');
    expect(transcriptPath('D:\\work\\demo-app', 'session-one', { ...win, env: { CLAUDE_CONFIG_DIR: 'D:\\claude' } }))
      .toBe('D:\\claude\\projects\\D--work-demo-app\\session-one.jsonl');
  });

  it('#7 AC3 no source file assumes a Unix home', () => {
    const files = readdirSync('src', { recursive: true, encoding: 'utf8' }).filter((f) => f.endsWith('.ts'));
    for (const file of files) {
      const text = readFileSync(join('src', file), 'utf8');
      expect(text, file).not.toMatch(/['"`]\/(home|Users)\//);
      expect(text, file).not.toMatch(/['"`]~\//);
    }
  });
});

describe('#7 AC4 README', () => {
  it('#7 AC4 explains what it is, how to run it, requirements and privacy', () => {
    const readme = readFileSync('README.md', 'utf8');
    expect(readme).toContain('npx github:claudekwanhyonglee/agent-office');
    expect(readme).toMatch(/Node(\.js)? 20/);
    expect(readme).toMatch(/Claude Code/);
    expect(readme).toMatch(/WebGL/);
    expect(readme).toMatch(/only reads/i);
    expect(readme).toMatch(/never sends/i);
  });
});
