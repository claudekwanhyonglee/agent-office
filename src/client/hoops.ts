// Hoops (#73): a shot every few seconds; the shooter jumps, lets go at the top and the ball arcs
// into the bin, where it stays until the next one lands. A function of seconds since the shooter
// got to the line, so the hands, the ball in them and the ball in the air agree.
import { BREAK_ROOM, HOOPS_LINE, type HangoutPlace, type Point } from './layout.ts';
import { fromThrower } from './darts.ts';

export const SHOT_EVERY = 3;
/** The hands start up at RISE_AT and let go at RELEASE_AT, the top of the jump; the ball lands FLIGHT later. */
const RISE_AT = 0.9;
export const RELEASE_AT = 1.5;
export const FLIGHT = 0.65;
/** The hands back down by then. */
const LOWERED_AT = 2.3;
const LOW = 0.85, HIGH = 1.75, JUMP = 0.25;
/** The hands hold the ball either side of it, in front of the shooter; the ball sits this far above them. */
export const HANDS = { apart: 0.19, forward: 0.3, under: 0.1 };
/** The bin's rim height and radius, and where a ball rests inside it. */
export const BIN = { rim: 0.51, r: 0.2, rest: 0.42 };
/** The ball falls this fast (m/s²) in flight; the hands push it out over the last PUSH seconds before the release (#123). */
const GRAVITY = 14;
const PUSH = 0.2;

/**
 * The ball leaves the hands at the speed it flies at, so its motion carries straight on (#123):
 * forward at the speed that crosses to the bin in FLIGHT, up at the speed that drops it in after FLIGHT.
 */
const LAUNCH_FORWARD = (HOOPS_LINE - HANDS.forward) / (FLIGHT + PUSH / 2);
const RELEASE_FORWARD = HANDS.forward + LAUNCH_FORWARD * PUSH / 2;
const launchUp = (from: number, to: number) => (to - from + GRAVITY * FLIGHT * FLIGHT / 2) / FLIGHT;
const LAUNCH_UP = launchUp(HIGH + JUMP + HANDS.under, BIN.rest);

const smooth = (k: number) => { const c = Math.min(1, Math.max(0, k)); return c * c * (3 - 2 * c); };

/** From LOW at rest to HIGH, arriving going up at LAUNCH_UP (a cubic Hermite curve, `k` 0–1). */
function raiseTo(k: number) {
  const c = Math.min(1, Math.max(0, k));
  return LOW + (HIGH - LOW) * c * c * (3 - 2 * c) + LAUNCH_UP * (RELEASE_AT - RISE_AT) * c * c * (c - 1);
}

/** How far forward the hands are: pushing out at LAUNCH_FORWARD by the release, then easing back. */
function forwardAt(u: number) {
  if (u >= RELEASE_AT) return RELEASE_FORWARD + (HANDS.forward - RELEASE_FORWARD) * smooth((u - RELEASE_AT) / (LOWERED_AT - RELEASE_AT));
  const s = Math.max(0, u - (RELEASE_AT - PUSH));
  return HANDS.forward + (LAUNCH_FORWARD * s * s) / (2 * PUSH);
}

/** The shot `t` seconds in: how high and far forward the hands are and the jump (shooter's frame), and where the ball is. */
export function shotAt(t: number) {
  const u = ((t % SHOT_EVERY) + SHOT_EVERY) % SHOT_EVERY;
  const span = 2 * (RELEASE_AT - RISE_AT);
  const jump = u > RISE_AT && u < RISE_AT + span ? Math.sin(((u - RISE_AT) / span) * Math.PI) * JUMP : 0;
  const raised = u < RELEASE_AT ? raiseTo((u - RISE_AT) / (RELEASE_AT - RISE_AT)) : HIGH - (HIGH - LOW) * smooth((u - RELEASE_AT) / (LOWERED_AT - RELEASE_AT));
  const flying = u >= RELEASE_AT && u < RELEASE_AT + FLIGHT ? (u - RELEASE_AT) / FLIGHT : null;
  return { hands: raised + jump, forward: forwardAt(u), jump, holding: flying == null, flying, landed: u >= RELEASE_AT + FLIGHT };
}

/** The ball between the hands, in the shooter's frame, `t` seconds in. */
export const ballInHands = (t: number) => { const { hands, forward } = shotAt(t); return { x: 0, y: hands + HANDS.under, z: forward }; };

/** The ball `k` (0–1) of the way through its FLIGHT from the hands at release to resting in the bin at `bin`: a throw under gravity. */
export function ballFlight(place: HangoutPlace, k: number, bin: Point = BREAK_ROOM.bin) {
  const from = fromThrower(place, ballInHands(RELEASE_AT)), to = { x: bin.x, y: BIN.rest, z: bin.z };
  const s = k * FLIGHT;
  return { x: from.x + (to.x - from.x) * k, y: from.y + launchUp(from.y, to.y) * s - GRAVITY * s * s / 2, z: from.z + (to.z - from.z) * k };
}
