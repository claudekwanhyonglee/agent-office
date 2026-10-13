import * as THREE from 'three';
import { buildOffice } from './office.ts';
import {
  bindHomeKey, blockContextMenu, createDoubleTap, createGestures, focusOn, frameFloor, goHome, grabAt, initialOrbit, pansWith, pickSurface,
  placeCamera, wheelRadius, zoomToward, type Orbit, type Pointer,
} from './camera.ts';

/** Renderer, lights, orbit camera and the office. Agents are layered on by callers. */
export function createView(host: HTMLElement) {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  host.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#2B2545');
  // Prototype intensities were tuned for legacy lighting; physical lights need ×π.
  scene.add(new THREE.HemisphereLight('#FFF1DC', '#5A4E7A', 0.55 * Math.PI));
  const sun = new THREE.DirectionalLight('#FFF4E2', 0.6 * Math.PI);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0008;
  scene.add(sun, sun.target);

  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 150);
  const orbit = initialOrbit();
  // Dev hook: aim the camera from the console or a capture script, e.g. __aim({ theta: Math.PI / 2 }, [-9, 1, 1.5]).
  if (import.meta.env.DEV) {
    Object.assign(window, {
      __aim: (angles: Partial<Pick<Orbit, 'theta' | 'phi' | 'radius'>>, target?: [number, number, number]) => {
        Object.assign(orbit, angles);
        if (target) orbit.target.set(...target);
        placeCamera(camera, orbit);
      },
    });
  }

  let office: ReturnType<typeof buildOffice> | undefined;
  let rows = 0;

  function setRows(count: number) {
    if (count === rows) return office!;
    if (office) scene.remove(office.group);
    rows = count;
    office = buildOffice(count);
    scene.add(office.group);
    // Frame the whole floor and stretch the sun's shadow box over it.
    const { left, right, back, front } = office.layout.bounds;
    const depth = front - back, centerZ = (back + front) / 2, width = right - left;
    const half = Math.max(width, depth) / 2 + 2;
    Object.assign(sun.shadow.camera, { left: -half, right: half, top: half, bottom: -half, near: 1, far: 40 });
    sun.shadow.camera.updateProjectionMatrix();
    sun.position.set(5, 14, 8 + centerZ);
    sun.target.position.set(0, 0, centerZ);
    resize();
    return office;
  }

  function resize() {
    const w = host.clientWidth || innerWidth, h = host.clientHeight || innerHeight;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    frameFloor(camera, orbit, rows);
  }

  // Map-style: drag to pan, right- or Shift-drag to orbit (touch: one finger orbits, two pan); pinch or scroll to zoom
  // towards what's under the pointer; double-click to focus; Home to go back. A press that doesn't
  // move counts as a click.
  const canvas = renderer.domElement;
  const clickHandlers: ((e: PointerEvent) => void)[] = [];
  const raycaster = new THREE.Raycaster();
  const pointer: Pointer = {
    ray(x, y) {
      const r = canvas.getBoundingClientRect();
      placeCamera(camera, orbit);
      raycaster.setFromCamera(new THREE.Vector2(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1), camera);
      return raycaster.ray.clone();
    },
    pick(x, y) {
      pointer.ray(x, y);
      return pickSurface(raycaster, scene);
    },
  };
  const gestures = createGestures(orbit, pointer);
  const doubleTap = createDoubleTap();
  blockContextMenu(canvas);
  canvas.addEventListener('pointerdown', (e) => {
    if (e.button === 1) e.preventDefault(); // no autoscroll on middle-drag
    gestures.down(e.pointerId, e.clientX, e.clientY, { pans: pansWith(e), taps: e.button === 0 });
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!gestures.move(e.pointerId, e.clientX, e.clientY)) return;
    canvas.classList.toggle('dragging', gestures.dragging);
    placeCamera(camera, orbit);
  });
  canvas.addEventListener('pointerup', (e) => {
    canvas.classList.remove('dragging');
    if (!gestures.up(e.pointerId)) return;
    clickHandlers.forEach((handle) => handle(e));
    const grab = doubleTap(e.clientX, e.clientY, e.timeStamp) && grabAt(pointer, orbit, e.clientX, e.clientY);
    if (grab) {
      focusOn(orbit, grab.point);
      placeCamera(camera, orbit);
    }
  });
  canvas.addEventListener('pointercancel', (e) => {
    canvas.classList.remove('dragging');
    gestures.up(e.pointerId);
  });
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const grab = grabAt(pointer, orbit, e.clientX, e.clientY);
    zoomToward(orbit, grab?.point ?? null, wheelRadius(orbit.radius, e.deltaY, orbit.maxRadius));
    placeCamera(camera, orbit);
  }, { passive: false });

  const home = () => goHome(camera, orbit, rows);
  document.getElementById('home')?.addEventListener('click', home);
  bindHomeKey(window, home);

  const frameHandlers: ((t: number, dt: number) => void)[] = [];
  const timer = new THREE.Clock();
  renderer.setAnimationLoop(() => {
    const dt = Math.min(timer.getDelta(), 0.05);
    frameHandlers.forEach((handle) => handle(timer.elapsedTime, dt));
    renderer.render(scene, camera);
  });
  addEventListener('resize', resize);

  return {
    scene,
    camera,
    canvas,
    setRows,
    onClick: (handle: (e: PointerEvent) => void) => clickHandlers.push(handle),
    onFrame: (handle: (t: number, dt: number) => void) => frameHandlers.push(handle),
  };
}

export type View = ReturnType<typeof createView>;
