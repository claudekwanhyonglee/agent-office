// Darts (#54): rounds of three throws, then the thrower walks up and pulls them out. A function of
// seconds since the thrower got to the throwing line, so the hand, the flights and the board agree.
import { BREAK_ROOM, type HangoutPlace } from './layout.ts';

export const THROWS = 3;
/** Each throw: aim, let go at RELEASE_AT, fly for FLIGHT seconds into the board. */
export const THROW_EVERY = 2.6;
export const RELEASE_AT = 1.4;
export const FLIGHT = 0.5;
/** After the third throw: walk to the board, pull the darts out, walk back. */
const WALK = 1.0;
const PULL = 0.6;
export const ROUND = THROWS * THROW_EVERY + 2 * WALK + PULL;

/** The board's face (it faces +x, into the room) and how close the thrower walks up to it. */
export const BOARD = { x: BREAK_ROOM.dartboard.x + 0.025, y: 1.6, z: BREAK_ROOM.dartboard.z, r: 0.3 };
export const COLLECT_FROM = 0.55;
/** Where each throw of a round lands on the face: up and along +z from the centre. */
const LANDINGS = [{ up: 0.06, along: -0.09 }, { up: -0.1, along: 0.03 }, { up: 0.03, along: 0.12 }];
/** The hand at the moment of release, in the thrower's own frame (forward is +z, its right is +x). */
export const RELEASE_HAND = { x: 0.25, y: 1.4, z: 0.45 };
/** Darts point along +z; the tip is this far ahead of the dart's origin, the flights this far behind. */
export const DART = { tip: 0.125, tail: 0.065 };

export interface Round {
  /** A dart in the hand, ready to throw. */
  holding: boolean;
  /** The throw in the air and how far along (0–1). */
  flying: { index: number; k: number } | null;
  /** How many darts are stuck in the board. */
  stuck: number;
  /** 0 at the throwing line, 1 up at the board (collecting). */
  walk: number;
}

export function dartsAt(t: number): Round {
  const r = ((t % ROUND) + ROUND) % ROUND;
  const throwing = THROWS * THROW_EVERY;
  if (r >= throwing) {
    const c = r - throwing;
    const walk = c < WALK ? c / WALK : c < WALK + PULL ? 1 : Math.max(0, 1 - (c - WALK - PULL) / WALK);
    return { holding: false, flying: null, stuck: c < WALK + PULL / 2 ? THROWS : 0, walk };
  }
  const index = Math.floor(r / THROW_EVERY), u = r - index * THROW_EVERY;
  const flying = u >= RELEASE_AT && u < RELEASE_AT + FLIGHT ? { index, k: (u - RELEASE_AT) / FLIGHT } : null;
  return { holding: u < RELEASE_AT, flying, stuck: index + (u >= RELEASE_AT + FLIGHT ? 1 : 0), walk: 0 };
}

type Vec = { x: number; y: number; z: number };

/** A point in a thrower's own frame, in the world, for a thrower standing at `place`. */
export function fromThrower(place: HangoutPlace, p: Vec): Vec {
  const sin = Math.sin(place.yaw), cos = Math.cos(place.yaw);
  return { x: place.x + p.x * cos + p.z * sin, y: p.y, z: place.z - p.x * sin + p.z * cos };
}

/** Where throw `i`'s tip goes into the board. */
export const landing = (i: number): Vec => ({ x: BOARD.x, y: BOARD.y + LANDINGS[i].up, z: BOARD.z + LANDINGS[i].along });

/** A dart's origin and pointing direction `k` (0–1) of the way through throw `i` from `place`; at 1 it's stuck. */
export function dartFlight(place: HangoutPlace, i: number, k: number) {
  // The tip starts a dart's length ahead of the hand, along the way it sets off.
  const hand = fromThrower(place, RELEASE_HAND), to = landing(i);
  const lift = 0.15;
  const start = { x: to.x - hand.x, y: to.y - hand.y + 4 * lift, z: to.z - hand.z };
  const len = Math.hypot(start.x, start.y, start.z);
  const from = { x: hand.x + (start.x / len) * DART.tip, y: hand.y + (start.y / len) * DART.tip, z: hand.z + (start.z / len) * DART.tip };
  const at = (s: number) => ({
    x: from.x + (to.x - from.x) * s, y: from.y + (to.y - from.y) * s + 4 * lift * s * (1 - s), z: from.z + (to.z - from.z) * s,
  });
  const tip = at(k), ahead = at(Math.min(1, k + 0.01)), behind = at(Math.max(0, k - 0.01));
  const d = { x: ahead.x - behind.x, y: ahead.y - behind.y, z: ahead.z - behind.z };
  const n = Math.hypot(d.x, d.y, d.z);
  const dir = { x: d.x / n, y: d.y / n, z: d.z / n };
  return { origin: { x: tip.x - dir.x * DART.tip, y: tip.y - dir.y * DART.tip, z: tip.z - dir.z * DART.tip }, dir };
}
