// Fishing (#58): a cast as a function of seconds since it began. The rod swings back and forward,
// the float flies out and lands with a ripple, then bobs; on some casts (the controller decides,
// with its injectable random) one of the pond's fish comes over, bites, is lifted out over the
// jetty for a moment, and drops back in.
import { BREAK_ROOM, type HangoutPlace, type Point } from './layout.ts';
import { fishAt } from './water.ts';

export interface Cast { landing: Point; fish: number | null }
export interface Vec { x: number; y: number; z: number }

export const CAST_SECONDS = 9;
/** The rod hand, in the angler's own frame (forward +z, right +x), and the rod's length. */
export const ROD_HAND: Vec = { x: 0.1, y: 0.82, z: 0.45 };
export const ROD_LENGTH = 1.6;
const SURFACE = 0.03;
const LINE_DROP = 0.5;

/** Timeline of a cast, in seconds. The float lets go as the rod comes over the top, its tip still rising (#84). */
export const T = { back: 0.6, forward: 0.9, release: 0.66, landed: 1.6, ripple: 1.5, alert: 3, reached: 5, lift: 5.6, lifted: 6.2, drop: 7.4, back_in: 8.4, reel: 8.4 };
/** Rod angle above level: resting, drawn back over the shoulder, and lifted with a fish. */
const PITCH = { rest: 0.5, back: 1.9, lift: 1.66 };

const lerp = (a: number, b: number, k: number) => a + (b - a) * Math.min(1, Math.max(0, k));
const smooth = (k: number) => { const c = Math.min(1, Math.max(0, k)); return c * c * (3 - 2 * c); };
const mix = (a: Vec, b: Vec, k: number): Vec => ({ x: lerp(a.x, b.x, k), y: lerp(a.y, b.y, k), z: lerp(a.z, b.z, k) });

/** The rod's angle above level `t` seconds into a cast. */
export function rodPitch(cast: Cast, t: number) {
  if (t < T.back) return lerp(PITCH.rest, PITCH.back, smooth(t / T.back));
  if (t < T.forward) return lerp(PITCH.back, PITCH.rest, smooth((t - T.back) / (T.forward - T.back)));
  if (cast.fish == null || t < T.lift) return PITCH.rest;
  if (t < T.drop) return lerp(PITCH.rest, PITCH.lift, smooth((t - T.lift) / (T.lifted - T.lift)));
  return lerp(PITCH.lift, PITCH.rest, smooth((t - T.drop) / (T.back_in - T.drop)));
}

/** A point in the angler's own frame, in the world. */
export function fromAngler(place: HangoutPlace, p: Vec): Vec {
  const sin = Math.sin(place.yaw), cos = Math.cos(place.yaw);
  return { x: place.x + p.x * cos + p.z * sin, y: p.y, z: place.z - p.x * sin + p.z * cos };
}

export const rodTip = (place: HangoutPlace, pitch: number) =>
  fromAngler(place, { x: ROD_HAND.x, y: ROD_HAND.y + ROD_LENGTH * Math.sin(pitch), z: ROD_HAND.z + ROD_LENGTH * Math.cos(pitch) });

export interface CastFrame {
  tip: Vec;
  /** The float, or null while a fish is hooked. */
  float: Vec | null;
  /** Where the line goes from the rod tip: the float, or the hooked fish. */
  lineEnd: Vec;
  ripple: { x: number; z: number; radius: number; opacity: number } | null;
  /** The fish taking part in a catch: where it is, which way it faces, and whether it shows "!!". */
  fish: { index: number; at: Vec; heading: number; alert: boolean } | null;
}

/** Everything about a cast by an angler at `place`, `t` seconds after it began (cast at `start` seconds on the pond's clock). */
export function castAt(cast: Cast, t: number, place: HangoutPlace, start = 0): CastFrame {
  const tip = rodTip(place, rodPitch(cast, t));
  const landing = { x: cast.landing.x, y: SURFACE, z: cast.landing.z };
  const hanging = (pitchTip: Vec): Vec => ({ x: pitchTip.x, y: pitchTip.y - LINE_DROP, z: pitchTip.z });
  const bobbing = { ...landing, y: SURFACE + Math.sin((t - T.landed) * 3) * 0.015 };
  let float: Vec | null;
  if (t < T.release) float = hanging(tip);
  else if (t < T.landed) float = flight(cast, place, landing, t - T.release); else if (cast.fish == null) float = t < T.reel ? bobbing : mix(landing, hanging(tip), smooth((t - T.reel) / (CAST_SECONDS - T.reel)));
  else if (t < T.reached) float = bobbing;
  else if (t < T.lift) float = { ...landing, y: SURFACE - 0.06 - Math.abs(Math.sin(t * 12)) * 0.03 }; // the bite: the float dips
  else if (t < T.drop) float = null; // hooked: the line runs to the fish
  else float = hanging(tip);

  let fish: CastFrame['fish'] = null;
  if (cast.fish != null && t >= T.alert && t < CAST_SECONDS) {
    const index = cast.fish;
    const natural = (s: number) => { const f = fishAt(index, start + s); return { at: { x: f.x, y: f.y, z: f.z }, heading: f.heading }; };
    const nearFloat = { x: landing.x, y: -0.1, z: landing.z };
    const hooked = hanging(tip);
    let at: Vec, heading: number;
    if (t < T.reached) {
      const from = natural(T.alert).at;
      at = mix(from, nearFloat, smooth((t - T.alert) / (T.reached - T.alert)));
      heading = Math.atan2(nearFloat.x - from.x, nearFloat.z - from.z);
    } else if (t < T.lift) {
      at = nearFloat;
      heading = 0;
    } else if (t < T.drop) {
      at = mix(nearFloat, hooked, smooth((t - T.lift) / (T.lifted - T.lift)));
      heading = 0;
    } else {
      const back = natural(T.back_in), k = smooth((t - T.drop) / (T.back_in - T.drop));
      at = { ...mix(hooked, back.at, k), y: lerp(hooked.y, back.at.y, k) + 4 * 0.3 * k * (1 - k) };
      heading = back.heading;
      if (t >= T.back_in) ({ at, heading } = natural(t));
    }
    fish = { index, at, heading, alert: t < T.reached };
  }
  const ripple = t >= T.landed && t < T.landed + T.ripple
    ? { x: landing.x, z: landing.z, radius: 0.08 + 0.5 * ((t - T.landed) / T.ripple), opacity: 0.8 * (1 - (t - T.landed) / T.ripple) }
    : null;
  return { tip, float, lineEnd: float ?? fish!.at, ripple, fish };
}

/**
 * The float `s` seconds after release (#84): it leaves with the rod tip's vertical speed and falls
 * under the one constant gravity that brings it down on the landing point at T.landed; across, it
 * goes straight there at a steady speed.
 */
function flight(cast: Cast, place: HangoutPlace, landing: Vec, s: number): Vec {
  const tipY = (t: number) => rodTip(place, rodPitch(cast, t)).y;
  const from = { ...rodTip(place, rodPitch(cast, T.release)), y: tipY(T.release) - LINE_DROP };
  const vy = (tipY(T.release) - tipY(T.release - 1e-3)) / 1e-3, d = T.landed - T.release;
  const gravity = (2 * (from.y + vy * d - landing.y)) / (d * d);
  return { ...mix(from, landing, s / d), y: from.y + vy * s - (gravity / 2) * s * s };
}

/** Landing points stay in the pond, beyond the jetty's end and in the rod's reach. */
export function landingFrom(random: () => number): Point {
  const { pond, jetty } = BREAK_ROOM;
  for (;;) {
    const p = { x: jetty.x - jetty.w / 2 - 0.5 - random() * 1.6, z: pond.z - 0.7 + random() * 1.4 };
    if (((p.x - pond.x) / pond.rx) ** 2 + ((p.z - pond.z) / pond.rz) ** 2 < 0.6) return p;
  }
}
