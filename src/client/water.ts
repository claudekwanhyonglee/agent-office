// See-through water for the pool and the pond (#63): a semi-transparent surface with drifting
// highlights over a sunken bottom, and a couple of fish in the pond.
import * as THREE from 'three';
import { BREAK_ROOM } from './layout.ts';
import { at, ball, mesh } from './toon.ts';

export const WATER_OPACITY = 0.6;
/** How deep the pool and pond go below the deck. */
export const POOL_DEPTH = 0.8;
export const POND_DEPTH = 0.4;

/** Light streaks on blue, generated as pixels (no canvas needed); every surface shares it and its drift. */
const shimmer = (() => {
  const size = 64, data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const streak = Math.max(0, Math.sin((x + Math.sin(y / 6) * 5) / 4)) ** 12;
      const v = 200 + streak * 55;
      data.set([v, v, 255, 255], (y * size + x) * 4);
    }
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(2, 2);
  texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
})();

/** Drifts the highlights; call every frame. */
export function updateWater(t: number) {
  shimmer.offset.set(t * 0.02, Math.sin(t * 0.3) * 0.05);
}

/** A flat water surface over `geometry` (lying in the xy plane): see-through, drawn after the solid things in and under it. */
export function waterSurface(geometry: THREE.BufferGeometry, color: string) {
  const surface = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({
    color, map: shimmer, transparent: true, opacity: WATER_OPACITY, depthWrite: false, side: THREE.DoubleSide,
  }));
  surface.rotation.x = -Math.PI / 2;
  surface.renderOrder = 1;
  surface.userData.part = 'water';
  return surface;
}

export const FISH = 2;

/** Where fish `i` is `t` seconds in: a slow loop well inside the pond, a little below the surface. */
export function fishAt(i: number, t: number) {
  const { pond } = BREAK_ROOM;
  const w = 0.12 + i * 0.03, phase = i * 2.1;
  const pos = (s: number) => ({
    x: pond.x + 0.62 * pond.rx * Math.sin(w * s + phase),
    z: pond.z + 0.55 * pond.rz * Math.sin(2 * w * s + phase * 0.5),
  });
  const p = pos(t), ahead = pos(t + 0.05);
  return { ...p, y: -0.15 - i * 0.05, heading: Math.atan2(ahead.x - p.x, ahead.z - p.z) };
}

/** A small toon fish, nose along +z. */
function fishModel(color: string) {
  const fish = new THREE.Group();
  const body = ball(0.08, color, { outline: 0.06, shadow: false });
  body.scale.set(0.6, 0.6, 1.4);
  fish.add(body);
  const tail = mesh(new THREE.ConeGeometry(0.06, 0.1, 3), color, { outline: 0.06, shadow: false });
  tail.rotation.x = -Math.PI / 2;
  fish.add(at(tail, 0, 0, -0.14));
  return fish;
}

/** The pond's fish, swimming their loops. */
export class PondFish {
  readonly fish = ['#F07A4A', '#E2B347'].slice(0, FISH).map(fishModel);

  constructor(parent: THREE.Object3D) {
    parent.add(...this.fish);
    this.update(0);
  }

  update(t: number) {
    this.fish.forEach((f, i) => {
      const at = fishAt(i, t);
      f.position.set(at.x, at.y, at.z);
      f.rotation.y = at.heading;
    });
  }
}
