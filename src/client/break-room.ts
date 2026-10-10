// Break-room props (#29), at their plan C positions. Each is tagged so route tests treat it as furniture.
import * as THREE from 'three';
import { at, ball, box, cyl, mesh, tag } from './toon.ts';
import { BREAK_ROOM, type HangoutPlace, type SeatSpot } from './layout.ts';
import { dartModel } from './character.ts';
import { THROWS, dartFlight, dartsAt } from './darts.ts';
import type { Afloat } from './float.ts';
import { POND_DEPTH, POOL_DEPTH, waterSurface } from './water.ts';
import { CAST_SECONDS, castAt, type Cast, type CastFrame } from './fishing.ts';
import { toonRamp } from './toon.ts';
import { BALL_R, POCKETS, POCKET_R, SHOT_SECONDS, ballsAt } from './pool.ts';
import { BALL_R as PONG_BALL_R, NET_TOP, pongBallAt, type Rally } from './pong.ts';

/** Coffee mugs left on desks by a coffee delivery (#33), one per desk at most. */
export class DeskMugs {
  private mugs = new Map<number, THREE.Object3D>();

  constructor(private parent: THREE.Object3D) {}

  set(seat: SeatSpot, on: boolean) {
    const old = this.mugs.get(seat.index);
    if (old) this.parent.remove(old);
    this.mugs.delete(seat.index);
    if (!on) return;
    const mug = tag(new THREE.Group(), 'mug');
    mug.add(cyl(0.06, 0.05, 0.12, '#FFFFFF', { outline: 0.08 }));
    mug.add(at(cyl(0.05, 0.05, 0.01, '#6B4226', { outline: 0, shadow: false }), 0, 0.055, 0));
    // On the desk's corner by the sitter's right hand.
    const right = { x: -Math.cos(seat.yaw), z: Math.sin(seat.yaw) };
    this.parent.add(at(mug, seat.desk.x + right.x * 0.42, 0.85, seat.desk.z + right.z * 0.42));
    this.mugs.set(seat.index, mug);
  }
}

const INK = '#3A3150';
const WOOD = '#C98A55';
const WATER = '#8FD3F2';
const FELT_TOP = 0.835;
const RING_Y = 0.1;

/** Marks a piece of a prop (not furniture of its own, so not tagged). */
const part = <T extends THREE.Object3D>(obj: T, name: string) => {
  obj.userData.part = name;
  return obj;
};

/** The hammock trees' trunks taper from bottom to top; the ropes are tied on this high (#55). */
const TRUNK = { bottom: 0.16, top: 0.12, height: 1.9 };
const ROPE_TIE = 1.3;
const trunkRadius = (y: number) => TRUNK.bottom + (TRUNK.top - TRUNK.bottom) * (y / TRUNK.height);

/** A thin rope from a to b. */
function rope(a: THREE.Vector3, b: THREE.Vector3) {
  const line = cyl(0.015, 0.015, a.distanceTo(b), INK, { outline: 0, shadow: false });
  line.position.copy(a).add(b).multiplyScalar(0.5);
  line.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
  return line;
}

const turned = <T extends THREE.Object3D>(obj: T, yaw: number) => {
  obj.rotation.y = yaw;
  return obj;
};

/** Loungers, pond and jetty, hammock, yoga mat, trampoline, dartboard, bin and paper stack (#30). */
export function addSoloProps(group: THREE.Group) {
  const { loungers, lounger, pond, jetty, hammock, yogaMat, trampoline, dartboard, bin, paperStack } = BREAK_ROOM;

  for (const { x, z } of loungers) group.add(at(sunLounger(), x, 0, z));

  group.add(at(buildPond(pond.rx, pond.rz), pond.x, 0, pond.z));
  for (const [dx, dz] of [[-0.8, -0.3], [0.4, 0.45]]) {
    const pad = at(cyl(0.16, 0.16, 0.02, '#5FA35A', { outline: 0, shadow: false }), pond.x + dx, 0.05, pond.z + dz);
    group.add(pad);
  }
  const pier = tag(new THREE.Group(), 'jetty');
  pier.add(at(box(jetty.w, 0.08, jetty.d, WOOD), 0, 0.1, 0));
  for (const dx of [-0.7, 0.7]) for (const dz of [-0.35, 0.35]) pier.add(at(cyl(0.05, 0.05, 0.2, '#8C6A4A', { outline: 0 }), dx, 0.05, dz));
  group.add(at(pier, jetty.x, 0, jetty.z));

  for (const x of hammock.trees) {
    const tree = tag(new THREE.Group(), 'tree');
    tree.add(part(at(cyl(TRUNK.top, TRUNK.bottom, TRUNK.height, '#8C6A4A', { outline: 0.03 }), 0, TRUNK.height / 2, 0), 'trunk'));
    tree.add(at(ball(0.55, '#5FA35A'), 0, 2.2, 0));
    group.add(at(tree, x, 0, hammock.z));
  }
  const sling = tag(new THREE.Group(), 'hammock');
  const cloth = part(mesh(new THREE.SphereGeometry(1, 24, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), '#E2B347', { outline: 0.02 }), 'cloth');
  cloth.scale.set(1.1, 0.25, 0.4);
  sling.add(at(cloth, 0, 0.75, 0));
  // Each rope runs from an end of the cloth up to its tree, tied on at the trunk's surface (#55).
  for (const [side, treeX] of [[-1, hammock.trees[0]], [1, hammock.trees[1]]]) {
    const end = new THREE.Vector3(side * 1.1, 0.75, 0);
    const trunkSide = treeX - hammock.x - side * (trunkRadius(ROPE_TIE) + 0.01);
    sling.add(part(rope(end, new THREE.Vector3(trunkSide, ROPE_TIE, 0)), 'rope'));
  }
  group.add(at(sling, hammock.x, 0, hammock.z));

  group.add(tag(at(box(yogaMat.w, 0.02, yogaMat.d, '#3FB3A6', { outline: 0.02, shadow: false }), yogaMat.x, 0.01, yogaMat.z), 'yoga-mat'));

  const bouncer = tag(new THREE.Group(), 'trampoline');
  bouncer.add(at(cyl(trampoline.r, trampoline.r, 0.06, '#4D86FF'), 0, 0.42, 0));
  bouncer.add(part(at(cyl(trampoline.r * 0.85, trampoline.r * 0.85, 0.02, INK, { outline: 0 }), 0, 0.46, 0), 'mat'));
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    bouncer.add(at(cyl(0.04, 0.04, 0.42, INK, { outline: 0 }), Math.sin(a) * trampoline.r * 0.85, 0.21, Math.cos(a) * trampoline.r * 0.85));
  }
  group.add(at(bouncer, trampoline.x, 0, trampoline.z));

  const board = tag(new THREE.Group(), 'dartboard');
  const face = cyl(0.3, 0.3, 0.05, INK, { outline: 0.02 });
  face.add(at(cyl(0.2, 0.2, 0.02, '#F4EEE2', { outline: 0, shadow: false }), 0, 0.03, 0));
  face.add(at(cyl(0.06, 0.06, 0.02, '#FF5A5A', { outline: 0, shadow: false }), 0, 0.045, 0));
  face.rotation.z = -Math.PI / 2; // faces +x, into the room
  board.add(face);
  group.add(at(board, dartboard.x, 1.6, dartboard.z));
  // The throw line is tape on the floor: not furniture.
  group.add(at(box(0.04, 0.005, 0.8, '#FF5A5A', { outline: 0, shadow: false }), -6.35, 0.004, dartboard.z));

  const hoop = tag(new THREE.Group(), 'bin');
  hoop.add(at(cyl(0.22, 0.18, 0.5, '#6B5B95'), 0, 0.25, 0));
  const rim = mesh(new THREE.TorusGeometry(0.2, 0.025, 6, 20), '#F07A4A', { outline: 0.05 });
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 0.51;
  hoop.add(rim);
  hoop.add(at(box(0.04, 0.5, 0.6, '#FFFFFF', { outline: 0.03 }), -0.38, 1.0, 0)); // backboard on the wall
  group.add(at(hoop, bin.x, 0, bin.z));

  const stack = tag(new THREE.Group(), 'paper-stack');
  stack.add(at(box(0.35, 0.4, 0.35, WOOD), 0, 0.2, 0));
  stack.add(at(box(0.28, 0.06, 0.2, '#FFFFFF', { outline: 0.04 }), 0, 0.43, 0));
  group.add(turned(at(stack, paperStack.x, 0, paperStack.z), 0.2));
}

/** The pool table and ping-pong table (#31). */
export function addGameTables(group: THREE.Group) {
  const { poolTable: pool, pingPong: pong } = BREAK_ROOM;
  const table = tag(new THREE.Group(), 'pool-table');
  table.add(at(box(pool.w, 0.18, pool.d, WOOD), 0, 0.72, 0));
  table.add(part(at(box(pool.w - 0.2, 0.03, pool.d - 0.2, '#3F8A5C', { outline: 0, shadow: false }), 0, 0.82, 0), 'felt'));
  for (const p of POCKETS) table.add(part(at(cyl(POCKET_R, POCKET_R, 0.005, INK, { outline: 0, shadow: false }), p.x, FELT_TOP, p.z), 'pocket'));
  for (const dx of [-0.45, 0.45]) for (const dz of [-0.9, 0.9]) table.add(at(box(0.12, 0.65, 0.12, '#8C6A4A', { outline: 0.02 }), dx, 0.32, dz));
  group.add(at(table, pool.x, 0, pool.z));

  const pingPong = tag(new THREE.Group(), 'ping-pong-table');
  pingPong.add(at(box(pong.w, 0.06, pong.d, '#3E6FD0'), 0, 0.74, 0));
  pingPong.add(at(box(0.02, 0.005, pong.d, '#FFFFFF', { outline: 0, shadow: false }), 0, 0.775, 0));
  pingPong.add(part(at(box(0.03, NET_TOP - 0.775, pong.d + 0.1, '#F4EEE2', { outline: 0.02 }), 0, (NET_TOP + 0.775) / 2, 0), 'net'));
  for (const dx of [-0.9, 0.9]) for (const dz of [-0.45, 0.45]) pingPong.add(at(box(0.06, 0.72, 0.06, INK, { outline: 0 }), dx, 0.36, dz));
  group.add(at(pingPong, pong.x, 0, pong.z));
}

/** The pool balls (#53): they follow the scripted rack from the turn the controller says, or sit racked. */
export class PoolBalls {
  readonly meshes = ['#FFFFFF', '#E2B347', '#C25B7A', '#4D86FF', '#241C2F'].map((color) => ball(BALL_R, color, { outline: 0.06, shadow: false }));
  /** Seconds into the rack; null while nobody plays. */
  private t: number | null = null;

  constructor(parent: THREE.Object3D) {
    parent.add(...this.meshes);
    this.place(0);
  }

  /** Turn `shot` of the rack starts now; null: play stopped, the balls go back in the rack. */
  play(shot: number | null) {
    this.t = shot == null ? null : shot * SHOT_SECONDS;
    this.place(this.t ?? 0);
  }

  update(dt: number) {
    if (this.t == null) return;
    this.t += dt;
    this.place(this.t);
  }

  private place(t: number) {
    const { poolTable: table } = BREAK_ROOM;
    ballsAt(t).forEach((b, i) => {
      this.meshes[i].position.set(table.x + b.x, FELT_TOP + BALL_R, table.z + b.z);
      this.meshes[i].visible = !b.potted;
    });
  }
}

/** The table-tennis ball (#70): it follows the rally the controller says, and is gone when nobody plays. */
export class PongBallMesh {
  readonly mesh = ball(PONG_BALL_R, '#FFFFFF', { outline: 0.1, shadow: false });
  private rally: Rally | null = null;
  private t = 0;

  constructor(parent: THREE.Object3D) {
    parent.add(this.mesh);
    this.mesh.visible = false;
  }

  play(rally: Rally | null) {
    this.rally = rally;
    this.t = 0;
    this.update(0);
  }

  update(dt: number) {
    this.t += dt;
    const at = this.rally && pongBallAt(this.rally, this.t);
    this.mesh.visible = !!at?.visible;
    if (at) this.mesh.position.set(BREAK_ROOM.pingPong.x + at.x, at.y, BREAK_ROOM.pingPong.z + at.z);
  }
}

/** The darts in the air or stuck in the board (#54), following the thrower at the line; none without one. */
export class BoardDarts {
  readonly darts = Array.from({ length: THROWS }, () => dartModel());

  constructor(parent: THREE.Object3D) {
    parent.add(...this.darts);
    this.update(null);
  }

  update(thrower: { place: HangoutPlace; t: number } | null) {
    const round = thrower && dartsAt(thrower.t);
    this.darts.forEach((dart, i) => {
      const k = !round ? null : i < round.stuck ? 1 : round.flying?.index === i ? round.flying.k : null;
      dart.visible = k != null;
      if (k == null) return;
      const { origin, dir } = dartFlight(thrower!.place, i, k);
      dart.position.set(origin.x, origin.y, origin.z);
      dart.lookAt(origin.x + dir.x, origin.y + dir.y, origin.z + dir.z);
    });
  }
}

/** Moves each pool ring with its rider's drift (#57), in pool-dip place order; an empty ring rests at home. */
export function floatRings(group: THREE.Object3D, afloat: (Afloat | null)[]) {
  const { pool } = BREAK_ROOM;
  group.traverse((o) => {
    if (o.userData.kind !== 'pool-ring') return;
    const i = o.userData.ring as number, home = pool.rings[i], a = afloat[i];
    o.position.set(home.x - pool.x + (a?.x ?? 0), RING_Y + (a?.bob ?? 0), home.z - pool.z + (a?.z ?? 0));
    o.rotation.z = a?.spin ?? 0;
  });
}

/** The angler's float, line and ripple (#58), following the cast the controller says. */
export class FishingGear {
  readonly float = new THREE.Group();
  readonly line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), new THREE.LineBasicMaterial({ color: '#F4EEE2' }));
  readonly ripple = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 32), new THREE.MeshBasicMaterial({ color: '#FFFFFF', transparent: true, depthWrite: false }));
  private cast: { cast: Cast; place: HangoutPlace; start: number; t: number } | null = null;
  private now: CastFrame | null = null;

  constructor(parent: THREE.Object3D) {
    this.float.add(at(ball(0.04, '#FF5A5A', { outline: 0.08, shadow: false }), 0, 0.02, 0));
    this.float.add(at(ball(0.03, '#FFFFFF', { outline: 0.08, shadow: false }), 0, 0.06, 0));
    this.ripple.rotation.x = -Math.PI / 2;
    this.ripple.renderOrder = 2;
    parent.add(this.float, this.line, this.ripple);
    this.stop();
  }

  /** A cast from `place` starts now, `start` seconds on the pond's clock (its fish's paths). */
  start(cast: Cast, place: HangoutPlace, start: number) {
    this.cast = { cast, place, start, t: 0 };
    this.update(0);
  }

  stop() {
    this.cast = this.now = null;
    this.float.visible = this.line.visible = this.ripple.visible = false;
  }

  /** The current moment of the cast, for the fish taking part in a catch. */
  frame() {
    return this.now;
  }

  update(dt: number) {
    if (!this.cast) return;
    const c = this.cast;
    c.t = Math.min(c.t + dt, CAST_SECONDS);
    const f = (this.now = castAt(c.cast, c.t, c.place, c.start));
    this.float.visible = !!f.float;
    if (f.float) this.float.position.set(f.float.x, f.float.y, f.float.z);
    this.line.visible = true;
    const positions = this.line.geometry.getAttribute('position') as THREE.BufferAttribute;
    positions.setXYZ(0, f.tip.x, f.tip.y, f.tip.z);
    positions.setXYZ(1, f.lineEnd.x, f.lineEnd.y, f.lineEnd.z);
    positions.needsUpdate = true;
    this.ripple.visible = !!f.ripple;
    if (f.ripple) {
      this.ripple.position.set(f.ripple.x, 0.035, f.ripple.z);
      this.ripple.scale.setScalar(f.ripple.radius);
      this.ripple.material.opacity = f.ripple.opacity;
    }
  }

  lineEnds() {
    const p = this.line.geometry.getAttribute('position');
    return [0, 1].map((i) => new THREE.Vector3().fromBufferAttribute(p, i));
  }
}

/** A sun lounger, head end at -z: a seat, and a backrest rising from it to the head end, propped up there (#64). */
function sunLounger() {
  const { w, d, seatTop, back } = BREAK_ROOM.lounger;
  const thick = 0.08, { angle, length } = back;
  const hingeZ = -d / 2 + length * Math.cos(angle);
  const chair = tag(new THREE.Group(), 'sun-lounger');
  chair.add(part(at(box(w, thick, d / 2 - hingeZ, '#FFF8EC'), 0, seatTop - thick / 2, (hingeZ + d / 2) / 2), 'seat'));
  // Its top face starts at the seat's top edge and runs up the slope; the box's centre is half a length up, half a thickness under.
  const up = new THREE.Vector3(0, Math.sin(angle), -Math.cos(angle)), out = new THREE.Vector3(0, Math.cos(angle), Math.sin(angle));
  const centre = new THREE.Vector3(0, seatTop, hingeZ).addScaledVector(up, length / 2).addScaledVector(out, -thick / 2);
  const rest = part(at(box(w, thick, length, '#FFF8EC'), centre.x, centre.y, centre.z), 'backrest');
  rest.rotation.x = angle;
  chair.add(rest);
  for (const dz of [hingeZ + 0.05, d / 2 - 0.15]) chair.add(at(box(w, seatTop - thick, 0.05, WOOD, { outline: 0.02 }), 0, (seatTop - thick) / 2, dz));
  const propZ = -d / 2 + 0.15, under = seatTop - thick / Math.cos(angle) + (hingeZ - propZ) * Math.tan(angle);
  chair.add(at(box(w, under, 0.05, WOOD, { outline: 0.02 }), 0, under / 2, propZ));
  return chair;
}

/** The pool's coping, around the hole in the deck (#63). */
export const POOL_RIM = 0.125;
const POOL_TILE = '#DDF3FA';

/** Light pool tiles with grout lines, generated as pixels (no canvas needed). */
function poolTiles(repeatX: number, repeatY: number) {
  const size = 32, data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) data.set(x % 16 < 1 || y % 16 < 1 ? [0xa9, 0xd6, 0xe6, 255] : [0xdd, 0xf3, 0xfa, 255], (y * size + x) * 4);
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeatX, repeatY);
  texture.needsUpdate = true;
  return texture;
}

/** The pond (#63): a sandy, stony bed in a sunken hollow, under see-through water; `rx`, `rz` its half-sizes. */
function buildPond(rx: number, rz: number) {
  const pond = tag(new THREE.Group(), 'pond');
  const ellipse = <T extends THREE.Object3D>(o: T) => { o.scale.set(rx, o.scale.y, rz); return o; };
  const bed = new THREE.Mesh(new THREE.CircleGeometry(1, 40), new THREE.MeshToonMaterial({ color: '#D9C08A', gradientMap: toonRamp }));
  bed.rotation.x = -Math.PI / 2;
  bed.scale.set(rx, rz, 1);
  pond.add(part(at(bed, 0, -POND_DEPTH, 0), 'pond-bed'));
  const bank = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, POND_DEPTH, 40, 1, true), new THREE.MeshToonMaterial({ color: '#B89A68', gradientMap: toonRamp, side: THREE.BackSide }));
  pond.add(ellipse(at(bank, 0, -POND_DEPTH / 2, 0)));
  for (const [x, z, r] of [[-0.5, 0.3, 0.12], [0.6, -0.4, 0.09], [0.1, 0.55, 0.1], [-0.2, -0.6, 0.08]]) {
    const stone = ball(r, '#9C93B5', { outline: 0.05, shadow: false });
    stone.scale.y = 0.5;
    pond.add(at(stone, x * rx * 0.8, -POND_DEPTH + r * 0.3, z * rz * 0.8));
  }
  const surface = waterSurface(new THREE.CircleGeometry(1, 40), WATER);
  surface.scale.set(rx, rz, 1);
  pond.add(at(surface, 0, 0.03, 0));
  return pond;
}

/** The dog's bed and bowl (#34). */
export function addPetCorner(group: THREE.Group) {
  const { petBed, bowl } = BREAK_ROOM;
  const bed = tag(new THREE.Group(), 'pet-bed');
  const cushion = cyl(1, 1, 0.12, '#E2B347', { outline: 0.03 }, 32);
  cushion.scale.set(petBed.rx, 1, petBed.rz);
  bed.add(at(cushion, 0, 0.06, 0));
  const rim = mesh(new THREE.TorusGeometry(1, 0.12, 8, 32), '#C25B7A', { outline: 0.03 });
  rim.rotation.x = Math.PI / 2;
  rim.scale.set(petBed.rx * 0.9, petBed.rz * 0.9, 1);
  bed.add(at(rim, 0, 0.12, 0));
  group.add(at(bed, petBed.x, 0, petBed.z));
  const dish = tag(new THREE.Group(), 'dog-bowl');
  dish.add(at(cyl(bowl.r, bowl.r * 0.8, 0.07, '#4D86FF', { outline: 0.05 }), 0, 0.035, 0));
  dish.add(at(cyl(bowl.r * 0.8, bowl.r * 0.8, 0.01, '#8C5A3A', { outline: 0, shadow: false }), 0, 0.07, 0));
  group.add(at(dish, bowl.x, 0, bowl.z));
}

/** The pool with its four rubber rings (#32); couch co-op uses the lounge's sofa and TV. */
export function addPool(group: THREE.Group) {
  const { pool } = BREAK_ROOM;
  const basin = tag(new THREE.Group(), 'pool');
  // A sunken, tiled basin under see-through water (#63), framed by a coping around the hole in the deck.
  const [iw, id] = [pool.w - POOL_RIM * 2, pool.d - POOL_RIM * 2];
  for (const side of [-1, 1]) {
    basin.add(at(box(pool.w, 0.06, POOL_RIM, '#F4EEE2', { outline: 0.01 }), 0, 0.03, side * (pool.d - POOL_RIM) / 2));
    basin.add(at(box(POOL_RIM, 0.06, id, '#F4EEE2', { outline: 0.01 }), side * (pool.w - POOL_RIM) / 2, 0.03, 0));
    basin.add(part(at(box(iw, POOL_DEPTH, 0.02, POOL_TILE, { outline: 0, shadow: false }), 0, -POOL_DEPTH / 2, side * (id / 2 - 0.01)), 'pool-wall'));
    basin.add(part(at(box(0.02, POOL_DEPTH, id, POOL_TILE, { outline: 0, shadow: false }), side * (iw / 2 - 0.01), -POOL_DEPTH / 2, 0), 'pool-wall'));
  }
  const floor = new THREE.Mesh(new THREE.BoxGeometry(iw, 0.02, id), new THREE.MeshToonMaterial({ map: poolTiles(iw / 0.5, id / 0.5), gradientMap: toonRamp }));
  basin.add(part(at(floor, 0, -POOL_DEPTH, 0), 'pool-floor'));
  for (const dz of [-0.6, 0.6]) basin.add(part(at(box(iw - 0.6, 0.01, 0.08, '#3E6FD0', { outline: 0, shadow: false }), 0, -POOL_DEPTH + 0.015, dz), 'lane-line'));
  basin.add(at(waterSurface(new THREE.PlaneGeometry(iw, id), '#5BC0EB'), 0, 0.065, 0));
  const ladder = at(box(0.05, 0.5, 0.05, '#C9C0E3', { outline: 0.02 }), pool.w / 2 - 0.3, 0.25, -pool.d / 2 - 0.02);
  basin.add(ladder);
  const colors = ['#F07A4A', '#E2B347', '#C25B7A', '#5BA37A'];
  pool.rings.forEach((r, i) => {
    const ring = tag(mesh(new THREE.TorusGeometry(0.4, 0.08, 10, 24), colors[i], { outline: 0.05 }), 'pool-ring');
    ring.rotation.x = Math.PI / 2;
    ring.userData.ring = i;
    basin.add(at(ring, r.x - pool.x, RING_Y, r.z - pool.z));
  });
  group.add(at(basin, pool.x, 0, pool.z));
}
