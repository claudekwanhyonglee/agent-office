import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { BREAK_ROOM, INITIAL_ROWS, officeLayout } from '../src/client/layout.ts';
import { buildOffice } from '../src/client/office.ts';
import { frameFloor, initialOrbit } from '../src/client/camera.ts';
import { Character } from '../src/client/character.ts';
import { lookFor } from '../src/client/look.ts';
import { FISH, PondFish, fishAt, updateWater } from '../src/client/water.ts';
import { find } from './office-sim.ts';

const { group } = buildOffice(INITIAL_ROWS);
group.updateMatrixWorld(true);
const { pool, pond } = BREAK_ROOM;
const parts = (root: THREE.Object3D, name: string) => {
  const out: THREE.Mesh[] = [];
  root.traverse((o) => { if (o.userData.part === name) out.push(o as THREE.Mesh); });
  return out;
};
const [poolGroup] = find(group, 'pool');
const [pondGroup] = find(group, 'pond');
const surfaces = [parts(poolGroup, 'water')[0], parts(pondGroup, 'water')[0]];
const material = (m: THREE.Mesh) => m.material as THREE.MeshBasicMaterial;
const opaque = (o: THREE.Object3D) => o instanceof THREE.Mesh && !(o.material as THREE.Material).transparent;

describe('#63 AC1 see-through blue water', () => {
  it('#63 AC1 the pool and pond surfaces are semi-transparent (0.5–0.7) and blue', () => {
    for (const s of surfaces) {
      expect(s, 'a water surface').toBeDefined();
      const m = material(s);
      expect(m.transparent).toBe(true);
      expect(m.opacity).toBeGreaterThanOrEqual(0.5);
      expect(m.opacity).toBeLessThanOrEqual(0.7);
      const { r, g, b } = m.color;
      expect(b).toBeGreaterThan(r);
      expect(b).toBeGreaterThan(g * 0.9);
    }
  });
});

describe('#63 AC2 a visible bottom with some depth', () => {
  it('#63 AC2 the pool has a tiled floor, inner walls and a lane line below the surface; the pond a bed', () => {
    const surfaceY = (m: THREE.Mesh) => m.getWorldPosition(new THREE.Vector3()).y;
    const [floor] = parts(poolGroup, 'pool-floor');
    expect(surfaceY(surfaces[0]) - new THREE.Box3().setFromObject(floor).max.y).toBeGreaterThan(0.5);
    expect(parts(poolGroup, 'pool-wall')).toHaveLength(4);
    expect(parts(poolGroup, 'lane-line').length).toBeGreaterThan(0);
    expect((material(floor).map ?? null)).not.toBeNull();
    const [bed] = parts(pondGroup, 'pond-bed');
    expect(surfaceY(surfaces[1]) - new THREE.Box3().setFromObject(bed).max.y).toBeGreaterThan(0.25);
  });

  it('#63 AC2 from the reset view, the bottoms are seen through the water: the deck, floor and base don\'t cover them', () => {
    for (const [w, h] of [[1440, 900], [390, 844]]) {
      const camera = new THREE.PerspectiveCamera(34, w / h, 0.1, 150);
      frameFloor(camera, initialOrbit(), INITIAL_ROWS);
      const targets = [
        // Between the rings, towards the back of the pool (the front wall hides the near end from this low angle).
        { name: 'pool-floor', at: new THREE.Vector3(pool.x, 0, pool.z - 0.95), root: poolGroup },
        { name: 'pool-floor', at: new THREE.Vector3(pool.x - 1.3, 0, pool.z - 1.0), root: poolGroup },
        { name: 'pond-bed', at: new THREE.Vector3(pond.x + 0.3, 0, pond.z + 0.2), root: pondGroup },
      ];
      for (const { name, at, root } of targets) {
        const [bottom] = parts(root, name);
        const bottomY = new THREE.Box3().setFromObject(bottom).max.y;
        const target = at.clone().setY(bottomY);
        const ray = new THREE.Raycaster(camera.position, target.clone().sub(camera.position).normalize());
        const [first] = ray.intersectObject(group, true).filter((hit) => opaque(hit.object) && ((hit.object as THREE.Mesh).material as THREE.Material).side !== THREE.BackSide);
        expect(first?.object.userData.part ?? first?.object.parent?.userData.kind ?? first?.object.userData.kind, `${w}×${h} ${name}`).toBe(name);
      }
    }
  });
});

describe('#63 AC3 a gentle shimmer on a flat surface', () => {
  it('#63 AC3 the surfaces\' highlights move over time', () => {
    const before = surfaces.map((s) => material(s).map!.offset.clone());
    updateWater(5);
    surfaces.forEach((s, i) => expect(material(s).map!.offset.distanceTo(before[i])).toBeGreaterThan(0.001));
  });

  it('#63 AC3 the surfaces stay flat, at the height the rings and the float sit on', () => {
    for (const s of surfaces) {
      const box = new THREE.Box3().setFromObject(s);
      expect(box.max.y - box.min.y).toBeLessThan(0.005);
    }
    const ring = find(group, 'pool-ring')[0];
    const ringY = ring.getWorldPosition(new THREE.Vector3()).y;
    expect(Math.abs(ringY - surfaces[0].getWorldPosition(new THREE.Vector3()).y)).toBeLessThan(0.06);
  });
});

describe('#63 AC4 fish in the pond', () => {
  it('#63 AC4 one or two fish swim slowly below the surface, always inside the pond\'s outline', () => {
    expect(FISH).toBeGreaterThanOrEqual(1);
    expect(FISH).toBeLessThanOrEqual(2);
    const surface = surfaces[1].getWorldPosition(new THREE.Vector3()).y;
    for (let i = 0; i < FISH; i++) {
      let prev = fishAt(i, 0), moved = 0;
      for (let t = 0.1; t < 300; t += 0.1) {
        const f = fishAt(i, t);
        const nose = { x: f.x + Math.sin(f.heading) * 0.15, z: f.z + Math.cos(f.heading) * 0.15 };
        for (const p of [f, nose]) expect(((p.x - pond.x) / pond.rx) ** 2 + ((p.z - pond.z) / pond.rz) ** 2, `fish ${i} t=${t.toFixed(1)}`).toBeLessThan(0.85);
        expect(f.y).toBeLessThan(surface - 0.05);
        const speed = Math.hypot(f.x - prev.x, f.z - prev.z) / 0.1;
        expect(speed, 'slowly').toBeLessThan(0.6);
        moved += speed * 0.1;
        prev = f;
      }
      expect(moved).toBeGreaterThan(10);
    }
  });

  it('#63 AC4 the fish models follow their paths', () => {
    const fish = new PondFish(new THREE.Scene());
    fish.update(12.5);
    fish.fish.forEach((m, i) => {
      const f = fishAt(i, 12.5);
      expect(m.position.distanceTo(new THREE.Vector3(f.x, f.y, f.z))).toBeLessThan(1e-9);
    });
  });
});

describe('#63 AC5 things in and above the water draw correctly', () => {
  it('#63 AC5 the water draws after everything solid without hiding it (no depth writes), and rings and riders are solid', () => {
    for (const s of surfaces) {
      expect(material(s).depthWrite).toBe(false);
      expect(s.renderOrder).toBeGreaterThan(0);
    }
    for (const ring of find(group, 'pool-ring')) expect((ring as THREE.Mesh).material).toHaveProperty('transparent', false);
    const layout = officeLayout(INITIAL_ROWS);
    const rider = new Character(lookFor('session-1'));
    rider.placeAt(layout.seats[0], 'done', layout.hangouts.find((s) => s.name === 'pool-dip')!.places[0]);
    rider.update(0, 0.016);
    rider.root.traverse((o) => {
      if (o instanceof THREE.Mesh) expect((o.material as THREE.Material).transparent, 'riders are drawn in the solid pass').toBe(false);
    });
  });
});
