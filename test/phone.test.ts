import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  FOV, ZOOM, allOnScreen, clampTooltip, createGestures, floorCorners, fovFor, frameFloor, initialOrbit, pinchRadius, placeCamera, wheelRadius,
} from '../src/client/camera.ts';
import { INITIAL_PODS } from '../src/client/controller.ts';

describe('#21 AC1 pinch zoom', () => {
  it('#21 AC1 spreading the fingers moves the camera closer, pinching moves it away, in proportion', () => {
    expect(pinchRadius(20, 100, 200)).toBeCloseTo(10);
    expect(pinchRadius(20, 200, 100)).toBeCloseTo(40);
    expect(pinchRadius(20, 100, 125)).toBeCloseTo(16);
    expect(pinchRadius(20, 100, 100)).toBeCloseTo(20);
  });

  it('#21 AC1 pinch is clamped to the same range as the mouse wheel: 6–45 m', () => {
    expect(ZOOM).toEqual({ min: 6, max: 45 });
    expect(pinchRadius(20, 100, 1000)).toBe(6);
    expect(pinchRadius(20, 1000, 100)).toBe(45);
    expect(pinchRadius(20, 100, 0)).toBe(45);
    expect(wheelRadius(6, -1)).toBe(6);
    expect(wheelRadius(45, 1)).toBe(45);
  });

  it('#21 AC1 / #22 where the floor needs more than 45 m to fit, wheel and pinch share the raised limit', () => {
    expect(pinchRadius(20, 1000, 100, 55)).toBe(55);
    expect(wheelRadius(55, 1, 55)).toBe(55);
    expect(pinchRadius(20, 100, 1000, 55)).toBe(6);
  });

  it('#21 AC1 two fingers spreading apart zoom in through the gesture handler', () => {
    const orbit = initialOrbit();
    const g = createGestures(orbit);
    g.down(1, 100, 100);
    g.down(2, 200, 100);
    g.move(2, 300, 100);
    expect(orbit.radius).toBeCloseTo(9);
    g.move(2, 150, 100);
    expect(orbit.radius).toBeCloseTo(36);
  });
});

describe('#21 AC2 two fingers neither orbit nor tap', () => {
  it('#21 AC2 the camera does not orbit while two fingers are down', () => {
    const orbit = initialOrbit();
    const { theta, phi } = orbit;
    const g = createGestures(orbit);
    g.down(1, 100, 100);
    g.down(2, 200, 100);
    g.move(1, 50, 300);
    g.move(2, 260, 20);
    expect([orbit.theta, orbit.phi]).toEqual([theta, phi]);
    expect(g.up(1)).toBe(false);
    g.move(2, 400, 400); // the finger left behind doesn't orbit either
    expect([orbit.theta, orbit.phi]).toEqual([theta, phi]);
    expect(g.up(2)).toBe(false);
  });

  it('#21 AC2 lifting two still fingers is not a tap, in either order', () => {
    const g = createGestures(initialOrbit());
    g.down(1, 100, 100);
    g.down(2, 200, 100);
    expect(g.up(2)).toBe(false);
    expect(g.up(1)).toBe(false);
  });

  it('#21 AC2 one finger still taps, and dragging one finger still orbits without a tap', () => {
    const orbit = initialOrbit();
    const g = createGestures(orbit);
    g.down(1, 100, 100);
    expect(g.up(1)).toBe(true);
    g.down(1, 100, 100);
    g.move(1, 160, 100);
    expect(orbit.theta).toBeCloseTo(0.22 - 0.3);
    expect(g.up(1)).toBe(false);
  });
});

describe('#21 AC3 the floor fits any screen shape on first load', () => {
  for (const [w, h] of [[390, 844], [1440, 900], [375, 667], [844, 390], [768, 1024], [2560, 1080]]) {
    for (const pods of [INITIAL_PODS, 6, 8]) {
      it(`#21 AC3 all four floor corners project inside a ${w}×${h} screen (${pods} pods)`, () => {
        const camera = new THREE.PerspectiveCamera(34, w / h, 0.1, 150);
        const orbit = initialOrbit();
        frameFloor(camera, orbit, pods);
        placeCamera(camera, orbit);
        camera.updateProjectionMatrix();
        expect(allOnScreen(camera, floorCorners(pods))).toBe(true);
        expect(orbit.radius).toBeLessThanOrEqual(orbit.maxRadius);
        expect(orbit.radius).toBeLessThan(camera.far);
      });
    }
  }

  it('#21 AC3 / #22 desktop keeps 34° and the 45 m limit; narrow screens widen to at most 45°', () => {
    expect(fovFor(1440 / 900)).toBe(FOV.base);
    expect(fovFor(1)).toBe(FOV.base);
    expect(fovFor(390 / 844)).toBe(FOV.max);
    expect(fovFor(0.85)).toBeGreaterThan(FOV.base);
    expect(fovFor(0.85)).toBeLessThan(FOV.max);
    const camera = new THREE.PerspectiveCamera(34, 1440 / 900, 0.1, 150);
    const orbit = initialOrbit();
    frameFloor(camera, orbit, INITIAL_PODS);
    expect(orbit.maxRadius).toBe(ZOOM.max);
  });
});

describe('#21 AC4 tooltip stays on screen', () => {
  const screen = { width: 390, height: 844 };
  const box = { width: 200, height: 30 };
  // The tooltip is drawn centred on x, its bottom 12px above y.
  const edges = (p: { x: number; y: number }) => ({ left: p.x - box.width / 2, right: p.x + box.width / 2, top: p.y - 12 - box.height, bottom: p.y - 12 });

  it('#21 AC4 an agent away from the edges keeps the tooltip where it was', () => {
    expect(clampTooltip(195, 400, box, screen)).toEqual({ x: 195, y: 400 });
  });

  it('#21 AC4 near an edge, the tooltip is moved inside with an 8px margin', () => {
    expect(edges(clampTooltip(10, 400, box, screen)).left).toBe(8);
    expect(edges(clampTooltip(385, 400, box, screen)).right).toBe(390 - 8);
    expect(edges(clampTooltip(195, 5, box, screen)).top).toBe(8);
    expect(edges(clampTooltip(195, 900, box, screen)).bottom).toBeLessThanOrEqual(844 - 8);
  });
});
