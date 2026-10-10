// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { allOnScreen, bindHomeKey, floorCorners, frameFloor, goHome, initialOrbit } from '../src/client/camera.ts';
import { INITIAL_ROWS } from '../src/client/layout.ts';

const SHAPES = [[1440, 900], [2560, 1080], [390, 844], [375, 667]] as const;

function homeView(w: number, h: number, rows = INITIAL_ROWS) {
  const camera = new THREE.PerspectiveCamera(34, w / h, 0.1, 150);
  const orbit = initialOrbit();
  orbit.theta = 2;
  orbit.phi = 0.4;
  orbit.target.set(5, 1, 9);
  goHome(camera, orbit, rows);
  return { camera, orbit };
}

describe('#50 AC1 the reset view is square-on, about 25° down', () => {
  it('#50 AC1 no sideways turn, and the camera looks about 25° below horizontal', () => {
    for (const [w, h] of SHAPES) {
      const { camera, orbit } = homeView(w, h);
      expect(orbit.theta).toBe(0);
      const look = camera.getWorldDirection(new THREE.Vector3());
      expect(look.x).toBeCloseTo(0, 9);
      expect(look.z).toBeLessThan(0);
      const below = THREE.MathUtils.radToDeg(Math.asin(-look.y));
      expect(below).toBeGreaterThan(23);
      expect(below).toBeLessThan(27);
    }
  });
});

describe('#50 AC2 the whole floor is on screen after reset', () => {
  for (const [w, h] of SHAPES) {
    for (const rows of [INITIAL_ROWS, 3]) {
      it(`#50 AC2 all four floor corners, deck included, on a ${w}×${h} screen (${rows} rows)`, () => {
        const { camera } = homeView(w, h, rows);
        camera.updateProjectionMatrix();
        expect(allOnScreen(camera, floorCorners(rows))).toBe(true);
      });
    }
  }
});

describe('#50 AC3 first load equals the reset view', () => {
  it('#50 AC3 framing a fresh orbit (first load) gives the same camera as reset', () => {
    for (const [w, h] of SHAPES) {
      const first = new THREE.PerspectiveCamera(34, w / h, 0.1, 150);
      frameFloor(first, initialOrbit(), INITIAL_ROWS);
      const { camera } = homeView(w, h);
      expect(camera.position.distanceTo(first.position)).toBeLessThan(1e-6);
      expect(camera.quaternion.angleTo(first.quaternion)).toBeLessThan(1e-6);
    }
  });
});

const html = readFileSync('index.html', 'utf8');
const css = readFileSync('src/client/style.css', 'utf8');
const rule = (selector: string, source = css) =>
  source.match(new RegExp(`(^|\\n)\\s*${selector.replace(/\./g, '\\.')}\\s*\\{([^}]*)\\}`))?.[2] ?? '';
const px = (value: string, prop: string) => Number(value.match(new RegExp(`(^|[\\s;])${prop}:\\s*(?:calc\\()?(\\d+)px`))?.[2]);

describe('#50 AC4 a camera icon on the reset button', () => {
  const button = html.match(/<button[^>]*id="home"[\s\S]*?<\/button>/)![0];

  it('#50 AC4 the button shows a line-drawn SVG camera, not ⌂', () => {
    expect(button).not.toContain('⌂');
    const svg = button.match(/<svg[\s\S]*<\/svg>/)![0];
    expect(svg).toMatch(/fill="none"/);
    expect(svg).toMatch(/stroke="currentColor"/);
    expect(svg).toMatch(/aria-hidden="true"/);
  });

  it('#50 AC4 its tooltip and accessible label still say it returns to the starting view', () => {
    expect(button).toMatch(/title="Back to the starting view \(Home\)"/);
    expect(button).toMatch(/aria-label="Back to the starting view"/);
  });

  it('#50 AC4 the Home key still resets', () => {
    let resets = 0;
    const target = new EventTarget();
    bindHomeKey(target, () => resets++);
    target.dispatchEvent(new KeyboardEvent('keydown', { key: 'End' }));
    expect(resets).toBe(0);
    const home = new KeyboardEvent('keydown', { key: 'Home', cancelable: true });
    target.dispatchEvent(home);
    expect(resets).toBe(1);
    expect(home.defaultPrevented).toBe(true);
  });
});

describe('#50 AC5 top right, with the desktop card below it', () => {
  it('#50 AC5 the button sits in the top-right corner', () => {
    const home = rule('.home');
    expect(home).toMatch(/right:\s*16px/);
    expect(home).toMatch(/top:\s*calc\(16px/);
    expect(home).not.toMatch(/left:|bottom:/);
  });

  it('#50 AC5 on desktop the card opens below the button without overlapping it', () => {
    const home = rule('.home'), card = rule('.card');
    const buttonBottom = px(home, 'top') + px(home, 'min-height');
    expect(px(card, 'top')).toBeGreaterThan(buttonBottom);
    expect(card).toMatch(/right:\s*16px/);
    // Its height leaves room for the button above it.
    expect(card).toMatch(new RegExp(`max-height:\\s*calc\\(100% - ${px(card, 'top') + 16}px`));
  });

  it('#50 AC5 on phones the card stays at the bottom', () => {
    const phone = css.match(/@media \(max-width: 700px\) \{([\s\S]*?)\n\}/)![1];
    expect(rule('.card', phone)).toMatch(/top:\s*auto/);
    expect(rule('.card', phone)).toMatch(/bottom:/);
  });
});

