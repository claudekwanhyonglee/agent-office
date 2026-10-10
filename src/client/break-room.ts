// Break-room props (#29), at their plan C positions. Each is tagged so route tests treat it as furniture.
import * as THREE from 'three';
import { at, ball, box, cyl, mesh, tag } from './toon.ts';
import { BREAK_ROOM } from './layout.ts';

const INK = '#3A3150';
const WOOD = '#C98A55';
const WATER = '#8FD3F2';

const turned = <T extends THREE.Object3D>(obj: T, yaw: number) => {
  obj.rotation.y = yaw;
  return obj;
};

/** Loungers, pond and jetty, hammock, yoga mat, trampoline, dartboard, bin and paper stack (#30). */
export function addSoloProps(group: THREE.Group) {
  const { loungers, lounger, pond, jetty, hammock, yogaMat, trampoline, dartboard, bin, paperStack } = BREAK_ROOM;

  for (const { x, z } of loungers) {
    const chair = tag(new THREE.Group(), 'sun-lounger');
    chair.add(at(box(lounger.w, 0.08, lounger.d * 0.7, '#FFF8EC'), 0, 0.3, lounger.d * 0.15));
    const back = at(box(lounger.w, 0.08, lounger.d * 0.32, '#FFF8EC'), 0, 0.45, -lounger.d * 0.33);
    back.rotation.x = -0.6;
    chair.add(back);
    for (const dz of [-0.75, 0.8]) chair.add(at(box(lounger.w, 0.26, 0.05, WOOD, { outline: 0.02 }), 0, 0.13, dz));
    group.add(at(chair, x, 0, z));
  }

  const water = tag(at(cyl(1, 1, 0.04, WATER, { outline: 0.02, shadow: false }, 40), pond.x, 0.02, pond.z), 'pond');
  water.scale.set(pond.rx, 1, pond.rz);
  group.add(water);
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
    tree.add(at(cyl(0.12, 0.16, 1.9, '#8C6A4A', { outline: 0.03 }), 0, 0.95, 0));
    tree.add(at(ball(0.55, '#5FA35A'), 0, 2.2, 0));
    group.add(at(tree, x, 0, hammock.z));
  }
  const sling = tag(new THREE.Group(), 'hammock');
  const cloth = mesh(new THREE.SphereGeometry(1, 24, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), '#E2B347', { outline: 0.02 });
  cloth.scale.set(1.1, 0.25, 0.4);
  sling.add(at(cloth, 0, 0.75, 0));
  const span = hammock.trees[1] - hammock.trees[0] - 0.4;
  for (const side of [-1, 1]) {
    const rope = at(cyl(0.015, 0.015, span / 2 - 1.05, INK, { outline: 0, shadow: false }), side * (span / 2 + 0.5) / 2, 0.85, 0);
    rope.rotation.z = Math.PI / 2;
    sling.add(rope);
  }
  group.add(at(sling, hammock.x, 0, hammock.z));

  group.add(tag(at(box(yogaMat.w, 0.02, yogaMat.d, '#3FB3A6', { outline: 0.02, shadow: false }), yogaMat.x, 0.01, yogaMat.z), 'yoga-mat'));

  const bouncer = tag(new THREE.Group(), 'trampoline');
  bouncer.add(at(cyl(trampoline.r, trampoline.r, 0.06, '#4D86FF'), 0, 0.42, 0));
  bouncer.add(at(cyl(trampoline.r * 0.85, trampoline.r * 0.85, 0.02, INK, { outline: 0 }), 0, 0.46, 0));
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
  table.add(at(box(pool.w - 0.2, 0.03, pool.d - 0.2, '#3F8A5C', { outline: 0, shadow: false }), 0, 0.82, 0));
  for (const dx of [-0.45, 0.45]) for (const dz of [-0.9, 0.9]) table.add(at(box(0.12, 0.65, 0.12, '#8C6A4A', { outline: 0.02 }), dx, 0.32, dz));
  ['#FFFFFF', '#E2B347', '#C25B7A', '#4D86FF', '#241C2F'].forEach((color, i) => {
    table.add(at(ball(0.05, color, { outline: 0.06, shadow: false }), -0.25 + (i % 3) * 0.2, 0.88, -0.3 + Math.floor(i / 3) * 0.5));
  });
  group.add(at(table, pool.x, 0, pool.z));

  const pingPong = tag(new THREE.Group(), 'ping-pong-table');
  pingPong.add(at(box(pong.w, 0.06, pong.d, '#3E6FD0'), 0, 0.74, 0));
  pingPong.add(at(box(0.02, 0.005, pong.d, '#FFFFFF', { outline: 0, shadow: false }), 0, 0.775, 0));
  pingPong.add(at(box(0.03, 0.15, pong.d + 0.1, '#F4EEE2', { outline: 0.02 }), 0, 0.85, 0)); // net
  for (const dx of [-0.9, 0.9]) for (const dz of [-0.45, 0.45]) pingPong.add(at(box(0.06, 0.72, 0.06, INK, { outline: 0 }), dx, 0.36, dz));
  group.add(at(pingPong, pong.x, 0, pong.z));
}
