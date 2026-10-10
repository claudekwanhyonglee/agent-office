import * as THREE from 'three';
import { buildOffice } from './office.ts';
import { createGestures, frameFloor, initialOrbit, placeCamera, wheelRadius } from './camera.ts';

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

  let office: ReturnType<typeof buildOffice> | undefined;
  let rows = 0;

  function setRows(count: number) {
    if (count === rows) return office!.seats;
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
    return office.seats;
  }

  function resize() {
    const w = host.clientWidth || innerWidth, h = host.clientHeight || innerHeight;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    frameFloor(camera, orbit, rows);
  }

  // Drag to orbit, pinch or scroll to zoom. A press that doesn't move counts as a click.
  const canvas = renderer.domElement;
  const clickHandlers: ((e: PointerEvent) => void)[] = [];
  const gestures = createGestures(orbit);
  canvas.addEventListener('pointerdown', (e) => {
    gestures.down(e.pointerId, e.clientX, e.clientY);
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!gestures.move(e.pointerId, e.clientX, e.clientY)) return;
    canvas.classList.toggle('dragging', gestures.dragging);
    placeCamera(camera, orbit);
  });
  canvas.addEventListener('pointerup', (e) => {
    canvas.classList.remove('dragging');
    if (gestures.up(e.pointerId)) clickHandlers.forEach((handle) => handle(e));
  });
  canvas.addEventListener('pointercancel', (e) => {
    canvas.classList.remove('dragging');
    gestures.up(e.pointerId);
  });
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    orbit.radius = wheelRadius(orbit.radius, e.deltaY, orbit.maxRadius);
    placeCamera(camera, orbit);
  }, { passive: false });

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
