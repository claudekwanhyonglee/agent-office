import * as THREE from 'three';
import { INITIAL_ROWS, officeLayout } from './layout.ts';

/** How far the camera can zoom, in metres from its target. Narrow screens may raise `max` to fit the floor (#22). */
export const ZOOM = { min: 6, max: 45 };
/** Vertical field of view: 34° normally, widened up to 45° on narrow screens (#22). */
export const FOV = { base: 34, max: 45 };
/** Tilt from straight down, in radians: nearly overhead to nearly level, never below the floor. */
export const TILT = { min: 0.1, max: 1.45 };
/** Furthest the fit will back off; the camera's far plane is 150 m. */
const FIT_LIMIT = 120;

/** Where the orbit target may go: the whole floor, deck included. */
export interface FloorBounds { left: number; right: number; back: number; front: number }

export interface Orbit { theta: number; phi: number; radius: number; target: THREE.Vector3; maxRadius: number; bounds: FloorBounds }

export const initialOrbit = (): Orbit => ({
  theta: 0.22, phi: 0.86, radius: 18, target: new THREE.Vector3(0, 0.5, 0), maxRadius: ZOOM.max, bounds: officeLayout(INITIAL_ROWS).bounds,
});

/** Metres the target moves per pixel dragged, per metre of zoom. */
const PAN_SPEED = 0.0008;

function keepOnFloor({ target, bounds }: Orbit) {
  target.x = THREE.MathUtils.clamp(target.x, bounds.left, bounds.right);
  target.z = THREE.MathUtils.clamp(target.z, bounds.back, bounds.front);
}

/** Slides the target across the floor as if dragging the floor by (dx, dy) pixels. */
export function panBy(orbit: Orbit, dx: number, dy: number) {
  const step = orbit.radius * PAN_SPEED;
  const sin = Math.sin(orbit.theta), cos = Math.cos(orbit.theta);
  orbit.target.x -= (cos * dx + sin * dy) * step;
  orbit.target.z += (sin * dx - cos * dy) * step;
  keepOnFloor(orbit);
}

/** Zooms to `radius`, moving towards `point` so it stays where it is on screen (null: towards the target). */
export function zoomToward(orbit: Orbit, point: THREE.Vector3 | null, radius: number) {
  if (point) orbit.target.sub(point).multiplyScalar(radius / orbit.radius).add(point);
  orbit.radius = radius;
  keepOnFloor(orbit);
}

/** Centres the target on a floor point. */
export function focusOn(orbit: Orbit, point: THREE.Vector3) {
  orbit.target.x = point.x;
  orbit.target.z = point.z;
  keepOnFloor(orbit);
}

/** Back to the view on first load: starting angle, tilt and target, zoomed to fit the floor. */
export function goHome(camera: THREE.PerspectiveCamera, orbit: Orbit, rows: number) {
  const start = initialOrbit();
  orbit.theta = start.theta;
  orbit.phi = start.phi;
  orbit.target.copy(start.target);
  frameFloor(camera, orbit, rows);
}

/** Where the ray through `ndc` meets the level plane at `height` (the target's), or null if it misses. */
export function floorPoint(camera: THREE.Camera, ndc: { x: number; y: number }, height: number) {
  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(new THREE.Vector2(ndc.x, ndc.y), camera);
  return raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -height), new THREE.Vector3());
}

/** Returns a tap checker: true when a tap lands soon after, and close to, the previous one. */
export function createDoubleTap(withinMs = 350, nearPx = 24) {
  let last: { x: number; y: number; t: number } | null = null;
  return (x: number, y: number, t: number) => {
    const double = !!last && t - last.t <= withinMs && Math.hypot(x - last.x, y - last.y) <= nearPx;
    last = double ? null : { x, y, t };
    return double;
  };
}

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
  orbit.bounds = officeLayout(rows).bounds;
  const { left, right, back, front } = orbit.bounds;
  orbit.target.z = (back + front) / 2 + 1.5;
  // Never closer than the hand-tuned desktop framing, so walls and furniture above the floor stay in view.
  const handTuned = 4 + Math.max(right - left, front - back) * 0.9;
  orbit.radius = Math.max(fitRadius(camera, orbit, floorCorners(rows)), handTuned);
  orbit.maxRadius = Math.max(ZOOM.max, orbit.radius);
  placeCamera(camera, orbit);
}

const MIDDLE_BUTTON = 1;

/**
 * Pointer gestures on the canvas: one finger (or left mouse) orbits, middle mouse pans, two fingers
 * pan and pinch-zoom towards their centre. `floorAt` turns screen pixels into the floor point there.
 * A left press or one finger that neither moves nor ever had a second finger counts as a tap.
 */
export function createGestures(orbit: Orbit, floorAt: (x: number, y: number) => THREE.Vector3 | null = () => null) {
  const pointers = new Map<number, { x: number; y: number }>();
  let drag: { x: number; y: number; theta: number; phi: number } | null = null;
  let pan: { x: number; y: number } | null = null;
  let pinch: { distance: number; radius: number; centre: { x: number; y: number } } | null = null;
  let moved = false;
  let multiTouch = false;
  /** Drags the floor from one screen point to another, so the floor point grabbed stays under the pointer. */
  const slide = (from: { x: number; y: number }, to: { x: number; y: number }) => {
    const grabbed = floorAt(from.x, from.y), under = floorAt(to.x, to.y);
    if (!grabbed || !under) return panBy(orbit, to.x - from.x, to.y - from.y); // above the horizon
    orbit.target.add(grabbed).sub(under);
    keepOnFloor(orbit);
  };
  const twoFingers = () => {
    const [a, b] = [...pointers.values()];
    return { spread: Math.hypot(a.x - b.x, a.y - b.y), centre: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } };
  };

  return {
    get dragging() { return moved; },
    down(id: number, x: number, y: number, button = 0) {
      pointers.set(id, { x, y });
      drag = pan = null;
      if (pointers.size === 1) {
        moved = false;
        multiTouch = button === MIDDLE_BUTTON; // a middle click is never a tap
        if (multiTouch) pan = { x, y };
        else drag = { x, y, theta: orbit.theta, phi: orbit.phi };
      } else {
        multiTouch = true;
        if (pointers.size === 2) {
          const { spread, centre } = twoFingers();
          pinch = { distance: spread, radius: orbit.radius, centre };
        }
      }
    },
    /** Returns whether the camera moved. */
    move(id: number, x: number, y: number) {
      if (!pointers.has(id)) return false;
      pointers.set(id, { x, y });
      if (pinch && pointers.size === 2) {
        const { spread, centre } = twoFingers();
        zoomToward(orbit, floorAt(pinch.centre.x, pinch.centre.y), pinchRadius(pinch.radius, pinch.distance, spread, orbit.maxRadius));
        slide(pinch.centre, centre);
        pinch.centre = centre;
        return true;
      }
      if (pan) {
        slide(pan, { x, y });
        pan = { x, y };
        moved = true;
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
      if (pointers.size > 0) { drag = pan = null; return false; }
      const tap = !!drag && !moved && !multiTouch;
      drag = pan = null;
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
