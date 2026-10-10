import { describe, expect, it } from 'vitest';
import { GLASS_Z, INITIAL_ROWS, route } from '../src/client/layout.ts';
import { buildOffice } from '../src/client/office.ts';
import { Dog } from '../src/client/dog.ts';
import { obstaclesIn, routeCollisions } from './geometry.ts';
import { centre, distance, find, ofType, office, plan } from './office-sim.ts';

/** `count` idle agents with the dog for `minutes`. */
function withDog(count: number, seed: number, minutes = 60, each?: (o: ReturnType<typeof office>) => void) {
  const o = office(count, seed);
  for (let n = 1; n <= count; n++) o.set(n, 'done');
  o.run(minutes * 60, 0.25, () => each?.(o));
  return { o, events: o.log.map((l) => l.event) };
}

describe('#34 AC1 one dog, a bed and a bowl', () => {
  it('#34 AC1 the bed and the bowl are tagged, at the plan C pet-bed position', () => {
    const { group } = buildOffice(INITIAL_ROWS);
    const [bed, ...beds] = find(group, 'pet-bed');
    const [bowl, ...bowls] = find(group, 'dog-bowl');
    expect([beds, bowls]).toEqual([[], []]);
    expect(distance(centre(bed), plan(16.4, 10.4))).toBeLessThan(0.35);
    expect(distance(centre(bowl), plan(17.05, 10.55))).toBeLessThan(0.35);
  });

  it('#34 AC1 there is one tagged dog, starting in its bed', () => {
    const { o } = withDog(0, 1, 0);
    expect(o.c.dog.spot.name).toBe('bed');
    expect(o.c.dog.lying).toBe(true);
    const dog = new Dog();
    expect(dog.root.userData.kind).toBe('dog');
    expect(find(dog.root, 'dog')).toHaveLength(1);
  });
});

describe('#34 AC2 the dog wanders on clear routes, and sometimes lies in its bed', () => {
  it('#34 AC2 it visits the floor and the deck along routes clear of furniture and walls, and lies in its bed', () => {
    const obstacles = obstaclesIn(buildOffice(INITIAL_ROWS).group);
    const { o, events } = withDog(4, 5, 90);
    const walks = ofType(events, 'dog');
    expect(walks.length).toBeGreaterThan(20);
    for (const w of walks) expect(routeCollisions(w.path, obstacles)).toEqual([]);
    const ends = walks.map((w) => w.path.at(-1)!);
    expect(ends.some((p) => p.z > GLASS_Z), 'on the deck').toBe(true);
    expect(ends.some((p) => p.z < GLASS_Z && distance(p, o.c.layout.dogSpots[0].dog) > 1), 'on the office floor').toBe(true);
    const bed = o.c.layout.dogSpots.find((s) => s.name === 'bed')!.dog;
    expect(walks.some((w) => w.lie && distance(w.path.at(-1)!, bed) < 1e-9), 'lies in its bed').toBe(true);
    expect(walks.every((w) => !w.lie || distance(w.path.at(-1)!, bed) < 1e-9), 'only lies in its bed').toBe(true);
  });

  for (const rows of [INITIAL_ROWS, INITIAL_ROWS + 1]) {
    it(`#34 AC2 routes between all dog spots, and to every place the agents visit it from, are clear (${rows} rows)`, () => {
      const { group, layout } = buildOffice(rows);
      const obstacles = obstaclesIn(group);
      for (const a of layout.dogSpots) {
        for (const b of layout.dogSpots) {
          if (a !== b) expect(routeCollisions(route(layout, a.link, b.link), obstacles), `${a.name} → ${b.name}`).toEqual([]);
        }
        for (const v of a.visitors) {
          for (const s of layout.seats) expect(routeCollisions(route(layout, s.link, v.link), obstacles), `seat ${s.index} → ${a.name} visitor`).toEqual([]);
        }
      }
    });
  }
});

describe('#34 AC3 idle agents play with the dog', () => {
  it('#34 AC3 they pet it, feed it at the bowl, and throw a ball it fetches, each with its own pose', () => {
    const { o, events } = withDog(5, 9, 120);
    const visits = ofType(events, 'walk').filter((w) => w.place?.spot === 'dog');
    const poses = new Set(visits.map((w) => w.place!.pose));
    expect([...poses].sort()).toEqual(['feeding', 'petting', 'throwing-ball']);
    const bowl = o.c.layout.dogSpots.find((s) => s.name === 'bed')!;
    for (const w of visits.filter((v) => v.place!.pose === 'feeding')) expect(distance(w.place!, bowl.dog)).toBeLessThan(1);
    const fetches = ofType(events, 'fetch');
    expect(fetches.length).toBeGreaterThan(0);
    // Each throw sends the dog out and back to where it was.
    for (let i = 0; i < events.length; i++) {
      if (events[i].type !== 'fetch') continue;
      const run = events.slice(i + 1).find((e) => e.type === 'dog');
      expect(run && run.type === 'dog' && distance(run.path[0], run.path.at(-1)!) < 1e-9).toBe(true);
    }
  });

  it('#34 AC3 an agent going to the dog finds it there: it waits for its visitors', () => {
    withDog(5, 9, 60, (o) => {
      const dog = o.c.dog;
      for (const a of o.c.agents.values()) {
        if (a.place?.spot !== 'dog' || a.arrivesAt > o.clock.t || dog.arrivesAt > o.clock.t) continue;
        expect(distance(a.place, dog.spot.dog)).toBeLessThan(1.5);
      }
    });
  });
});

describe('#34 AC4 / #65 one agent with the dog at a time', () => {
  it('#65 AC1 while an agent is with (or on its way to) the dog, no other agent is sent to it', () => {
    let visits = 0;
    for (const seed of [4, 5]) {
      withDog(8, seed, 120, (o) => {
        const n = [...o.c.agents.values()].filter((a) => a.place?.spot === 'dog').length;
        expect(n, `seed ${seed} at ${o.clock.t}`).toBeLessThanOrEqual(1);
        visits += n;
      });
    }
    expect(visits).toBeGreaterThan(0);
  });

  it('#65 AC2 an agent that would visit the dog while it\'s taken does something else instead', () => {
    // While the dog is taken, agents moving on still go somewhere: another activity.
    let sentElsewhere = 0;
    const { events } = withDog(6, 2, 30, (o) => {
      const busy = [...o.c.agents.values()].some((a) => a.place?.spot === 'dog');
      const walks = ofType(o.log.filter((l) => l.t === o.clock.t).map((l) => l.event), 'walk');
      if (busy) sentElsewhere += walks.filter((w) => w.place && w.place.spot !== 'dog').length;
    });
    expect(ofType(events, 'walk').filter((w) => w.place?.spot === 'dog').length).toBeGreaterThan(0);
    expect(sentElsewhere).toBeGreaterThan(0);
  });

  it('#65 AC3 once the visitor leaves, another agent can visit', () => {
    const { events } = withDog(8, 4, 120);
    const visitors = ofType(events, 'walk').filter((w) => w.place?.spot === 'dog').map((w) => w.key);
    expect(new Set(visitors).size).toBeGreaterThan(1);
  });
});
