import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { INITIAL_ROWS, officeLayout } from '../src/client/layout.ts';
import { Character } from '../src/client/character.ts';
import { lookFor } from '../src/client/look.ts';
import { BALL_R, SHOT_COUNT, SHOT_SECONDS, STRIKE_AT, ballsAt } from '../src/client/pool.ts';

const START = officeLayout(INITIAL_ROWS);
const TABLE = { x: 7.4, z: 1.6 };
/** The felt's height (break-room.ts) and the cue model's half length (character.ts). */
const FELT_TOP = 0.835;
const CUE_HALF = 1.45 / 2;
const FRAME = 1 / 60;

const isCue = (o: THREE.Object3D) => o instanceof THREE.Mesh && o.userData.kind === 'cue';

/** Shot `k`'s shooter at the strike: the cue's tip, its direction, and the cue ball's centre, in the world. */
function strike(k: number) {
  const c = new Character(lookFor('session-1'));
  c.placeAt(START.seats[0], 'done', START.poolTurns[k].shoot);
  c.takeShot();
  for (let t = 0; t <= STRIKE_AT + 1e-9; t += FRAME) c.update(t, t ? FRAME : 0);
  c.update(STRIKE_AT, 0);
  c.root.updateMatrixWorld(true);
  let cue: THREE.Mesh | null = null;
  c.root.traverseVisible((o) => { if (!cue && isCue(o)) cue = o as THREE.Mesh; });
  const butt = new THREE.Vector3(0, -CUE_HALF, 0).applyMatrix4(cue!.matrixWorld);
  const tip = new THREE.Vector3(0, CUE_HALF, 0).applyMatrix4(cue!.matrixWorld);
  const b = ballsAt(k * SHOT_SECONDS)[0];
  const ball = new THREE.Vector3(TABLE.x + b.x, FELT_TOP + BALL_R, TABLE.z + b.z);
  return { tip, along: tip.clone().sub(butt).normalize(), ball };
}

describe('#124 the cue tip strikes the cue ball', () => {
  for (let k = 0; k < SHOT_COUNT; k++) {
    it(`#124 AC1 shot ${k + 1}: the tip is within 0.03 m of the cue ball's surface at the strike`, () => {
      const { tip, ball } = strike(k);
      expect(Math.abs(tip.distanceTo(ball) - BALL_R)).toBeLessThanOrEqual(0.03);
    });

    it(`#124 AC2 shot ${k + 1}: the cue points at the cue ball's centre at the strike`, () => {
      const { tip, along, ball } = strike(k);
      expect(THREE.MathUtils.radToDeg(along.angleTo(ball.clone().sub(tip)))).toBeLessThanOrEqual(10);
    });
  }
});
