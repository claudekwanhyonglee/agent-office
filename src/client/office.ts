import * as THREE from 'three';
import { at, ball, box, cyl, tag, toonRamp } from './toon.ts';
import { DESKS_PER_POD, DOOR, POD_DEPTH, floorDepth, seatLayout, type SeatSpot } from './layout.ts';
import { SCREEN_OFF, screenColor } from './poses.ts';
import type { OfficeState } from '../shared/agent.ts';

export { SCREEN_OFF };

export interface Seat extends SeatSpot {
  screen: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
}

/** Monitors glow for their desk's occupant; empty desks stay dark. */
export function updateScreens(seats: Seat[], occupants: Map<number, OfficeState>) {
  for (const seat of seats) {
    const state = occupants.get(seat.index);
    seat.screen.material.color.set(state ? screenColor(state) : SCREEN_OFF);
  }
}

/** The prototype's office, with `podCount` desk pods. Builds without a DOM or WebGL. */
export function buildOffice(podCount: number) {
  const group = new THREE.Group();
  const depth = floorDepth(podCount);
  const centerZ = (depth - 7.8) / 2;

  addRoom(group, depth, centerZ);
  addLounge(group);
  addKitchen(group);
  addPlants(group, podCount);

  const spots = seatLayout(podCount);
  for (let pod = 0; pod < podCount; pod++) group.add(tag(new THREE.Group(), 'pod'));
  const pods = group.children.filter((c) => c.userData.kind === 'pod');
  const seats: Seat[] = spots.map((spot) => {
    const pod = pods[Math.floor(spot.index / DESKS_PER_POD)];
    const { desk, screen } = buildDesk(spot.facing);
    pod.add(at(desk, spot.x, 0, spot.deskZ));
    pod.add(at(buildChair(spot.facing), spot.x, 0, spot.chairZ));
    return { ...spot, screen };
  });
  return { group, seats };
}

function addRoom(group: THREE.Group, depth: number, centerZ: number) {
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(11, depth),
    new THREE.MeshToonMaterial({ map: tileTexture(5.5, depth / 2), gradientMap: toonRamp }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.z = centerZ;
  floor.receiveShadow = true;
  group.add(tag(floor, 'floor'));
  group.add(at(box(11.3, 0.3, depth + 0.3, '#4A4068', { outline: 0, shadow: false }), 0, -0.16, centerZ));

  // Back and left walls, kept low so the camera sees over them.
  group.add(tag(at(box(11.3, 1.3, 0.25, '#B9A6E0', { outline: 0.01 }), 0, 0.65, -4.02), 'wall'));
  group.add(tag(at(box(0.25, 1.3, depth + 0.25, '#B9A6E0', { outline: 0.01 }), -5.65, 0.65, centerZ), 'wall'));
  for (const x of [-4, -2.2, -0.4, 1.4]) {
    group.add(tag(at(box(1.3, 0.55, 0.05, '#BFE6F5', { outline: 0.03, shadow: false }), x, 0.82, -3.88), 'window'));
  }

  const door = tag(new THREE.Group(), 'door');
  door.add(at(box(1.0, 1.3, 0.06, '#3A3150', { outline: 0, shadow: false }), 0, 0.65, 0));
  door.add(at(box(0.12, 1.4, 0.3, '#C98A55'), -0.56, 0.7, 0.01));
  door.add(at(box(0.12, 1.4, 0.3, '#C98A55'), 0.56, 0.7, 0.01));
  door.add(at(box(1.24, 0.12, 0.3, '#C98A55'), 0, 1.36, 0.01));
  door.add(at(box(1.0, 0.03, 0.6, '#7FB069', { outline: 0.02, shadow: false }), 0, 0.015, 0.57));
  group.add(at(door, DOOR.x, 0, -3.87));
}

function addLounge(group: THREE.Group) {
  group.add(tag(at(cyl(1.55, 1.55, 0.03, '#F0A3B5', { outline: 0.02, shadow: false }, 48), 4.2, 0.015, -0.7), 'rug'));
  const sofa = tag(new THREE.Group(), 'sofa');
  sofa.add(at(box(1.9, 0.38, 0.85, '#5B7DB1'), 0, 0.27, 0));
  sofa.add(at(box(1.9, 0.55, 0.25, '#4C6B9C'), 0, 0.6, -0.33));
  sofa.add(at(box(0.25, 0.5, 0.85, '#4C6B9C'), -0.95, 0.4, 0));
  sofa.add(at(box(0.25, 0.5, 0.85, '#4C6B9C'), 0.95, 0.4, 0));
  sofa.add(at(box(0.8, 0.12, 0.6, '#6E90C4'), -0.42, 0.5, 0.05));
  sofa.add(at(box(0.8, 0.12, 0.6, '#6E90C4'), 0.42, 0.5, 0.05));
  group.add(at(sofa, 4.2, 0, -1.2));
  group.add(at(cyl(0.3, 0.3, 0.45, '#C98A55'), 4.2, 0.22, 0.05));
}

function addKitchen(group: THREE.Group) {
  const coffee = tag(new THREE.Group(), 'coffee-machine');
  coffee.add(at(box(1.4, 0.8, 0.6, '#9C8FB8'), 0, 0.4, 0));
  coffee.add(at(box(0.45, 0.55, 0.4, '#3A3150'), -0.25, 1.08, 0));
  coffee.add(at(ball(0.05, '#FF5A5A', { outline: 0, shadow: false }), -0.25, 1.2, 0.21));
  coffee.add(at(cyl(0.08, 0.07, 0.14, '#FFFFFF', { outline: 0.08 }), 0.35, 0.87, 0.1));
  group.add(at(coffee, 2.6, 0, -3.55));

  const cooler = tag(new THREE.Group(), 'water-cooler');
  cooler.add(at(box(0.4, 0.75, 0.4, '#E9E3F5'), 0, 0.38, 0));
  cooler.add(at(cyl(0.18, 0.18, 0.45, '#8FD3F2', { outline: 0.04 }), 0, 0.98, 0));
  group.add(at(cooler, 1.55, 0, -3.6));
}

function addPlants(group: THREE.Group, podCount: number) {
  const spots: [number, number, number][] = [[-5.05, -3.4, 1], [0.75, -3.45, 0.9], [5.0, 3.3, 1.1], [-5.05, 3.3, 1.2], [2.2, 1.0, 0.8]];
  for (let pod = 1; pod < podCount; pod++) spots.push([2.2, 1.0 + pod * POD_DEPTH, 0.8], [5.0, 3.3 + pod * POD_DEPTH, 1.1]);
  for (const [x, z, scale] of spots) {
    const plant = tag(new THREE.Group(), 'plant');
    plant.add(at(cyl(0.22, 0.17, 0.36, '#D9774B'), 0, 0.18, 0));
    for (const [px, py, pz, r] of [[0, 0.62, 0, 0.26], [0.14, 0.5, 0.08, 0.2], [-0.13, 0.52, -0.06, 0.2], [0.02, 0.82, -0.04, 0.17]]) {
      plant.add(at(ball(r, '#5FA35A'), px, py, pz));
    }
    plant.scale.setScalar(scale);
    group.add(at(plant, x, 0, z));
  }
}

function buildDesk(facing: 1 | -1) {
  const desk = tag(new THREE.Group(), 'desk');
  desk.add(at(box(1.5, 0.08, 0.82, '#E9B872'), 0, 0.75, 0));
  for (const [lx, lz] of [[-0.68, -0.34], [0.68, -0.34], [-0.68, 0.34], [0.68, 0.34]]) {
    desk.add(at(box(0.07, 0.72, 0.07, '#8C6A4A', { outline: 0.02 }), lx, 0.36, lz));
  }
  desk.add(at(box(0.1, 0.25, 0.08, '#4A4068'), 0, 0.92, 0.22 * facing));
  desk.add(tag(at(box(0.82, 0.5, 0.06, '#3A3150'), 0, 1.22, 0.24 * facing), 'monitor'));
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.72, 0.4), new THREE.MeshBasicMaterial({ color: SCREEN_OFF }));
  screen.position.set(0, 1.22, (0.24 - 0.035) * facing);
  if (facing === 1) screen.rotation.y = Math.PI;
  desk.add(screen);
  desk.add(at(box(0.5, 0.03, 0.16, '#F4EEE2', { outline: 0.03 }), 0, 0.805, -0.12 * facing));
  desk.add(at(box(0.14, 0.03, 0.18, '#F4EEE2', { outline: 0.04 }), 0.42, 0.805, -0.1 * facing));
  return { desk, screen };
}

function buildChair(facing: 1 | -1) {
  const chair = tag(new THREE.Group(), 'chair');
  chair.add(at(cyl(0.3, 0.3, 0.09, '#6B5B95'), 0, 0.42, 0));
  chair.add(at(box(0.55, 0.5, 0.09, '#6B5B95'), 0, 0.72, -0.3 * facing));
  chair.add(at(cyl(0.04, 0.04, 0.38, '#3A3150', { outline: 0 }), 0, 0.2, 0));
  chair.add(at(cyl(0.26, 0.26, 0.04, '#3A3150', { outline: 0.02 }), 0, 0.03, 0));
  return chair;
}

/** Two-tone floor tiles with grout lines, generated as pixels (no canvas needed). */
function tileTexture(repeatX: number, repeatY: number) {
  const size = 64;
  const light = [0xe2, 0xd3, 0xb8], dark = [0xd2, 0xc0, 0x9f], grout = [0xc4, 0xb1, 0x92];
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const edge = x % 32 < 1 || y % 32 < 1;
      const color = edge ? grout : (x < 32) === (y < 32) ? dark : light;
      data.set([...color, 255], (y * size + x) * 4);
    }
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeatX, repeatY);
  texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}
