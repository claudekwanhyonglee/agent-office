import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { INITIAL_ROWS, officeLayout } from '../src/client/layout.ts';
import { buildOffice } from '../src/client/office.ts';
import { Character, bounceAt } from '../src/client/character.ts';
import { lookFor } from '../src/client/look.ts';
import { find } from './office-sim.ts';

const START = officeLayout(INITIAL_ROWS);
const PLACE = START.hangouts.find((s) => s.name === 'trampoline')!.places[0];
const MS = 0.001;

/** A bouncer, sampled every millisecond for `seconds`: body height, squash, head height and lowest point. */
function bounce(seconds: number) {
  const character = new Character(lookFor('session-1'));
  character.placeAt(START.seats[0], 'done', PLACE);
  const samples: { y: number; squash: number; head: number; lowest: number }[] = [];
  for (let t = 0; t < seconds; t += MS) {
    character.update(t, MS);
    character.root.updateMatrixWorld(true);
    let lowest = Infinity;
    character.root.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      for (let p: THREE.Object3D | null = o; p; p = p.parent) if (!p.visible) return;
      o.geometry.computeBoundingBox();
      lowest = Math.min(lowest, o.geometry.boundingBox!.clone().applyMatrix4(o.matrixWorld).min.y);
    });
    samples.push({ y: character.pivot.position.y, squash: character.pivot.scale.y, head: character.head.getWorldPosition(new THREE.Vector3()).y, lowest });
  }
  return samples;
}

const samples = bounce(4);
const topSpeed = Math.max(...samples.slice(1).map((s, i) => Math.abs(s.y - samples[i].y) / MS));

describe('#60 smooth trampoline bounce', () => {
  it('#60 AC1 each bounce\'s height is a parabola in time: slowest at the top, fastest at the mat', () => {
    const { period, flight } = bounceAt(0);
    for (let t0 = 0; t0 < 3 * period; t0 += period) {
      // Start of a flight: after the landing's contact.
      const start = t0 + (period - flight);
      const at = (k: number) => bounceAt(start + k * flight).y;
      // Second differences of a parabola are constant (and negative: it slows going up, speeds coming down).
      const h = flight / 20;
      const second = Array.from({ length: 18 }, (_, i) => at((i + 2) / 20) - 2 * at((i + 1) / 20) + at(i / 20));
      for (const d of second) expect(d).toBeCloseTo(second[0], 9);
      expect(second[0]).toBeLessThan(0);
      const speed = (k: number) => Math.abs(at(k + h / flight) - at(k)) / h;
      expect(speed(0.48)).toBeLessThan(speed(0.02));
      expect(speed(0.48)).toBeLessThan(speed(0.95));
    }
  });

  it('#60 AC2 the landing squash changes by at most 0.01 between 1 ms samples', () => {
    const squashes = samples.map((s) => s.squash);
    expect(Math.min(...squashes), 'it squashes').toBeLessThan(0.95);
    squashes.slice(1).forEach((s, i) => expect(Math.abs(s - squashes[i]), `ms ${i}`).toBeLessThanOrEqual(0.01));
  });

  it('#60 AC3 the head never jumps: between 1 ms samples it moves no more than the bounce\'s top speed allows', () => {
    expect(topSpeed).toBeGreaterThan(1);
    samples.slice(1).forEach((s, i) => expect(Math.abs(s.head - samples[i].head), `ms ${i}`).toBeLessThanOrEqual(topSpeed * MS + 1e-6));
  });

  it('#60 AC4 the feet never go below the trampoline mat', () => {
    const { group } = buildOffice(INITIAL_ROWS);
    const [trampoline] = find(group, 'trampoline');
    let mat = -Infinity;
    trampoline.traverse((o) => { if (o.userData.part === 'mat') mat = new THREE.Box3().setFromObject(o).max.y; });
    expect(mat).toBeGreaterThan(0.3);
    for (const s of samples) expect(s.lowest).toBeGreaterThanOrEqual(mat - 1e-6);
  });
});
