import { describe, expect, it } from 'vitest';
import { INITIAL_ROWS, officeLayout, route, type HangoutPlace } from '../src/client/layout.ts';
import { buildOffice } from '../src/client/office.ts';
import { obstaclesIn, routeCollisions } from './geometry.ts';
import { centre, distance, find, ofType, office, plan } from './office-sim.ts';

const START = officeLayout(INITIAL_ROWS);
const spot = (name: string) => START.hangouts.find((s) => s.name === name)!;
const placeName = (p: HangoutPlace) => `${p.spot}@${p.x},${p.z}`;

/** The eight solo activities: their spot, pose, prop and plan C position. */
const SOLO = [
  { spot: 'loungers', pose: 'lounging-sun', prop: 'sun-lounger', at: [plan(12.5, 15.45), plan(13.3, 15.45)] },
  { spot: 'fishing', pose: 'fishing', prop: 'jetty', at: [plan(4.8, 16.0)] },
  { spot: 'hammock', pose: 'swinging', prop: 'hammock', at: [plan(15.9, 17.6)] },
  { spot: 'yoga', pose: 'yoga', prop: 'yoga-mat', at: [plan(1.4, 13.5)] },
  { spot: 'trampoline', pose: 'bouncing', prop: 'trampoline', at: [plan(16.6, 15.6)] },
  { spot: 'darts', pose: 'throwing-darts', prop: 'dartboard', at: [plan(0.15, 9.4)] },
  { spot: 'hoops', pose: 'shooting-hoops', prop: 'bin', at: [plan(0.5, 11.3)] },
  { spot: 'planes', pose: 'throwing-plane', prop: 'paper-stack', at: [plan(14.8, 9.4)] },
] as const;

describe('#30 AC1 solo props and poses', () => {
  const { group } = buildOffice(INITIAL_ROWS);
  for (const s of SOLO) {
    it(`#30 AC1 ${s.spot}: a tagged ${s.prop} at its plan C position, and places posed ${s.pose}`, () => {
      const props = find(group, s.prop);
      expect(props).toHaveLength(s.at.length);
      // The paper stack has no plan C footprint (pin 12 marks where planes are thrown from), so it gets more room.
      const tolerance = s.spot === 'planes' ? 1 : 0.35;
      for (const p of s.at) expect(Math.min(...props.map((o) => distance(centre(o), p))), `${s.prop} near (${p.x}, ${p.z})`).toBeLessThan(tolerance);
      expect(spot(s.spot).places.map((p) => p.pose)).toEqual(s.at.map(() => s.pose));
    });
  }
});

describe('#30 AC2 one agent per place', () => {
  it('#30 AC2 the loungers have 2 places, every other solo activity 1, and none is a chat spot', () => {
    for (const s of SOLO) {
      expect(spot(s.spot).places, s.spot).toHaveLength(s.spot === 'loungers' ? 2 : 1);
      expect(spot(s.spot).chat).toBe(false);
    }
  });

  it('#30 AC2 with 12 idle agents wandering for 30 minutes, no place ever holds two agents', () => {
    const o = office(12, 4);
    for (let n = 1; n <= 12; n++) o.set(n, n % 2 ? 'done' : 'finished');
    let checks = 0;
    o.run(30 * 60, 0.25, () => {
      const held = [...o.c.agents.values()].flatMap((a) => (a.place ? [a.place] : []));
      expect(new Set(held).size).toBe(held.length);
      checks++;
    });
    expect(checks).toBeGreaterThan(1000);
  });
});

describe('#30 AC3 any free solo place can be chosen', () => {
  it('#30 AC3 with a seeded random, every solo place is chosen at least once', () => {
    const o = office(4, 21);
    for (let n = 1; n <= 4; n++) o.set(n, 'done');
    o.run(60 * 60);
    const chosen = new Set(o.log.flatMap(({ event }) => (event.type === 'walk' && event.place ? [placeName(event.place)] : [])));
    const solo = START.hangouts.filter((s) => !s.chat && !s.game).flatMap((s) => s.places).map(placeName);
    expect(solo.filter((p) => !chosen.has(p))).toEqual([]);
    for (const s of SOLO) expect(solo.some((p) => p.startsWith(`${s.spot}@`)), s.spot).toBe(true);
  });
});

describe('#30 AC4 routes to and from solo places are clear', () => {
  for (const rows of [INITIAL_ROWS, INITIAL_ROWS + 1]) {
    it(`#30 AC4 every route between a solo place and every desk, place and the door misses all furniture and walls (${rows} rows)`, () => {
      const { group, layout } = buildOffice(rows);
      const obstacles = obstaclesIn(group);
      const solo = SOLO.flatMap((s) => layout.hangouts.find((h) => h.name === s.spot)!.places);
      const ends = [
        ...layout.hangouts.flatMap((s) => s.places).map((p) => ({ name: placeName(p), link: p.link })),
        ...layout.seats.map((s) => ({ name: `seat ${s.index}`, link: s.link })),
        { name: 'door', link: layout.doorLink },
      ];
      for (const place of solo) {
        for (const end of ends) {
          if (end.link === place.link) continue;
          expect(routeCollisions(route(layout, place.link, end.link), obstacles), `${placeName(place)} → ${end.name}`).toEqual([]);
          expect(routeCollisions(route(layout, end.link, place.link), obstacles), `${end.name} → ${placeName(place)}`).toEqual([]);
        }
      }
    });
  }
});

describe('#30 AC5 paper planes land on desks', () => {
  it('#30 AC5 an agent at the paper-plane place throws planes, each naming a desk', () => {
    const o = office(4, 21);
    for (let n = 1; n <= 4; n++) o.set(n, 'done');
    const events = o.run(60 * 60);
    const throws = ofType(events, 'plane');
    expect(throws.length).toBeGreaterThan(0);
    for (const t of throws) {
      expect(START.seats.map((s) => s.index)).toContain(t.desk);
      expect(o.log.some(({ event }) => event.type === 'walk' && event.key === t.key && event.place?.spot === 'planes')).toBe(true);
    }
  });

  it('#30 AC5 planes are only thrown by an agent that has arrived at the paper-plane place', () => {
    const o = office(4, 21);
    for (let n = 1; n <= 4; n++) o.set(n, 'done');
    let throws = 0;
    for (let i = 0; i < 4 * 60 * 60; i++) {
      o.clock.t += 0.25;
      for (const t of ofType(o.c.tick(), 'plane')) {
        const agent = o.c.agents.get(t.key)!;
        expect(agent.place?.spot).toBe('planes');
        expect(agent.arrivesAt).toBeLessThanOrEqual(o.clock.t);
        throws++;
      }
    }
    expect(throws).toBeGreaterThan(0);
  });
});
