import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import {
  createDoubleTap, createGestures, floorPoint, focusOn, frameFloor, goHome, initialOrbit, placeCamera, wheelRadius, zoomToward, type Orbit,
} from '../src/client/camera.ts';
import { INITIAL_ROWS, officeLayout } from '../src/client/layout.ts';

const SCREEN = { width: 1600, height: 1000 };
const toNdc = (x: number, y: number) => ({ x: (x / SCREEN.width) * 2 - 1, y: -(y / SCREEN.height) * 2 + 1 });
const toPixels = (p: THREE.Vector3, camera: THREE.Camera) => {
  const ndc = p.clone().project(camera);
  return { x: ((ndc.x + 1) / 2) * SCREEN.width, y: ((1 - ndc.y) / 2) * SCREEN.height };
};

/** A camera framed as on first load, and a `floorAt` like the view's (screen pixels → floor point). */
function setup(rows = INITIAL_ROWS) {
  const camera = new THREE.PerspectiveCamera(34, SCREEN.width / SCREEN.height, 0.1, 150);
  const orbit = initialOrbit();
  frameFloor(camera, orbit, rows);
  const floorAt = (x: number, y: number) => {
    placeCamera(camera, orbit);
    return floorPoint(camera, toNdc(x, y), orbit.target.y);
  };
  return { camera, orbit, floorAt, gestures: createGestures(orbit, floorAt) };
}

const view = (orbit: Orbit) => ({ theta: orbit.theta, phi: orbit.phi, radius: orbit.radius, target: orbit.target.clone() });
const insideFloor = (orbit: Orbit, rows = INITIAL_ROWS) => {
  const { left, right, back, front } = officeLayout(rows).bounds;
  return orbit.target.x >= left && orbit.target.x <= right && orbit.target.z >= back && orbit.target.z <= front;
};

describe('#41 AC1 pan', () => {
  it('#41 AC1 middle-drag moves the target across the floor; angle, tilt and zoom stay', () => {
    const { orbit, camera, gestures } = setup();
    const before = view(orbit);
    placeCamera(camera, orbit);
    const marker = before.target.clone();
    const markerBefore = toPixels(marker, camera);
    gestures.down(1, 800, 500, 1);
    gestures.move(1, 900, 500);
    gestures.up(1);
    expect([orbit.theta, orbit.phi, orbit.radius]).toEqual([before.theta, before.phi, before.radius]);
    expect(orbit.target.y).toBe(before.target.y);
    expect(orbit.target.distanceTo(before.target)).toBeGreaterThan(0.3);
    placeCamera(camera, orbit);
    expect(toPixels(marker, camera).x, 'the floor follows the pointer to the right').toBeGreaterThan(markerBefore.x + 20);
  });

  it('#41 AC1 dragging down pulls the floor towards the viewer, at any angle', () => {
    for (const theta of [0.22, 2, -2.8]) {
      const { orbit, camera, gestures } = setup();
      orbit.theta = theta;
      orbit.target.set(0, 0.5, 2);
      placeCamera(camera, orbit);
      const marker = orbit.target.clone();
      const y0 = toPixels(marker, camera).y;
      gestures.down(1, 800, 500, 1);
      gestures.move(1, 800, 560);
      placeCamera(camera, orbit);
      expect(toPixels(marker, camera).y, `theta ${theta}`).toBeGreaterThan(y0 + 10);
      expect(Math.abs(toPixels(marker, camera).x - 800), `theta ${theta}: straight down`).toBeLessThan(2);
    }
  });

  it('#41 AC1 two fingers dragging together pan without orbiting or zooming', () => {
    const { orbit, gestures } = setup();
    const before = view(orbit);
    gestures.down(1, 700, 500);
    gestures.down(2, 900, 500);
    gestures.move(1, 750, 540);
    gestures.move(2, 950, 540);
    expect([orbit.theta, orbit.phi]).toEqual([before.theta, before.phi]);
    expect(orbit.radius).toBeCloseTo(before.radius, 6);
    expect(orbit.target.distanceTo(before.target)).toBeGreaterThan(0.3);
    expect(gestures.up(1)).toBe(false);
    expect(gestures.up(2)).toBe(false);
  });

  it('#41 AC1 two-finger pinch still zooms', () => {
    const { orbit, gestures } = setup();
    const radius = orbit.radius;
    gestures.down(1, 700, 500);
    gestures.down(2, 900, 500);
    gestures.move(1, 600, 500);
    gestures.move(2, 1000, 500);
    expect(orbit.radius).toBeCloseTo(radius / 2, 6);
  });
});

describe('#41 AC2 the target stays over the floor', () => {
  it('#41 AC2 panning far in any direction stops at the floor bounds (office and deck)', () => {
    for (const [dx, dy] of [[5000, 0], [-5000, 0], [0, 5000], [0, -5000], [4000, 4000]]) {
      const { orbit, gestures } = setup();
      gestures.down(1, 800, 500, 1);
      for (let s = 1; s <= 10; s++) gestures.move(1, 800 + (dx * s) / 10, 500 + (dy * s) / 10);
      expect(insideFloor(orbit), `${dx},${dy}`).toBe(true);
    }
  });

  it('#41 AC2 the bounds grow with the office', () => {
    const { orbit, camera } = setup(4);
    expect(orbit.bounds).toEqual(officeLayout(4).bounds);
    focusOn(orbit, new THREE.Vector3(0, 0.5, officeLayout(4).bounds.back + 0.5));
    expect(orbit.target.z).toBeCloseTo(officeLayout(4).bounds.back + 0.5);
    frameFloor(camera, orbit, INITIAL_ROWS);
    expect(orbit.bounds).toEqual(officeLayout(INITIAL_ROWS).bounds);
  });

  it('#41 AC2 zooming towards a point off the floor, and focusing on one, stay inside', () => {
    const { orbit } = setup();
    zoomToward(orbit, new THREE.Vector3(60, 0.5, -60), 6);
    expect(insideFloor(orbit)).toBe(true);
    focusOn(orbit, new THREE.Vector3(-80, 0.5, 90));
    expect(insideFloor(orbit)).toBe(true);
  });
});

describe('#41 AC3 zoom towards the pointer', () => {
  for (const [x, y] of [[300, 700], [1300, 400], [800, 500]]) {
    it(`#41 AC3 wheel zoom keeps the floor point under the pointer at (${x}, ${y})`, () => {
      const { orbit, camera, floorAt } = setup();
      for (const deltaY of [-100, -100, 100]) {
        const point = floorAt(x, y)!;
        zoomToward(orbit, point, wheelRadius(orbit.radius, deltaY, orbit.maxRadius));
        placeCamera(camera, orbit);
        const after = toPixels(point, camera);
        expect(after.x).toBeCloseTo(x, 3);
        expect(after.y).toBeCloseTo(y, 3);
      }
      expect(orbit.target.y).toBeCloseTo(0.5);
    });
  }

  it('#41 AC3 zoom limits still hold', () => {
    const { orbit, floorAt } = setup();
    for (let i = 0; i < 40; i++) zoomToward(orbit, floorAt(800, 500), wheelRadius(orbit.radius, -1, orbit.maxRadius));
    expect(orbit.radius).toBe(6);
  });

  it('#41 AC3 pinch zoom keeps the floor point under the pinch centre', () => {
    const { orbit, camera, floorAt, gestures } = setup();
    const centre = { x: 500, y: 650 };
    const point = floorAt(centre.x, centre.y)!;
    gestures.down(1, centre.x - 50, centre.y);
    gestures.down(2, centre.x + 50, centre.y);
    for (const spread of [70, 90, 120, 160]) {
      gestures.move(1, centre.x - spread, centre.y);
      gestures.move(2, centre.x + spread, centre.y);
    }
    expect(orbit.radius).toBeLessThan(18);
    placeCamera(camera, orbit);
    const after = toPixels(point, camera);
    expect(after.x).toBeCloseTo(centre.x, 0);
    expect(after.y).toBeCloseTo(centre.y, 0);
  });
});

describe('#41 AC4 double-click to focus', () => {
  it('#41 AC4 two quick taps close together are a double tap; slow or far apart ones are not', () => {
    const tap = createDoubleTap();
    expect(tap(100, 100, 1000)).toBe(false);
    expect(tap(104, 102, 1250)).toBe(true);
    expect(tap(104, 102, 1400)).toBe(false); // a third tap starts over
    expect(tap(104, 102, 2000)).toBe(false); // too slow
    expect(tap(300, 102, 2100)).toBe(false); // too far
  });

  it('#41 AC4 focusing centres the orbit target on the floor point, keeping angle, tilt and zoom', () => {
    const { orbit, camera, floorAt } = setup();
    const before = view(orbit);
    const point = floorAt(400, 600)!;
    focusOn(orbit, point);
    expect(orbit.target.x).toBeCloseTo(point.x);
    expect(orbit.target.z).toBeCloseTo(point.z);
    expect([orbit.theta, orbit.phi, orbit.radius]).toEqual([before.theta, before.phi, before.radius]);
    placeCamera(camera, orbit);
    const centre = toPixels(point, camera);
    expect(centre.x).toBeCloseTo(800, 3);
    expect(centre.y).toBeCloseTo(500, 3);
  });
});

describe('#41 AC5 Home', () => {
  it('#41 AC5 Home restores target, angle, tilt and zoom as on first load', () => {
    for (const rows of [INITIAL_ROWS, 3]) {
      const { orbit, camera, gestures, floorAt } = setup(rows);
      const start = view(orbit);
      gestures.down(1, 800, 500);
      gestures.move(1, 1100, 300);
      gestures.up(1);
      gestures.down(1, 800, 500, 1);
      gestures.move(1, 600, 650);
      gestures.up(1);
      zoomToward(orbit, floorAt(200, 200), 9);
      focusOn(orbit, new THREE.Vector3(5, 0.5, 9));
      goHome(camera, orbit, rows);
      const home = view(orbit);
      expect(home.theta).toBe(start.theta);
      expect(home.phi).toBe(start.phi);
      expect(home.radius).toBeCloseTo(start.radius, 6);
      expect(home.target.distanceTo(start.target)).toBeLessThan(1e-9);
    }
  });

  it('#41 AC5 the page has a Home button', () => {
    const html = readFileSync('index.html', 'utf8');
    expect(html).toMatch(/<button[^>]*id="home"[^>]*>/);
  });
});

describe('#41 AC6 tap and orbit as before', () => {
  it('#41 AC6 a still left click (or one-finger tap) is a tap; a middle click is not', () => {
    const { gestures } = setup();
    gestures.down(1, 800, 500, 0);
    expect(gestures.up(1)).toBe(true);
    gestures.down(1, 800, 500, 1);
    expect(gestures.up(1)).toBe(false);
    gestures.down(1, 800, 500);
    expect(gestures.up(1)).toBe(true);
  });

  it('#41 AC6 a left drag orbits and leaves the target where it was; a middle drag does not orbit', () => {
    const { orbit, gestures } = setup();
    const before = view(orbit);
    gestures.down(1, 800, 500, 0);
    gestures.move(1, 860, 480);
    expect(gestures.up(1)).toBe(false);
    expect(orbit.theta).toBeCloseTo(before.theta - 0.3);
    expect(orbit.phi).toBeCloseTo(before.phi + 0.08);
    expect(orbit.target.equals(before.target)).toBe(true);
    const turned = view(orbit);
    gestures.down(1, 800, 500, 1);
    gestures.move(1, 860, 480);
    gestures.up(1);
    expect([orbit.theta, orbit.phi]).toEqual([turned.theta, turned.phi]);
  });
});
