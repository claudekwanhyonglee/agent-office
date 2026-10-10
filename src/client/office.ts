import * as THREE from 'three';
import { at, ball, box, cyl, tag, toonRamp } from './toon.ts';
import {
  DECK_Z, FLOOR, GLASS_DOORS, GLASS_Z, MEETING_ROOM, MEETING_TABLE, officeLayout, type OfficeLayout, type SeatSpot,
} from './layout.ts';
import { SCREEN_OFF } from './poses.ts';
import { DeskScreen, screenContent } from './screen.ts';
import { BigBoard } from './board.ts';
import type { AgentRecord } from '../shared/agent.ts';

export { SCREEN_OFF };

export interface Seat extends SeatSpot {
  screen: DeskScreen;
}

/**
 * Each desk's screen shows its occupant (empty desks show nothing), turned towards `camera` when given.
 * Call every frame: screens only redraw when their content changes.
 */
export function updateScreens(seats: Seat[], occupants: Map<number, AgentRecord>, now: number, camera?: THREE.Vector3) {
  for (const seat of seats) {
    seat.screen.show(screenContent(occupants.get(seat.index)), now);
    if (camera) seat.screen.face(camera);
  }
}

/** The office with `rows` curved rows of desks. Builds without a DOM or WebGL. */
export function buildOffice(rows: number) {
  const layout = officeLayout(rows);
  const group = new THREE.Group();
  addRoom(group, layout);
  addFrontGlass(group);
  addMeetingRoom(group);
  addKitchen(group, layout);
  addLounge(group, layout);
  const board = addBackWallPieces(group, layout);
  addWallArt(group, layout);
  addPlants(group, layout);

  const deskRows = Array.from({ length: rows }, () => tag(new THREE.Group(), 'desk-row'));
  group.add(...deskRows);
  const seats: Seat[] = layout.seats.map((spot) => {
    const row = deskRows[spot.row];
    row.add(turned(at(buildDesk(), spot.desk.x, 0, spot.desk.z), spot.yaw));
    row.add(turned(at(buildChair(), spot.chair.x, 0, spot.chair.z), spot.yaw));
    const screen = new DeskScreen(spot.screenAt, spot.yaw, Math.hypot(spot.screenAt.x - spot.desk.x, spot.screenAt.z - spot.desk.z) - 0.22);
    row.add(screen.root);
    return { ...spot, screen };
  });
  return { group, seats, layout, board };
}

const turned = <T extends THREE.Object3D>(obj: T, yaw: number) => {
  obj.rotation.y = yaw;
  return obj;
};

const WALL = '#B9A6E0';
const WOOD = '#C98A55';
const INK = '#3A3150';

function addRoom(group: THREE.Group, layout: OfficeLayout) {
  const { left, right, back, front } = layout.bounds;
  const width = right - left, centerX = (left + right) / 2;
  const indoorDepth = GLASS_Z - back, indoorZ = (back + GLASS_Z) / 2;
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(width, indoorDepth),
    new THREE.MeshToonMaterial({ map: tileTexture(width / 2, indoorDepth / 2), gradientMap: toonRamp }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(centerX, 0, indoorZ);
  floor.receiveShadow = true;
  group.add(tag(floor, 'floor'));

  const deckDepth = front - GLASS_Z;
  const deck = tag(new THREE.Group(), 'deck');
  const boards = new THREE.Mesh(new THREE.PlaneGeometry(width, deckDepth), new THREE.MeshToonMaterial({ color: '#D9B48A', gradientMap: toonRamp }));
  boards.rotation.x = -Math.PI / 2;
  boards.position.set(centerX, 0.001, GLASS_Z + deckDepth / 2);
  boards.receiveShadow = true;
  deck.add(tag(boards, 'floor'));
  for (let z = GLASS_Z + 0.6; z < front; z += 0.6) {
    deck.add(at(box(width, 0.004, 0.03, '#B98F63', { outline: 0, shadow: false }), centerX, 0.003, z));
  }
  group.add(deck);

  const depth = front - back, centerZ = (back + front) / 2;
  group.add(at(box(width + 0.3, 0.3, depth + 0.3, '#4A4068', { outline: 0, shadow: false }), centerX, -0.16, centerZ));

  // The back wall is tall (the camera faces it, and the big board hangs on it); the left wall stays low.
  const backZ = back - 0.15;
  group.add(tag(at(box(width + 0.3, 3.4, 0.25, WALL, { outline: 0.01 }), centerX, 1.7, backZ), 'wall'));
  group.add(tag(at(box(0.25, 1.4, indoorDepth + 0.25, WALL, { outline: 0.01 }), left - 0.15, 0.7, indoorZ), 'wall'));
  for (const x of layout.windows) {
    group.add(tag(at(box(1.0, 0.6, 0.05, '#BFE6F5', { outline: 0.03, shadow: false }), x, 1.9, backZ + 0.14), 'window'));
  }

  const door = tag(new THREE.Group(), 'door');
  door.add(at(box(0.9, 2.0, 0.06, INK, { outline: 0, shadow: false }), 0, 1.0, 0));
  door.add(at(box(0.12, 2.1, 0.3, WOOD), -0.51, 1.05, 0.01));
  door.add(at(box(0.12, 2.1, 0.3, WOOD), 0.51, 1.05, 0.01));
  door.add(at(box(1.14, 0.12, 0.3, WOOD), 0, 2.06, 0.01));
  door.add(at(box(0.9, 0.03, 0.6, '#7FB069', { outline: 0.02, shadow: false }), 0, 0.015, 0.57));
  group.add(at(door, layout.door.x, 0, back + 0.13));
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

/** The glass wall onto the deck, with an open doorway at each side aisle. */
function addFrontGlass(group: THREE.Group) {
  const front = tag(new THREE.Group(), 'glass-front');
  const edges = [FLOOR.left, ...GLASS_DOORS.flatMap((d) => [d.x0, d.x1]), FLOOR.right];
  for (let i = 0; i < edges.length; i += 2) {
    const [x0, x1] = [edges[i], edges[i + 1]];
    front.add(at(glassWall(x1 - x0, true), (x0 + x1) / 2, 0, GLASS_Z));
  }
  for (const { x0, x1 } of GLASS_DOORS) {
    const doorway = tag(new THREE.Group(), 'glass-door');
    doorway.add(at(box(x1 - x0, 0.02, 0.5, '#8C7FB0', { outline: 0, shadow: false }), 0, 0.01, 0));
    front.add(at(doorway, (x0 + x1) / 2, 0, GLASS_Z));
  }
  // A mat on the deck walkway, so the path between the doors reads as one.
  front.add(tag(at(box(GLASS_DOORS[1].x1 - GLASS_DOORS[0].x0, 0.01, 0.5, '#C9A57A', { outline: 0, shadow: false }), 0, 0.006, DECK_Z), 'rug'));
  group.add(front);
}

function addMeetingRoom(group: THREE.Group) {
  const { x0, x1, z0, z1 } = MEETING_ROOM;
  const room = tag(new THREE.Group(), 'meeting-room');
  room.add(at(glassWall(x1 - x0, true), (x0 + x1) / 2, 0, z0));
  room.add(at(glassWall(x1 - x0, true), (x0 + x1) / 2, 0, z1));
  // The aisle side, with a doorway in the middle.
  const doorway = { from: 0.3, to: 1.2 };
  room.add(at(glassWall(doorway.from - z0, false), x1, 0, (z0 + doorway.from) / 2));
  room.add(at(glassWall(z1 - doorway.to, false), x1, 0, (doorway.to + z1) / 2));

  const { x, z, w, d } = MEETING_TABLE;
  const table = tag(new THREE.Group(), 'meeting-table');
  table.add(at(box(w, 0.08, d, '#F4EEE2'), 0, 0.74, 0));
  table.add(at(cyl(0.12, 0.2, 0.7, '#8C6A4A', { outline: 0.02 }), -w / 3, 0.35, 0));
  table.add(at(cyl(0.12, 0.2, 0.7, '#8C6A4A', { outline: 0.02 }), w / 3, 0.35, 0));
  room.add(at(table, x, 0, z));
  for (const dx of [-0.45, 0.45]) {
    for (const side of [-1, 1] as const) {
      room.add(turned(at(tag(buildChair(), 'meeting-chair'), x + dx, 0, z + side * (d / 2 + 0.38)), side === -1 ? 0 : Math.PI));
    }
  }

  const board = tag(new THREE.Group(), 'whiteboard');
  board.add(at(box(2.0, 1.0, 0.06, '#FFFFFF', { outline: 0.02 }), 0, 1.3, 0));
  board.add(at(box(2.1, 0.06, 0.12, '#8C8FA0', { outline: 0.02 }), 0, 0.78, 0.03));
  for (const [sx, sy, sw, color] of [[-0.5, 1.5, 0.7, '#4D86FF'], [0.3, 1.3, 0.9, '#F07A4A'], [-0.2, 1.1, 0.6, '#5BA37A']] as const) {
    board.add(at(box(sw, 0.04, 0.02, color, { outline: 0 }), sx, sy, 0.04));
  }
  room.add(at(board, x, 0, z0 + 0.12));
  group.add(room);
}

function addKitchen(group: THREE.Group, layout: OfficeLayout) {
  const kitchen = tag(new THREE.Group(), 'kitchen');
  const { counter, coffee: coffeeAt, table } = layout.kitchen;

  const top = tag(new THREE.Group(), 'kitchen-counter');
  top.add(at(box(counter.w, 0.85, counter.d, '#9C8FB8'), 0, 0.425, 0));
  top.add(at(box(counter.w + 0.06, 0.06, counter.d + 0.04, '#F4EEE2', { outline: 0.02 }), 0, 0.88, 0));
  top.add(at(box(0.5, 0.04, 0.35, '#C9C0E3', { outline: 0.03 }), 0.6, 0.92, 0)); // sink
  kitchen.add(at(top, counter.x, 0, counter.z));

  const coffee = tag(new THREE.Group(), 'coffee-machine');
  coffee.add(at(box(0.45, 0.55, 0.4, INK), 0, 0.275, 0));
  coffee.add(at(ball(0.05, '#FF5A5A', { outline: 0, shadow: false }), 0, 0.4, 0.21));
  coffee.add(at(cyl(0.08, 0.07, 0.14, '#FFFFFF', { outline: 0.08 }), 0.35, 0.07, 0.1));
  kitchen.add(at(coffee, coffeeAt.x, 0.91, coffeeAt.z));

  const bistro = tag(new THREE.Group(), 'kitchen-table');
  bistro.add(at(cyl(0.45, 0.45, 0.06, '#F4EEE2'), 0, 0.74, 0));
  bistro.add(at(cyl(0.05, 0.05, 0.72, INK, { outline: 0 }), 0, 0.36, 0));
  bistro.add(at(cyl(0.25, 0.25, 0.04, INK, { outline: 0.02 }), 0, 0.02, 0));
  kitchen.add(at(bistro, table.x, 0, table.z));
  for (const dx of [-0.8, 0.8]) {
    const stool = tag(new THREE.Group(), 'stool');
    stool.add(at(cyl(0.2, 0.2, 0.07, '#F07A4A'), 0, 0.55, 0));
    stool.add(at(cyl(0.04, 0.04, 0.52, INK, { outline: 0 }), 0, 0.26, 0));
    kitchen.add(at(stool, table.x + dx, 0, table.z));
  }
  group.add(kitchen);
}

/** The TV on the back wall with a sofa facing it. */
function addLounge(group: THREE.Group, layout: OfficeLayout) {
  const { tv, sofa: sofaAt, rug } = layout.lounge;
  const lounge = tag(new THREE.Group(), 'lounge');
  const mat = tag(at(cyl(1, 1, 0.03, '#F0A3B5', { outline: 0.02, shadow: false }, 48), rug.x, 0.015, rug.z), 'rug');
  mat.scale.set(1.8, 1, 1.1);
  lounge.add(mat);

  const screen = tag(new THREE.Group(), 'tv');
  screen.add(at(box(tv.w, 1.3, 0.1, INK), 0, 1.6, 0));
  screen.add(at(box(tv.w - 0.16, 1.14, 0.02, '#4D86FF', { outline: 0, shadow: false }), 0, 1.6, 0.06));
  lounge.add(at(screen, tv.x, 0, tv.z));

  const w = sofaAt.w;
  const sofa = tag(new THREE.Group(), 'sofa');
  sofa.add(at(box(w, 0.38, 0.85, '#5B7DB1'), 0, 0.27, 0));
  sofa.add(at(box(w, 0.55, 0.25, '#4C6B9C'), 0, 0.6, -0.3));
  sofa.add(at(box(0.25, 0.5, 0.85, '#4C6B9C'), -w / 2 + 0.125, 0.4, 0));
  sofa.add(at(box(0.25, 0.5, 0.85, '#4C6B9C'), w / 2 - 0.125, 0.4, 0));
  for (const dx of [-0.75, 0, 0.75]) sofa.add(at(box(0.7, 0.12, 0.6, '#6E90C4'), dx, 0.5, 0.05));
  lounge.add(turned(at(sofa, sofaAt.x, 0, sofaAt.z), Math.PI)); // faces the TV
  group.add(lounge);
}

/** The big board (returned, for the scene to keep up to date), water cooler and bookshelf. */
function addBackWallPieces(group: THREE.Group, layout: OfficeLayout) {
  const { back } = layout.bounds;
  const frame = tag(new THREE.Group(), 'big-board');
  frame.add(at(box(layout.board.w, 2.4, 0.1, INK, { outline: 0.01 }), 0, 2.05, 0));
  const board = new BigBoard(layout.board.w - 0.2);
  frame.add(at(board.mesh, 0, 2.05, 0.06));
  group.add(at(frame, layout.board.x, 0, back + 0.05));

  const cooler = tag(new THREE.Group(), 'water-cooler');
  cooler.add(at(box(0.4, 0.75, 0.4, '#E9E3F5'), 0, 0.38, 0));
  cooler.add(at(cyl(0.18, 0.18, 0.45, '#8FD3F2', { outline: 0.04 }), 0, 0.98, 0));
  group.add(at(cooler, layout.cooler.x, 0, layout.cooler.z));

  const { x, z, length } = layout.bookshelf;
  const shelf = tag(new THREE.Group(), 'bookshelf');
  shelf.add(at(box(length, 1.4, 0.4, WOOD), 0, 0.7, 0));
  const spines = ['#4D86FF', '#F07A4A', '#5BA37A', '#E2B347', '#C25B7A', '#7E6BD6', '#3FB3A6'];
  [0.3, 0.75, 1.2].forEach((y, row) => {
    for (let i = 0; i < 7; i++) {
      const h = 0.26 + ((i * 7 + row * 3) % 5) * 0.025;
      const book = box(0.15, h, 0.3, spines[(i + row * 2) % spines.length], { outline: 0.03, shadow: false });
      shelf.add(at(book, -0.57 + i * 0.19, y - 0.17 + h / 2, 0.06));
    }
  });
  group.add(turned(at(shelf, x, 0, z), Math.PI / 2)); // against the left wall
  return board;
}

const ART = [['#F07A4A', '#E2B347'], ['#4D86FF', '#8FD3F2'], ['#5BA37A', '#F0A3B5']];

function addWallArt(group: THREE.Group, layout: OfficeLayout) {
  layout.wallArt.forEach((z, i) => {
    const art = tag(new THREE.Group(), 'wall-art');
    const [a, b] = ART[i % ART.length];
    art.add(at(box(0.9, 0.65, 0.05, INK, { outline: 0.02 }), 0, 0, 0));
    art.add(at(box(0.76, 0.51, 0.02, '#FFF8EC', { outline: 0, shadow: false }), 0, 0, 0.03));
    art.add(at(ball(0.14, a, { outline: 0, shadow: false }), -0.15, 0.05, 0.04));
    art.add(at(box(0.3, 0.2, 0.02, b, { outline: 0, shadow: false }), 0.15, -0.08, 0.05));
    group.add(turned(at(art, layout.bounds.left + 0.02, 0.95, z), Math.PI / 2));
  });
}

function addPlants(group: THREE.Group, layout: OfficeLayout) {
  layout.plants.forEach(({ x, z }, i) => {
    const plant = tag(new THREE.Group(), 'plant');
    plant.add(at(cyl(0.22, 0.17, 0.36, '#D9774B'), 0, 0.18, 0));
    for (const [px, py, pz, r] of [[0, 0.62, 0, 0.26], [0.14, 0.5, 0.08, 0.2], [-0.13, 0.52, -0.06, 0.2], [0.02, 0.82, -0.04, 0.17]]) {
      plant.add(at(ball(r, '#5FA35A'), px, py, pz));
    }
    plant.scale.setScalar(0.85 + (i % 3) * 0.15);
    group.add(at(plant, x, 0, z));
  });
}

/** A desk whose sitter is on its -z side, facing +z (the screen side). 0.7 m deep, so 1.5 m stays clear between rows. */
function buildDesk() {
  const desk = tag(new THREE.Group(), 'desk');
  desk.add(at(box(1.24, 0.08, 0.7, '#E9B872'), 0, 0.75, 0));
  for (const [lx, lz] of [[-0.55, -0.28], [0.55, -0.28], [-0.55, 0.28], [0.55, 0.28]]) {
    desk.add(at(box(0.07, 0.72, 0.07, '#8C6A4A', { outline: 0.02 }), lx, 0.36, lz));
  }
  desk.add(at(box(0.5, 0.03, 0.16, '#F4EEE2', { outline: 0.03 }), 0, 0.805, -0.12));
  desk.add(at(box(0.14, 0.03, 0.18, '#F4EEE2', { outline: 0.04 }), 0.4, 0.805, -0.1));
  return desk;
}

/** A chair facing +z (its back on the -z side). */
function buildChair() {
  const chair = tag(new THREE.Group(), 'chair');
  chair.add(at(cyl(0.3, 0.3, 0.09, '#6B5B95'), 0, 0.42, 0));
  chair.add(at(box(0.55, 0.5, 0.09, '#6B5B95'), 0, 0.72, -0.3));
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
