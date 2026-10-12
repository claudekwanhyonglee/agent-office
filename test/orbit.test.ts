import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { ZOOM, createGestures, initialOrbit, placeCamera, type Orbit } from '../src/client/camera.ts';
import { INITIAL_ROWS } from '../src/client/layout.ts';
import { buildOffice, updateBackWall } from '../src/client/office.ts';

const cameraAt = (orbit: Orbit) => {
  const camera = new THREE.PerspectiveCamera(34, 1.6, 0.1, 150);
  placeCamera(camera, orbit);
  return camera;
};

/** Drags one pointer from (100, 100) by (dx, dy) in steps. */
function drag(orbit: Orbit, dx: number, dy: number) {
  const g = createGestures(orbit);
  g.down(1, 100, 100);
  for (let s = 1; s <= 20; s++) g.move(1, 100 + (dx * s) / 20, 100 + (dy * s) / 20);
  g.up(1);
}

describe('#39 AC1 full spin', () => {
  it('#39 AC1 dragging sideways turns past ±0.9 rad, either way', () => {
    const left = initialOrbit(), right = initialOrbit();
    drag(left, 1000, 0);
    drag(right, -1000, 0);
    expect(left.theta).toBeLessThan(-0.9 - 1);
    expect(right.theta).toBeGreaterThan(0.9 + 1);
  });

  it('#39 AC1 a full round (2π) brings back the starting view', () => {
    const start = initialOrbit();
    const round = initialOrbit();
    drag(round, (2 * Math.PI) / 0.005, 0);
    const a = cameraAt(start), b = cameraAt(round);
    expect(b.position.distanceTo(a.position)).toBeLessThan(1e-6);
    expect(b.quaternion.angleTo(a.quaternion)).toBeLessThan(1e-6);
  });
});

describe('#39 AC2 wider tilt, never below the floor', () => {
  it('#39 AC2 tilt goes from 0.1 rad up to 1.45 rad and stops there', () => {
    const up = initialOrbit(), down = initialOrbit();
    drag(up, 0, 2000);
    drag(down, 0, -2000);
    expect(up.phi).toBeCloseTo(0.1);
    expect(down.phi).toBeCloseTo(1.45);
  });

  it('#39 AC2 a little past the old limits (0.5 and 1.15) is now allowed', () => {
    const up = initialOrbit(), down = initialOrbit();
    drag(up, 0, (up.phi - 0.3) / 0.004);
    drag(down, 0, -(1.3 - down.phi) / 0.004);
    expect(up.phi).toBeCloseTo(0.3);
    expect(down.phi).toBeCloseTo(1.3);
  });

  it('#39 AC2 the camera stays above the floor at every angle, tilt and zoom', () => {
    for (const phi of [0.1, 0.8, 1.45]) {
      for (const radius of [ZOOM.min, 20, ZOOM.max]) {
        for (const theta of [0, 1, Math.PI, -2.5]) {
          expect(cameraAt({ ...initialOrbit(), theta, phi, radius }).position.y, `${theta}/${phi}/${radius}`).toBeGreaterThan(0.5);
        }
      }
    }
  });

  it('#39 AC2 zoom limits are unchanged', () => {
    expect(ZOOM).toEqual({ min: 6, max: 45 });
  });
});

describe('#39 AC3 the back wall gets out of the way', () => {
  /** Whether `object` would be drawn: it and every parent are visible. */
  const shown = (object: THREE.Object3D) => {
    for (let o: THREE.Object3D | null = object; o; o = o.parent) if (!o.visible) return false;
    return true;
  };
  const backWallPieces = (group: THREE.Group, back: number) => {
    const pieces: THREE.Object3D[] = [];
    group.updateMatrixWorld(true);
    group.traverse((o) => {
      if ((o.userData.kind === 'wall' || o.userData.kind === 'window') && o.getWorldPosition(new THREE.Vector3()).z < back) pieces.push(o);
    });
    return pieces;
  };

  it('#39 AC3 behind the back wall, the wall is hidden; in front again, it is back', () => {
    const office = buildOffice(INITIAL_ROWS);
    const pieces = backWallPieces(office.group, office.layout.bounds.back);
    expect(pieces.length).toBeGreaterThan(1); // the wall and its windows

    const behind = cameraAt({ ...initialOrbit(), theta: Math.PI, phi: 1.2, radius: 20 });
    expect(behind.position.z).toBeLessThan(office.layout.bounds.back);
    updateBackWall(office, behind.position);
    for (const p of pieces) expect(shown(p)).toBe(false);

    const front = cameraAt({ ...initialOrbit(), radius: 20 });
    updateBackWall(office, front.position);
    for (const p of pieces) expect(shown(p)).toBe(true);
  });

  it('#39 AC3 seen from the side or the front, the wall stays', () => {
    const office = buildOffice(INITIAL_ROWS);
    const pieces = backWallPieces(office.group, office.layout.bounds.back);
    for (const theta of [0, 1.2, -1.2]) {
      updateBackWall(office, cameraAt({ ...initialOrbit(), theta, radius: 18 }).position);
      for (const p of pieces) expect(shown(p), `theta ${theta}`).toBe(true);
    }
  });
});
