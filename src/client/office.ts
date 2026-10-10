import * as THREE from 'three';
import { at, ball, box, cyl, tag, toonRamp } from './toon.ts';
import {
  BOOKSHELF, DESKS_PER_POD, DOOR, FLOOR, KITCHEN, LOUNGE, MEETING_ROOM, MEETING_TABLE, WATER_COOLER, WHITEBOARD,
  floorFront, plantSpots, seatLayout, wallArt, type SeatSpot,
} from './layout.ts';
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

/** The open-plan office with `podCount` desk pods. Builds without a DOM or WebGL. */
export function buildOffice(podCount: number) {
  const group = new THREE.Group();
  addRoom(group, floorFront(podCount));
  addMeetingRoom(group);
  addKitchen(group);
  addLounge(group);
  addBackWallPieces(group);
  addWallArt(group, podCount);
  addPlants(group, podCount);

  const pods = Array.from({ length: podCount }, () => tag(new THREE.Group(), 'pod'));
  group.add(...pods);
  const seats: Seat[] = seatLayout(podCount).map((spot) => {
    const pod = pods[Math.floor(spot.index / DESKS_PER_POD)];
    const { desk, screen } = buildDesk(spot.facing);
    pod.add(at(desk, spot.x, 0, spot.deskZ));
    pod.add(at(buildChair(spot.facing), spot.x, 0, spot.chairZ));
    return { ...spot, screen };
  });
  return { group, seats };
}

const WALL = '#B9A6E0';
const WOOD = '#C98A55';
const INK = '#3A3150';

function addRoom(group: THREE.Group, front: number) {
  const width = FLOOR.right - FLOOR.left, depth = front - FLOOR.back;
  const centerX = (FLOOR.left + FLOOR.right) / 2, centerZ = (FLOOR.back + front) / 2;
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(width, depth),
    new THREE.MeshToonMaterial({ map: tileTexture(width / 2, depth / 2), gradientMap: toonRamp }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(centerX, 0, centerZ);
  floor.receiveShadow = true;
  group.add(tag(floor, 'floor'));
  group.add(at(box(width + 0.3, 0.3, depth + 0.3, '#4A4068', { outline: 0, shadow: false }), centerX, -0.16, centerZ));

  // The back wall is tall (the camera faces it); the left wall stays low so it doesn't hide the floor.
  const backZ = FLOOR.back - 0.15;
  group.add(tag(at(box(width + 0.3, 2.2, 0.25, WALL, { outline: 0.01 }), centerX, 1.1, backZ), 'wall'));
  group.add(tag(at(box(0.25, 1.4, depth + 0.25, WALL, { outline: 0.01 }), FLOOR.left - 0.15, 0.7, centerZ), 'wall'));
  for (const x of [-7.2, -3.4, -0.15]) {
    group.add(tag(at(box(1.0, 0.6, 0.05, '#BFE6F5', { outline: 0.03, shadow: false }), x, 1.75, backZ + 0.14), 'window'));
  }

  const door = tag(new THREE.Group(), 'door');
  door.add(at(box(1.0, 2.0, 0.06, INK, { outline: 0, shadow: false }), 0, 1.0, 0));
  door.add(at(box(0.12, 2.1, 0.3, WOOD), -0.56, 1.05, 0.01));
  door.add(at(box(0.12, 2.1, 0.3, WOOD), 0.56, 1.05, 0.01));
  door.add(at(box(1.24, 0.12, 0.3, WOOD), 0, 2.06, 0.01));
  door.add(at(box(1.0, 0.03, 0.6, '#7FB069', { outline: 0.02, shadow: false }), 0, 0.015, 0.57));
  group.add(at(door, DOOR.x, 0, FLOOR.back + 0.13));
}

const glass = new THREE.MeshBasicMaterial({ color: '#BFE6F5', transparent: true, opacity: 0.28, depthWrite: false });

/** A glass pane with a frame rail top and bottom, `length` long along x or z. */
function glassWall(length: number, alongX: boolean) {
  const size = (thick: number) => (alongX ? [length, thick] : [thick, length]);
  const [w, d] = size(0.06);
  const pane = new THREE.Mesh(new THREE.BoxGeometry(w, 1.5, d), glass);
  pane.position.y = 0.75;
  const [rw, rd] = size(0.1);
  pane.add(at(box(rw, 0.08, rd, '#8C7FB0', { outline: 0.02 }), 0, 0.75, 0));
  pane.add(at(box(rw, 0.08, rd, '#8C7FB0', { outline: 0.02 }), 0, -0.71, 0));
  return tag(pane, 'glass-wall');
}

function addMeetingRoom(group: THREE.Group) {
  const { x0, x1, z0, z1 } = MEETING_ROOM;
  const room = tag(new THREE.Group(), 'meeting-room');
  // A front wall with a doorway near the corner, and a side wall.
  const doorway = { from: x1 - 1.3, to: x1 - 0.4 };
  room.add(at(glassWall(doorway.from - x0, true), (x0 + doorway.from) / 2, 0, z1));
  room.add(at(glassWall(x1 - doorway.to, true), (doorway.to + x1) / 2, 0, z1));
  room.add(at(glassWall(z1 - z0, false), x1, 0, (z0 + z1) / 2));

  const { x, z, w, d } = MEETING_TABLE;
  const table = tag(new THREE.Group(), 'meeting-table');
  table.add(at(box(w, 0.08, d, '#F4EEE2'), 0, 0.74, 0));
  table.add(at(cyl(0.12, 0.2, 0.7, '#8C6A4A', { outline: 0.02 }), -w / 3, 0.35, 0));
  table.add(at(cyl(0.12, 0.2, 0.7, '#8C6A4A', { outline: 0.02 }), w / 3, 0.35, 0));
  room.add(at(table, x, 0, z));
  for (const dx of [-0.8, 0, 0.8]) {
    for (const side of [-1, 1] as const) {
      room.add(at(tag(buildChair(side === -1 ? 1 : -1), 'meeting-chair'), x + dx, 0, z + side * (d / 2 + 0.38)));
    }
  }

  const board = tag(new THREE.Group(), 'whiteboard');
  board.add(at(box(2.0, 1.0, 0.06, '#FFFFFF', { outline: 0.02 }), 0, 1.3, 0));
  board.add(at(box(2.1, 0.06, 0.12, '#8C8FA0', { outline: 0.02 }), 0, 0.78, 0.03));
  for (const [sx, sy, sw, color] of [[-0.5, 1.5, 0.7, '#4D86FF'], [0.3, 1.3, 0.9, '#F07A4A'], [-0.2, 1.1, 0.6, '#5BA37A']] as const) {
    board.add(at(box(sw, 0.04, 0.02, color, { outline: 0 }), sx, sy, 0.04));
  }
  room.add(at(board, WHITEBOARD.x, 0, WHITEBOARD.z));
  group.add(room);
}

function addKitchen(group: THREE.Group) {
  const kitchen = tag(new THREE.Group(), 'kitchen');
  const { counter, fridge, table } = KITCHEN;

  const top = tag(new THREE.Group(), 'kitchen-counter');
  top.add(at(box(counter.w, 0.85, counter.d, '#9C8FB8'), 0, 0.425, 0));
  top.add(at(box(counter.w + 0.06, 0.06, counter.d + 0.04, '#F4EEE2', { outline: 0.02 }), 0, 0.88, 0));
  top.add(at(box(0.5, 0.04, 0.35, '#C9C0E3', { outline: 0.03 }), 0.6, 0.92, 0)); // sink
  kitchen.add(at(top, counter.x, 0, counter.z));

  const coffee = tag(new THREE.Group(), 'coffee-machine');
  coffee.add(at(box(0.45, 0.55, 0.4, INK), 0, 0.275, 0));
  coffee.add(at(ball(0.05, '#FF5A5A', { outline: 0, shadow: false }), 0, 0.4, 0.21));
  coffee.add(at(cyl(0.08, 0.07, 0.14, '#FFFFFF', { outline: 0.08 }), 0.35, 0.07, 0.1));
  kitchen.add(at(coffee, counter.x - 0.9, 0.91, counter.z));

  const fridgeBox = tag(new THREE.Group(), 'fridge');
  fridgeBox.add(at(box(0.8, 1.8, 0.7, '#E9E3F5'), 0, 0.9, 0));
  fridgeBox.add(at(box(0.05, 0.5, 0.05, '#8C8FA0', { outline: 0.02 }), -0.3, 1.2, 0.37));
  kitchen.add(at(fridgeBox, fridge.x, 0, fridge.z));

  const bistro = tag(new THREE.Group(), 'kitchen-table');
  bistro.add(at(cyl(0.45, 0.45, 0.06, '#F4EEE2'), 0, 0.74, 0));
  bistro.add(at(cyl(0.05, 0.05, 0.72, INK, { outline: 0 }), 0, 0.36, 0));
  bistro.add(at(cyl(0.25, 0.25, 0.04, INK, { outline: 0.02 }), 0, 0.02, 0));
  kitchen.add(at(bistro, table.x, 0, table.z));
  for (const dx of [-0.75, 0.75]) {
    const stool = tag(new THREE.Group(), 'stool');
    stool.add(at(cyl(0.2, 0.2, 0.07, '#F07A4A'), 0, 0.55, 0));
    stool.add(at(cyl(0.04, 0.04, 0.52, INK, { outline: 0 }), 0, 0.26, 0));
    kitchen.add(at(stool, table.x + dx, 0, table.z));
  }
  group.add(kitchen);
}

function addLounge(group: THREE.Group) {
  const lounge = tag(new THREE.Group(), 'lounge');
  lounge.add(tag(at(cyl(1.5, 1.5, 0.03, '#F0A3B5', { outline: 0.02, shadow: false }, 48), LOUNGE.rug.x, 0.015, LOUNGE.rug.z), 'rug'));
  const sofa = tag(new THREE.Group(), 'sofa');
  sofa.add(at(box(1.9, 0.38, 0.85, '#5B7DB1'), 0, 0.27, 0));
  sofa.add(at(box(1.9, 0.55, 0.25, '#4C6B9C'), 0, 0.6, -0.33));
  sofa.add(at(box(0.25, 0.5, 0.85, '#4C6B9C'), -0.95, 0.4, 0));
  sofa.add(at(box(0.25, 0.5, 0.85, '#4C6B9C'), 0.95, 0.4, 0));
  sofa.add(at(box(0.8, 0.12, 0.6, '#6E90C4'), -0.42, 0.5, 0.05));
  sofa.add(at(box(0.8, 0.12, 0.6, '#6E90C4'), 0.42, 0.5, 0.05));
  sofa.rotation.y = -Math.PI / 2; // backs onto the right edge, faces into the room
  lounge.add(at(sofa, LOUNGE.sofa.x, 0, LOUNGE.sofa.z));
  lounge.add(tag(at(cyl(0.35, 0.35, 0.42, WOOD), LOUNGE.table.x, 0.21, LOUNGE.table.z), 'coffee-table'));
  group.add(lounge);
}

function addBackWallPieces(group: THREE.Group) {
  const cooler = tag(new THREE.Group(), 'water-cooler');
  cooler.add(at(box(0.4, 0.75, 0.4, '#E9E3F5'), 0, 0.38, 0));
  cooler.add(at(cyl(0.18, 0.18, 0.45, '#8FD3F2', { outline: 0.04 }), 0, 0.98, 0));
  group.add(at(cooler, WATER_COOLER.x, 0, WATER_COOLER.z));

  const shelf = tag(new THREE.Group(), 'bookshelf');
  shelf.add(at(box(BOOKSHELF.w, 1.4, 0.4, WOOD), 0, 0.7, 0));
  const spines = ['#4D86FF', '#F07A4A', '#5BA37A', '#E2B347', '#C25B7A', '#7E6BD6', '#3FB3A6'];
  [0.3, 0.75, 1.2].forEach((y, row) => {
    for (let i = 0; i < 7; i++) {
      const h = 0.26 + ((i * 7 + row * 3) % 5) * 0.025;
      const book = box(0.15, h, 0.3, spines[(i + row * 2) % spines.length], { outline: 0.03, shadow: false });
      shelf.add(at(book, -0.57 + i * 0.19, y - 0.17 + h / 2, 0.06));
    }
  });
  group.add(at(shelf, BOOKSHELF.x, 0, BOOKSHELF.z));
}

const ART = [['#F07A4A', '#E2B347'], ['#4D86FF', '#8FD3F2'], ['#5BA37A', '#F0A3B5']];

function addWallArt(group: THREE.Group, podCount: number) {
  wallArt(podCount).forEach(({ x, z, wall }, i) => {
    const art = tag(new THREE.Group(), 'wall-art');
    const [a, b] = ART[i % ART.length];
    art.add(at(box(0.9, 0.65, 0.05, INK, { outline: 0.02 }), 0, 0, 0));
    art.add(at(box(0.76, 0.51, 0.02, '#FFF8EC', { outline: 0, shadow: false }), 0, 0, 0.03));
    art.add(at(ball(0.14, a, { outline: 0, shadow: false }), -0.15, 0.05, 0.04));
    art.add(at(box(0.3, 0.2, 0.02, b, { outline: 0, shadow: false }), 0.15, -0.08, 0.05));
    if (wall === 'left') art.rotation.y = Math.PI / 2;
    group.add(at(art, x + (wall === 'left' ? 0.02 : 0), wall === 'left' ? 0.95 : 1.55, z + (wall === 'back' ? 0.02 : 0)));
  });
}

function addPlants(group: THREE.Group, podCount: number) {
  plantSpots(podCount).forEach(({ x, z }, i) => {
    const plant = tag(new THREE.Group(), 'plant');
    plant.add(at(cyl(0.22, 0.17, 0.36, '#D9774B'), 0, 0.18, 0));
    for (const [px, py, pz, r] of [[0, 0.62, 0, 0.26], [0.14, 0.5, 0.08, 0.2], [-0.13, 0.52, -0.06, 0.2], [0.02, 0.82, -0.04, 0.17]]) {
      plant.add(at(ball(r, '#5FA35A'), px, py, pz));
    }
    plant.scale.setScalar(0.85 + (i % 3) * 0.15);
    group.add(at(plant, x, 0, z));
  });
}

function buildDesk(facing: 1 | -1) {
  const desk = tag(new THREE.Group(), 'desk');
  desk.add(at(box(1.5, 0.08, 0.82, '#E9B872'), 0, 0.75, 0));
  for (const [lx, lz] of [[-0.68, -0.34], [0.68, -0.34], [-0.68, 0.34], [0.68, 0.34]]) {
    desk.add(at(box(0.07, 0.72, 0.07, '#8C6A4A', { outline: 0.02 }), lx, 0.36, lz));
  }
  desk.add(at(box(0.1, 0.25, 0.08, '#4A4068'), 0, 0.92, 0.22 * facing));
  desk.add(tag(at(box(0.82, 0.5, 0.06, INK), 0, 1.22, 0.24 * facing), 'monitor'));
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
  chair.add(at(cyl(0.04, 0.04, 0.38, INK, { outline: 0 }), 0, 0.2, 0));
  chair.add(at(cyl(0.26, 0.26, 0.04, INK, { outline: 0.02 }), 0, 0.03, 0));
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
