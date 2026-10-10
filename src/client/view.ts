import * as THREE from 'three';
import { buildOffice, type Seat } from './office.ts';
import { FLOOR, floorFront } from './layout.ts';

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
  const orbit = { theta: 0.22, phi: 0.86, radius: 18, target: new THREE.Vector3(0, 0.5, 0) };

  let office: { group: THREE.Group; seats: Seat[] } | undefined;
  let podCount = 0;

  function placeCamera() {
    const { theta, phi, radius, target } = orbit;
    camera.position.set(
      target.x + radius * Math.sin(phi) * Math.sin(theta),
      target.y + radius * Math.cos(phi),
      target.z + radius * Math.sin(phi) * Math.cos(theta),
    );
    camera.lookAt(target);
  }

  function setPodCount(count: number) {
    if (count === podCount) return office!.seats;
    if (office) scene.remove(office.group);
    podCount = count;
    office = buildOffice(count);
    scene.add(office.group);
    // Frame the whole floor and stretch the sun's shadow box over it.
    const front = floorFront(count), depth = front - FLOOR.back, centerZ = (FLOOR.back + front) / 2;
    const width = FLOOR.right - FLOOR.left;
    orbit.target.z = centerZ + 1.5;
    orbit.radius = Math.max(orbit.radius, 4 + Math.max(width, depth) * 0.9);
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
    if (w < 700) orbit.radius = Math.max(orbit.radius, 30);
    camera.updateProjectionMatrix();
    placeCamera();
  }

  // Drag to orbit, scroll to zoom. A press that doesn't move counts as a click.
  const canvas = renderer.domElement;
  const clickHandlers: ((e: PointerEvent) => void)[] = [];
  let drag: { x: number; y: number; theta: number; phi: number; moved: boolean } | null = null;
  canvas.addEventListener('pointerdown', (e) => {
    drag = { x: e.clientX, y: e.clientY, theta: orbit.theta, phi: orbit.phi, moved: false };
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (Math.hypot(dx, dy) > 4) { drag.moved = true; canvas.classList.add('dragging'); }
    orbit.theta = THREE.MathUtils.clamp(drag.theta - dx * 0.005, -0.9, 0.9);
    orbit.phi = THREE.MathUtils.clamp(drag.phi - dy * 0.004, 0.5, 1.15);
    placeCamera();
  });
  canvas.addEventListener('pointerup', (e) => {
    canvas.classList.remove('dragging');
    if (drag && !drag.moved) clickHandlers.forEach((handle) => handle(e));
    drag = null;
  });
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    orbit.radius = THREE.MathUtils.clamp(orbit.radius * (e.deltaY > 0 ? 1.08 : 0.92), 6, 45);
    placeCamera();
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
    setPodCount,
    onClick: (handle: (e: PointerEvent) => void) => clickHandlers.push(handle),
    onFrame: (handle: (t: number, dt: number) => void) => frameHandlers.push(handle),
  };
}

export type View = ReturnType<typeof createView>;
