import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { BREAK_ROOM, INITIAL_ROWS, officeLayout } from '../src/client/layout.ts';
import { buildOffice } from '../src/client/office.ts';
import { Character } from '../src/client/character.ts';
import { lookFor } from '../src/client/look.ts';
import { find } from './office-sim.ts';

const { group } = buildOffice(INITIAL_ROWS);
group.updateMatrixWorld(true);
const loungers = find(group, 'sun-lounger');
const part = (root: THREE.Object3D, name: string) => { let found: THREE.Mesh | undefined; root.traverse((o) => { if (o.userData.part === name) found = o as THREE.Mesh; }); return found!; };

/** A box mesh's 8 corners in the world (or only its top face's 4). */
function corners(m: THREE.Mesh, topOnly = false) {
  const { width: w, height: h, depth: d } = (m.geometry as THREE.BoxGeometry).parameters;
  const out: THREE.Vector3[] = [];
  for (const x of [-w / 2, w / 2]) for (const y of topOnly ? [h / 2] : [-h / 2, h / 2]) for (const z of [-d / 2, d / 2]) out.push(new THREE.Vector3(x, y, z).applyMatrix4(m.matrixWorld));
  return out;
}
const seatOf = (lounger: THREE.Object3D) => {
  const c = corners(part(lounger, 'seat'));
  return { top: Math.max(...c.map((p) => p.y)), bottom: Math.min(...c.map((p) => p.y)), headEnd: Math.min(...c.map((p) => p.z)) };
};

describe('#64 sun lounger backrests angled the right way', () => {
  it('#64 AC1 the backrest rises from seat height at the seat to the lounger\'s highest point at the head end, 0.25 m+ above the seat', () => {
    expect(loungers).toHaveLength(2);
    for (const lounger of loungers) {
      const seat = seatOf(lounger);
      const top = corners(part(lounger, 'backrest')).sort((a, b) => b.y - a.y);
      // The top face's edge by the seat (its two corners with the greater z) sits at seat height.
      const topFace = corners(part(lounger, 'backrest'), true).sort((a, b) => b.z - a.z);
      for (const p of topFace.slice(0, 2)) expect(Math.abs(p.y - seat.top)).toBeLessThan(0.03);
      for (const p of topFace.slice(2)) expect(p.y - seat.top).toBeGreaterThanOrEqual(0.25);
      expect(Math.min(...topFace.slice(2).map((p) => p.z)), 'the high edge is at the head end (-z)').toBeLessThan(seat.headEnd);
      const highest = new THREE.Box3().setFromObject(lounger).max.y;
      expect(highest - top[0].y, 'nothing higher than the backrest\'s outer edge').toBeLessThan(0.02);
    }
  });

  it('#64 AC2 no part of the backrest goes below the seat or into the floor', () => {
    for (const lounger of loungers) {
      const seat = seatOf(lounger);
      for (const p of corners(part(lounger, 'backrest'))) {
        expect(p.y).toBeGreaterThanOrEqual(seat.bottom - 0.01);
        expect(p.y).toBeGreaterThan(0);
      }
    }
  });

  it('#64 AC3 a lounging character\'s back and head rest along the backrest (torso within 0.1 m of it, not through it)', () => {
    const layout = officeLayout(INITIAL_ROWS);
    const places = layout.hangouts.find((s) => s.name === 'loungers')!.places;
    places.forEach((place, i) => {
      const lounger = loungers.reduce((a, b) => (Math.abs(a.position.x - place.x) < Math.abs(b.position.x - place.x) ? a : b));
      const back = part(lounger, 'backrest');
      const normal = new THREE.Vector3(0, 1, 0).applyQuaternion(back.getWorldQuaternion(new THREE.Quaternion()));
      const surface = new THREE.Plane().setFromNormalAndCoplanarPoint(normal, new THREE.Vector3(0, (back.geometry as THREE.BoxGeometry).parameters.height / 2, 0).applyMatrix4(back.matrixWorld));
      const along = new THREE.Vector3(0, 0, -1).applyQuaternion(back.getWorldQuaternion(new THREE.Quaternion()));
      const low = corners(back).reduce((a, b) => (b.y < a.y ? b : a));
      const length = (back.geometry as THREE.BoxGeometry).parameters.depth;

      const character = new Character(lookFor(`session-${i}`));
      character.placeAt(layout.seats[0], 'done', place);
      for (let t = 0; t < 10; t += 0.1) {
        character.update(t, 0.1);
        character.root.updateMatrixWorld(true);
        const body = character.pivot.children[0] as THREE.Mesh;
        const { radius, length: height } = (body.geometry as THREE.CapsuleGeometry).parameters;
        const backOfBody = radius * body.scale.z;
        for (const k of [-height / 2, 0, height / 2]) {
          const onAxis = new THREE.Vector3(0, k, 0).applyMatrix4(body.matrixWorld);
          const gap = surface.distanceToPoint(onAxis) - backOfBody;
          expect(gap, `torso, t=${t.toFixed(1)}`).toBeGreaterThanOrEqual(-0.01);
          expect(gap, `torso, t=${t.toFixed(1)}`).toBeLessThanOrEqual(0.1);
        }
        const head = character.head.getWorldPosition(new THREE.Vector3());
        const headGap = surface.distanceToPoint(head) - 0.38;
        expect(headGap, 'head on the backrest').toBeGreaterThanOrEqual(-0.02);
        expect(headGap).toBeLessThanOrEqual(0.1);
        const up = head.clone().sub(low).dot(along);
        expect(up, 'the head is over the backrest').toBeLessThan(length);
      }
    });
    expect(BREAK_ROOM.loungers).toHaveLength(2);
  });
});
