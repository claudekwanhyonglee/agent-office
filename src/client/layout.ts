// Office floor plan in plain numbers (no three.js), so seating and routes are testable.
import { SHOT_COUNT, shotSetup } from './pool.ts';
import { PLAYER_X } from './pong.ts';

// Plan C, "Mission Control Bay": curved rows of desks face the camera (+z) around a point on the
// front deck. Kitchen, big board, TV and the door line the back wall (-z); a glass wall with two
// doors opens onto the deck. Extra rows go in behind the last one and push the back wall back.

export interface Point { x: number; z: number }

export interface SeatSpot {
  index: number;
  row: number;
  desk: Point;
  chair: Point;
  /** Facing direction of the seated agent (towards the camera side): forward is (sin yaw, cos yaw). */
  yaw: number;
  sit: Point;
  /** Where the agent stands before hopping into the chair. */
  approach: Point;
  /** Where a finished agent stands, behind its chair. */
  standSpot: Point;
  /** From the chair out to a walkway. */
  link: Point[];
}

export type HangoutPose =
  | 'eating' | 'drinking' | 'lounging' | 'chatting'
  | 'lounging-sun' | 'fishing' | 'swinging' | 'yoga' | 'bouncing' | 'throwing-darts' | 'shooting-hoops' | 'throwing-plane'
  | 'cue-shot' | 'cue-wait' | 'paddle' | 'floating' | 'gaming'
  | 'watching' | 'high-five' | 'delivering'
  | 'petting' | 'feeding' | 'throwing-ball';

export interface HangoutPlace extends Point {
  spot: string;
  /** Facing direction, as for seats. */
  yaw: number;
  pose: HangoutPose;
  /** Sits down on furniture (the last step is a hop onto it). */
  sits?: boolean;
  /** From this place out to a walkway. */
  link: Point[];
}

export interface HangoutSpot {
  name: string;
  chat: boolean;
  places: HangoutPlace[];
  /** A game or group activity: it starts with at least `min` idle agents and takes one per place. */
  game?: { min: number };
}

/** Where the office dog stops (#34), how it gets there, and where agents stand to play with it. */
export interface DogSpot {
  name: string;
  dog: Point;
  /** From the dog's spot out to a walkway. */
  link: Point[];
  /** Where a thrown ball lands: the dog runs there and back. */
  fetch: Point;
  /** Where agents stand with the dog, and what they can do there. */
  visitors: { at: Point; link: Point[]; poses: HangoutPose[] }[];
}

export interface Area { name: string; x0: number; x1: number; z0: number; z1: number }

export const DESKS_PER_ROW = 8;
export const INITIAL_ROWS = 2;

/** Metres per second; the controller uses it to know when a walk ends. */
export const WALK_SPEED = 1.7;
export const DOG_SPEED = 2.4;

/** The rows curve around this point; every desk faces it. */
const ARC_CENTER: Point = { x: 0, z: 11.5 };
const FIRST_RADIUS = 7.5;
const ROW_GAP = 3.4;
/** Desk centre to desk centre along the arc. */
const DESK_SPACING = 1.36;
const CHAIR_BEHIND = 1.2;
const APPROACH = 0.7;
/** The walkway behind each row of chairs, measured from the row's desks. */
const LANE_BEHIND = 2.1;

export const FLOOR = { left: -9, right: 9, front: 13.4 };
/** The back wall's height; the camera's pivot stays below it. */
export const WALL_HEIGHT = 3.4;
/** The glass wall between the office and the deck. */
export const GLASS_Z = 6.8;
export const GLASS_DOORS = [{ x0: -6.3, x1: -5.3 }, { x0: 5.3, x1: 6.3 }];
/** Side aisles from the hall, through the glass doors, to the deck walkway. */
export const AISLE_X = 5.8;
export const DECK_Z = 7.6;
/** Centre to centre between two people chatting. */
const CHAT_GAP = 1.3;

export const yawTowards = (from: Point, to: Point) => Math.atan2(to.x - from.x, to.z - from.z);

const onArc = (radius: number, angle: number): Point =>
  ({ x: ARC_CENTER.x + radius * Math.sin(angle), z: ARC_CENTER.z - radius * Math.cos(angle) });

const rowRadius = (row: number) => FIRST_RADIUS + row * ROW_GAP;
const rowAngles = (row: number) =>
  Array.from({ length: DESKS_PER_ROW }, (_, i) => (i - (DESKS_PER_ROW - 1) / 2) * (DESK_SPACING / rowRadius(row)));

function seatsFor(rows: number): SeatSpot[] {
  const seats: SeatSpot[] = [];
  for (let row = 0; row < rows; row++) {
    const r = rowRadius(row);
    for (const angle of rowAngles(row)) {
      const chair = onArc(r + CHAIR_BEHIND, angle), approach = onArc(r + CHAIR_BEHIND + APPROACH, angle);
      const desk = onArc(r, angle);
      seats.push({
        index: seats.length, row, desk, chair,
        yaw: yawTowards(chair, desk), sit: chair, approach, standSpot: approach,
        link: [chair, approach, onArc(r + LANE_BEHIND, angle)],
      });
    }
  }
  return seats;
}

/** A row's walkway: an arc behind its chairs, from the left aisle to the right one. */
function lane(row: number): Point[] {
  const radius = rowRadius(row) + LANE_BEHIND;
  const end = Math.asin(AISLE_X / radius);
  return [-end, ...rowAngles(row), end].map((a) => onArc(radius, a));
}

/**
 * Areas the next epic's break-room props will fill (from plan C); no furniture may stand in them.
 */
export const RESERVED: Area[] = [
  { name: 'darts lane', x0: -9, x1: -6.4, z0: 3.9, z1: 5.1 },
  { name: 'bin', x0: -8.9, x1: -8.1, z0: 5.9, z1: 6.7 },
  { name: 'pool table', x0: 6.6, x1: 8.2, z0: -0.5, z1: 2.9 },
  { name: 'pet bed', x0: 6.9, x1: 8.2, z0: 5.0, z1: 5.8 },
  { name: 'pool', x0: -2.8, x1: 2.8, z0: 9.0, z1: 11.8 },
  { name: 'loungers', x0: 3.2, x1: 4.6, z0: 9.5, z1: 11.4 },
  { name: 'ping pong', x0: 4.7, x1: 7.9, z0: 8.1, z1: 9.3 },
  { name: 'trampoline', x0: 6.7, x1: 8.5, z0: 9.7, z1: 11.5 },
  { name: 'hammock', x0: 4.65, x1: 9.0, z0: 11.85, z1: 13.4 },
  { name: 'pond and jetty', x0: -8.6, x1: -3.4, z0: 9.7, z1: 12.3 },
  { name: 'yoga mat', x0: -8.5, x1: -6.7, z0: 8.2, z1: 8.8 },
];

/**
 * Break-room props from plan C (artifact x − 9, y − 5). They sit at the sides and on the deck, so
 * they stay put when rows are added.
 */
export const BREAK_ROOM = {
  loungers: [{ x: 3.5, z: 10.45 }, { x: 4.3, z: 10.45 }] as Point[],
  /** The backrest rises from the seat towards the head end (-z), long enough to lean back on, head and all (#64). */
  lounger: { w: 0.6, d: 1.9, seatTop: 0.34, back: { angle: 0.55, length: 1.3 } },
  pond: { x: -6.6, z: 11.0, rx: 2.0, rz: 1.3 },
  jetty: { x: -4.2, z: 11.0, w: 1.6, d: 0.8 },
  hammock: { x: 6.9, z: 12.6, trees: [5.4, 8.4] },
  yogaMat: { x: -7.6, z: 8.5, w: 1.8, d: 0.6 },
  trampoline: { x: 7.6, z: 10.6, r: 0.85 },
  dartboard: { x: -8.85, z: 4.4 },
  bin: { x: -8.5, z: 6.3 },
  /** Pin 12 marks the throwing spot on the right aisle; the paper stack sits beside it. */
  paperStack: { x: 6.6, z: 4.0 },
  petBed: { x: 7.4, z: 5.4, rx: 0.45, rz: 0.32 },
  bowl: { x: 8.05, z: 5.55, r: 0.13 },
  /** Long side along z. */
  poolTable: { x: 7.4, z: 1.6, w: 1.2, d: 2.2 },
  /** Long side along x. */
  pingPong: { x: 6.3, z: 8.7, w: 2.2, d: 1.2 },
  pool: {
    x: 0, z: 10.4, w: 5.6, d: 2.8,
    /** In a row across the pool, with room to drift along it without touching (#57). */
    rings: [-1.95, -0.65, 0.65, 1.95].map((x) => ({ x, z: 10.4 })) as Point[],
  },
};

export const MEETING_ROOM ={ x0: -8.7, x1: -6.05, z0: -0.8, z1: 2.2 };
export const MEETING_TABLE = { x: -7.35, z: 0.7, w: 1.8, d: 1.0 };

/** Everything for an office with `rows` rows of desks. Pieces along the back wall move back with each extra row. */
export function officeLayout(rows: number) {
  const b = -ROW_GAP * (rows - INITIAL_ROWS);
  const back = -5 + b;
  const hallZ = -1.6 + b;
  const door: Point = { x: 8.45, z: -4.45 + b };
  const kitchen = {
    counter: { x: -6.9, z: -4.525 + b, w: 3.6, d: 0.65 },
    coffee: { x: -8.1, z: -4.525 + b },
    table: { x: -6.9, z: -2.7 + b },
  };
  const cooler: Point = { x: -4.75, z: -4.6 + b };
  const lounge = { tv: { x: 6.4, z: -4.82 + b, w: 2.6 }, sofa: { x: 6.4, z: -2.35 + b, w: 2.8 }, rug: { x: 6.4, z: -3.2 + b } };

  const toHall = (p: Point): Point[] => [p, { x: p.x, z: hallZ }];
  const toDeck = (p: Point): Point[] => [p, { x: p.x, z: DECK_Z }];
  const sofaFront = lounge.sofa.z - 0.95;
  const sofaSeat = (x: number, spot = 'lounge', pose: HangoutPose = 'lounging'): HangoutPlace => ({
    x, z: lounge.sofa.z, spot, yaw: Math.PI, pose, sits: true,
    link: [{ x, z: lounge.sofa.z }, { x, z: sofaFront }, { x: 4.75, z: sofaFront }, { x: 4.75, z: hallZ }],
  });
  const standing = (spot: string, p: Point, pose: HangoutPose, yaw = Math.PI): HangoutPlace =>
    ({ ...p, spot, yaw, pose, link: toHall(p) });
  /** Two places facing each other across `centre`, CHAT_GAP apart (#56). */
  const chatSpot = (name: string, centre: Point, link: (p: Point) => Point[]): HangoutSpot => {
    const [a, c] = [-1, 1].map((side) => ({ x: centre.x + (side * CHAT_GAP) / 2, z: centre.z }));
    const place = (p: Point, other: Point): HangoutPlace => ({ ...p, spot: name, yaw: yawTowards(p, other), pose: 'chatting', link: link(p) });
    return { name, chat: true, places: [place(a, c), place(c, a)] };
  };
  const cooler2 = { x: -4.0, z: -3.9 + b };

  const hangouts: HangoutSpot[] = [
    {
      name: 'kitchen',
      chat: false,
      places: [
        standing('kitchen', { x: -8.2, z: -3.6 + b }, 'drinking'),
        standing('kitchen', { x: -5.5, z: -3.6 + b }, 'eating'),
        standing('kitchen', { x: -6.9, z: -1.95 + b }, 'eating'),
      ],
    },
    {
      name: 'water-cooler',
      chat: false,
      places: [standing('water-cooler', { x: cooler.x, z: -3.75 + b }, 'drinking'), standing('water-cooler', cooler2, 'drinking', yawTowards(cooler2, cooler))],
    },
    { name: 'lounge', chat: false, places: [sofaSeat(5.7), sofaSeat(6.4), sofaSeat(7.1)] },
    chatSpot('chat-hall', { x: -1.0, z: -2.6 + b }, toHall),
    chatSpot('chat-deck', { x: -1.2, z: 8.3 }, toDeck),
    chatSpot('chat-deck-right', { x: 2.4, z: 8.3 }, toDeck),
    ...soloSpots(),
    ...pairGames(),
    {
      name: 'pool-dip',
      chat: false,
      game: { min: 3 },
      places: BREAK_ROOM.pool.rings.map((r) => {
        const edge = { x: r.x, z: 8.8 };
        return { ...r, spot: 'pool-dip', yaw: 0, pose: 'floating' as const, sits: true, link: [{ ...r }, edge, { x: edge.x, z: DECK_Z }] };
      }),
    },
    { name: 'couch-co-op', chat: false, game: { min: 2 }, places: [-0.87, -0.29, 0.29, 0.87].map((dx) => sofaSeat(lounge.sofa.x + dx, 'couch-co-op', 'gaming')) },
  ];

  const lanes = Array.from({ length: rows }, (_, row) => lane(row));
  const walkways: Point[][] = [
    [{ x: door.x, z: hallZ }, { x: -8.2, z: hallZ }],
    [{ x: -AISLE_X, z: hallZ }, { x: -AISLE_X, z: DECK_Z }],
    [{ x: AISLE_X, z: hallZ }, { x: AISLE_X, z: DECK_Z }],
    [{ x: -AISLE_X, z: DECK_Z }, { x: AISLE_X, z: DECK_Z }],
    ...lanes,
  ];

  return {
    rows,
    bounds: { ...FLOOR, back },
    hallZ,
    door,
    /** From the door out to the hall. */
    doorLink: [{ ...door }, { x: door.x, z: hallZ }] as Point[],
    seats: seatsFor(rows),
    hangouts,
    walkways,
    dogSpots: dogSpots(hallZ),
    poolTurns: POOL_TURNS,
    /** The walkway behind each row of chairs. */
    lanes,
    kitchen,
    cooler,
    bookshelf: { x: -8.78, z: -2.8 + b, length: 1.6 },
    lounge,
    board: { x: 0, w: 8.8 },
    windows: [-7.8, -6.0],
    plants: [
      { x: -4.0, z: -4.5 + b }, { x: 4.7, z: -4.4 + b }, { x: 8.5, z: -1.0 }, { x: -8.5, z: 7.4 }, { x: -3.2, z: 12.9 },
      { x: 3.0, z: 12.9 }, { x: 8.5, z: 3.6 }, { x: -8.5, z: 2.9 }, { x: 8.5, z: 6.4 },
    ] as Point[],
    wallArt: [0.5, 3.0],
  };
}

export type OfficeLayout = ReturnType<typeof officeLayout>;

/** Between the loungers and the ping-pong table: the way from the deck walkway to the right of the deck. */
const RIGHT_DECK_X = 4.95;

/** One-agent activities (#30). Each link steps off the prop and out to the deck walkway or a side aisle. */
function soloSpots(): HangoutSpot[] {
  const { loungers, hammock, yogaMat, trampoline } = BREAK_ROOM;
  const place = (spot: string, pose: HangoutPose, p: Point, yaw: number, link: Point[], sits?: boolean): HangoutPlace =>
    ({ x: p.x, z: p.z, spot, yaw, pose, link: [{ x: p.x, z: p.z }, ...link], ...(sits && { sits }) });
  const solo = (spot: string, pose: HangoutPose, p: Point, yaw: number, link: Point[], sits?: boolean): HangoutSpot =>
    ({ name: spot, chat: false, places: [place(spot, pose, p, yaw, link, sits)] });
  const left = -Math.PI / 2, right = Math.PI / 2;
  return [
    {
      name: 'loungers',
      chat: false,
      places: loungers.map(({ x, z }) => place('loungers', 'lounging-sun', { x, z }, 0, [{ x, z: 9.3 }, { x, z: DECK_Z }], true)),
    },
    solo('fishing', 'fishing', { x: -4.4, z: 11.0 }, left, [{ x: -3.2, z: 11.0 }, { x: -3.2, z: DECK_Z }]),
    solo('hammock', 'swinging', hammock, right, [{ x: hammock.x, z: 11.7 }, { x: RIGHT_DECK_X, z: 11.7 }, { x: RIGHT_DECK_X, z: DECK_Z }], true),
    solo('yoga', 'yoga', yogaMat, 0, [{ x: -6.4, z: yogaMat.z }, { x: -AISLE_X, z: DECK_Z }]),
    solo('trampoline', 'bouncing', trampoline, 0, [{ x: 6.5, z: trampoline.z }, { x: RIGHT_DECK_X, z: trampoline.z }, { x: RIGHT_DECK_X, z: DECK_Z }], true),
    solo('darts', 'throwing-darts', { x: -6.6, z: BREAK_ROOM.dartboard.z }, left, [{ x: -AISLE_X, z: BREAK_ROOM.dartboard.z }]),
    solo('hoops', 'shooting-hoops', { x: -6.8, z: BREAK_ROOM.bin.z }, left, [{ x: -AISLE_X, z: BREAK_ROOM.bin.z }]),
    solo('planes', 'throwing-plane', { x: 6.25, z: 4.4 }, left, [{ x: AISLE_X, z: 4.4 }]),
  ];
}

/** A pool shooter stands this far from the cue ball, behind it (#53). */
export const CUE_REACH = 1.1;
/** The waiting player stands this much further back from the table's end, a little towards the aisle. */
const WAIT_BACK = 0.45;
const WAIT_X = -0.15;

/**
 * For each shot of the pool rack (#53): where its shooter stands, behind the cue ball facing along
 * the table, and where the shooter then waits, at the same end. Each links straight out to the aisle.
 */
const POOL_TURNS = Array.from({ length: SHOT_COUNT }, (_, k) => {
  const { poolTable: table } = BREAK_ROOM;
  const { cue, aim } = shotSetup(k);
  const at = { x: table.x + cue.x, z: table.z + cue.z - aim * CUE_REACH };
  const wait = { x: table.x + WAIT_X, z: at.z - aim * WAIT_BACK };
  const shoot: HangoutPlace = { ...at, spot: 'pool-table', pose: 'cue-shot', yaw: aim > 0 ? 0 : Math.PI, link: [at, { x: AISLE_X, z: at.z }] };
  const waiting: HangoutPlace = {
    ...wait, spot: 'pool-table', pose: 'cue-wait', yaw: yawTowards(wait, table), link: [wait, { x: wait.x, z: at.z }, { x: AISLE_X, z: at.z }],
  };
  return { shoot, wait: waiting };
});

/** Two-player games at either end of a table (#31). */
function pairGames(): HangoutSpot[] {
  const { pingPong: pong } = BREAK_ROOM;
  const end = (spot: string, pose: HangoutPose, p: Point, toward: Point, link: Point[]): HangoutPlace =>
    ({ ...p, spot, pose, yaw: yawTowards(p, toward), link: [p, ...link] });
  const pongEnds = [pong.x - PLAYER_X, pong.x + PLAYER_X];
  return [
    // The first shooter breaks; the other waits at the far end, where they'll shoot next.
    { name: 'pool-table', chat: false, game: { min: 2 }, places: [POOL_TURNS[0].shoot, POOL_TURNS[1].wait] },
    {
      name: 'ping-pong',
      chat: false,
      game: { min: 2 },
      places: [
        end('ping-pong', 'paddle', { x: pongEnds[0], z: pong.z }, pong, [{ x: pongEnds[0], z: DECK_Z }]),
        end('ping-pong', 'paddle', { x: pongEnds[1], z: pong.z }, pong, [{ x: pongEnds[1], z: DECK_Z }, { x: AISLE_X, z: DECK_Z }]),
      ],
    },
  ];
}

// Routes: every place links out to a walkway; a route walks out along one link, takes the
// shortest way along the walkways, and walks in along the other link.

const same = (a: Point, b: Point) => Math.abs(a.x - b.x) < 1e-9 && Math.abs(a.z - b.z) < 1e-9;
const distance = (a: Point, b: Point) => Math.hypot(b.x - a.x, b.z - a.z);
const onSegment = (p: Point, a: Point, b: Point) => Math.abs(distance(a, p) + distance(p, b) - distance(a, b)) < 1e-6;

/** Shortest walk between two points on the walkways (each walkway is a polyline; walkways meet where one's point lies on another). */
export function shortestWalk(walkways: Point[][], from: Point, to: Point): Point[] {
  const nodes: Point[] = [];
  const nodeOf = (p: Point) => {
    const i = nodes.findIndex((q) => same(p, q));
    return i >= 0 ? i : nodes.push(p) - 1;
  };
  [...walkways.flat(), from, to].forEach(nodeOf);
  const next: number[][] = nodes.map(() => []);
  for (const line of walkways) {
    for (let s = 0; s + 1 < line.length; s++) {
      const a = line[s], b = line[s + 1];
      const on = nodes.map((_, i) => i).filter((i) => onSegment(nodes[i], a, b)).sort((i, j) => distance(a, nodes[i]) - distance(a, nodes[j]));
      for (let k = 0; k + 1 < on.length; k++) { next[on[k]].push(on[k + 1]); next[on[k + 1]].push(on[k]); }
    }
  }
  const start = nodeOf(from), end = nodeOf(to);
  for (const i of [start, end]) if (!next[i].length) throw new Error(`(${nodes[i].x}, ${nodes[i].z}) is not on a walkway`);

  // Dijkstra; the network has a few dozen points.
  const dist = nodes.map(() => Infinity), prev = nodes.map(() => -1), done = new Set<number>();
  dist[start] = 0;
  while (!done.has(end)) {
    let u = -1;
    for (let i = 0; i < nodes.length; i++) if (!done.has(i) && (u < 0 || dist[i] < dist[u])) u = i;
    if (dist[u] === Infinity) throw new Error('walkways are not connected');
    done.add(u);
    for (const v of next[u]) {
      const d = dist[u] + distance(nodes[u], nodes[v]);
      if (d < dist[v]) { dist[v] = d; prev[v] = u; }
    }
  }
  const path: Point[] = [];
  for (let i = end; i >= 0; i = prev[i]) path.unshift({ ...nodes[i] });
  return path;
}

/** Walk from the start of link `from` to the start of link `to`. */
export function route(layout: OfficeLayout, from: Point[], to: Point[]): Point[] {
  const walk = shortestWalk(layout.walkways, from.at(-1)!, to.at(-1)!);
  return withoutLoops([...from, ...walk.slice(1), ...[...to].reverse().slice(1)]);
}

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
    const len = distance(path[i], path[i + 1]);
    if (d < len) return { leg: i, done: false };
    d -= len;
  }
  return { leg: path.length - 1, done: true };
}

export const pathLength = (path: Point[]) => path.slice(1).reduce((sum, p, i) => sum + distance(path[i], p), 0);

/** The dog's bed (first: it starts there), a spot on the deck, one in the hall and one in the left aisle. */
function dogSpots(hallZ: number): DogSpot[] {
  const play: HangoutPose[] = ['petting', 'throwing-ball'];
  const onWalkway = (p: Point) => ({ at: p, link: [p], poses: play });
  const { petBed: bed } = BREAK_ROOM;
  const onDeck = (x: number) => ({ at: { x, z: 8.25 }, link: [{ x, z: 8.25 }, { x, z: DECK_Z }], poses: play });
  return [
    {
      name: 'bed',
      dog: { x: bed.x, z: bed.z },
      link: [{ x: bed.x, z: bed.z }, { x: 6.6, z: bed.z }, { x: AISLE_X, z: bed.z }],
      fetch: { x: AISLE_X, z: 3.0 },
      visitors: [
        { at: { x: 6.45, z: bed.z }, link: [{ x: 6.45, z: bed.z }, { x: AISLE_X, z: bed.z }], poses: play },
        { at: { x: 7.6, z: 6.15 }, link: [{ x: 7.6, z: 6.15 }, { x: AISLE_X, z: 6.15 }], poses: ['feeding'] },
      ],
    },
    {
      name: 'deck', dog: { x: 0.6, z: 8.25 }, link: [{ x: 0.6, z: 8.25 }, { x: 0.6, z: DECK_Z }], fetch: { x: -2.5, z: DECK_Z },
      visitors: [onDeck(0), onDeck(1.2)],
    },
    {
      name: 'hall', dog: { x: 1.5, z: hallZ }, link: [{ x: 1.5, z: hallZ }], fetch: { x: -1.5, z: hallZ },
      visitors: [onWalkway({ x: 0.9, z: hallZ }), onWalkway({ x: 2.1, z: hallZ })],
    },
    {
      name: 'left aisle', dog: { x: -AISLE_X, z: 3.0 }, link: [{ x: -AISLE_X, z: 3.0 }], fetch: { x: -AISLE_X, z: 0 },
      visitors: [onWalkway({ x: -AISLE_X, z: 2.4 }), onWalkway({ x: -AISLE_X, z: 3.6 })],
    },
  ];
}

/** Gap between the spots where onlookers stand behind a chair. */
const ONLOOKER_GAP = 0.45;

/**
 * Three spots behind `seat`'s chair, on the lane behind its row (#33 over the shoulder): straight
 * behind, and either side along the lane. They're on a walkway, so each is its own link.
 */
export function behindChair(layout: OfficeLayout, seat: SeatSpot): Point[] {
  const lanePoints = layout.lanes[seat.row];
  const behind = seat.link.at(-1)!;
  const i = lanePoints.findIndex((p) => same(p, behind));
  const toward = (q: Point, gaps: number) => {
    const k = (ONLOOKER_GAP * gaps) / distance(behind, q);
    return { x: behind.x + (q.x - behind.x) * k, z: behind.z + (q.z - behind.z) * k };
  };
  const [prev, next] = [lanePoints[i - 1], lanePoints[i + 1]];
  // At the end of a row the lane meets the aisle within a step: both side spots go on the inner side.
  if (distance(behind, prev) < ONLOOKER_GAP) return [{ ...behind }, toward(next, 1), toward(next, 2)];
  if (distance(behind, next) < ONLOOKER_GAP) return [{ ...behind }, toward(prev, 1), toward(prev, 2)];
  return [{ ...behind }, toward(prev, 1), toward(next, 1)];
}

/** Door → hall → aisle → lane behind the row → into the chair. */
export const arrivalPath = (layout: OfficeLayout, seat: SeatSpot) => route(layout, layout.doorLink, seat.link);

/** Chair → door: the arrival route walked backwards. */
export const departurePath = (layout: OfficeLayout, seat: SeatSpot) => route(layout, seat.link, layout.doorLink);
