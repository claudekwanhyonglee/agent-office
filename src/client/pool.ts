// The pool rack (#53): a fixed script of shots, so the balls move the same way every rack (no physics).
// Table-local metres: x across the table, z along it (+z towards the deck); y is left to the renderer.
import type { Point } from './layout.ts';

/** Half the playing surface (the felt inside the rails). */
export const FELT = { hx: 0.5, hz: 1.0 };
export const BALL_R = 0.05;
export const POCKET_R = 0.09;
/** Corner and middle pockets, on the felt's edge. */
export const POCKETS: Point[] = [-1, 0, 1].flatMap((z) => [-1, 1].map((x) => ({ x: x * FELT.hx, z: z * FELT.hz })));

/** A turn: the next shooter steps up, then strikes at STRIKE_AT; everything has stopped before the next turn. */
export const SHOT_SECONDS = 5;
export const STRIKE_AT = 2;
const CUE_ROLL = 1.5;
const BALL_ROLL = 1.2;

/** The cue ball, then the yellow, pink, blue and black, racked at the far (+z) end. */
const RACK: Point[] = [
  { x: 0, z: -0.85 }, { x: 0, z: 0.45 }, { x: -0.055, z: 0.545 }, { x: 0.055, z: 0.545 }, { x: 0, z: 0.64 },
];

interface Shot {
  /** Which way the cue points: +1 from the near (-z) end towards +z, -1 from the far end. */
  aim: 1 | -1;
  /** The cue ball's path: first to where it hits, then on to where it stops. */
  cue: Point[];
  /** Paths of the balls it sets moving (by index); they start when the cue ball hits. A path ending in a pocket pots the ball. */
  balls: Record<number, Point[]>;
}

/** Each shot's cue ball starts where the last one stopped, 0.25 m in from the shooter's end of the table. */
const SHOTS: Shot[] = [
  { // The break: the yellow goes in, the rest spread out.
    aim: 1,
    cue: [{ x: 0, z: 0.35 }, { x: -0.25, z: 0.15 }, { x: -0.1, z: 0.85 }],
    balls: {
      1: [{ x: 0.5, z: 1 }],
      2: [{ x: -0.45, z: 0.75 }, { x: -0.15, z: 0 }],
      3: [{ x: 0.12, z: 0.6 }],
      4: [{ x: 0.45, z: 0.3 }, { x: -0.25, z: -0.7 }],
    },
  },
  { aim: -1, cue: [{ x: -0.1, z: 0.087 }, { x: 0.12, z: -0.85 }], balls: { 2: [{ x: -0.5, z: 0 }] } },
  { aim: 1, cue: [{ x: 0.12, z: 0.5 }, { x: -0.2, z: 0.85 }], balls: { 3: [{ x: 0.5, z: 1 }] } },
  { aim: -1, cue: [{ x: -0.2, z: -0.613 }, { x: 0, z: -0.3 }], balls: { 4: [{ x: -0.5, z: -1 }] } },
];

export const SHOT_COUNT = SHOTS.length;
export const RACK_SECONDS = SHOT_COUNT * SHOT_SECONDS;

export interface Ball extends Point { potted: boolean }

const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.z - b.z);
const easeOut = (u: number) => 1 - (1 - u) ** 3;
const isPocket = (p: Point) => POCKETS.some((q) => dist(p, q) < 1e-9);

/** The point a fraction `f` of the way along a polyline. */
function along(path: Point[], f: number): Point {
  const lengths = path.slice(1).map((p, i) => dist(path[i], p));
  let d = f * lengths.reduce((a, b) => a + b, 0);
  for (let i = 0; i < lengths.length; i++) {
    if (d <= lengths[i] || i === lengths.length - 1) {
      const k = lengths[i] ? Math.min(1, d / lengths[i]) : 1;
      return { x: path[i].x + (path[i + 1].x - path[i].x) * k, z: path[i].z + (path[i + 1].z - path[i].z) * k };
    }
    d -= lengths[i];
  }
  return { ...path[0] };
}

/** Seconds after the strike when the cue ball reaches its first point (the hit), with its slowing roll. */
function hitTime(path: Point[]) {
  const total = path.slice(1).reduce((sum, p, i) => sum + dist(path[i], p), 0);
  const f = dist(path[0], path[1]) / total;
  return CUE_ROLL * (1 - Math.cbrt(1 - f));
}

/** Where every ball is `t` seconds into a rack (any t: racks repeat). Potted balls stay at their pocket. */
export function ballsAt(t: number): Ball[] {
  const into = ((t % RACK_SECONDS) + RACK_SECONDS) % RACK_SECONDS;
  const balls: Ball[] = RACK.map((p) => ({ ...p, potted: false }));
  SHOTS.forEach((shot, k) => {
    const since = into - (k * SHOT_SECONDS + STRIKE_AT);
    if (since < 0) return;
    const cuePath = [{ x: balls[0].x, z: balls[0].z }, ...shot.cue];
    const hit = hitTime(cuePath);
    Object.assign(balls[0], along(cuePath, easeOut(Math.min(1, since / CUE_ROLL))));
    for (const [i, rest] of Object.entries(shot.balls)) {
      const ball = balls[Number(i)];
      const u = Math.min(1, Math.max(0, (since - hit) / BALL_ROLL));
      Object.assign(ball, along([{ x: ball.x, z: ball.z }, ...rest], easeOut(u)));
      ball.potted = u === 1 && isPocket(rest.at(-1)!);
    }
  });
  return balls;
}

/** Where the cue ball sits for shot `k` of the rack, and which way it's played. */
export function shotSetup(k: number) {
  return { cue: ballsAt(k * SHOT_SECONDS)[0] as Point, aim: SHOTS[k].aim };
}
