// Office floor plan in plain numbers (no three.js), so seating and routes are testable.
// Pods are stacked front to back (+z); the office floor grows with them.

export interface Point { x: number; z: number }

export interface SeatSpot {
  index: number;
  x: number;
  deskZ: number;
  chairZ: number;
  /** 1 faces +z (front row), -1 faces -z (back row). */
  facing: 1 | -1;
  yaw: number;
  sit: Point;
  /** Where the agent stands before hopping into the chair. */
  approach: Point;
  /** Where a finished agent stands, next to its chair. */
  standSpot: Point;
}

export const DESKS_PER_POD = 5;
export const POD_DEPTH = 4.8;
export const DOOR: Point = { x: 4.6, z: -3.45 };

const POD_SEATS = [
  { x: -3.4, deskZ: 0.0, chairZ: -0.85, facing: 1 },
  { x: -1.8, deskZ: 0.0, chairZ: -0.85, facing: 1 },
  { x: -0.2, deskZ: 0.0, chairZ: -0.85, facing: 1 },
  { x: -2.6, deskZ: 1.75, chairZ: 2.6, facing: -1 },
  { x: -1.0, deskZ: 1.75, chairZ: 2.6, facing: -1 },
] as const;

export function seatLayout(podCount: number): SeatSpot[] {
  const seats: SeatSpot[] = [];
  for (let pod = 0; pod < podCount; pod++) {
    const dz = pod * POD_DEPTH;
    for (const s of POD_SEATS) {
      const chairZ = s.chairZ + dz;
      seats.push({
        index: seats.length,
        x: s.x,
        deskZ: s.deskZ + dz,
        chairZ,
        facing: s.facing,
        yaw: s.facing === 1 ? 0 : Math.PI,
        sit: { x: s.x, z: chairZ + 0.04 * s.facing },
        approach: { x: s.x, z: chairZ - 0.6 * s.facing },
        standSpot: { x: s.x + 0.8, z: chairZ },
      });
    }
  }
  return seats;
}

export function floorDepth(podCount: number) {
  return 7.8 + (podCount - 1) * POD_DEPTH;
}
