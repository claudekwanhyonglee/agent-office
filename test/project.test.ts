import { describe, expect, it } from 'vitest';
import { execFileSync, execSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const run = (command: string) => execSync(command, { encoding: 'utf8', stdio: 'pipe' });

describe('#2 AC2 tooling', () => {
  it('#2 AC2 typecheck passes', () => {
    expect(() => run('npm run typecheck')).not.toThrow();
  }, 120_000);
});

describe('#2 AC5 privacy check', () => {
  // Patterns are assembled from pieces so this file doesn't match itself.
  const at = '@';
  const email = new RegExp(`[A-Za-z0-9._%+-]+${at}[A-Za-z0-9-]+(\\.[A-Za-z0-9-]+)*\\.[A-Za-z]{2,}`);
  const fixtureUser = 'alex';
  const homePaths = [
    new RegExp(`/${'home'}/(?!${fixtureUser}/)[A-Za-z0-9._-]+/`),
    new RegExp(`/${'Users'}/(?!${fixtureUser}/)[A-Za-z0-9._-]+/`),
    new RegExp(`[A-Za-z]:\\\\${'Users'}\\\\(?!${fixtureUser}\\\\)[A-Za-z0-9._-]+\\\\`),
  ];
  const hex = (n: number) => `[0-9a-fA-F]{${n}}`;
  const uuid = new RegExp([hex(8), hex(4), hex(4), hex(4), hex(12)].join('-'));
  const isFixture = (file: string) => file.startsWith('test/fixtures/');
  const isBinary = (file: string) => /\.(png|jpe?g|gif|webp|woff2?|ico)$/i.test(file);

  function problemsIn(file: string, text: string) {
    const problems: string[] = [];
    if (email.test(text)) problems.push('email address');
    if (homePaths.some((p) => p.test(text))) problems.push('home path');
    if (!isFixture(file) && uuid.test(text)) problems.push('session id');
    return problems;
  }

  it('#2 AC5 flags personal info and spares fixture data', () => {
    const home = ['', 'home', 'sam', 'x'].join('/');
    expect(problemsIn('a.ts', `see ${home}`)).toEqual(['home path']);
    expect(problemsIn('a.ts', ['/Users', 'sam', 'x'].join('/'))).toEqual(['home path']);
    expect(problemsIn('a.ts', ['C:', 'Users', 'sam', 'x'].join('\\'))).toEqual(['home path']);
    expect(problemsIn('a.ts', ['', 'home', 'alex', 'projects'].join('/'))).toEqual([]);
    expect(problemsIn('a.ts', `sam${at}example.com`)).toEqual(['email address']);
    const id = ['1b3cbc49', 'aaaa', 'bbbb', 'cccc', '1234567890ab'].join('-');
    expect(problemsIn('a.ts', id)).toEqual(['session id']);
    expect(problemsIn('test/fixtures/agents.json', id)).toEqual([]);
  });

  it('#2 AC5 no git-tracked file contains personal info', () => {
    const tracked = execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], { encoding: 'utf8' })
      .split('\0')
      .filter((f) => f && !isBinary(f));
    const found = tracked.flatMap((file) => {
      let text: string;
      try { text = readFileSync(file, 'utf8'); } catch { return []; }
      return problemsIn(file, text).map((p) => `${file}: ${p}`);
    });
    expect(found).toEqual([]);
  });
});

describe('#2 AC6 no requests to other hosts', () => {
  it('#2 AC6 the built page only references its own server', () => {
    const outDir = mkdtempSync(join(tmpdir(), 'office-build-'));
    run(`npx vite build --outDir "${outDir}" --emptyOutDir --logLevel error`);
    const files = readdirSync(outDir, { recursive: true, encoding: 'utf8' });
    const read = (f: string) => readFileSync(join(outDir, f), 'utf8');

    const html = read('index.html');
    expect(html).not.toMatch(/(src|href)=["']?(https?:)?\/\//i);

    for (const css of files.filter((f) => f.endsWith('.css'))) {
      expect(read(css)).not.toMatch(/(url\(|@import)\s*["']?(https?:)?\/\//i);
    }
    expect(files.some((f) => /\.woff2$/.test(f))).toBe(true);

    for (const js of files.filter((f) => f.endsWith('.js'))) {
      expect(read(js)).not.toMatch(/(fetch|EventSource)\(\s*["'`](https?:)?\/\//);
    }
  }, 120_000);
});
