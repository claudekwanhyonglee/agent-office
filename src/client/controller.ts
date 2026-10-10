import type { AgentRecord, OfficeState } from '../shared/agent.ts';
import {
  DOG_SPEED, INITIAL_ROWS, WALK_SPEED, along, arrivalPath, behindChair, officeLayout, pathLength, route, withoutLoops, yawTowards,
  type DogSpot, type HangoutPlace, type HangoutPose, type Point, type SeatSpot,
} from './layout.ts';
import { SHOT_COUNT, SHOT_SECONDS } from './pool.ts';
import { hitter, rallySeconds, type Rally, type Side } from './pong.ts';
import { RETURN_SECONDS, driftParams, type Drift } from './float.ts';
import { CAST_SECONDS, landingFrom, type Cast } from './fishing.ts';
import { FISH } from './water.ts';

/** Seconds an idle agent waits at its desk before wandering off (AC: within 3 s). */
const SET_OFF = { min: 1, max: 2.5 };
/** Agents turning idle in the same update set off one after another, this far apart (#59). */
const STAGGER = { min: 0.55, max: 1 };
/** No two idle agents' next moves are closer than this, unless they're in the same game (#59). */
const MOVE_GAP = 0.35;
/** Seconds an idle agent stays at a spot. */
const STAY = { min: 10, max: 30 };
/** How often a due agent looks for someone to chat with, and how long to wait when every spot is full. */
const CHAT_CHANCE = 0.35;
const RETRY = { min: 3, max: 8 };
/** Places closer than this share furniture: only one of them can be used at a time. */
const OVERLAP = 0.5;
/** Seconds after arriving before the first paper plane, then between throws. */
const PLANE_FIRST = { min: 0.5, max: 1.5 };
const PLANE_EVERY = { min: 4, max: 7 };
/** Seconds a high-fiver or coffee courier stays once there. */
const ERRAND_STAY = { min: 2.5, max: 3.5 };
/** The dog (#34): how long it stops at a spot or rests in its bed, how often it goes to bed, how often agents go to it. */
const DOG_PAUSE = { min: 5, max: 15 };
const DOG_REST = { min: 20, max: 45 };
const DOG_BED_CHANCE = 0.3;
const DOG_CHANCE = 0.2;
const DOG_VISITORS = 2;
const FETCH_EVERY = { min: 5, max: 8 };
/** How many shots of a table-tennis rally reach the other bat before one is missed (#70). */
const RALLY_HITS = { min: 1, max: 9 };
/** Seconds between cheers on the sofa while anyone sits there (#61). */
const CHEER_EVERY = { min: 20, max: 60 };
const SOFA = ['lounge', 'couch-co-op'];
/** How often a cast ends in a catch (#58). */
const CATCH_CHANCE = 0.35;

const isIdle = (state: OfficeState) => state === 'done' || state === 'finished';

/** Something an idle agent is doing for another agent (#33). */
interface Reaction {
  kind: 'watch' | 'high-five' | 'coffee';
  /** The agent it's for. */
  target: string;
  /** The high five or the mug has happened. */
  done: boolean;
}

interface Walk { path: Point[]; /** From the walk's first point out to the spine. */ origin: Point[]; startedAt: number }

export interface Occupant {
  record: AgentRecord;
  seat: SeatSpot;
  /** The hangout place the agent is at or walking to; null means its desk. */
  place: HangoutPlace | null;
  walk?: Walk;
  /** When the current walk ends (in the past once the agent has arrived). */
  arrivesAt: number;
  /** When an idle agent next moves on; null while it isn't idle. */
  nextAt: number | null;
  /** When the agent next does its place's one-off action (throwing a paper plane). */
  actAt: number;
  reaction: Reaction | null;
  /** Just turned idle (or found idle on first load): it sets off at its own staggered time (#59). */
  settingOff?: boolean;
}

export type OfficeEvent =
  /** The office grew to `count` rows of desks. */
  | { type: 'rows'; count: number }
  /** Put straight at `place` (or the desk when null): the room was rearranged under the agent. */
  | { type: 'place'; key: string; seat: SeatSpot; state: OfficeState; place: HangoutPlace | null }
  /**
   * `walk` is false for agents already listed when the page opened: they're placed straight away,
   * at their desk or (idle ones) at `place`.
   */
  | { type: 'arrive'; key: string; record: AgentRecord; seat: SeatSpot; path: Point[]; walk: boolean; place: HangoutPlace | null }
  /** Walk along `path` to `place`, or to the desk when `place` is null. */
  | { type: 'walk'; key: string; path: Point[]; place: HangoutPlace | null }
  | { type: 'leave'; key: string; path: Point[] }
  | { type: 'state'; key: string; state: OfficeState }
  /** A paper plane thrown from the agent's place, landing on desk `desk` (a seat index). */
  | { type: 'plane'; key: string; desk: number }
  /** Agent `key` has walked over to agent `to` and they high-five. */
  | { type: 'high-five'; key: string; to: string }
  /** A coffee mug appears on (or is cleared from) desk `desk`. */
  | { type: 'mug'; desk: number; on: boolean }
  /** The dog runs along `path`, then lies down (in its bed) or stands. */
  | { type: 'dog'; path: Point[]; lie: boolean }
  /** Agent `key` throws a ball for the dog (the dog's run follows). */
  | { type: 'fetch'; key: string }
  /** Turn `shot` of the pool rack starts (#53); null: play stopped, the balls go back in the rack. */
  | { type: 'pool'; shot: number | null }
  /** A table-tennis rally starts (#70) between `players` (at the -x end, then the +x end); null: play stopped. */
  | { type: 'pong'; rally: Rally | null; players: [string, string] }
  /** How agent `key`'s ring will drift once it's afloat in the pool dip it's walking to (#57). */
  | { type: 'drift'; key: string; drift: Drift }
  /** Everyone sitting on the sofa (`keys`) fist-pumps, all at once (#61). */
  | { type: 'cheer'; keys: string[] }
  /** Agent `key` casts from the jetty (#58): where the float lands, and the fish it catches, if any. */
  | { type: 'cast'; key: string; cast: Cast };

export interface DogState {
  spot: DogSpot;
  lying: boolean;
  /** When its current walk or fetch run ends. */
  arrivesAt: number;
  /** When it next moves on (put off while agents are with it). */
  nextAt: number;
}

export interface Clock {
  /** Seconds. */
  now(): number;
  random(): number;
}

const systemClock: Clock = { now: () => performance.now() / 1000, random: Math.random };

/**
 * Decides who sits where, and where idle agents wander. Agents (keyed by session id) take the
 * first free desk and keep it while listed; when every desk is taken, a row of desks is added.
 * Done and Finished agents leave their desk for hangout spots. Rendering only follows its events.
 */
export class OfficeController {
  readonly agents = new Map<string, Occupant>();
  rows = INITIAL_ROWS;
  layout = officeLayout(INITIAL_ROWS);
  private firstUpdate = true;
  /** The last set-off handed out in this update, so agents turning idle together are staggered (#59). */
  private lastSetOff = -Infinity;
  /** When a chat or game was last started: one per moment, so a game's end doesn't set off a crowd (#59). */
  private togetherAt = -Infinity;
  /** When a helper was last sent on an errand: one per moment, so a batch of state changes doesn't send a crowd (#59). */
  private errandAt = -Infinity;
  private clock: Clock;
  /** Desks with a delivered mug, by the key of the agent working there. */
  private mugs = new Map<string, number>();
  readonly dog: DogState;
  /** The pool game in play (#53): its two players (the first breaks), the turn it's on and when the next starts. */
  private pool: { players: [string, string]; turn: number; nextAt: number } | null = null;
  /** The table-tennis game in play (#70): its players (-x end first), the rally and when it ends. */
  private pong: { players: [string, string]; rally: Rally; nextAt: number } | null = null;
  /** When the sofa next cheers, if anyone's sitting there then (#61). */
  private cheerAt: number | null = null;

  constructor(clock: Partial<Clock> = {}) {
    this.clock = { ...systemClock, ...clock };
    const now = this.clock.now();
    this.dog = { spot: this.layout.dogSpots[0], lying: true, arrivesAt: now, nextAt: now + this.between(DOG_REST) };
  }

  update(records: AgentRecord[]): OfficeEvent[] {
    const now = this.clock.now();
    const events: OfficeEvent[] = [];
    const listed = new Map(records.map((r) => [r.sessionId, r]));
    this.lastSetOff = -Infinity;

    for (const [key, agent] of this.agents) {
      if (listed.has(key)) continue;
      this.agents.delete(key);
      events.push({ type: 'leave', key, path: route(this.layout, this.whereNow(agent, now), this.layout.doorLink) });
      this.endIfShortHanded(agent.place, now, events);
      this.releaseOnlookers(key, now, events);
      this.clearMug(key, events);
    }

    for (const [key, record] of listed) {
      const agent = this.agents.get(key);
      if (agent) this.changeState(key, agent, record, now, events);
      else this.arrive(key, record, now, events);
    }

    this.firstUpdate = false;
    return events;
  }

  /** Moves on idle agents whose time is up. Call it often (every frame is fine). */
  tick(): OfficeEvent[] {
    const now = this.clock.now();
    const events: OfficeEvent[] = [];
    for (const [key, agent] of this.agents) {
      if (agent.nextAt != null && agent.nextAt <= now) this.wander(key, agent, now, events);
      else this.act(key, agent, now, events);
    }
    this.moveDog(now, events);
    this.playPool(now, events);
    this.playPong(now, events);
    this.cheerOn(now, events);
    return events;
  }

  /** Every so often, everyone sitting on the sofa cheers together; with nobody there, the moment passes (#61). */
  private cheerOn(now: number, events: OfficeEvent[]) {
    this.cheerAt ??= now + this.between(CHEER_EVERY);
    if (now < this.cheerAt) return;
    this.cheerAt = now + this.between(CHEER_EVERY);
    const keys = [...this.agents].filter(([, a]) => SOFA.includes(a.place?.spot ?? '') && a.arrivesAt <= now).map(([k]) => k);
    if (keys.length) events.push({ type: 'cheer', keys });
  }

  /** The two players at a game's spot once both have arrived, if they have. */
  private arrivedPlayers(spot: string, now: number) {
    const players = [...this.agents].filter(([, a]) => a.place?.spot === spot);
    return players.length === 2 && players.every(([, a]) => a.arrivesAt <= now) ? players : null;
  }

  /** Table tennis (#70): rallies of a random length, each ending in a miss; whoever missed serves the next. */
  private playPong(now: number, events: OfficeEvent[]) {
    let server: Side;
    if (!this.pong) {
      const players = this.arrivedPlayers('ping-pong', now);
      if (!players) return;
      const [left, right] = players.sort(([, a], [, b]) => a.place!.x - b.place!.x).map(([k]) => k);
      server = this.clock.random() < 0.5 ? -1 : 1;
      this.pong = { players: [left, right], rally: { server, hits: 0 }, nextAt: now };
    } else {
      if (now < this.pong.nextAt) return;
      const last = this.pong.rally;
      server = -hitter(last, last.hits) as Side;
    }
    const rally = { server, hits: Math.floor(this.between(RALLY_HITS)) };
    this.pong.rally = rally;
    this.pong.nextAt += rallySeconds(rally);
    events.push({ type: 'pong', rally, players: this.pong.players });
  }

  /**
   * Pool (#53): once both players are at the table, turns follow every SHOT_SECONDS. Each turn the
   * last shooter steps back to wait at its end, and the other player steps up to the next shot's spot.
   */
  private playPool(now: number, events: OfficeEvent[]) {
    if (!this.pool) {
      const players = this.arrivedPlayers('pool-table', now);
      if (!players) return;
      const breaker = players.find(([, a]) => a.place!.pose === 'cue-shot') ?? players[0];
      const other = players.find((p) => p !== breaker)!;
      this.pool = { players: [breaker[0], other[0]], turn: 0, nextAt: now + SHOT_SECONDS };
      events.push({ type: 'pool', shot: 0 });
      return;
    }
    const pool = this.pool;
    if (now < pool.nextAt) return;
    const last = pool.turn % SHOT_COUNT, shot = (pool.turn + 1) % SHOT_COUNT;
    const [waiter, shooter] = [pool.players[pool.turn % 2], pool.players[(pool.turn + 1) % 2]];
    pool.turn += 1;
    pool.nextAt += SHOT_SECONDS;
    const turns = this.layout.poolTurns;
    this.step(waiter, turns[last].wait, now, events);
    this.step(shooter, turns[shot].shoot, now, events);
    events.push({ type: 'pool', shot });
  }

  /** Walks a player straight to another place at the same table (its stay there is unchanged). */
  private step(key: string, place: HangoutPlace, now: number, events: OfficeEvent[]) {
    const agent = this.agents.get(key)!;
    const from = agent.place!;
    const path = [{ x: from.x, z: from.z }, { x: place.x, z: place.z }];
    agent.place = place;
    agent.walk = { path, origin: from.link, startedAt: now };
    agent.arrivesAt = now + pathLength(path) / WALK_SPEED;
    events.push({ type: 'walk', key, path, place });
  }

  /** Who sits at each desk (their latest record), by seat index. */
  occupants() {
    return new Map([...this.agents.values()].map((o) => [o.seat.index, o.record]));
  }

  private arrive(key: string, record: AgentRecord, now: number, events: OfficeEvent[]) {
    const seat = this.freeSeat(now, events);
    const agent: Occupant = { record, seat, place: null, arrivesAt: now, nextAt: null, actAt: now + this.between(PLANE_FIRST), reaction: null };
    this.agents.set(key, agent);
    const path = arrivalPath(this.layout, seat);
    if (this.firstUpdate) {
      // Already there when the page opened: idle agents are found at a hangout spot.
      const place = isIdle(record.state) ? this.pick(this.freePlaces().filter((p) => !this.spotOf(p)?.game)) : null;
      if (place) {
        agent.place = place;
        agent.nextAt = this.setOffTime(now, STAY, agent);
      }
      events.push({ type: 'arrive', key, record, seat, path, walk: false, place });
      return;
    }
    agent.walk = { path, origin: this.layout.doorLink, startedAt: now };
    agent.arrivesAt = now + pathLength(path) / WALK_SPEED;
    if (isIdle(record.state)) agent.nextAt = this.setOffTime(agent.arrivesAt, SET_OFF, agent);
    events.push({ type: 'arrive', key, record, seat, path, walk: true, place: null });
  }

  private changeState(key: string, agent: Occupant, record: AgentRecord, now: number, events: OfficeEvent[]) {
    const was = agent.record.state;
    agent.record = record;
    if (was === record.state) return;
    events.push({ type: 'state', key, state: record.state });
    if (!isIdle(record.state)) {
      agent.nextAt = null;
      const away = agent.place || (agent.walk && now < agent.arrivesAt);
      if (away) this.send(key, agent, null, now, events);
    } else if (!isIdle(was)) {
      agent.nextAt = this.setOffTime(now, SET_OFF, agent);
    }
    this.react(key, agent, was, now, events);
  }

  /** The dog moves on when its time is up and nobody is with it: to its bed now and then, else to another spot. */
  private moveDog(now: number, events: OfficeEvent[]) {
    const dog = this.dog;
    if (dog.nextAt > now || dog.arrivesAt > now) return;
    if (this.dogVisitors().length) {
      dog.nextAt = now + this.between(RETRY);
      return;
    }
    const [bed, ...others] = this.layout.dogSpots;
    const lie = dog.spot !== bed && this.clock.random() < DOG_BED_CHANCE;
    const next = lie ? bed : this.pick([bed, ...others].filter((s) => s !== dog.spot && s !== bed))!;
    const path = route(this.layout, dog.spot.link, next.link);
    dog.spot = next;
    dog.lying = lie;
    dog.arrivesAt = now + pathLength(path) / DOG_SPEED;
    dog.nextAt = dog.arrivesAt + this.between(lie ? DOG_REST : DOG_PAUSE);
    events.push({ type: 'dog', path, lie });
  }

  private dogVisitors() {
    return [...this.agents.values()].filter((a) => a.place?.spot === 'dog');
  }

  /** An idle agent goes to the dog where it is (if it has stopped there and has room) to pet it, feed it or play fetch. */
  private visitDog(key: string, agent: Occupant, now: number, events: OfficeEvent[]) {
    const dog = this.dog, visitors = this.dogVisitors();
    if (dog.arrivesAt > now || visitors.length >= DOG_VISITORS) return false;
    const visit = this.pick(dog.spot.visitors.filter((v) => !visitors.some((a) => a.place!.x === v.at.x && a.place!.z === v.at.z)));
    if (!visit) return false;
    const place = errandPlace('dog', this.pick(visit.poses)!, visit.at, visit.link, yawTowards(visit.at, dog.spot.dog));
    this.send(key, agent, place, now, events);
    dog.nextAt = Math.max(dog.nextAt, agent.nextAt!);
    return true;
  }

  /** The dog runs to where the ball lands and back. */
  private fetch(key: string, now: number, events: OfficeEvent[]) {
    const dog = this.dog;
    const out = route(this.layout, dog.spot.link, [dog.spot.fetch]);
    const path = [...out, ...out.slice(0, -1).reverse()];
    dog.lying = false;
    dog.arrivesAt = now + pathLength(path) / DOG_SPEED;
    events.push({ type: 'fetch', key }, { type: 'dog', path, lie: false });
  }

  /** Idle agents react to another agent's state change (#33). */
  private react(key: string, agent: Occupant, was: OfficeState, now: number, events: OfficeEvent[]) {
    const state = agent.record.state;
    if (was === 'needs') this.releaseOnlookers(key, now, events);
    if (was === 'working') this.clearMug(key, events);
    if (state === 'needs') this.gatherOnlookers(key, agent, now, events);
    else if (state === 'done' && !agent.place) this.highFive(key, agent, now, events);
    else if (state === 'working') this.bringCoffee(key, agent, now, events);
  }

  /** Up to three idle agents come and look over the shoulder of an agent that needs you; they stay until it doesn't. */
  private gatherOnlookers(key: string, agent: Occupant, now: number, events: OfficeEvent[]) {
    const spots = behindChair(this.layout, agent.seat);
    const onlookers = this.shuffled(this.helpers(key)).slice(0, spots.length);
    onlookers.forEach(([k, a], i) => {
      const place = errandPlace('over-the-shoulder', 'watching', spots[i], [spots[i]], yawTowards(spots[i], agent.seat.desk));
      this.send(k, a, place, now, events);
      a.nextAt = null;
      a.reaction = { kind: 'watch', target: key, done: true };
    });
  }

  private releaseOnlookers(key: string, now: number, events: OfficeEvent[]) {
    for (const [k, a] of this.agents) {
      if (a.reaction?.kind !== 'watch' || a.reaction.target !== key) continue;
      a.reaction = null;
      this.wander(k, a, now, events);
    }
  }

  /** The nearest idle agent (by route length) walks over to high-five an agent that just finished; it waits for them. */
  private highFive(key: string, agent: Occupant, now: number, events: OfficeEvent[]) {
    if (this.errandAt === now) return;
    const place = this.deskSide('high-five', 'high-five', agent.seat);
    const lengths = this.helpers(key).map(([k, a]) => ({ k, a, length: pathLength(route(this.layout, this.whereNow(a, now), place.link)) }));
    if (!lengths.length) return;
    const { k, a } = lengths.reduce((best, c) => (c.length < best.length ? c : best));
    this.errand(k, a, place, { kind: 'high-five', target: key, done: false }, now, events);
    // It waits for the high five, then moves on just after the high-fiver.
    agent.nextAt = this.stagger(Math.max(agent.nextAt ?? now, a.nextAt!), { min: 0, max: 0.5 }, [agent]);
  }

  /** An idle agent fetches a coffee from the kitchen and leaves it on the desk of an agent that started working. */
  private bringCoffee(key: string, agent: Occupant, now: number, events: OfficeEvent[]) {
    const onItsWay = [...this.agents.values()].some((a) => a.reaction?.kind === 'coffee' && a.reaction.target === key);
    const courier = this.pick(this.helpers(key));
    if (this.mugs.has(key) || onItsWay || !courier || this.errandAt === now) return;
    const kitchen = this.layout.hangouts.find((s) => s.name === 'kitchen')!.places[0];
    const place = this.deskSide('coffee-delivery', 'delivering', agent.seat);
    this.errand(courier[0], courier[1], place, { kind: 'coffee', target: key, done: false }, now, events, kitchen);
  }

  private clearMug(key: string, events: OfficeEvent[]) {
    const desk = this.mugs.get(key);
    if (desk == null) return;
    this.mugs.delete(key);
    events.push({ type: 'mug', desk, on: false });
  }

  /** Sends an agent on an errand for another: it does its part on arrival (see `act`), then moves on. */
  private errand(key: string, agent: Occupant, place: HangoutPlace, reaction: Reaction, now: number, events: OfficeEvent[], via?: HangoutPlace) {
    this.errandAt = now;
    this.send(key, agent, place, now, events, via);
    agent.nextAt = this.stagger(agent.arrivesAt, ERRAND_STAY, [agent]);
    agent.actAt = agent.arrivesAt;
    agent.reaction = reaction;
  }

  /** Standing just behind a seat's chair, facing it. */
  private deskSide(spot: string, pose: HangoutPose, seat: SeatSpot) {
    const [approach, ...link] = seat.link.slice(1);
    return errandPlace(spot, pose, approach, [approach, ...link], yawTowards(approach, seat.chair));
  }

  /** Idle agents free to react for agent `key`: not already doing something for someone, nor in the middle of a game. */
  private helpers(key: string) {
    return [...this.agents].filter(([k, a]) => k !== key && isIdle(a.record.state) && !a.reaction && !(a.place && this.spotOf(a.place)?.game));
  }

  private wander(key: string, agent: Occupant, now: number, events: OfficeEvent[]) {
    if (this.clock.random() < CHAT_CHANCE && this.togetherAt !== now && this.startTogether(key, agent, now, events)) return;
    if (this.clock.random() < DOG_CHANCE && this.visitDog(key, agent, now, events)) return;
    const here = agent.place?.spot;
    const place = this.pick(this.freePlaces().filter((p) => this.isSolo(p) && p.spot !== here));
    if (place) this.send(key, agent, place, now, events);
    else if (agent.place && !this.isSolo(agent.place)) {
      // Nowhere free, but a game can't be played alone: wait at the desk instead.
      this.send(key, agent, null, now, events);
      agent.nextAt = this.stagger(agent.arrivesAt, RETRY, [agent]);
    } else agent.nextAt = this.stagger(now, RETRY, [agent]);
  }

  /**
   * When an agent that just turned idle (or was found idle on first load) moves: `range` after
   * `from`, and if others turned idle in the same update, a STAGGER after the last of them (#59).
   */
  private setOffTime(from: number, range: { min: number; max: number }, agent: Occupant) {
    agent.settingOff = true;
    let t = this.stagger(from, range, [agent]);
    if (t < this.lastSetOff + STAGGER.min) t = this.stagger(Math.max(from, this.lastSetOff), STAGGER, [agent]);
    this.lastSetOff = t;
    return t;
  }

  /**
   * `from` plus a random pick from `range`, moved to the nearest moment (in range if it can) that's
   * at least MOVE_GAP from every other agent's next move, leaving out `except` (#59).
   */
  private stagger(from: number, { min, max }: { min: number; max: number }, except: Occupant[]) {
    const others = [...this.agents.values()].filter((a) => a.nextAt != null && !except.includes(a)).map((a) => a.nextAt!);
    const want = from + this.between({ min, max });
    const clear = (t: number) => t >= from + min && others.every((o) => Math.abs(t - o) >= MOVE_GAP - 1e-9);
    const slots = [want, ...others.flatMap((o) => [o - MOVE_GAP, o + MOVE_GAP])].filter(clear);
    const inRange = slots.filter((t) => t <= from + max);
    const nearest = (ts: number[]) => ts.reduce((a, b) => (Math.abs(b - want) < Math.abs(a - want) ? b : a));
    return nearest(inRange.length ? inRange : slots);
  }

  /**
   * Starts a chat or game at a free spot, with enough free idle agents to start it (as many as
   * it has places). A game's players all finish at the same time.
   */
  private startTogether(key: string, agent: Occupant, now: number, events: OfficeEvent[]) {
    const free = this.freePlaces();
    const spot = this.pick(this.layout.hangouts.filter((s) => !this.isSolo(s.places[0]) && s.places.every((p) => free.includes(p))));
    if (!spot) return false;
    const partners = this.shuffled(this.freeToJoin(key, now)).slice(0, spot.places.length - 1);
    if (partners.length + 1 < (spot.game?.min ?? spot.places.length)) return false;
    this.togetherAt = now;
    const players: [string, Occupant][] = [[key, agent], ...partners];
    // Partners first: sending the starter may end its old game, and those players then look for partners too.
    for (let i = players.length - 1; i >= 0; i--) this.send(players[i][0], players[i][1], spot.places[i], now, events);
    if (spot.game) {
      // One end time that keeps every player's stay within STAY (when their arrivals are close enough).
      const arrivals = players.map(([, a]) => a.arrivesAt);
      const earliest = Math.max(...arrivals) + STAY.min, latest = Math.min(...arrivals) + STAY.max;
      const end = this.stagger(0, { min: earliest, max: Math.max(earliest, latest) }, players.map(([, a]) => a));
      for (const [, a] of players) a.nextAt = end;
    }
    return true;
  }

  /**
   * Other idle agents free to join in: arrived, and either at their desk or done with a minimum stay
   * at a solo place. Agents that just turned idle set off on their own, staggered (#59).
   */
  private freeToJoin(key: string, now: number) {
    return [...this.agents].filter(([other, a]) =>
      other !== key && isIdle(a.record.state) && a.nextAt != null && a.arrivesAt <= now && !a.settingOff
      && (!a.place || (this.isSolo(a.place) && now - a.arrivesAt >= STAY.min)));
  }

  /** After a player leaves `left`, a game left with fewer than 2 players ends and the rest move on. */
  private endIfShortHanded(left: HangoutPlace | null, now: number, events: OfficeEvent[]) {
    if (!left || !this.spotOf(left)?.game) return;
    const players = [...this.agents].filter(([, a]) => a.place?.spot === left.spot);
    if (players.length >= 2) return;
    if (left.spot === 'pool-table' && this.pool) {
      this.pool = null;
      events.push({ type: 'pool', shot: null });
    }
    if (left.spot === 'ping-pong' && this.pong) {
      events.push({ type: 'pong', rally: null, players: this.pong.players });
      this.pong = null;
    }
    for (const [key, agent] of players) this.wander(key, agent, now, events);
  }

  /** The hangout spot a place belongs to; none for an errand place (#33). */
  private spotOf(place: HangoutPlace) {
    return this.layout.hangouts.find((s) => s.name === place.spot);
  }

  /** A hangout place one agent uses on its own (not part of a chat or game, nor an errand). */
  private isSolo(place: HangoutPlace) {
    const spot = this.spotOf(place);
    return !!spot && !spot.chat && !spot.game;
  }

  /** Walk the agent to `place` (null: its desk) from wherever it is now, by way of `via` if given. */
  private send(key: string, agent: Occupant, place: HangoutPlace | null, now: number, events: OfficeEvent[], via?: HangoutPlace) {
    const origin = this.whereNow(agent, now);
    const to = place ? place.link : agent.seat.link;
    const path = via ? [...route(this.layout, origin, via.link), ...route(this.layout, via.link, to).slice(1)] : route(this.layout, origin, to);
    agent.reaction = null;
    agent.settingOff = false;
    const left = agent.place;
    // Afloat in a pool dip, the agent paddles back to the ring's home spot before setting off (#57).
    const setsOff = left?.pose === 'floating' && agent.arrivesAt <= now ? now + RETURN_SECONDS : now;
    agent.place = place;
    agent.walk = { path, origin, startedAt: setsOff };
    agent.arrivesAt = setsOff + pathLength(path) / WALK_SPEED;
    agent.nextAt = place ? this.stagger(agent.arrivesAt, STAY, [agent]) : null;
    agent.actAt = agent.arrivesAt + this.between(PLANE_FIRST);
    events.push({ type: 'walk', key, path, place });
    if (place?.pose === 'floating') events.push({ type: 'drift', key, drift: driftParams(this.clock.random) });
    if (left !== place) this.endIfShortHanded(left, now, events);
  }

  /** Once arrived, an agent does its errand, or at the paper-plane place throws planes at the desks. */
  private act(key: string, agent: Occupant, now: number, events: OfficeEvent[]) {
    if (agent.arrivesAt > now || agent.actAt > now) return;
    if (agent.reaction && !agent.reaction.done) return this.finishErrand(key, agent.reaction, events);
    if (agent.place?.pose === 'throwing-ball' && this.dog.arrivesAt <= now) {
      this.fetch(key, now, events);
      agent.actAt = now + this.between(FETCH_EVERY);
      return;
    }
    if (agent.place?.pose === 'fishing') {
      const landing = landingFrom(this.clock.random);
      const fish = this.clock.random() < CATCH_CHANCE ? Math.floor(this.clock.random() * FISH) : null;
      events.push({ type: 'cast', key, cast: { landing, fish } });
      agent.actAt = now + CAST_SECONDS;
      return;
    }
    if (agent.place?.pose !== 'throwing-plane') return;
    events.push({ type: 'plane', key, desk: this.pick(this.layout.seats)!.index });
    agent.actAt = now + this.between(PLANE_EVERY);
  }

  /**
   * A route from where the agent is now out to the spine. Mid-walk, that's back along the leg it's
   * on and the way it came, so every step is on a route that's already known to be clear.
   */
  private whereNow(agent: Occupant, now: number): Point[] {
    const walk = agent.walk;
    if (walk && now < agent.arrivesAt) {
      const { leg } = along(walk.path, (now - walk.startedAt) * WALK_SPEED);
      return withoutLoops([...walk.path.slice(0, leg + 1).reverse(), ...walk.origin.slice(1)]);
    }
    return agent.place ? agent.place.link : agent.seat.link;
  }

  /**
   * Places nobody is at or walking to, and not overlapping a taken one (the sofa seats lounging and
   * co-op players). A game in progress holds all its places, even with fewer players than places.
   */
  private freePlaces() {
    const held = (p: HangoutPlace) => this.spotOf(p)?.game ? this.spotOf(p)!.places : [p];
    const taken = [...this.agents.values()].flatMap((a) => (a.place ? held(a.place) : []));
    return this.layout.hangouts.flatMap((s) => s.places).filter((p) => taken.every((q) => Math.hypot(p.x - q.x, p.z - q.z) >= OVERLAP));
  }

  private finishErrand(key: string, reaction: Reaction, events: OfficeEvent[]) {
    reaction.done = true;
    const target = this.agents.get(reaction.target);
    if (reaction.kind === 'high-five' && target) events.push({ type: 'high-five', key, to: reaction.target });
    if (reaction.kind === 'coffee' && target?.record.state === 'working' && !this.mugs.has(reaction.target)) {
      this.mugs.set(reaction.target, target.seat.index);
      events.push({ type: 'mug', desk: target.seat.index, on: true });
    }
  }

  private shuffled<T>(options: T[]): T[] {
    const rest = [...options], out: T[] = [];
    while (rest.length) out.push(rest.splice(Math.floor(this.clock.random() * rest.length), 1)[0]);
    return out;
  }

  private pick<T>(options: T[]): T | null {
    return options.length ? options[Math.floor(this.clock.random() * options.length)] : null;
  }

  private between({ min, max }: { min: number; max: number }) {
    return min + this.clock.random() * (max - min);
  }

  private freeSeat(now: number, events: OfficeEvent[]) {
    const taken = new Set([...this.agents.values()].map((o) => o.seat.index));
    const free = () => this.layout.seats.find((s) => !taken.has(s.index));
    if (!free()) this.addRow(now, events);
    return free()!;
  }

  /**
   * A new row goes in behind the last and pushes the back wall (and the hangouts along it) back.
   * Agents away from their desks are put straight at their moved spot, or back at their desk.
   */
  private addRow(now: number, events: OfficeEvent[]) {
    const old = this.layout;
    this.rows += 1;
    this.layout = officeLayout(this.rows);
    events.push({ type: 'rows', count: this.rows });
    const places = old.hangouts.flatMap((s) => s.places), moved = this.layout.hangouts.flatMap((s) => s.places);
    // The hall moves back, and the dog's hall spot with it.
    this.dog.spot = this.layout.dogSpots.find((s) => s.name === this.dog.spot.name)!;
    this.dog.arrivesAt = now;
    events.push({ type: 'dog', path: [this.dog.spot.dog], lie: this.dog.lying });
    for (const [key, agent] of this.agents) {
      agent.seat = this.layout.seats[agent.seat.index];
      const walking = agent.walk && now < agent.arrivesAt;
      if (!agent.place && !walking) continue;
      agent.place = agent.place && (moved[places.indexOf(agent.place)] ?? agent.place); // errand places don't move
      agent.walk = undefined;
      agent.arrivesAt = now;
      if (agent.place && agent.nextAt == null) agent.nextAt = this.stagger(now, STAY, [agent]);
      events.push({ type: 'place', key, seat: agent.seat, state: agent.record.state, place: agent.place });
    }
  }
}

/** A one-off place for an errand (#33): not one of the office's hangout spots. */
function errandPlace(spot: string, pose: HangoutPose, p: Point, link: Point[], yaw: number): HangoutPlace {
  return { x: p.x, z: p.z, spot, pose, yaw, link };
}
