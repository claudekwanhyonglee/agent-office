// The Control room preset's floor plan (#100), in plain numbers like layout.ts. Tiers of consoles
// curve round a point behind the screen wall (-z) and face it; a stair aisle runs up their middle
// from the pit to the crew lounge, a raised mezzanine behind the top tier with a rail along its
// front. The entrance is in the left wall beside the pit; the side door in the right wall opens
// onto the deck. A new tier goes in behind the last and pushes the lounge back; the deck stays.
import {
  BREAK_ROOM, CHAT_GAP, DARTS_LINE, HOOPS_LINE, turnsAround, yawTowards,
  type Area, type DogSpot, type HangoutPlace, type HangoutPose, type HangoutSpot, type Point, type Props, type SeatSpot,
} from './layout.ts';
import { PLAYER_X } from './pong.ts';

export const INITIAL_TIERS = 3;
const SEATS_PER_SIDE = 3;

const ROOM = { left: -11, right: 11, back: -8.6 };
/** Every console faces this point, behind the screen wall. */
const FOCUS: Point = { x: 0, z: -10.5 };
const FIRST_RADIUS = 7.6;
const TIER_GAP = 3.0;
export const TIER_RISE = 0.4;
/** The screen wall is the room's tallest part. */
const SCREEN_WALL_HEIGHT = 6.4;
/** A tier's floor runs from this far in front of its consoles back to the next tier. */
const TIER_FRONT = 0.8;
/** Half a tier's width, as an arc at its consoles. */
export const TIER_HALF_ARC = 6.0;
const CONSOLE = { w: 1.48, d: 0.7 };
/** Console centre to centre along the arc. */
const SEAT_SPACING = 1.55;
/** Half the stair aisle up the middle of the tiers. */
const AISLE_HALF = 0.7;
const CHAIR_BEHIND = 1.0;
const APPROACH = 0.7;
/** Each tier's walkway, behind its chairs. */
const LANE_BEHIND = 1.9;
/** The walkway across the pit, from the entrance to the side door. */
const PIT_Z = -6.3;
const LOUNGE_DEPTH = 6.2;
/** The lounge walkway, this far behind the rail. */
const PROMENADE = 1.0;
/** Steps from the lounge down to the floor at the right, towards the side door. */
const RIGHT_STEPS = { x0: 8.2, x1: 10.2, length: 3.0 };
/** The right steps' flight has this many treads; each tier's front has a half step this deep in the centre aisle. */
export const FLIGHT = 8;
export const HALF_STEP = 0.36;
/** Walkers go up and down only inside the steps' areas, so their heights start this far in. */
const STEP_EDGE = 0.05;
/** Paper planes thrown from the lounge rail land this far from the focus, across the pit (#103). */
const PLANE_LANDING_RADIUS = 4.4;
const RIGHT_AISLE_X = (RIGHT_STEPS.x0 + RIGHT_STEPS.x1) / 2;
const DECK = { x0: ROOM.right + 0.3, x1: 22.5, z0: ROOM.back, z1: 8.5 };
/** Deck walkways: one from the side door along the house, two across the deck. */
const SPINE_X = 12.6;
const DECK_BACK_Z = -3.6;
const DECK_FRONT_Z = 2.6;
const DECK_END_X = 21.4;

const onArc = (radius: number, angle: number): Point =>
  ({ x: FOCUS.x + radius * Math.sin(angle), z: FOCUS.z + radius * Math.cos(angle) });
const tierRadius = (tier: number) => FIRST_RADIUS + tier * TIER_GAP;
/** Arc offsets of a tier's consoles from the aisle's centre line, left to right. */
const OFFSETS = (() => {
  const right = Array.from({ length: SEATS_PER_SIDE }, (_, i) => AISLE_HALF + CONSOLE.w / 2 + 0.035 + i * SEAT_SPACING);
  return [...right.map((s) => -s).reverse(), ...right];
})();
const LANE_END = OFFSETS.at(-1)! + 0.9;

export type ControlRoomLayout = ReturnType<typeof controlRoomLayout>;

/** The Control room with `rows` tiers of consoles (at least INITIAL_TIERS). */
export function controlRoomLayout(rows: number) {
  const tierCount = Math.max(rows, INITIAL_TIERS);
  const tiers = Array.from({ length: tierCount }, (_, t) => {
    const radius = tierRadius(t);
    return { radius, inner: radius - TIER_FRONT, outer: radius - TIER_FRONT + TIER_GAP, height: (t + 1) * TIER_RISE };
  });
  const loungeFront = FOCUS.z + tiers.at(-1)!.outer;
  const crewLounge = {
    name: 'crew lounge', x0: ROOM.left, x1: ROOM.right, z0: loungeFront, z1: loungeFront + LOUNGE_DEPTH, height: (tierCount + 1) * TIER_RISE,
    /** Its side walls rise this far above its floor (the dart board hangs on the left one). */
    wallHeight: 2.6,
  };
  /** A point in the lounge, `u` behind the rail. */
  const inLounge = (x: number, u: number): Point => ({ x, z: loungeFront + u });
  const promenadeZ = loungeFront + PROMENADE;
  const toPromenade = (p: Point): Point[] => [p, { x: p.x, z: promenadeZ }];

  const seats = seatsFor(tiers);
  const lanes = tiers.map((t) => lane(t.radius));
  const props = propsFor(inLounge);
  const lounge = { tv: { ...inLounge(3.2, 5.98), w: 2.6 }, sofa: { ...inLounge(3.2, 3.5), w: 2.8 }, rug: inLounge(3.2, 4.4) };
  const poolTurns = turnsAround(props.poolTable, (z) => [{ x: -1.8, z }, { x: -1.8, z: promenadeZ }]);

  const door: Point = { x: ROOM.left + 0.4, z: PIT_Z };
  const sideDoor: Point = { x: ROOM.right, z: PIT_Z };
  const walkways: Point[][] = [
    [{ x: -9.8, z: PIT_Z }, { x: SPINE_X, z: PIT_Z }],
    [{ x: 0, z: PIT_Z }, { x: 0, z: promenadeZ }],
    [{ x: RIGHT_AISLE_X, z: PIT_Z }, { x: RIGHT_AISLE_X, z: promenadeZ }],
    [{ x: -10.2, z: promenadeZ }, { x: 10.2, z: promenadeZ }],
    [{ x: SPINE_X, z: -7.8 }, { x: SPINE_X, z: 7.6 }],
    [{ x: SPINE_X, z: DECK_BACK_Z }, { x: DECK_END_X, z: DECK_BACK_Z }],
    [{ x: SPINE_X, z: DECK_FRONT_Z }, { x: DECK_END_X, z: DECK_FRONT_Z }],
    ...lanes,
  ];
  const kitchen = { counter: { ...inLounge(-6.0, 5.725), w: 3.6, d: 0.65 }, coffee: inLounge(-7.2, 5.725), table: inLounge(-6.0, 3.9) };
  const cooler = inLounge(-3.2, 5.8);

  return {
    preset: 'control-room' as const,
    rows: tierCount,
    bounds: { left: ROOM.left, right: DECK.x1, back: ROOM.back, front: Math.max(crewLounge.z1, DECK.z1) },
    hallZ: promenadeZ,
    door,
    /** From the entrance out to the pit walkway. */
    doorLink: [{ ...door }, { x: -9.8, z: PIT_Z }] as Point[],
    seats,
    hangouts: hangoutsFor({ props, lounge, kitchen, cooler, poolTurns, inLounge, toPromenade }),
    walkways,
    dogSpots: dogSpotsFor(inLounge, promenadeZ),
    poolTurns,
    lanes,
    kitchen,
    cooler,
    bookshelf: { ...inLounge(ROOM.left + 0.22, 4.6), length: 1.6 },
    lounge,
    /** The centre screen on the screen wall. */
    board: { x: 0, w: 8.2 },
    windows: [] as number[],
    plants: [
      { x: ROOM.left + 0.6, z: ROOM.back + 0.6 }, { x: ROOM.right - 0.6, z: ROOM.back + 0.6 }, inLounge(ROOM.left + 0.6, 5.8),
      { x: 11.9, z: 7.8 }, { x: 22.0, z: 8.0 },
    ] as Point[],
    wallArt: [] as number[],
    props,
    room: { ...ROOM, front: crewLounge.z1 },
    screenWall: { z: ROOM.back, focus: FOCUS, height: SCREEN_WALL_HEIGHT },
    tiers,
    /** Console footprints, `w` across and `d` deep, turned to `yaw` like their seats. */
    consoles: seats.map((s) => ({ ...s.desk, yaw: s.yaw, ...CONSOLE })),
    crewLounge,
    deck: { name: 'deck', ...DECK } as Area,
    sideDoor,
    /** Where walks may go up or down: the stair aisle up the middle, and the lounge's steps down to the right. */
    steps: [
      { name: 'centre steps', x0: -AISLE_HALF, x1: AISLE_HALF, z0: FOCUS.z + tiers[0].inner - 0.4, z1: loungeFront + 0.4 },
      { name: 'right steps', x0: RIGHT_STEPS.x0, x1: RIGHT_STEPS.x1, z0: loungeFront - RIGHT_STEPS.length, z1: loungeFront + 0.4 },
    ] as Area[],
    /** The glass rail along the lounge's front, open at the steps. */
    rail: [
      [{ x: ROOM.left, z: loungeFront }, { x: -AISLE_HALF, z: loungeFront }],
      [{ x: AISLE_HALF, z: loungeFront }, { x: RIGHT_STEPS.x0, z: loungeFront }],
      [{ x: RIGHT_STEPS.x1, z: loungeFront }, { x: ROOM.right, z: loungeFront }],
    ] as Point[][],
  };
}

/** Floor height at `p`: the pit, side aisles and deck are 0; tiers, their steps and the lounge are raised. */
export function heightAt(layout: ControlRoomLayout, p: Point): number {
  const { tiers, crewLounge } = layout;
  if (p.x > ROOM.right) return 0;
  if (p.z >= crewLounge.z0) return crewLounge.height;
  const d = Math.hypot(p.x - FOCUS.x, p.z - FOCUS.z), angle = Math.atan2(p.x - FOCUS.x, p.z - FOCUS.z);
  const tier = tiers.find((t, i) => d >= t.inner && (d < t.outer || i === tiers.length - 1));
  const onTier = tier && Math.abs(angle) <= TIER_HALF_ARC / tier.radius ? tier.height : 0;
  return Math.max(onTier, stepHeightAt(layout, p));
}

/** On the steps (as control-room-3d builds them), a little inside their areas: a tread of the right flight, or a half step in the centre aisle; else 0. */
function stepHeightAt({ tiers, crewLounge, steps: [centre, right] }: ControlRoomLayout, p: Point): number {
  const inside = (a: Area) => p.x > a.x0 + STEP_EDGE && p.x < a.x1 - STEP_EDGE && p.z > a.z0 + STEP_EDGE && p.z < a.z1 - STEP_EDGE;
  if (inside(right)) {
    const tread = Math.floor(((p.z - right.z0) / (crewLounge.z0 - right.z0)) * FLIGHT);
    return ((tread + 1) * crewLounge.height) / (FLIGHT + 1);
  }
  if (!inside(centre)) return 0;
  const fronts = [...tiers.map((t) => ({ z: FOCUS.z + t.inner, h: t.height })), { z: crewLounge.z0, h: crewLounge.height }];
  const front = fronts.find(({ z }) => p.z >= z - HALF_STEP && p.z < z);
  return front ? front.h - TIER_RISE / 2 : 0;
}

/** Where a paper plane aimed at `seat` lands: on the pit floor in front of its console (#103). */
export const pitLanding = (seat: SeatSpot): Point =>
  onArc(PLANE_LANDING_RADIUS, Math.atan2(seat.desk.x - FOCUS.x, seat.desk.z - FOCUS.z));

function seatsFor(tiers: { radius: number }[]): SeatSpot[] {
  return tiers.flatMap(({ radius: r }, row) => OFFSETS.map((offset, i) => {
    const angle = offset / r;
    const desk = onArc(r, angle), chair = onArc(r + CHAIR_BEHIND, angle), approach = onArc(r + CHAIR_BEHIND + APPROACH, angle);
    return {
      index: row * OFFSETS.length + i, row, desk, chair, yaw: yawTowards(chair, desk), sit: chair, approach, standSpot: approach,
      link: [chair, approach, onArc(r + LANE_BEHIND, angle)],
    };
  }));
}

/** A tier's walkway behind its chairs, through the stair aisle in the middle. */
function lane(radius: number): Point[] {
  const r = radius + LANE_BEHIND;
  return [-LANE_END / radius, ...OFFSETS.slice(0, SEATS_PER_SIDE).map((s) => s / radius), 0, ...OFFSETS.slice(SEATS_PER_SIDE).map((s) => s / radius), LANE_END / radius]
    .map((a) => onArc(r, a));
}

/** Lounge props move back with the lounge; deck props stay. */
function propsFor(inLounge: (x: number, u: number) => Point): Props {
  const pool = { x: 17.0, z: 0.6, w: 5.4, d: 2.8 };
  return {
    loungers: [{ x: 15.0, z: 3.95 }, { x: 15.8, z: 3.95 }],
    lounger: BREAK_ROOM.lounger,
    pond: { x: 16.0, z: -6.8, rx: 1.8, rz: 1.3 },
    jetty: { x: 18.4, z: -6.8, w: 1.6, d: 0.8 },
    hammock: { x: 19.1, z: 6.6, trees: [17.6, 20.6] },
    yogaMat: { x: 21.0, z: -6.4, w: 1.8, d: 0.6 },
    trampoline: { x: 13.9, z: 5.6, r: 0.85 },
    /** On the lounge's left wall. */
    dartboard: inLounge(ROOM.left, 2.4),
    bin: inLounge(8.4, 5.4),
    petBed: { x: 11.9, z: -1.0, rx: 0.45, rz: 0.32 },
    bowl: { x: 11.95, z: -0.35, r: 0.13 },
    poolTable: { ...inLounge(-0.6, 3.3), w: 1.2, d: 2.2 },
    pingPong: { ...inLounge(7.6, 3.0), w: 2.2, d: 1.2 },
    pool: { ...pool, rings: [-1.95, -0.65, 0.65, 1.95].map((dx) => ({ x: pool.x + dx, z: pool.z })) },
  };
}

interface HangoutParts {
  props: Props;
  lounge: { sofa: Point };
  kitchen: { table: Point };
  cooler: Point;
  poolTurns: ReturnType<typeof turnsAround>;
  inLounge: (x: number, u: number) => Point;
  toPromenade: (p: Point) => Point[];
}

/** Classic's activity spots, by the same names: games and the kitchen in the crew lounge, the outdoor ones on the deck. */
function hangoutsFor({ props, lounge, kitchen, cooler, poolTurns, inLounge, toPromenade }: HangoutParts): HangoutSpot[] {
  const place = (spot: string, pose: HangoutPose, p: Point, yaw: number, link: Point[], sits?: boolean): HangoutPlace =>
    ({ x: p.x, z: p.z, spot, yaw, pose, link: [{ x: p.x, z: p.z }, ...link], ...(sits && { sits }) });
  const solo = (spot: string, pose: HangoutPose, p: Point, yaw: number, link: Point[], sits?: boolean): HangoutSpot =>
    ({ name: spot, chat: false, places: [place(spot, pose, p, yaw, link, sits)] });
  const standing = (spot: string, p: Point, pose: HangoutPose, yaw = 0): HangoutPlace => ({ ...p, spot, yaw, pose, link: toPromenade(p) });
  const toDeck = (z: number) => (p: Point): Point[] => [p, { x: p.x, z }];
  const chatSpot = (name: string, centre: Point, link: (p: Point) => Point[]): HangoutSpot => {
    const [a, c] = [-1, 1].map((side) => ({ x: centre.x + (side * CHAT_GAP) / 2, z: centre.z }));
    const at = (p: Point, other: Point): HangoutPlace => ({ ...p, spot: name, yaw: yawTowards(p, other), pose: 'chatting', link: link(p) });
    return { name, chat: true, places: [at(a, c), at(c, a)] };
  };
  // The sofa faces the TV on the lounge's back wall (+z); sitters get up and walk round its right end.
  const { sofa } = lounge;
  const seatZ = sofa.z + 0.25, sofaFront = sofa.z + 0.95, sofaEnd = sofa.x + 1.8;
  const sofaSeat = (x: number, spot = 'lounge', pose: HangoutPose = 'lounging'): HangoutPlace => ({
    x, z: seatZ, spot, yaw: 0, pose, sits: true,
    link: [{ x, z: seatZ }, { x, z: sofaFront }, ...toPromenade({ x: sofaEnd, z: sofaFront })],
  });
  const cooler2 = inLounge(cooler.x + 0.8, 5.25);
  const { pingPong: pong, pool, loungers, jetty, hammock, yogaMat, trampoline, dartboard, bin } = props;
  const left = -Math.PI / 2, right = Math.PI / 2;
  const pongEnd = (x: number) => ({ ...place('ping-pong', 'paddle', { x, z: pong.z }, 0, [{ x, z: toPromenade(pong)[1].z }]), yaw: yawTowards({ x, z: pong.z }, pong) });

  return [
    {
      name: 'kitchen',
      chat: false,
      places: [
        standing('kitchen', inLounge(-7.2, 4.9), 'drinking'),
        standing('kitchen', inLounge(-4.8, 4.9), 'eating'),
        standing('kitchen', { x: kitchen.table.x, z: kitchen.table.z - 0.75 }, 'eating'),
      ],
    },
    {
      name: 'water-cooler',
      chat: false,
      places: [standing('water-cooler', inLounge(cooler.x, 5.05), 'drinking'), standing('water-cooler', cooler2, 'drinking', yawTowards(cooler2, cooler))],
    },
    { name: 'lounge', chat: false, places: [sofa.x - 0.7, sofa.x, sofa.x + 0.7].map((x) => sofaSeat(x)) },
    chatSpot('chat-hall', inLounge(-3.6, 2.2), toPromenade),
    chatSpot('chat-deck', { x: 20.6, z: 3.6 }, toDeck(DECK_FRONT_Z)),
    chatSpot('chat-deck-right', { x: 20.6, z: -1.6 }, toDeck(DECK_BACK_Z)),
    {
      name: 'loungers',
      chat: false,
      places: loungers.map((p) => place('loungers', 'lounging-sun', p, 0, [{ x: p.x, z: DECK_FRONT_Z }], true)),
    },
    // At the jetty's lake end, stepping off at its deck end.
    solo('fishing', 'fishing', { x: jetty.x - 0.2, z: jetty.z }, left, [{ x: jetty.x + 1.0, z: jetty.z }, { x: jetty.x + 1.0, z: DECK_BACK_Z }]),
    solo('hammock', 'swinging', hammock, right, [{ x: hammock.x, z: DECK_FRONT_Z }], true),
    solo('yoga', 'yoga', yogaMat, right, [{ x: yogaMat.x, z: DECK_BACK_Z }]),
    solo('trampoline', 'bouncing', trampoline, 0, [{ x: trampoline.x, z: DECK_FRONT_Z }], true),
    solo('darts', 'throwing-darts', { x: dartboard.x + DARTS_LINE, z: dartboard.z }, left, toPromenade({ x: dartboard.x + DARTS_LINE, z: dartboard.z }).slice(1)),
    solo('hoops', 'shooting-hoops', { x: bin.x + HOOPS_LINE, z: bin.z }, left, toPromenade({ x: bin.x + HOOPS_LINE, z: bin.z }).slice(1)),
    // Thrown from the rail, out over the pit.
    { name: 'planes', chat: false, places: [-6.0, -3.0, 3.0, 6.0].map((x) => standing('planes', inLounge(x, 0.4), 'throwing-plane', Math.PI)) },
    { name: 'pool-table', chat: false, game: { min: 2 }, places: [poolTurns[0].shoot, poolTurns[1].wait] },
    { name: 'ping-pong', chat: false, game: { min: 2 }, places: [pongEnd(pong.x - PLAYER_X), pongEnd(pong.x + PLAYER_X)] },
    {
      name: 'pool-dip',
      chat: false,
      places: pool.rings.map((r) => {
        const edge = { x: r.x, z: pool.z - pool.d / 2 - 0.2 };
        return { ...r, spot: 'pool-dip', yaw: 0, pose: 'floating' as const, sits: true, link: [{ ...r }, edge, { x: edge.x, z: DECK_BACK_Z }] };
      }),
    },
    { name: 'couch-co-op', chat: false, game: { min: 2 }, places: [-0.87, -0.29, 0.29, 0.87].map((dx) => sofaSeat(sofa.x + dx, 'couch-co-op', 'gaming')) },
  ];
}

/** The dog's bed on the deck (first: it starts there), a spot further out on the deck, one in the lounge and one in the pit. */
function dogSpotsFor(inLounge: (x: number, u: number) => Point, promenadeZ: number): DogSpot[] {
  const play: HangoutPose[] = ['petting', 'throwing-ball'];
  const onWalkway = (p: Point) => ({ at: p, link: [p], poses: play });
  const alongside = (name: string, dog: Point, fetch: Point): DogSpot =>
    ({ name, dog, link: [dog], fetch, visitors: [onWalkway({ x: dog.x - 0.6, z: dog.z }), onWalkway({ x: dog.x + 0.6, z: dog.z })] });
  const bed = { x: 11.9, z: -1.0 };
  return [
    {
      name: 'bed',
      dog: bed,
      link: [bed, { x: SPINE_X, z: bed.z }],
      fetch: { x: SPINE_X, z: -5.0 },
      visitors: [
        { at: { x: 13.2, z: bed.z }, link: [{ x: 13.2, z: bed.z }, { x: SPINE_X, z: bed.z }], poses: play },
        { at: { x: SPINE_X, z: -0.35 }, link: [{ x: SPINE_X, z: -0.35 }], poses: ['feeding'] },
      ],
    },
    alongside('deck', { x: 17.0, z: DECK_FRONT_Z }, { x: 13.6, z: DECK_FRONT_Z }),
    alongside('lounge', { x: -5.0, z: promenadeZ }, inLounge(5.6, PROMENADE)),
    alongside('pit', { x: -3.0, z: PIT_Z }, { x: 3.0, z: PIT_Z }),
  ];
}
