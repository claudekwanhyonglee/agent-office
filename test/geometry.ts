// Route-vs-furniture checks against the real 3D office (shared by the #13 and #14 tests).
import * as THREE from 'three';
import type { Point } from '../src/client/layout.ts';

/** Things on the floor you can walk over, and zone groups (their pieces are checked one by one). */
const WALKABLE = new Set(['floor', 'rug', 'door', 'glass-door']);
const ZONES = new Set(['desk-row', 'meeting-room', 'lounge', 'kitchen', 'deck', 'glass-front']);
const CLEARANCE = 0.1;

export interface Obstacle { kind: string; box: THREE.Box3; object: THREE.Object3D }

/** Footprints of every tagged piece, from the real 3D office. */
export function obstaclesIn(group: THREE.Group): Obstacle[] {
  group.updateMatrixWorld(true);
  const obstacles: Obstacle[] = [];
  group.traverse((o) => {
    const kind = o.userData.kind as string | undefined;
    if (!kind || WALKABLE.has(kind) || ZONES.has(kind)) return;
    obstacles.push({ kind, box: new THREE.Box3().setFromObject(o), object: o });
  });
  return obstacles;
}

export const inside = (p: Point, box: THREE.Box3, margin: number) =>
  p.x > box.min.x - margin && p.x < box.max.x + margin && p.z > box.min.z - margin && p.z < box.max.z + margin;

/** Obstacles a polyline passes through, sampled every 2 cm. `ignore(leg)` skips obstacles for one leg. */
export function collisions(path: Point[], obstacles: Obstacle[], ignore: (legIndex: number) => Set<THREE.Object3D> = () => new Set()) {
  const hits: string[] = [];
  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i], b = path[i + 1];
    const skip = ignore(i);
    const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 0.02));
    for (let s = 0; s <= steps; s++) {
      const p = { x: a.x + ((b.x - a.x) * s) / steps, z: a.z + ((b.z - a.z) * s) / steps };
      for (const o of obstacles) {
        if (!skip.has(o.object) && inside(p, o.box, CLEARANCE)) hits.push(`leg ${i} (${p.x.toFixed(2)},${p.z.toFixed(2)}) hits ${o.kind}`);
      }
    }
  }
  return [...new Set(hits)];
}

/**
 * Collisions, except that the first leg may leave, and the last leg may enter, the piece the
 * route starts or ends on (an agent hops out of its chair or off the sofa, and back on).
 */
export function routeCollisions(path: Point[], obstacles: Obstacle[]) {
  const under = (p: Point) => new Set(obstacles.filter((o) => inside(p, o.box, 0)).map((o) => o.object));
  const start = under(path[0]), end = under(path.at(-1)!);
  const last = path.length - 2;
  return collisions(path, obstacles, (i) => new Set([...(i === 0 ? start : []), ...(i === last ? end : [])]));
}
