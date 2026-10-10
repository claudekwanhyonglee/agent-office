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

  it('#3 AC5 shows a feed error in the status popup', () => {
    const app = boot({ createOffice: () => ({ show() {}, onPick() {}, onHover() {} }) })!;
    app.applyFeed({ error: 'claude agents failed: boom' });
    expect(status().hidden).toBe(false);
    expect(status().textContent).toContain('claude agents failed: boom');
  });
});

const quietOffice = () => boot({ createOffice: () => ({ show() {}, onPick() {}, onHover() {} }) })!;
const expectHidden = () => {
  expect(status().hidden).toBe(true);
  expect(status().textContent).toBe('');
};

describe('#10 quiet empty office', () => {
  it('#10 AC1 with zero agents on boot, the status popup is hidden and empty', () => {
    quietOffice();
    expectHidden();
  });

  it('#10 AC1 an empty feed keeps the popup hidden and empty', () => {
    quietOffice().applyFeed([]);
    expectHidden();
  });

  it('#10 AC2 feed errors and the no-WebGL message still show in the popup', () => {
    quietOffice().applyFeed({ error: 'claude agents failed: boom' });
    expect(status().hidden).toBe(false);
    expect(status().className).toContain('problem');
    expect(status().textContent).toContain('claude agents failed: boom');

    boot(); // jsdom has no WebGL
    expect(status().hidden).toBe(false);
    expect(status().textContent).toMatch(/3D isn.t available/);
  });

  it('#10 AC3 after a feed error, an empty feed hides the popup again', () => {
    const app = quietOffice();
    app.applyFeed({ error: 'boom' });
    app.applyFeed([]);
    expectHidden();
  });
});
