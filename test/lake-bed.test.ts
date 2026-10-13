import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildOffice } from '../src/client/office.ts';
import { find } from './office-sim.ts';

const { group } = buildOffice(3, 'control-room');
group.updateMatrixWorld(true);
const [lake] = find(group, 'lake');
const named = (name: string) => {
  const found: THREE.Mesh[] = [];
  lake.traverse((o) => { if (o.userData.part === name) found.push(o as THREE.Mesh); });
  return found;
};
const [bed] = named('lake-bed');
const bedBox = new THREE.Box3().setFromObject(bed);
const bedY = bedBox.max.y;

/** World-space xz boxes of the flat, upward-facing triangles of `mesh` level with `y` (within 1 cm). */
function upFacesAt(mesh: THREE.Mesh, y: number) {
  const pos = mesh.geometry.getAttribute('position');
  const index = mesh.geometry.getIndex();
  const count = index ? index.count : pos.count;
  const v = [0, 1, 2].map(() => new THREE.Vector3());
  const faces: THREE.Box3[] = [];
  for (let i = 0; i < count; i += 3) {
    v.forEach((p, k) => p.fromBufferAttribute(pos, index ? index.getX(i + k) : i + k).applyMatrix4(mesh.matrixWorld));
    const normal = new THREE.Triangle(v[0], v[1], v[2]).getNormal(new THREE.Vector3());
    if (normal.y > 0.99 && v.every((p) => Math.abs(p.y - y) < 0.01)) faces.push(new THREE.Box3().setFromPoints(v));
  }
  return faces;
}
const overlapsXZ = (a: THREE.Box3, b: THREE.Box3) => a.min.x < b.max.x && a.max.x > b.min.x && a.min.z < b.max.z && a.max.z > b.min.z;

describe('#121 the lake bed is separate from the earth below it', () => {
  it('#121 AC1 the top of the earth block under the lake sits at least 0.01 m below the lake bed', () => {
    const [earth] = named('lake-earth');
    expect(earth).toBeDefined();
    expect(new THREE.Box3().setFromObject(earth).max.y).toBeLessThanOrEqual(bedY - 0.01);
  });

  it('#121 AC2 no other mesh in the lake group has an upward-facing surface level with the bed where their footprints overlap', () => {
    const clashes: string[] = [];
    lake.traverse((o) => {
      if (o === bed || !(o as THREE.Mesh).isMesh) return;
      const hits = upFacesAt(o as THREE.Mesh, bedY).filter((f) => overlapsXZ(f, bedBox));
      if (hits.length) clashes.push(`${o.userData.part ?? o.type}: ${hits.length} faces`);
    });
    expect(clashes).toEqual([]);
  });
});
