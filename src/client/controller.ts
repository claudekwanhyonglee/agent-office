import type { AgentRecord, OfficeState } from '../shared/agent.ts';
import { PODS_PER_ROW, arrivalPath, departurePath, seatLayout, type Point, type SeatSpot } from './layout.ts';

export const INITIAL_PODS = 4;

export interface Occupant { record: AgentRecord; seat: SeatSpot }

export type OfficeEvent =
  | { type: 'pods'; count: number }
  /** `walk` is false for agents already listed when the page opened: they're seated straight away. */
  | { type: 'arrive'; key: string; record: AgentRecord; seat: SeatSpot; path: Point[]; walk: boolean }
  | { type: 'leave'; key: string; path: Point[] }
  | { type: 'state'; key: string; state: OfficeState };

/**
 * Decides who sits where. Agents (keyed by session id) take the first free desk and keep it
 * while listed; when every desk is taken, a row of pods is added. Rendering only follows its events.
 */
export class OfficeController {
  readonly agents = new Map<string, Occupant>();
  podCount = INITIAL_PODS;
  private seats = seatLayout(INITIAL_PODS);
  private firstUpdate = true;

  update(records: AgentRecord[]): OfficeEvent[] {
    const events: OfficeEvent[] = [];
    const listed = new Map(records.map((r) => [r.sessionId, r]));

    for (const [key, { seat }] of this.agents) {
      if (listed.has(key)) continue;
      this.agents.delete(key);
      events.push({ type: 'leave', key, path: departurePath(seat) });
    }

    for (const [key, record] of listed) {
      const current = this.agents.get(key);
      if (current) {
        if (current.record.state !== record.state) events.push({ type: 'state', key, state: record.state });
        current.record = record;
        continue;
      }
      const seat = this.freeSeat(events);
      this.agents.set(key, { record, seat });
      events.push({ type: 'arrive', key, record, seat, path: arrivalPath(seat), walk: !this.firstUpdate });
    }

    this.firstUpdate = false;
    return events;
  }

  /** Who sits at each desk, by seat index. */
  occupants() {
    return new Map([...this.agents.values()].map((o) => [o.seat.index, o.record.state]));
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
