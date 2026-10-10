import type { AgentRecord, OfficeState } from '../shared/agent.ts';
import {
  HANGOUTS, PODS_PER_ROW, WALK_SPEED, along, arrivalPath, doorLink, pathLength, route, seatLayout, seatLink, withoutLoops,
  type HangoutPlace, type Point, type SeatSpot,
} from './layout.ts';

export const INITIAL_PODS = 4;

/** Seconds an idle agent waits at its desk before wandering off (AC: within 3 s). */
const SET_OFF = { min: 1, max: 2.5 };
/** Seconds an idle agent stays at a spot. */
const STAY = { min: 10, max: 30 };
/** How often a due agent looks for someone to chat with, and how long to wait when every spot is full. */
const CHAT_CHANCE = 0.35;
const RETRY = 5;

const isIdle = (state: OfficeState) => state === 'done' || state === 'finished';

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
}

export type OfficeEvent =
  | { type: 'pods'; count: number }
  /**
   * `walk` is false for agents already listed when the page opened: they're placed straight away,
   * at their desk or (idle ones) at `place`.
   */
  | { type: 'arrive'; key: string; record: AgentRecord; seat: SeatSpot; path: Point[]; walk: boolean; place: HangoutPlace | null }
  /** Walk along `path` to `place`, or to the desk when `place` is null. */
  | { type: 'walk'; key: string; path: Point[]; place: HangoutPlace | null }
  | { type: 'leave'; key: string; path: Point[] }
  | { type: 'state'; key: string; state: OfficeState };

export interface Clock {
  /** Seconds. */
  now(): number;
  random(): number;
}

const systemClock: Clock = { now: () => performance.now() / 1000, random: Math.random };

/**
 * Decides who sits where, and where idle agents wander. Agents (keyed by session id) take the
 * first free desk and keep it while listed; when every desk is taken, a row of pods is added.
 * Done and Finished agents leave their desk for hangout spots. Rendering only follows its events.
 */
export class OfficeController {
  readonly agents = new Map<string, Occupant>();
  podCount = INITIAL_PODS;
  private seats = seatLayout(INITIAL_PODS);
  private firstUpdate = true;
  private clock: Clock;

  constructor(clock: Partial<Clock> = {}) {
    this.clock = { ...systemClock, ...clock };
  }

  update(records: AgentRecord[]): OfficeEvent[] {
    const now = this.clock.now();
    const events: OfficeEvent[] = [];
    const listed = new Map(records.map((r) => [r.sessionId, r]));

    for (const [key, agent] of this.agents) {
      if (listed.has(key)) continue;
      this.agents.delete(key);
      events.push({ type: 'leave', key, path: route(this.whereNow(agent, now), doorLink()) });
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
    }
    return events;
  }

  /** Who sits at each desk, by seat index. */
  occupants() {
    return new Map([...this.agents.values()].map((o) => [o.seat.index, o.record.state]));
  }

  private arrive(key: string, record: AgentRecord, now: number, events: OfficeEvent[]) {
    const seat = this.freeSeat(events);
    const agent: Occupant = { record, seat, place: null, arrivesAt: now, nextAt: null };
    this.agents.set(key, agent);
    const path = arrivalPath(seat);
    if (this.firstUpdate) {
      // Already there when the page opened: idle agents are found at a hangout spot.
      const place = isIdle(record.state) ? this.pick(this.freePlaces()) : null;
      if (place) {
        agent.place = place;
        agent.nextAt = now + this.between(STAY);
      }
      events.push({ type: 'arrive', key, record, seat, path, walk: false, place });
      return;
    }
    agent.walk = { path, origin: doorLink(), startedAt: now };
    agent.arrivesAt = now + pathLength(path) / WALK_SPEED;
    if (isIdle(record.state)) agent.nextAt = agent.arrivesAt + this.between(SET_OFF);
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
      agent.nextAt = now + this.between(SET_OFF);
    }
  }

  private wander(key: string, agent: Occupant, now: number, events: OfficeEvent[]) {
    const free = this.freePlaces();
    if (this.clock.random() < CHAT_CHANCE) {
      const partner = this.chatPartner(key, now);
      const spot = this.pick(HANGOUTS.filter((s) => s.chat && s.places.every((p) => free.includes(p))));
      if (partner && spot) {
        this.send(key, agent, spot.places[0], now, events);
        this.send(partner[0], partner[1], spot.places[1], now, events);
        return;
      }
    }
    const here = agent.place?.spot;
    const place = this.pick(free.filter((p) => !HANGOUTS.find((s) => s.name === p.spot)!.chat && p.spot !== here));
    if (place) this.send(key, agent, place, now, events);
    else agent.nextAt = now + RETRY;
  }

  /** Another idle agent that is free to talk: arrived, and either at its desk or done with a minimum stay. */
  private chatPartner(key: string, now: number) {
    const candidates = [...this.agents].filter(([other, a]) =>
      other !== key && isIdle(a.record.state) && a.nextAt != null && a.arrivesAt <= now
      && (!a.place || (!a.place.spot.startsWith('chat') && now - a.arrivesAt >= STAY.min)));
    return this.pick(candidates);
  }

  /** Walk the agent to `place` (null: its desk) from wherever it is now. */
  private send(key: string, agent: Occupant, place: HangoutPlace | null, now: number, events: OfficeEvent[]) {
    const origin = this.whereNow(agent, now);
    const path = route(origin, place ? place.link : seatLink(agent.seat));
    agent.place = place;
    agent.walk = { path, origin, startedAt: now };
    agent.arrivesAt = now + pathLength(path) / WALK_SPEED;
    agent.nextAt = place ? agent.arrivesAt + this.between(STAY) : null;
    events.push({ type: 'walk', key, path, place });
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
    return agent.place ? agent.place.link : seatLink(agent.seat);
  }

  private freePlaces() {
    const taken = new Set([...this.agents.values()].map((a) => a.place));
    return HANGOUTS.flatMap((s) => s.places).filter((p) => !taken.has(p));
  }

  private pick<T>(options: T[]): T | null {
    return options.length ? options[Math.floor(this.clock.random() * options.length)] : null;
  }

  private between({ min, max }: { min: number; max: number }) {
    return min + this.clock.random() * (max - min);
  }

  private freeSeat(events: OfficeEvent[]) {
    const taken = new Set([...this.agents.values()].map((o) => o.seat.index));
    const free = () => this.seats.find((s) => !taken.has(s.index));
    if (!free()) {
      this.podCount += PODS_PER_ROW;
      this.seats = seatLayout(this.podCount);
      events.push({ type: 'pods', count: this.podCount });
    }
    return free()!;
  }
}
