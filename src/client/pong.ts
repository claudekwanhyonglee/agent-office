// Table tennis (#70): a rally's ball follows a scripted path (no physics), so it's a function of
// time into the rally. Table-local metres: x along the table (the players stand at either end),
// z across it, y up from the floor. Side -1 is the player at the -x end, +1 the one at +x.

export type Side = -1 | 1;

/** A rally: who serves, and how many shots reach the other bat before one is missed. */
export interface Rally { server: Side; hits: number }

export const TABLE = { hx: 1.1, hz: 0.6, top: 0.77 };
export const NET_TOP = 0.925;
export const BALL_R = 0.02;
/** Players stand this far from the table's centre, at either end. */
export const PLAYER_X = 1.6;
/** Where a player hits the ball, from where they stand: in front, to the bat (right) side, and how high. */
export const HIT = { reach: 0.35, side: 0.25, y: 0.95 };

/** Seconds from one hit to the next: to the bounce on the far half, then up to the other bat. */
export const CROSS_SECONDS = 1;
const TO_BOUNCE = 0.6;
const BOUNCE_X = 0.6;
const ARC = { over: 0.25, up: 0.2, miss: 0.45 };
/** A missed ball: it bounces, flies past the end, drops and rolls away; then a short pause before the next serve. */
const PAST_END = 0.5;
const ROLL = 1;
const PAUSE = 0.8;
const MISS_SECONDS = TO_BOUNCE + PAST_END + ROLL + PAUSE;

export interface PongBall { x: number; y: number; z: number; visible: boolean }

/** Which side hits shot `i` of a rally: the server, then turn about. */
export const hitter = (rally: Rally, i: number): Side => (i % 2 ? -rally.server : rally.server) as Side;

/** Where side `s` hits the ball (table-local): the bat side is +z for the +x player, -z for the other. */
export const hitPoint = (s: Side) => ({ x: s * (PLAYER_X - HIT.reach), y: HIT.y, z: s * HIT.side });

export const rallySeconds = (rally: Rally) => rally.hits * CROSS_SECONDS + MISS_SECONDS;

/** Times (seconds into the rally) when side `s` hits the ball. */
export const hitTimes = (rally: Rally, s: Side) =>
  Array.from({ length: rally.hits + 1 }, (_, i) => i).filter((i) => hitter(rally, i) === s).map((i) => i * CROSS_SECONDS);

const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
/** A thrown ball's height: from y0 to y1, `h` above the straight line at the middle. */
const arc = (y0: number, y1: number, h: number, k: number) => lerp(y0, y1, k) + 4 * h * k * (1 - k);
const ON_TABLE = TABLE.top + BALL_R;

/** Where the ball is `t` seconds into `rally`. */
export function pongBallAt(rally: Rally, t: number): PongBall {
  const i = Math.min(rally.hits, Math.max(0, Math.floor(t / CROSS_SECONDS)));
  const s = hitter(rally, i), from = hitPoint(s), to = hitPoint(-s as Side);
  const u = t - i * CROSS_SECONDS;
  const bounce = { x: -s * BOUNCE_X, z: lerp(from.z, to.z, (Math.abs(from.x) + BOUNCE_X) / (Math.abs(from.x) + Math.abs(to.x))) };
  if (u < TO_BOUNCE) {
    const k = Math.max(0, u) / TO_BOUNCE;
    return { x: lerp(from.x, bounce.x, k), y: arc(from.y, ON_TABLE, ARC.over, k), z: lerp(from.z, bounce.z, k), visible: true };
  }
  if (i < rally.hits) {
    const k = Math.min(1, (u - TO_BOUNCE) / (CROSS_SECONDS - TO_BOUNCE));
    return { x: lerp(bounce.x, to.x, k), y: arc(ON_TABLE, to.y, ARC.up, k), z: lerp(bounce.z, to.z, k), visible: true };
  }
  // Missed: wide of the receiver (the side away from their bat), off the end and onto the floor, then rolling away.
  const wide = s * 0.6, drop = { x: -s * (TABLE.hx + 0.6), z: s * 0.6 };
  if (u < TO_BOUNCE + PAST_END) {
    const k = (u - TO_BOUNCE) / PAST_END;
    return { x: lerp(bounce.x, drop.x, k), y: arc(ON_TABLE, BALL_R, ARC.miss, k), z: lerp(bounce.z, wide, k), visible: true };
  }
  const k = Math.min(1, (u - TO_BOUNCE - PAST_END) / ROLL);
  const rolled = 1 - (1 - k) ** 2;
  return { x: drop.x - s * rolled * 0.8, y: BALL_R, z: drop.z, visible: u < TO_BOUNCE + PAST_END + ROLL };
}
