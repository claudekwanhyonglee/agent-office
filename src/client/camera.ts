import * as THREE from 'three';
import { officeLayout } from './layout.ts';

/** How far the camera can zoom, in metres from its target. Narrow screens may raise `max` to fit the floor (#22). */
export const ZOOM = { min: 6, max: 45 };
/** Vertical field of view: 34° normally, widened up to 45° on narrow screens (#22). */
export const FOV = { base: 34, max: 45 };
/** Tilt from straight down, in radians: nearly overhead to nearly level, never below the floor. */
export const TILT = { min: 0.1, max: 1.45 };
/** Furthest the fit will back off; the camera's far plane is 150 m. */
const FIT_LIMIT = 120;

export interface Orbit { theta: number; phi: number; radius: number; target: THREE.Vector3; maxRadius: number }

export const initialOrbit = (): Orbit => ({ theta: 0.22, phi: 0.86, radius: 18, target: new THREE.Vector3(0, 0.5, 0), maxRadius: ZOOM.max });

export function placeCamera(camera: THREE.PerspectiveCamera, { theta, phi, radius, target }: Orbit) {
  camera.position.set(
    target.x + radius * Math.sin(phi) * Math.sin(theta),
    target.y + radius * Math.cos(phi),
    target.z + radius * Math.sin(phi) * Math.cos(theta),
  );
  camera.lookAt(target);
  camera.updateMatrixWorld();
}

const clampZoom = (radius: number, max: number) => THREE.MathUtils.clamp(radius, ZOOM.min, Math.max(ZOOM.max, max));

/** Scrolling down zooms out, up zooms in. */
export const wheelRadius = (radius: number, deltaY: number, max = ZOOM.max) => clampZoom(radius * (deltaY > 0 ? 1.08 : 0.92), max);

/** Spreading the fingers zooms in, pinching zooms out, in proportion to the finger distance. */
export const pinchRadius = (startRadius: number, startDistance: number, distance: number, max = ZOOM.max) =>
  clampZoom(startRadius * (startDistance / Math.max(distance, 1)), max);

/** Wider on narrow screens, so the side-to-side view doesn't shrink as much; never past FOV.max. */
export const fovFor = (aspect: number) => {
  const keepHorizontal = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(FOV.base / 2)) / aspect));
  return THREE.MathUtils.clamp(keepHorizontal, FOV.base, FOV.max);
};

/** The corners of the whole floor, deck included. */
export const floorCorners = (rows: number) => {
  const { left, right, back, front } = officeLayout(rows).bounds;
  return [[left, back], [right, back], [left, front], [right, front]].map(([x, z]) => new THREE.Vector3(x, 0, z));
};

/** Whether every point lands inside the screen, leaving `margin` (in NDC units) at the edges. */
export function allOnScreen(camera: THREE.PerspectiveCamera, points: THREE.Vector3[], margin = 0) {
  const limit = 1 - margin;
  return points.every((p) => {
    const ndc = p.clone().project(camera);
    return Math.abs(ndc.x) <= limit && Math.abs(ndc.y) <= limit && ndc.z < 1;
  });
}

/** The closest camera distance at which all the points fit on screen, at the camera's current aspect and fov. */
export function fitRadius(camera: THREE.PerspectiveCamera, orbit: Orbit, points: THREE.Vector3[], margin = 0.04) {
  camera.updateProjectionMatrix();
  const fits = (radius: number) => {
    placeCamera(camera, { ...orbit, radius });
    return allOnScreen(camera, points, margin);
  };
  // Further away only ever shrinks the floor on screen, so a binary search finds the edge.
  let near = ZOOM.min, far = FIT_LIMIT;
  if (fits(near)) return near;
  if (!fits(far)) return far;
  while (far - near > 0.05) {
    const mid = (near + far) / 2;
    if (fits(mid)) far = mid; else near = mid;
  }
  return far;
}

/** Sets the fov for the screen shape, aims at the floor and backs off until all of it is on screen. */
export function frameFloor(camera: THREE.PerspectiveCamera, orbit: Orbit, rows: number) {
  camera.fov = fovFor(camera.aspect);
  const { left, right, back, front } = officeLayout(rows).bounds;
  orbit.target.z = (back + front) / 2 + 1.5;
  // Never closer than the hand-tuned desktop framing, so walls and furniture above the floor stay in view.
  const handTuned = 4 + Math.max(right - left, front - back) * 0.9;
  orbit.radius = Math.max(fitRadius(camera, orbit, floorCorners(rows)), handTuned);
  orbit.maxRadius = Math.max(ZOOM.max, orbit.radius);
  placeCamera(camera, orbit);
}

/**
 * Pointer gestures on the canvas: one finger (or mouse) orbits, two fingers pinch-zoom.
 * A press that neither moves nor ever had a second finger counts as a tap.
 */
export function createGestures(orbit: Orbit) {
  const pointers = new Map<number, { x: number; y: number }>();
  let drag: { x: number; y: number; theta: number; phi: number } | null = null;
  let pinch: { distance: number; radius: number } | null = null;
  let moved = false;
  let multiTouch = false;
  const spread = () => {
    const [a, b] = [...pointers.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  };

  return {
    get dragging() { return moved; },
    down(id: number, x: number, y: number) {
      pointers.set(id, { x, y });
      if (pointers.size === 1) {
        drag = { x, y, theta: orbit.theta, phi: orbit.phi };
        moved = false;
        multiTouch = false;
      } else {
        drag = null;
        multiTouch = true;
        if (pointers.size === 2) pinch = { distance: spread(), radius: orbit.radius };
      }
    },
    /** Returns whether the camera moved. */
    move(id: number, x: number, y: number) {
      if (!pointers.has(id)) return false;
      pointers.set(id, { x, y });
      if (pinch && pointers.size === 2) {
        orbit.radius = pinchRadius(pinch.radius, pinch.distance, spread(), orbit.maxRadius);
        return true;
      }
      if (!drag) return false;
      const dx = x - drag.x, dy = y - drag.y;
      if (Math.hypot(dx, dy) > 4) moved = true;
      orbit.theta = drag.theta - dx * 0.005;
      orbit.phi = THREE.MathUtils.clamp(drag.phi - dy * 0.004, TILT.min, TILT.max);
      return true;
    },
    /** Returns whether this release was a tap. */
    up(id: number) {
      if (!pointers.delete(id)) return false;
      if (pointers.size < 2) pinch = null;
      if (pointers.size > 0) { drag = null; return false; }
      const tap = !!drag && !moved && !multiTouch;
      drag = null;
      moved = false;
      return tap;
    },
  };
}

/**
 * Anchor for a box drawn centred above (x, y) with its bottom `gap` px above it (the tooltip's CSS),
 * moved so the box stays `margin` px inside the screen.
 */
export function clampTooltip(x: number, y: number, box: { width: number; height: number }, screen: { width: number; height: number }, margin = 8, gap = 12) {
  const half = box.width / 2;
  const top = margin + box.height + gap;
  return {
    x: THREE.MathUtils.clamp(x, margin + half, Math.max(margin + half, screen.width - margin - half)),
    y: THREE.MathUtils.clamp(y, top, Math.max(top, screen.height - margin)),
  };
}
