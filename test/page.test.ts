// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { boot } from '../src/client/main.ts';

const body = readFileSync('index.html', 'utf8').match(/<body>([\s\S]*)<\/body>/)![1];

beforeEach(() => {
  document.body.innerHTML = body.replace(/<script[\s\S]*?<\/script>/g, '');
});

const status = () => document.getElementById('status')!;

describe('#2 page', () => {
  it('#2 AC4 shows a message instead of a blank page when WebGL is unavailable', () => {
    // jsdom has no WebGL: getContext returns null.
    boot();
    expect(status().hidden).toBe(false);
    expect(status().textContent).toMatch(/3D isn.t available in this browser/);
  });

  it('#2 AC3 shows "No Claude Code sessions running" with no agents', () => {
    boot({ createView: () => ({ setPodCount: () => [] }) });
    expect(status().hidden).toBe(false);
    expect(status().textContent).toBe('No Claude Code sessions running');
  });
});
