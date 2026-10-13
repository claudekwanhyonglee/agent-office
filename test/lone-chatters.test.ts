import { describe, expect, it } from 'vitest';
import { INITIAL_ROWS, officeLayout } from '../src/client/layout.ts';
import { OfficeController } from '../src/client/controller.ts';
import { ofType, rec, seeded } from './office-sim.ts';

// #122: nobody is found alone at a chat spot when the page opens.

function firstPlaces(preset: string, count: number, seed: number) {
  const c = new OfficeController({ now: () => 0, random: seeded(seed) }, preset);
  const events = c.update(Array.from({ length: count }, (_, i) => rec(i + 1, 'done')));
  return ofType(events, 'arrive').map((e) => e.place);
}

for (const preset of ['classic', 'control-room']) {
  const chatSpots = new Set(officeLayout(INITIAL_ROWS, preset).hangouts.filter((s) => s.chat).map((s) => s.name));

  describe(`#122 AC1 AC2 first placement avoids chat spots (${preset})`, () => {
    it(`#122 AC1 AC2 ${preset}: no idle agent is placed at a chat spot's place, for any number of agents`, () => {
      expect(chatSpots.size).toBeGreaterThan(0);
      let placed = 0;
      for (let count = 1; count <= 30; count++) {
        for (const seed of [1, 2, 3, 4, 5]) {
          const places = firstPlaces(preset, count, seed);
          placed += places.filter(Boolean).length;
          for (const p of places) expect(p && chatSpots.has(p.spot), `${count} agents, seed ${seed}: ${p?.spot}`).toBeFalsy();
        }
      }
      expect(placed).toBeGreaterThan(100);
    });
  });
}
