import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { BREAK_ROOM, INITIAL_ROWS } from '../src/client/layout.ts';
import { buildOffice } from '../src/client/office.ts';
import { find } from './office-sim.ts';

const { group } = buildOffice(INITIAL_ROWS);
const [hammock] = find(group, 'hammock');
const trees = find(group, 'tree');
const parts = (root: THREE.Object3D, part: string) => {
  const out: THREE.Mesh[] = [];
  root.traverse((o) => { if (o.userData.part === part) out.push(o as THREE.Mesh); });
  return out;
};
const ropes = parts(hammock, 'rope');
const [cloth] = parts(hammock, 'cloth');

/** A rope's two ends (a cylinder's axis ends), lower first. */
function ends(rope: THREE.Mesh) {
  const h = (rope.geometry as THREE.CylinderGeometry).parameters.height;
  const pts = [new THREE.Vector3(0, -h / 2, 0), new THREE.Vector3(0, h / 2, 0)].map((p) => p.applyMatrix4(rope.matrixWorld));
  return pts.sort((a, b) => a.y - b.y);
}

/** The cloth's two ends: the far left and right of its rim. */
const clothBox = new THREE.Box3().setFromObject(cloth, true);
const clothTop = clothBox.max.y;
const clothEnds = [new THREE.Vector3(clothBox.min.x, clothTop, BREAK_ROOM.hammock.z), new THREE.Vector3(clothBox.max.x, clothTop, BREAK_ROOM.hammock.z)];

/** A trunk's radius at height y, from its tapered cylinder. */
function trunkOf(tree: THREE.Object3D) {
  const [trunk] = parts(tree, 'trunk');
  const g = (trunk.geometry as THREE.CylinderGeometry).parameters;
  const base = trunk.getWorldPosition(new THREE.Vector3()).y - g.height / 2;
  const axis = tree.getWorldPosition(new THREE.Vector3());
  return {
    x: axis.x, z: axis.z, top: base + g.height,
    radius: (y: number) => g.radiusBottom + (g.radiusTop - g.radiusBottom) * Math.min(1, Math.max(0, (y - base) / g.height)),
    gap: (p: THREE.Vector3) => Math.hypot(p.x - axis.x, p.z - axis.z) - (g.radiusBottom + (g.radiusTop - g.radiusBottom) * Math.min(1, Math.max(0, (p.y - base) / g.height))),
  };
}

describe('#55 hammock ropes tied to the trees', () => {
  it('#55 AC1 each end of the cloth has a rope starting within 5 cm of it', () => {
    expect(ropes).toHaveLength(2);
    for (const end of clothEnds) {
      const rope = ropes.find((r) => ends(r)[0].distanceTo(end) < 0.05);
      expect(rope, `rope at (${end.x.toFixed(2)}, ${end.y.toFixed(2)})`).toBeDefined();
    }
  });

  it('#55 AC2 each rope ends within 5 cm of its trunk\'s surface, higher than the cloth end, sloping up', () => {
    for (const rope of ropes) {
      const [low, high] = ends(rope);
      const trunk = trees.map(trunkOf).reduce((a, b) => (Math.abs(a.x - high.x) < Math.abs(b.x - high.x) ? a : b));
      expect(Math.abs(trunk.gap(high)), 'at the trunk surface').toBeLessThan(0.05);
      expect(high.y).toBeGreaterThan(low.y + 0.1);
      expect(high.y).toBeLessThan(trunk.top);
      expect(Math.abs(high.x - trunk.x), 'reaches out to its own tree').toBeLessThan(Math.abs(low.x - trunk.x));
    }
  });

  it('#55 AC3 ropes pass through neither the cloth nor the trunks', () => {
    const c = cloth.getWorldPosition(new THREE.Vector3());
    const r = cloth.getWorldScale(new THREE.Vector3());
    const inCloth = (p: THREE.Vector3) => p.y <= c.y && ((p.x - c.x) / r.x) ** 2 + ((p.y - c.y) / r.y) ** 2 + ((p.z - c.z) / r.z) ** 2 < 1;
    for (const rope of ropes) {
      const [low, high] = ends(rope);
      for (let k = 0.05; k <= 0.95; k += 0.01) {
        const p = low.clone().lerp(high, k);
        expect(inCloth(p), `k=${k.toFixed(2)} in the cloth`).toBe(false);
        for (const tree of trees.map(trunkOf)) expect(tree.gap(p), `k=${k.toFixed(2)} in a trunk`).toBeGreaterThan(0);
      }
    }
  });
});
