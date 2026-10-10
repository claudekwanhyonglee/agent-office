// Office floor plan in plain numbers (no three.js), so seating and routes are testable.
// The back wall is at -z with the door, kitchen and meeting room along it; desk pods fill the
// floor in a grid of rows that grows towards the camera (+z).

export interface Point { x: number; z: number }

export interface SeatSpot {
  index: number;
  x: number;
  deskZ: number;
  chairZ: number;
  /** 1 faces +z (back half of a pod), -1 faces -z (front half). */
  facing: 1 | -1;
  yaw: number;
  sit: Point;
  /** Where the agent stands before hopping into the chair. */
  approach: Point;
  /** Where a finished agent stands, next to its chair. */
  standSpot: Point;
}

export const DESKS_PER_POD = 4;
export const PODS_PER_ROW = 2;

export const FLOOR = { left: -8, right: 8, back: -5 };
export const DOOR: Point = { x: 6.6, z: -4.45 };
/** Walkway in front of the back-wall zones, from the door to the central aisle. */
export const HALL_Z = -2.6;
/** Walkway between the two pod columns, from the hall to the front. */
export const AISLE_X = 0;

/** Metres per second; the controller uses it to know when a walk ends. */
export const WALK_SPEED = 1.7;

const POD_X = [-2.4, 2.4];
const FIRST_ROW_Z = 0.6;
const ROW_PITCH = 4.6;
const DESK_HALF_DEPTH = 0.41;
const CHAIR_OFFSET = 0.85;
const APPROACH = 0.7;
const STAND_ASIDE = 0.8;
const POD_DESKS = [
  { dx: -0.78, facing: 1 }, { dx: 0.78, facing: 1 },
  { dx: -0.78, facing: -1 }, { dx: 0.78, facing: -1 },
] as const;

const rowsFor = (podCount: number) => Math.ceil(podCount / PODS_PER_ROW);

export function podCenter(pod: number): Point {
  return { x: POD_X[pod % PODS_PER_ROW], z: FIRST_ROW_Z + Math.floor(pod / PODS_PER_ROW) * ROW_PITCH };
}

export function seatLayout(podCount: number): SeatSpot[] {
  const seats: SeatSpot[] = [];
  for (let pod = 0; pod < podCount; pod++) {
    const center = podCenter(pod);
    for (const { dx, facing } of POD_DESKS) {
      const x = center.x + dx;
      const deskZ = center.z - DESK_HALF_DEPTH * facing;
      const chairZ = deskZ - CHAIR_OFFSET * facing;
      seats.push({
        index: seats.length,
        x,
        deskZ,
        chairZ,
        facing,
        yaw: facing === 1 ? 0 : Math.PI,
        sit: { x, z: chairZ + 0.04 * facing },
        approach: { x, z: chairZ - APPROACH * facing },
        standSpot: { x: x + STAND_ASIDE * Math.sign(dx), z: chairZ },
      });
    }
  }
  return seats;
}

/** Front edge of the floor (+z); the back edge is FLOOR.back. */
export function floorFront(podCount: number) {
  return FIRST_ROW_Z + (rowsFor(podCount) - 1) * ROW_PITCH + 3.0;
}

// Fixed zones along the back and side walls. Positions are centres; sizes are full widths.
export const MEETING_ROOM = { x0: -7.9, x1: -2.6, z0: -4.9, z1: -1.9 };
export const MEETING_TABLE = { x: -5.25, z: -3.4, w: 2.6, d: 1.1 };
export const WHITEBOARD = { x: -5.25, z: -4.8 };
export const KITCHEN = { counter: { x: 2.7, z: -4.6, w: 3.0, d: 0.65 }, fridge: { x: 4.65, z: -4.55 }, table: { x: 2.7, z: -3.6 } };
export const WATER_COOLER: Point = { x: -1.7, z: -4.6 };
export const BOOKSHELF = { x: -0.15, z: -4.75, w: 1.6 };
export const LOUNGE = { rug: { x: 6.3, z: 2.2 }, sofa: { x: 7.3, z: 2.2 }, table: { x: 6.0, z: 2.2 } };

export function plantSpots(podCount: number): Point[] {
  const front = floorFront(podCount) - 0.5;
  return [
    { x: -7.5, z: -1.3 }, { x: -2.15, z: -4.6 }, { x: 0.95, z: -4.6 }, { x: 5.6, z: -4.6 }, { x: 7.55, z: -4.6 },
    { x: 7.55, z: -0.4 }, { x: 7.55, z: 4.6 }, { x: -7.5, z: 3.0 }, { x: -7.5, z: front }, { x: 7.5, z: front },
  ];
}

export function wallArt(podCount: number): { x: number; z: number; wall: 'back' | 'left' }[] {
  const art: { x: number; z: number; wall: 'back' | 'left' }[] = [{ x: 2.0, z: FLOOR.back, wall: 'back' }, { x: 3.4, z: FLOOR.back, wall: 'back' }];
  for (let z = 1.2; z < floorFront(podCount) - 1; z += 3.2) art.push({ x: FLOOR.left, z, wall: 'left' });
  return art;
}

// Routes: every place links to the walkway "spine" (the hall plus the central aisle);
// a route walks out along one link, along the spine, and in along the other link.

const onHall = (p: Point) => p.z === HALL_Z;
const onAisle = (p: Point) => p.x === AISLE_X;

function spine(from: Point, to: Point): Point[] {
  if ((onHall(from) && onHall(to)) || (onAisle(from) && onAisle(to))) return [to];
  return [{ x: AISLE_X, z: HALL_Z }, to];
}

/** From a place (first point) out to the spine (last point). */
export const doorLink = (): Point[] => [{ ...DOOR }, { x: DOOR.x, z: HALL_Z }];
export const seatLink = (seat: SeatSpot): Point[] => [{ ...seat.sit }, { ...seat.approach }, { x: AISLE_X, z: seat.approach.z }];

/** Walk from the start of link `from` to the start of link `to`. */
export function route(from: Point[], to: Point[]): Point[] {
  return withoutLoops([...from, ...spine(from.at(-1)!, to.at(-1)!), ...[...to].reverse().slice(1)]);
}

const same = (a: Point, b: Point) => a.x === b.x && a.z === b.z;

/** Drops repeats and any detour that comes back to a point already passed. */
export function withoutLoops(points: Point[]): Point[] {
  const out: Point[] = [];
  for (const p of points) {
    const seen = out.findIndex((q) => same(q, p));
    if (seen >= 0) out.length = seen + 1;
    else out.push({ ...p });
  }
  return out;
}

/** The point at distance `d` along `path`, and the index of the leg it's on. */
export function along(path: Point[], d: number): { leg: number; done: boolean } {
  for (let i = 0; i < path.length - 1; i++) {
    const len = Math.hypot(path[i + 1].x - path[i].x, path[i + 1].z - path[i].z);
    if (d < len) return { leg: i, done: false };
    d -= len;
  }
  return { leg: path.length - 1, done: true };
}

export const pathLength = (path: Point[]) =>
  path.slice(1).reduce((sum, p, i) => sum + Math.hypot(p.x - path[i].x, p.z - path[i].z), 0);

// Hangout spots for idle agents. Each place links to the spine like a seat does.

/** The walkway across the floor between the first two pod rows. */
const LANE_Z = FIRST_ROW_Z + ROW_PITCH / 2;
const LOUNGE_LANE_X = 5.0;

export type HangoutPose = 'eating' | 'drinking' | 'lounging' | 'chatting';

export interface HangoutPlace extends Point {
  spot: string;
  /** Facing direction, as for seats: forward is (sin yaw, cos yaw). */
  yaw: number;
  pose: HangoutPose;
  /** Sits down on furniture (the last step is a hop onto it). */
  sits?: boolean;
  /** From this place out to the spine. */
  link: Point[];
}

export interface HangoutSpot { name: string; chat: boolean; places: HangoutPlace[] }

export const yawTowards = (from: Point, to: Point) => Math.atan2(to.x - from.x, to.z - from.z);

const toHall = (p: Point): Point[] => [p, { x: p.x, z: HALL_Z }];
const viaLane = (p: Point): Point[] => [p, { x: p.x, z: LANE_Z }, { x: AISLE_X, z: LANE_Z }];
const viaLoungeLane = (...points: Point[]): Point[] => [...points, { x: LOUNGE_LANE_X, z: points.at(-1)!.z }, { x: LOUNGE_LANE_X, z: HALL_Z }];

function chatSpot(name: string, a: Point, b: Point, link: (p: Point) => Point[]): HangoutSpot {
  const place = (p: Point, other: Point): HangoutPlace => ({ ...p, spot: name, yaw: yawTowards(p, other), pose: 'chatting', link: link(p) });
  return { name, chat: true, places: [place(a, b), place(b, a)] };
}

function sofaSeat(z: number): HangoutPlace {
  const seat = { x: LOUNGE.sofa.x - 0.35, z };
  return { ...seat, spot: 'lounge', yaw: -Math.PI / 2, pose: 'lounging', sits: true, link: viaLoungeLane(seat, { x: 6.25, z }) };
}

const cooler2 = { x: -1.05, z: -3.75 };

export const HANGOUTS: HangoutSpot[] = [
  {
    name: 'kitchen',
    chat: false,
    places: [
      { x: 2.3, z: -2.95, spot: 'kitchen', yaw: Math.PI, pose: 'eating', link: toHall({ x: 2.3, z: -2.95 }) },
      { x: 3.1, z: -2.95, spot: 'kitchen', yaw: Math.PI, pose: 'drinking', link: toHall({ x: 3.1, z: -2.95 }) },
      { x: 1.45, z: -3.85, spot: 'kitchen', yaw: Math.PI, pose: 'drinking', link: toHall({ x: 1.45, z: -3.85 }) },
    ],
  },
  {
    name: 'water-cooler',
    chat: false,
    places: [
      { x: WATER_COOLER.x, z: -3.9, spot: 'water-cooler', yaw: Math.PI, pose: 'drinking', link: toHall({ x: WATER_COOLER.x, z: -3.9 }) },
      { ...cooler2, spot: 'water-cooler', yaw: yawTowards(cooler2, WATER_COOLER), pose: 'drinking', link: toHall(cooler2) },
    ],
  },
  {
    name: 'lounge',
    chat: false,
    places: [
      sofaSeat(1.6),
      sofaSeat(2.8),
      { x: 5.45, z: LOUNGE.table.z, spot: 'lounge', yaw: Math.PI / 2, pose: 'drinking', link: viaLoungeLane({ x: 5.45, z: LOUNGE.table.z }) },
    ],
  },
  chatSpot('chat-hall', { x: 1.3, z: -1.95 }, { x: 2.1, z: -1.95 }, toHall),
  chatSpot('chat-left', { x: -6.4, z: 0.8 }, { x: -5.6, z: 0.8 }, viaLane),
  chatSpot('chat-left-front', { x: -6.4, z: 4.8 }, { x: -5.6, z: 4.8 }, viaLane),
];

export const HANGOUT_PLACES = HANGOUTS.flatMap((s) => s.places);

/** Door → hall → aisle → in front of the desk → into the chair. */
export const arrivalPath = (seat: SeatSpot) => route(doorLink(), seatLink(seat));

/** Chair → door: the arrival route walked backwards. */
export const departurePath = (seat: SeatSpot) => route(seatLink(seat), doorLink());
