import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { INITIAL_ROWS } from '../src/client/layout.ts';
import { buildOffice } from '../src/client/office.ts';
import { find } from './office-sim.ts';

const { group } = buildOffice(INITIAL_ROWS);
group.updateMatrixWorld(true);
const trees = find(group, 'tree');
const parts = (root: THREE.Object3D, name: string) => {
  const out: THREE.Mesh[] = [];
  root.traverse((o) => { if (o.userData.part === name) out.push(o as THREE.Mesh); });
  return out;
};
/** A leaf ball as a world sphere. */
const sphere = (m: THREE.Mesh) => new THREE.Sphere(m.getWorldPosition(new THREE.Vector3()), (m.geometry as THREE.SphereGeometry).parameters.radius * m.getWorldScale(new THREE.Vector3()).x);

describe('#66 slightly more detailed trees', () => {
  it('#66 AC1 each canopy is 4–6 overlapping leaf balls of varied sizes, in at least two greens', () => {
    expect(trees).toHaveLength(2);
    for (const tree of trees) {
      const leaves = parts(tree, 'leaves');
      expect(leaves.length).toBeGreaterThanOrEqual(4);
      expect(leaves.length).toBeLessThanOrEqual(6);
      const balls = leaves.map(sphere);
      expect(new Set(balls.map((b) => b.radius.toFixed(3))).size).toBeGreaterThanOrEqual(3);
      const greens = new Set(leaves.map((m) => (m.material as THREE.MeshToonMaterial).color.getHexString()));
      expect(greens.size).toBeGreaterThanOrEqual(2);
      for (const c of greens) { const { r, g, b } = new THREE.Color(`#${c}`); expect(g).toBeGreaterThan(Math.max(r, b)); }
      balls.forEach((b, i) => expect(balls.some((o, j) => j !== i && b.intersectsSphere(o)), `ball ${i} overlaps another`).toBe(true));
    }
  });

  it('#66 AC2 the trunk tapers, and one or two short branches reach from it into the canopy', () => {
    for (const tree of trees) {
      const [trunk] = parts(tree, 'trunk');
      const g = (trunk.geometry as THREE.CylinderGeometry).parameters;
      expect(g.radiusTop).toBeLessThan(g.radiusBottom * 0.85);
      const branches = parts(tree, 'branch');
      expect(branches.length).toBeGreaterThanOrEqual(1);
      expect(branches.length).toBeLessThanOrEqual(2);
      const axis = tree.getWorldPosition(new THREE.Vector3());
      const balls = parts(tree, 'leaves').map(sphere);
      for (const b of branches) {
        const h = (b.geometry as THREE.CylinderGeometry).parameters.height;
        expect(h, 'short').toBeLessThan(1);
        const [low, high] = [new THREE.Vector3(0, -h / 2, 0), new THREE.Vector3(0, h / 2, 0)].map((p) => p.applyMatrix4(b.matrixWorld)).sort((p, q) => p.y - q.y);
        expect(Math.hypot(low.x - axis.x, low.z - axis.z), 'it starts at the trunk').toBeLessThan(g.radiusBottom + 0.05);
        expect(balls.some((s) => s.containsPoint(high)), 'it ends in the canopy').toBe(true);
      }
    }
  });

  it('#66 AC3 a tree is no more than 12 meshes (outlines included)', () => {
    for (const tree of trees) {
      let meshes = 0;
      tree.traverse((o) => { if (o instanceof THREE.Mesh) meshes++; });
      expect(meshes).toBeLessThanOrEqual(12);
    }
  });

  it('#66 AC4 the canopy stays above the hammock ropes\' tie points, clear of the ropes', () => {
    const [hammock] = find(group, 'hammock');
    const ropes = parts(hammock, 'rope');
    expect(ropes).toHaveLength(2);
    const balls = trees.flatMap((t) => parts(t, 'leaves').map(sphere));
    for (const rope of ropes) {
      const h = (rope.geometry as THREE.CylinderGeometry).parameters.height;
      const [a, b] = [new THREE.Vector3(0, -h / 2, 0), new THREE.Vector3(0, h / 2, 0)].map((p) => p.applyMatrix4(rope.matrixWorld));
      const tie = Math.max(a.y, b.y);
      for (const s of balls) expect(s.center.y - s.radius, 'leaves above the tie').toBeGreaterThan(tie + 0.1);
      for (let k = 0; k <= 1; k += 0.02) {
        const p = a.clone().lerp(b, k);
        for (const s of balls) expect(s.distanceToPoint(p)).toBeGreaterThan(0.05);
      }
    }
  });
});
