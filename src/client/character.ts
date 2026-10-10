import * as THREE from 'three';
import type { OfficeState } from '../shared/agent.ts';
import { at, ball, cyl, mesh } from './toon.ts';
import type { Look, HatKind } from './look.ts';
import type { Point, SeatSpot } from './layout.ts';
import { POSES, type BubbleKind, type Pose } from './poses.ts';
import { bubbleTexture } from './bubbles.ts';

const SEAT_Y = 0.38;
const WALK_SPEED = 1.7;
const HOP_SECONDS = 0.45;
const REDUCED_MOTION = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const motion = REDUCED_MOTION ? 0.35 : 1;

export type Mode = 'seated' | 'standing' | 'walking' | 'hopping' | 'exiting' | 'gone';

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

  private pivot = new THREE.Group();
  private head = new THREE.Group();
  private eyes: THREE.Mesh[];
  private hands: THREE.Mesh[];
  private feet: THREE.Mesh[];
  private mug = new THREE.Group();
  private bubble: THREE.Sprite;
  private path: THREE.Vector3[] = [];
  private onArrive?: () => void;
  private hopTween?: { from: THREE.Vector3; to: THREE.Vector3; fromYaw: number; yaw: number; k: number; then: () => void };
  private blinkAt = 1 + Math.random() * 3;
  private seed = Math.random() * 10;
  private walkPhase = 0;
  private exitK = 0;
  private scale = 1;
  private growing = false;

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

    this.bubble = new THREE.Sprite(new THREE.SpriteMaterial({ depthTest: false, transparent: true }));
    this.bubble.center.set(0.5, 0);
    this.bubble.scale.set(0.72, 0.72, 1);
    this.bubble.renderOrder = 10;
    this.root.add(this.bubble);
  }

  get pose(): Pose | 'walking' {
    if (this.mode === 'seated') return POSES[this.state].pose;
    if (this.mode === 'standing') return 'standing';
    return 'walking';
  }

  /** Place straight at the desk (agents already there when the page opens). */
  sitAt(seat: SeatSpot, state: OfficeState) {
    this.seat = seat;
    this.state = state;
    this.settle();
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

  /** Get up and walk out along `path` (desk → door), then disappear. */
  leave(path: Point[]) {
    const out = () => this.walk(path.slice(2), () => { this.mode = 'exiting'; this.exitK = 0; });
    if (this.mode === 'seated' || this.mode === 'standing') this.hop(vec(path[1]), this.root.rotation.y, out);
    else out();
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
    let bubble: BubbleKind | null = null;
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
      bubble = POSES[this.state].bubble;
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
      bubble = 'finished';
      bubbleY = 2.15 + hopY;
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
