import * as THREE from 'three';
import type { Point } from './layout.ts';
import { paperPlane } from './character.ts';

const FLIGHT_SECONDS = 1.4;
/** How long a landed plane lies on the desk. */
const LANDED_SECONDS = 12;
/** Where a landed plane's middle lies: on the desk top (0.82 m), as it always did. */
const LANDED_Y = 0.82 + 0.12;

/** Paper planes flying in an arc from a thrower's hand to a desk, where they lie for a while. */
export class PaperPlanes {
  private flights: { plane: THREE.Object3D; from: THREE.Vector3; to: THREE.Vector3; age: number }[] = [];

  constructor(private scene: THREE.Scene) {}

  /** A plane leaving from `from` (the held plane's place in the world, #74) for desk `desk`. */
  throw(from: THREE.Vector3, desk: Point) {
    const plane = new THREE.Group().add(paperPlane());
    plane.children[0].position.set(0, 0, 0);
    const start = from.clone(), to = new THREE.Vector3(desk.x, LANDED_Y, desk.z);
    plane.position.copy(start);
    plane.lookAt(to.x, start.y, to.z);
    this.scene.add(plane);
    this.flights.push({ plane, from: start, to, age: 0 });
  }

  /** The planes in the air or lying on desks. */
  planes() {
    return this.flights.map((f) => f.plane);
  }

  update(dt: number) {
    for (const f of this.flights) {
      f.age += dt;
      const k = Math.min(1, f.age / FLIGHT_SECONDS);
      f.plane.position.lerpVectors(f.from, f.to, k);
      f.plane.position.y += Math.sin(k * Math.PI) * 0.9;
      f.plane.rotation.z = Math.sin(k * Math.PI * 2) * 0.3 * (1 - k);
    }
    for (const f of this.flights.filter((f) => f.age > FLIGHT_SECONDS + LANDED_SECONDS)) this.scene.remove(f.plane);
    this.flights = this.flights.filter((f) => f.age <= FLIGHT_SECONDS + LANDED_SECONDS);
  }
}
