import * as THREE from 'three';
import type { OfficeState } from '../shared/agent.ts';
import { at, ball, cyl, mesh, tag } from './toon.ts';
import type { Look, HatKind } from './look.ts';
import { WALK_SPEED, type HangoutPlace, type HangoutPose, type Point, type SeatSpot } from './layout.ts';
import { POSES, type BubbleKind, type Pose } from './poses.ts';
import { bubbleTexture } from './bubbles.ts';
import { HIT, hitTimes, type Rally, type Side } from './pong.ts';
import { BOARD, COLLECT_FROM, RELEASE_AT, RELEASE_HAND, ROUND, THROWS, THROW_EVERY, dartsAt } from './darts.ts';

const SEAT_Y = 0.38;
const WOOD_DARK = '#8C6A4A';
const INK_DARK = '#3A3150';
const HIGH_FIVE_SECONDS = 1.2;
const HOP_SECONDS = 0.45;
/** A leaving agent's bubble grows for this long, then vanishes (#49). */
const POP_SECONDS = 0.2;
/** Pool (#53): the cue is held level this high, over the playing surface (0.835 m); the bridge hand stops short of the table's edge, 0.85 m ahead. */
const CUE_Y = 0.9;
const BRIDGE = 0.62;
const UP = new THREE.Vector3(0, 1, 0);
const BUBBLE_SIZE = 0.72;
const REDUCED_MOTION = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const motion = REDUCED_MOTION ? 0.35 : 1;

/** `hanging` is an idle agent at a hangout place (see `place`). */
export type Mode = 'seated' | 'standing' | 'hanging' | 'walking' | 'hopping' | 'exiting' | 'gone';

const vec = (p: Point, y = 0) => new THREE.Vector3(p.x, y, p.z);

function lerpAngle(a: number, b: number, k: number) {
  let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * k;
}

/** A prototype-style cartoon agent. Builds without a DOM; speech bubbles appear when a canvas is available. */
export class Character {
  readonly root = new THREE.Group();
  mode: Mode = 'seated';
  state: OfficeState = 'working';
  bubbleKind: BubbleKind | null = null;
  seat?: SeatSpot;
  place: HangoutPlace | null = null;

  private pivot = new THREE.Group();
  readonly head = new THREE.Group();
  private eyes: THREE.Mesh[];
  private hands: THREE.Mesh[];
  private feet: THREE.Mesh[];
  private mug = new THREE.Group();
  private snack: THREE.Mesh;
  /** Things held in the right hand for one pose: a fishing rod, dart, ball or paper plane. */
  private held = heldProps();
  readonly bubble: THREE.Sprite;
  private path: THREE.Vector3[] = [];
  private onArrive?: () => void;
  private hopTween?: { from: THREE.Vector3; to: THREE.Vector3; fromYaw: number; yaw: number; k: number; then: () => void };
  private blinkAt = 1 + Math.random() * 3;
  private seed = Math.random() * 10;
  private walkPhase = 0;
  private exitK = 0;
  private scale = 1;
  private growing = false;
  /** Seconds left of a raised-hand high five (#33). */
  private highFiving = 0;
  /** The table-tennis rally this agent is playing (#70): which end it's at, and seconds into the rally. */
  private rally: { rally: Rally; side: Side; t: number } | null = null;
  /** Seconds since the agent got to its hangout place. */
  private placeTime = 0;
  /** Seconds since the agent started leaving; its bubble pops, then stays gone (#49). */
  private leftFor: number | null = null;

  constructor(look: Look) {
    this.root.add(this.pivot);
    const body = mesh(new THREE.CapsuleGeometry(0.36, 0.3, 8, 20), look.shirt);
    body.position.y = 0.53;
    body.scale.set(1, 1, 0.92);
    this.pivot.add(body);
    const apron = mesh(new THREE.CapsuleGeometry(0.3, 0.12, 6, 16), '#FFF8EC', { outline: 0.03 });
    apron.position.set(0, 0.42, 0.12);
    apron.scale.set(0.95, 0.9, 0.7);
    this.pivot.add(apron);

    this.head.position.y = 1.27;
    this.pivot.add(this.head);
    this.head.add(ball(0.38, look.skin));
    this.eyes = [-1, 1].map((side) => {
      const eye = at(new THREE.Mesh(new THREE.SphereGeometry(0.055, 16, 12), new THREE.MeshBasicMaterial({ color: '#241C2F' })), 0.13 * side, 0.04, 0.345);
      eye.scale.set(0.85, 1.25, 0.5);
      eye.add(at(new THREE.Mesh(new THREE.SphereGeometry(0.018, 8, 6), new THREE.MeshBasicMaterial({ color: '#FFFFFF' })), 0.015, 0.02, 0.04));
      this.head.add(eye);
      return eye;
    });
    for (const side of [-1, 1]) {
      const cheek = at(new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 8), new THREE.MeshBasicMaterial({ color: '#F49AA0' })), 0.23 * side, -0.08, 0.3);
      cheek.scale.set(1.3, 0.75, 0.4);
      this.head.add(cheek);
    }
    const mouth = at(new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.014, 6, 12, Math.PI), new THREE.MeshBasicMaterial({ color: '#241C2F' })), 0, -0.1, 0.365);
    mouth.rotation.z = Math.PI;
    this.head.add(mouth);
    this.head.add(hat(look.hat, look.hatColor));

    this.hands = [0, 1].map(() => {
      const hand = ball(0.12, look.skin, { outline: 0.08 });
      this.root.add(hand);
      return hand;
    });
    this.feet = [0, 1].map(() => {
      const foot = ball(0.12, '#3A3150', { outline: 0.08 });
      foot.scale.set(1, 0.6, 1.35);
      this.root.add(foot);
      return foot;
    });

    this.mug.add(cyl(0.08, 0.07, 0.15, '#FFFFFF', { outline: 0.08 }));
    const handle = mesh(new THREE.TorusGeometry(0.045, 0.015, 6, 12), '#FFFFFF', { outline: 0.1 });
    handle.position.x = 0.09;
    this.mug.add(handle);
    this.mug.position.set(0.04, 0.1, 0.06);
    this.hands[1].add(this.mug);
    this.snack = mesh(new THREE.BoxGeometry(0.2, 0.08, 0.14), '#E2B347', { outline: 0.06 });
    this.snack.position.set(-0.02, 0.1, 0.06);
    this.hands[0].add(this.snack);
    for (const prop of Object.values(this.held)) this.hands[1].add(prop);

    this.bubble = new THREE.Sprite(new THREE.SpriteMaterial({ depthTest: false, transparent: true }));
    this.bubble.center.set(0.5, 0);
    this.bubble.scale.set(BUBBLE_SIZE, BUBBLE_SIZE, 1);
    this.bubble.renderOrder = 10;
    this.root.add(this.bubble);
  }

  get pose(): Pose | HangoutPose | 'walking' {
    if (this.mode === 'seated') return POSES[this.state].pose;
    if (this.mode === 'standing') return 'standing';
    if (this.mode === 'hanging') return this.place!.pose;
    return 'walking';
  }

  /** Place straight at the desk (agents already there when the page opens). */
  sitAt(seat: SeatSpot, state: OfficeState) {
    this.seat = seat;
    this.state = state;
    this.settle();
  }

  /** Place straight at a hangout spot (idle agents already there when the page opens). */
  placeAt(seat: SeatSpot, state: OfficeState, place: HangoutPlace) {
    this.seat = seat;
    this.state = state;
    this.hangAt(place);
  }

  /** Walk along `path` to a hangout `place`, or back to the desk when it's null. */
  go(path: Point[], place: HangoutPlace | null) {
    if (!place) this.setOff(path, path.length - 1, () => this.hopToPlace());
    else if (place.sits) this.setOff(path, path.length - 1, () => this.hop(vec(place, SEAT_Y), place.yaw, () => this.hangAt(place)));
    else this.setOff(path, path.length, () => this.hangAt(place));
  }

  /** Walk in from the door along `path` (which ends at the seat), then sit down. */
  arrive(seat: SeatSpot, state: OfficeState, path: Point[]) {
    this.seat = seat;
    this.state = state;
    this.root.position.copy(vec(path[0]));
    this.scale = 0.01;
    this.growing = true;
    this.walk(path.slice(1, -1), () => this.hopToPlace());
  }

  setState(state: OfficeState) {
    this.state = state;
    if (this.mode === 'seated' && state === 'finished') this.hopToPlace();
    else if (this.mode === 'standing' && state !== 'finished') this.hopToPlace();
  }

  /** A table-tennis rally starts now, with this agent at end `side` (#70); null: play stopped. */
  playRally(rally: Rally | null, side: Side) {
    this.rally = rally && { rally, side, t: 0 };
  }

  /** At the darts line (#54): where, and seconds since arriving there (the board's darts follow it). */
  dartsThrower() {
    return this.mode === 'hanging' && this.place?.pose === 'throwing-darts' ? { place: this.place, t: this.placeTime } : null;
  }

  /** Raise a hand for a high five (#33), whatever the agent is doing. */
  highFive() {
    this.highFiving = HIGH_FIVE_SECONDS;
  }

  /** Walk out along `path` (from wherever the agent is to the door), then disappear. */
  leave(path: Point[]) {
    this.leftFor = 0;
    this.setOff(path, path.length, () => { this.mode = 'exiting'; this.exitK = 0; });
  }

  /**
   * Start along `path` (whose first point is where the agent is, or a point behind it on the leg
   * it's walking) and walk up to point `end`: hop off a chair or sofa first, or turn round mid-walk.
   */
  private setOff(path: Point[], end: number, then: () => void) {
    const walkFrom = (from: number) => this.walk(path.slice(from, end), then);
    const offFurniture = this.mode === 'seated' || this.mode === 'standing' || (this.mode === 'hanging' && this.place!.sits);
    if (offFurniture) this.hop(vec(path[1] ?? path[0]), this.root.rotation.y, () => walkFrom(2));
    else if (this.mode === 'hanging') walkFrom(1);
    else if (this.mode === 'hopping') this.hopTween!.then = () => walkFrom(0);
    else walkFrom(0);
    this.place = null;
    this.rally = null;
  }

  private hangAt(place: HangoutPlace) {
    this.place = place;
    this.mode = 'hanging';
    this.placeTime = 0;
    this.root.position.copy(vec(place, place.sits ? SEAT_Y : 0));
    this.root.rotation.y = place.yaw;
  }

  private settle() {
    const seat = this.seat!;
    const standing = this.state === 'finished';
    this.mode = standing ? 'standing' : 'seated';
    this.root.position.copy(standing ? vec(seat.standSpot) : vec(seat.sit, SEAT_Y));
    this.root.rotation.y = standing ? 0 : seat.yaw;
  }

  private hopToPlace() {
    const seat = this.seat!;
    const standing = this.state === 'finished';
    this.hop(standing ? vec(seat.standSpot) : vec(seat.sit, SEAT_Y), standing ? 0 : seat.yaw, () => this.settle());
  }

  private hop(to: THREE.Vector3, yaw: number, then: () => void) {
    this.mode = 'hopping';
    this.hopTween = { from: this.root.position.clone(), to, fromYaw: this.root.rotation.y, yaw, k: 0, then };
  }

  private walk(points: Point[], then: () => void) {
    this.mode = 'walking';
    this.path = points.map((p) => vec(p));
    this.onArrive = then;
  }

  update(t: number, dt: number) {
    if (this.mode === 'gone') return;
    const p = this.pivot, head = this.head, [hl, hr] = this.hands, [fl, fr] = this.feet;
    const tt = t + this.seed;
    p.position.set(0, 0, 0);
    p.rotation.set(0, 0, 0);
    p.scale.set(1, 1, 1);
    head.rotation.set(0, 0, 0);
    this.mug.visible = false;
    this.snack.visible = false;
    for (const prop of Object.values(this.held)) prop.visible = false;
    // Every agent keeps its state's bubble, wherever it is, until it pops on leaving.
    if (this.leftFor != null) this.leftFor += dt;
    const popping = this.leftFor != null && this.leftFor < POP_SECONDS;
    const bubble: BubbleKind | null = this.leftFor == null || popping ? POSES[this.state].bubble : null;
    this.bubble.scale.setScalar(BUBBLE_SIZE * (popping ? 1 + (this.leftFor! / POP_SECONDS) * 0.5 : 1));
    let bubbleY = 2.2;

    this.blinkAt -= dt;
    const blinking = this.blinkAt < 0;
    if (this.blinkAt < -0.12) this.blinkAt = 2 + Math.random() * 4;
    this.eyes.forEach((e) => { e.scale.y = blinking ? 0.15 : 1.25; });

    if (this.growing) {
      this.scale = Math.min(1, this.scale + dt * 2.5);
      if (this.scale >= 1) this.growing = false;
    }
    if (this.mode === 'walking' || this.mode === 'hopping' || this.mode === 'exiting') this.locomote(dt);

    if (this.mode === 'seated') {
      fl.position.set(-0.16, -0.24, 0.34);
      fr.position.set(0.16, -0.24, 0.34);
      const pose = POSES[this.state].pose;
      if (pose === 'typing') {
        p.position.y = Math.sin(tt * 9) * 0.012 * motion;
        head.rotation.x = 0.14 + Math.sin(tt * 1.3) * 0.04 * motion;
        head.rotation.y = Math.sin(tt * 0.7) * 0.08 * motion;
        hl.position.set(-0.2, 0.5 + Math.max(0, Math.sin(tt * 15)) * 0.07 * motion, 0.62);
        hr.position.set(0.2, 0.5 + Math.max(0, Math.sin(tt * 15 + Math.PI)) * 0.07 * motion, 0.62);
      } else if (pose === 'waving') {
        p.rotation.z = Math.sin(tt * 3) * 0.07 * motion;
        head.rotation.z = Math.sin(tt * 3) * 0.08 * motion;
        head.rotation.x = -0.12;
        hl.position.set(-0.22, 0.5, 0.58);
        hr.position.set(0.44 + Math.sin(tt * 10) * 0.09 * motion, 1.62 + Math.abs(Math.sin(tt * 10)) * 0.04, 0.12);
        bubbleY = 2.3 + Math.abs(Math.sin(tt * 3.2)) * 0.12 * motion;
      } else if (pose === 'sipping') {
        p.rotation.x = -0.2;
        const sipping = (tt % 6) / 6 < 0.22;
        head.rotation.x = sipping ? -0.28 : -0.05;
        hl.position.set(-0.32, 0.45, 0.28);
        hr.position.lerp(sipping ? new THREE.Vector3(0.1, 1.08, 0.42) : new THREE.Vector3(0.34, 0.62, 0.36), Math.min(1, dt * 8));
        this.mug.visible = true;
        bubbleY = 2.2 + Math.sin(tt * 1.6) * 0.04 * motion;
      } else if (pose === 'slumped') {
        p.rotation.x = 0.42;
        p.scale.y = 1 + Math.sin(tt * 1.4) * 0.025 * motion;
        head.rotation.x = 0.4;
        head.rotation.z = 0.25;
        hl.position.set(-0.38, 0.48, 0.6);
        hr.position.set(0.38, 0.48, 0.6);
        bubbleY = 2.0 + ((tt * 0.25) % 1) * 0.25 * motion;
      }
    } else if (this.mode === 'standing') {
      const hopT = (tt % 3.2) / 3.2;
      const hopY = hopT < 0.16 ? Math.sin((hopT / 0.16) * Math.PI) * 0.22 * motion : 0;
      this.root.position.y = hopY;
      p.scale.y = hopT > 0.16 && hopT < 0.22 ? 0.92 : 1;
      hl.position.set(-0.47, 0.6 + hopY * 0.6, 0.06);
      hr.position.set(0.47, 0.6 + hopY * 0.6 + (hopY > 0 ? 0.25 : 0), 0.06);
      fl.position.set(-0.17, 0.06, 0.04);
      fr.position.set(0.17, 0.06, 0.04);
      head.rotation.x = -0.1;
      bubbleY = 2.15 + hopY;
    } else if (this.mode === 'hanging') {
      bubbleY = this.hangingPose(this.place!, tt, dt);
    }

    if (this.highFiving > 0) {
      this.highFiving -= dt;
      hr.position.set(0.3, 1.8 + Math.sin(this.highFiving * 12) * 0.05 * motion, 0.25);
    }

    this.bubbleKind = bubble;
    const texture = bubble && bubbleTexture(bubble);
    this.bubble.visible = !!texture;
    if (texture) {
      this.bubble.material.map = texture;
      this.bubble.material.needsUpdate = true;
      this.bubble.position.set(0.32, bubbleY, 0);
    }
    this.root.scale.setScalar(this.scale);
  }

  /** Poses at a hangout place; returns the bubble height. */
  private hangingPose(place: HangoutPlace, tt: number, dt: number) {
    const p = this.pivot, head = this.head, [hl, hr] = this.hands, [fl, fr] = this.feet;
    this.placeTime += dt;
    this.root.rotation.y = lerpAngle(this.root.rotation.y, place.yaw, Math.min(1, dt * 8));
    if (place.pose === 'throwing-darts') this.collectDarts(place);
    if (place.pose === 'lounging') {
      fl.position.set(-0.16, -0.24, 0.34);
      fr.position.set(0.16, -0.24, 0.34);
      p.rotation.x = -0.28;
      head.rotation.x = -0.1 + Math.sin(tt * 0.8) * 0.05 * motion;
      hl.position.set(-0.4, 0.42, 0.2);
      hr.position.set(0.34, 0.62, 0.36);
      this.mug.visible = true;
      return 2.1;
    }
    fl.position.set(-0.17, 0.06, 0.04);
    fr.position.set(0.17, 0.06, 0.04);
    const activity = ACTIVITY_POSES[place.pose];
    if (activity) {
      const held = this.held[place.pose];
      if (held) held.visible = true;
      if (this.rally) this.rally.t += dt;
      return activity({ pivot: p, head, hands: this.hands, feet: this.feet, held, rally: this.rally, placeTime: this.placeTime }, tt);
    }
    if (place.pose === 'chatting') {
      const talk = Math.sin(tt * 6);
      p.position.y = Math.abs(Math.sin(tt * 3)) * 0.03 * motion;
      head.rotation.x = Math.sin(tt * 2.4) * 0.12 * motion;
      head.rotation.z = Math.sin(tt * 1.3) * 0.08 * motion;
      hl.position.set(-0.42, 0.75 + Math.max(0, talk) * 0.18 * motion, 0.22);
      hr.position.set(0.42, 0.75 + Math.max(0, -talk) * 0.18 * motion, 0.22);
    } else {
      const eating = place.pose === 'eating';
      const bite = (tt % 4) / 4 < 0.25;
      const hand = eating ? hl : hr;
      (eating ? hr : hl).position.set(eating ? 0.47 : -0.47, 0.6, 0.06);
      hand.position.lerp(bite ? new THREE.Vector3(eating ? -0.1 : 0.1, 1.08, 0.42) : new THREE.Vector3(eating ? -0.36 : 0.36, 0.66, 0.34), Math.min(1, dt * 8));
      head.rotation.x = bite ? -0.2 : 0;
      (eating ? this.snack : this.mug).visible = true;
    }
    return 2.2 + Math.sin(tt * 1.6) * 0.04 * motion;
  }

  /** Darts (#54): after a round, walk up to the board to pull the darts out, then back to the line. */
  private collectDarts(place: HangoutPlace) {
    const walk = dartsAt(this.placeTime).walk;
    const back = dartsAt(this.placeTime + 0.05).walk < walk;
    const to = BOARD.x + COLLECT_FROM;
    this.root.position.set(place.x + (to - place.x) * walk, 0, place.z);
    if (walk > 0) this.root.rotation.y = back ? place.yaw + Math.PI : place.yaw;
  }

  private locomote(dt: number) {
    const p = this.pivot, [hl, hr] = this.hands, [fl, fr] = this.feet;
    if (this.mode === 'hopping') {
      const w = this.hopTween!;
      w.k = Math.min(1, w.k + dt / HOP_SECONDS);
      const e = w.k < 0.5 ? 2 * w.k * w.k : 1 - Math.pow(-2 * w.k + 2, 2) / 2;
      this.root.position.lerpVectors(w.from, w.to, e);
      this.root.position.y += Math.sin(w.k * Math.PI) * 0.45;
      this.root.rotation.y = lerpAngle(w.fromYaw, w.yaw, e);
      p.scale.set(1 - Math.sin(w.k * Math.PI) * 0.06, 1 + Math.sin(w.k * Math.PI) * 0.1, 1);
      hl.position.set(-0.5, 0.95, 0.05);
      hr.position.set(0.5, 0.95, 0.05);
      fl.position.set(-0.17, 0.04, 0.04);
      fr.position.set(0.17, 0.04, 0.04);
      if (w.k >= 1) w.then();
      return;
    }
    if (this.mode === 'exiting') {
      this.exitK += dt / 0.5;
      this.scale = Math.max(0, 1 - this.exitK);
      this.root.position.z -= dt * 0.8;
      if (this.exitK >= 1) { this.mode = 'gone'; this.root.visible = false; }
      return;
    }
    const target = this.path[0];
    if (!target) {
      const then = this.onArrive;
      this.onArrive = undefined;
      then?.();
      return;
    }
    const pos = this.root.position;
    const dx = target.x - pos.x, dz = target.z - pos.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.05) {
      this.path.shift();
      return;
    }
    const step = Math.min(dist, WALK_SPEED * dt);
    pos.x += (dx / dist) * step;
    pos.z += (dz / dist) * step;
    this.root.rotation.y = lerpAngle(this.root.rotation.y, Math.atan2(dx, dz), Math.min(1, dt * 10));
    this.walkPhase += dt * 11;
    const s = Math.sin(this.walkPhase);
    pos.y = Math.abs(s) * 0.09 * motion;
    p.rotation.z = s * 0.09 * motion;
    p.rotation.x = 0.08;
    fl.position.set(-0.17, 0.06 + Math.max(0, s) * 0.1, 0.04 + s * 0.16);
    fr.position.set(0.17, 0.06 + Math.max(0, -s) * 0.1, 0.04 - s * 0.16);
    hl.position.set(-0.47, 0.6, 0.06 - s * 0.2);
    hr.position.set(0.47, 0.6, 0.06 + s * 0.2);
  }
}

function hat(kind: HatKind, color: string) {
  const g = new THREE.Group();
  const dome = (r: number, frac: number, c: string) =>
    mesh(new THREE.SphereGeometry(r, 24, 12, 0, Math.PI * 2, 0, Math.PI * frac), c, { outline: 0.04 });
  if (kind === 'headphones') {
    g.add(at(dome(0.395, 0.42, '#4A3A2E'), 0, 0.01, 0));
    g.add(mesh(new THREE.TorusGeometry(0.41, 0.045, 8, 32, Math.PI), color, { outline: 0.06 }));
    for (const side of [-1, 1]) {
      const cup = at(cyl(0.12, 0.12, 0.1, color, { outline: 0.06 }), 0.41 * side, 0, 0);
      cup.rotation.z = Math.PI / 2;
      g.add(cup);
    }
  } else if (kind === 'cap') {
    g.add(at(dome(0.405, 0.5, color), 0, 0.03, 0));
    const brim = at(cyl(0.26, 0.26, 0.04, color, { outline: 0.06 }), 0, 0.08, 0.34);
    brim.scale.set(1, 1, 0.8);
    g.add(brim);
    g.add(at(ball(0.05, '#FFFFFF', { outline: 0.1 }), 0, 0.43, 0));
  } else if (kind === 'beanie') {
    g.add(at(dome(0.415, 0.5, color), 0, 0.02, 0));
    const rim = mesh(new THREE.TorusGeometry(0.39, 0.07, 10, 32), '#FFF8EC', { outline: 0.05 });
    rim.rotation.x = Math.PI / 2;
    rim.position.y = 0.06;
    g.add(rim);
    g.add(at(ball(0.1, '#FFF8EC'), 0, 0.46, 0));
  } else if (kind === 'chef') {
    g.add(at(cyl(0.3, 0.27, 0.32, '#FFFFFF'), 0, 0.42, 0));
    for (const [x, y, z, r] of [[0, 0.66, 0, 0.2], [0.17, 0.62, 0.05, 0.16], [-0.17, 0.62, 0.05, 0.16], [0, 0.62, -0.16, 0.16]]) {
      g.add(at(ball(r, '#FFFFFF'), x, y, z));
    }
  } else if (kind === 'tuft') {
    g.add(at(dome(0.395, 0.45, color), 0, 0.01, 0));
    for (const [x, y, z, r] of [[0, 0.4, 0.12, 0.09], [0.08, 0.43, 0.05, 0.08], [-0.07, 0.42, 0.02, 0.07]]) {
      g.add(at(ball(r, color), x, y, z));
    }
  } else {
    g.add(at(dome(0.4, 0.5, color), 0, 0.01, 0));
    g.add(at(ball(0.16, color), 0, 0.46, -0.12));
  }
  return g;
}

interface Body {
  pivot: THREE.Group; head: THREE.Group; hands: THREE.Mesh[]; feet: THREE.Mesh[]; held?: THREE.Object3D;
  rally?: { rally: Rally; side: Side; t: number } | null;
  /** Seconds since arriving at the place. */
  placeTime?: number;
}

/** Darts (#54): the throwing hand while aiming, drawn back just before the release, and at the release. */
const AIM_HAND = new THREE.Vector3(0.25, 1.45, 0.15);
const DRAWN_HAND = new THREE.Vector3(0.25, 1.5, -0.05);
const THROWN_HAND = new THREE.Vector3(RELEASE_HAND.x, RELEASE_HAND.y, RELEASE_HAND.z);

/** The throwing hand `u` seconds into a throw: aim, draw back, snap forward to let go, follow through, back to aim. */
function dartHand(u: number) {
  const ease = (k: number) => k * k * (3 - 2 * k);
  const from = (a: THREE.Vector3, b: THREE.Vector3, k: number) => a.clone().lerp(b, ease(Math.min(1, Math.max(0, k))));
  if (u < RELEASE_AT - 0.3) return AIM_HAND.clone();
  if (u < RELEASE_AT - 0.12) return from(AIM_HAND, DRAWN_HAND, (u - (RELEASE_AT - 0.3)) / 0.18);
  if (u < RELEASE_AT) return DRAWN_HAND.clone().lerp(THROWN_HAND, (u - (RELEASE_AT - 0.12)) / 0.12);
  if (u < RELEASE_AT + 0.4) return THROWN_HAND.clone();
  return from(THROWN_HAND, AIM_HAND, (u - RELEASE_AT - 0.4) / 0.4);
}

/** Table tennis (#70): the bat's blade sits this far from the hand; a swing takes SWING seconds, centred on the hit. */
const BLADE = new THREE.Vector3(0, 0.2, 0.05);
const SWING = 0.3;
const WIND = 0.25;
/** The hand when the blade is where the ball is hit, and when waiting between hits. */
const CONTACT = new THREE.Vector3(HIT.side, HIT.y, HIT.reach).sub(BLADE);
const READY = new THREE.Vector3(0.35, 0.8, 0.05);

/** The bat hand during a rally: ready, then back, forward through the ball at each hit, and back to ready. */
function batHand({ rally, side, t }: { rally: Rally; side: Side; t: number }) {
  const back = CONTACT.clone().setZ(CONTACT.z - WIND), through = CONTACT.clone().setZ(CONTACT.z + WIND);
  const d = hitTimes(rally, side).map((h) => t - h).reduce((a, b) => (Math.abs(b) < Math.abs(a) ? b : a), Infinity);
  const smooth = (k: number) => k * k * (3 - 2 * k);
  if (Math.abs(d) <= SWING / 2) return back.lerp(through, d / SWING + 0.5);
  if (d < 0 && d > -SWING / 2 - 0.25) return READY.clone().lerp(back, smooth((d + SWING / 2 + 0.25) / 0.25));
  if (d > 0 && d < SWING / 2 + 0.25) return through.lerp(READY, smooth((d - SWING / 2) / 0.25));
  return READY.clone();
}

/** A throw every `period` seconds: 0 → 1 while winding up and letting go, then 0 while waiting. */
const throwPhase = (tt: number, period: number) => Math.min(1, ((tt % period) / period) * 3);

/** Break-room poses (#30); each sets the body and returns the bubble height. */
const ACTIVITY_POSES: Partial<Record<HangoutPose, (b: Body, tt: number) => number>> = {
  'lounging-sun': ({ pivot, head, hands: [hl, hr], feet: [fl, fr] }, tt) => {
    pivot.rotation.x = -1.15;
    pivot.position.set(0, 0.05, 0.35);
    head.rotation.x = 0.5 + Math.sin(tt * 0.5) * 0.04 * motion;
    hl.position.set(-0.32, 0.45, -0.75);
    hr.position.set(0.32, 0.45, -0.75);
    fl.position.set(-0.15, 0.02, 0.8);
    fr.position.set(0.15, 0.02, 0.8);
    return 1.4;
  },
  swinging: ({ pivot, head, hands: [hl, hr], feet: [fl, fr] }, tt) => {
    const sway = Math.sin(tt * 1.3) * 0.15 * motion;
    pivot.rotation.set(-1.3, 0, sway);
    pivot.position.set(sway * 0.6, 0.25, 0.4);
    head.rotation.x = 0.6;
    hl.position.set(-0.35, 0.55, -0.6);
    hr.position.set(0.35, 0.55, -0.6);
    fl.position.set(-0.15 + sway * 0.6, 0.45, 0.85);
    fr.position.set(0.15 + sway * 0.6, 0.45, 0.85);
    return 1.6;
  },
  bouncing: ({ pivot, head, hands: [hl, hr], feet: [fl, fr] }, tt) => {
    const k = Math.abs(Math.sin(tt * 3.4));
    const y = 0.12 + k * 0.55 * motion;
    pivot.position.y = y;
    pivot.scale.y = k < 0.15 ? 0.9 : 1;
    head.rotation.x = -0.2 * k;
    hl.position.set(-0.45, 0.9 + y + k * 0.4, 0.05);
    hr.position.set(0.45, 0.9 + y + k * 0.4, 0.05);
    fl.position.set(-0.17, 0.08 + y, 0.04);
    fr.position.set(0.17, 0.08 + y, 0.04);
    return 2.3 + y;
  },
  yoga: ({ pivot, head, hands: [hl, hr], feet: [fl, fr] }, tt) => {
    // Tree pose: one foot on the other knee, palms together overhead, a slow sway.
    pivot.rotation.z = Math.sin(tt * 0.7) * 0.04 * motion;
    head.rotation.x = -0.05;
    hl.position.set(-0.07, 1.85, 0.05);
    hr.position.set(0.07, 1.85, 0.05);
    fl.position.set(-0.05, 0.06, 0.04);
    fr.position.set(0.12, 0.42, 0.12);
    return 2.4;
  },
  fishing: ({ head, hands: [hl, hr], held }, tt) => {
    const bob = Math.sin(tt * 2.2) * 0.05 * motion;
    head.rotation.x = 0.15;
    hl.position.set(-0.12, 0.75, 0.42);
    hr.position.set(0.1, 0.82 + bob, 0.45);
    if (held) held.rotation.x = -0.9 + bob;
    return 2.2;
  },
  'throwing-darts': ({ head, hands: [hl, hr], feet: [fl, fr], held, placeTime = 0 }) => {
    const round = dartsAt(placeTime), r = ((placeTime % ROUND) + ROUND) % ROUND;
    head.rotation.x = -0.05;
    hl.position.set(-0.45, 0.65, 0.1);
    if (held) held.visible = round.holding;
    if (r < THROWS * THROW_EVERY) {
      hr.position.copy(dartHand(r % THROW_EVERY));
      return 2.2;
    }
    // Collecting: walking up to the board and back, reaching up to pull the darts out.
    const step = round.walk > 0 && round.walk < 1 ? Math.sin(placeTime * 11) : 0;
    fl.position.set(-0.17, 0.06 + Math.max(0, step) * 0.1, 0.04 + step * 0.16);
    fr.position.set(0.17, 0.06 + Math.max(0, -step) * 0.1, 0.04 - step * 0.16);
    hr.position.set(0.3, round.walk === 1 ? 1.55 : 0.6, round.walk === 1 ? 0.4 : 0.06);
    return 2.2;
  },
  'shooting-hoops': ({ pivot, head, hands: [hl, hr], feet: [fl, fr], held }, tt) => {
    const k = throwPhase(tt, 3);
    const jump = k > 0.3 && k < 1 ? Math.sin(((k - 0.3) / 0.7) * Math.PI) * 0.25 * motion : 0;
    pivot.position.y = jump;
    head.rotation.x = -0.25;
    const handY = k < 0.3 ? 0.85 : 1.75;
    hl.position.set(-0.15, handY + jump, 0.3);
    hr.position.set(0.15, handY + jump, 0.3);
    fl.position.set(-0.17, 0.06 + jump, 0.04);
    fr.position.set(0.17, 0.06 + jump, 0.04);
    if (held) held.visible = k < 0.8;
    return 2.2 + jump;
  },
  'throwing-plane': ({ pivot, head, hands: [hl, hr], held }, tt) => {
    const k = throwPhase(tt, 5);
    const windUp = k < 0.6;
    pivot.rotation.y = windUp ? -0.2 : 0.1;
    head.rotation.x = -0.15;
    hl.position.set(-0.4, 0.75, 0.25);
    hr.position.copy(windUp ? new THREE.Vector3(0.35, 1.3, -0.1) : new THREE.Vector3(0.25, 1.35, 0.55));
    if (held) held.visible = windUp;
    return 2.2;
  },
  'cue-shot': ({ pivot, head, hands: [hl, hr], held }, tt) => {
    // Leaning in at the end of the table, drawing the cue back and striking along it.
    const drawBack = (1 - Math.sin(tt * 2.2)) * 0.08 * motion;
    pivot.rotation.x = 0.1;
    head.rotation.x = 0.1;
    hl.position.set(0.04, CUE_Y, BRIDGE);
    hr.position.set(0.36, CUE_Y, 0.1 - drawBack);
    if (held) held.quaternion.setFromUnitVectors(UP, hl.position.clone().sub(hr.position).normalize());
    return 2.0;
  },
  'cue-wait': ({ pivot, head, hands: [hl, hr], held }, tt) => {
    // Leaning on the cue, watching.
    pivot.rotation.z = 0.06;
    head.rotation.y = Math.sin(tt * 0.6) * 0.2 * motion;
    hl.position.set(0.05, 1.0, 0.3);
    hr.position.set(0.18, 0.85, 0.3);
    if (held) held.rotation.set(-0.1, 0, 0);
    return 2.2;
  },
  paddle: ({ pivot, head, hands: [hl, hr], feet: [fl, fr], rally }, tt) => {
    // Ready stance, knees bent; the bat swings through the ball at each of this player's hits.
    pivot.position.y = -0.04 + Math.sin(tt * 3) * 0.015 * motion;
    pivot.rotation.x = 0.15;
    head.rotation.x = -0.1;
    hl.position.set(-0.4, 0.7, 0.2);
    hr.position.copy(rally ? batHand(rally) : READY);
    fl.position.set(-0.22, 0.06, 0.04);
    fr.position.set(0.22, 0.06, 0.04);
    return 2.2;
  },
  floating: ({ pivot, head, hands: [hl, hr], feet: [fl, fr] }, tt) => {
    // Sitting low in a rubber ring, arms over its sides; the water hides the legs.
    const bob = Math.sin(tt * 1.5) * 0.03 * motion;
    pivot.position.y = -0.72 + bob;
    pivot.rotation.x = -0.15;
    head.rotation.x = -0.2;
    hl.position.set(-0.36, -0.22 + bob, 0.1);
    hr.position.set(0.36, -0.22 + bob, 0.1);
    fl.position.set(-0.15, -0.6, 0.2);
    fr.position.set(0.15, -0.6, 0.2);
    return 1.5 + bob;
  },
  watching: ({ pivot, head, hands: [hl, hr] }, tt) => {
    // Leaning in over someone's shoulder, hands on hips.
    pivot.rotation.x = 0.22;
    head.rotation.x = 0.25;
    head.rotation.z = Math.sin(tt * 0.8) * 0.1 * motion;
    hl.position.set(-0.42, 0.62, 0.1);
    hr.position.set(0.42, 0.62, 0.1);
    return 2.15;
  },
  'high-five': ({ head, hands: [hl, hr] }) => {
    head.rotation.x = -0.15;
    hl.position.set(-0.47, 0.6, 0.06);
    hr.position.set(0.3, 1.75, 0.25);
    return 2.3;
  },
  delivering: ({ pivot, head, hands: [hl, hr] }) => {
    // Just set a mug down on the desk.
    pivot.rotation.x = 0.18;
    head.rotation.x = 0.2;
    hl.position.set(-0.47, 0.6, 0.06);
    hr.position.set(0.25, 0.85, 0.5);
    return 2.2;
  },
  petting: ({ pivot, head, hands: [hl, hr], feet: [fl, fr] }, tt) => {
    // Crouched by the dog, a hand stroking its back.
    pivot.position.y = -0.22;
    pivot.rotation.x = 0.35;
    head.rotation.x = 0.35;
    hl.position.set(-0.4, 0.4, 0.15);
    hr.position.set(0.05, 0.45, 0.62 + Math.sin(tt * 3) * 0.08 * motion);
    fl.position.set(-0.2, 0.06, 0.2);
    fr.position.set(0.2, 0.06, 0.2);
    return 1.95;
  },
  feeding: ({ pivot, head, hands: [hl, hr], held }, tt) => {
    // Bent over the bowl, shaking food out of a box.
    pivot.rotation.x = 0.3;
    head.rotation.x = 0.4;
    hl.position.set(-0.4, 0.55, 0.15);
    hr.position.set(0.12, 0.85, 0.55);
    if (held) held.rotation.z = 1.6 + Math.sin(tt * 8) * 0.2 * motion;
    return 2.1;
  },
  'throwing-ball': ({ pivot, head, hands: [hl, hr], held }, tt) => {
    const k = throwPhase(tt, 6);
    const windUp = k < 0.6;
    pivot.rotation.y = windUp ? -0.2 : 0.15;
    head.rotation.x = -0.1;
    hl.position.set(-0.4, 0.75, 0.25);
    hr.position.copy(windUp ? new THREE.Vector3(0.35, 1.4, -0.15) : new THREE.Vector3(0.25, 1.4, 0.6));
    if (held) held.visible = windUp;
    return 2.2;
  },
  gaming: ({ pivot, head, hands: [hl, hr], feet: [fl, fr] }, tt) => {
    // On the sofa, leaning in, thumbs going.
    const mash = Math.max(0, Math.sin(tt * 14)) * 0.025 * motion;
    pivot.rotation.x = 0.12;
    pivot.rotation.z = Math.sin(tt * 0.9) * 0.08 * motion;
    head.rotation.x = -0.05;
    hl.position.set(-0.12, 0.62 + mash, 0.4);
    hr.position.set(0.12, 0.62, 0.4);
    fl.position.set(-0.16, -0.24, 0.34);
    fr.position.set(0.16, -0.24, 0.34);
    return 2.1;
  },
};

function heldProps(): Partial<Record<HangoutPose, THREE.Object3D>> {
  const rod = new THREE.Group();
  const pole = at(cyl(0.015, 0.025, 1.6, '#8C6A4A', { outline: 0 }), 0, 0.8, 0);
  rod.add(pole);
  rod.add(at(cyl(0.004, 0.004, 0.9, '#FFFFFF', { outline: 0, shadow: false }), 0, 1.6, 0.0));
  const dart = dartModel();
  const ball = at(mesh(new THREE.SphereGeometry(0.13, 16, 12), '#F07A4A', { outline: 0.06 }), 0, 0.15, 0.1);
  // Gripped near the butt: the tip is 1.025 m along from the hand.
  const cue = () => tag(at(cyl(0.012, 0.022, 1.45, '#E9B872', { outline: 0.03 }), 0, 0.3, 0), 'cue');
  const bat = new THREE.Group();
  bat.add(Object.assign(at(cyl(0.14, 0.14, 0.03, '#C25B7A', { outline: 0.05 }), BLADE.x, BLADE.y, BLADE.z), { userData: { part: 'bat-blade' } }));
  bat.add(at(cyl(0.025, 0.025, 0.12, WOOD_DARK, { outline: 0 }), 0, 0.05, 0.02));
  bat.children[0].rotation.x = Math.PI / 2;
  const holding = (o: THREE.Object3D) => new THREE.Group().add(o);
  return {
    fishing: rod, 'throwing-darts': dart, 'shooting-hoops': ball, 'throwing-plane': paperPlane(),
    'cue-shot': holding(cue()), 'cue-wait': holding(cue()), paddle: bat, gaming: gamepad(),
    feeding: at(mesh(new THREE.BoxGeometry(0.14, 0.2, 0.08), '#F07A4A', { outline: 0.06 }), 0, 0.1, 0.05),
    'throwing-ball': at(mesh(new THREE.SphereGeometry(0.08, 12, 10), '#C8E04A', { outline: 0.08 }), 0, 0.12, 0.08),
  };
}

/** A game controller, held in both hands (it hangs off the right one). */
function gamepad() {
  const pad = new THREE.Group();
  pad.userData.kind = 'controller';
  pad.add(at(mesh(new THREE.BoxGeometry(0.3, 0.06, 0.12), INK_DARK, { outline: 0.06 }), -0.12, 0.06, 0.02));
  pad.add(at(ball(0.025, '#FF5A5A', { outline: 0, shadow: false }), -0.04, 0.1, 0.02));
  pad.add(at(ball(0.025, '#4D86FF', { outline: 0, shadow: false }), -0.2, 0.1, 0.02));
  return pad;
}

/** A dart (#54): point, barrel, shaft and crossed flights, pointing along +z from its origin (the grip). */
export function dartModel() {
  const dart = new THREE.Group();
  const along = (o: THREE.Mesh, z: number, part?: string) => {
    o.rotation.x = Math.PI / 2;
    o.position.z = z;
    if (part) o.userData.part = part;
    return dart.add(o);
  };
  along(cyl(0.001, 0.005, 0.05, '#C9C0E3', { outline: 0, shadow: false }), 0.1, 'dart-point');
  along(cyl(0.011, 0.011, 0.06, '#FF5A5A', { outline: 0.05, shadow: false }), 0.045, 'dart-barrel');
  along(cyl(0.004, 0.004, 0.06, INK_DARK, { outline: 0, shadow: false }), -0.015);
  const flights = new THREE.Group();
  flights.userData.part = 'dart-flights';
  for (const turn of [0, Math.PI / 2]) {
    const fin = mesh(new THREE.BoxGeometry(0.05, 0.002, 0.045), '#4D86FF', { outline: 0, shadow: false });
    fin.rotation.z = turn;
    flights.add(fin);
  }
  flights.position.z = -0.045;
  dart.add(flights);
  return dart;
}

/** A small white dart-shaped plane, nose along +z. */
export function paperPlane() {
  const plane = mesh(new THREE.ConeGeometry(0.1, 0.3, 3), '#FFFFFF', { outline: 0.06 });
  plane.rotation.x = Math.PI / 2;
  plane.scale.set(1, 1, 0.25);
  plane.position.set(0, 0.12, 0.08);
  return plane;
}
