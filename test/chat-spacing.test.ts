import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { INITIAL_ROWS, officeLayout, yawTowards } from '../src/client/layout.ts';
import { buildOffice } from '../src/client/office.ts';
import { Character } from '../src/client/character.ts';
import { lookFor } from '../src/client/look.ts';
import { obstaclesIn } from './geometry.ts';

const CHATS = ['chat-hall', 'chat-deck', 'chat-deck-right'];

describe('#56 more room between people chatting', () => {
  for (const rows of [INITIAL_ROWS, INITIAL_ROWS + 1]) {
    it(`#56 AC1 every chat spot's two places are 1.3 m apart and face each other (${rows} rows)`, () => {
      const layout = officeLayout(rows);
      for (const name of CHATS) {
        const [a, b] = layout.hangouts.find((s) => s.name === name)!.places;
        expect(Math.hypot(a.x - b.x, a.z - b.z), name).toBeCloseTo(1.3, 6);
        expect(a.yaw).toBeCloseTo(yawTowards(a, b), 9);
        expect(b.yaw).toBeCloseTo(yawTowards(b, a), 9);
      }
    });
  }

  it('#56 AC2 in the chatting pose the two heads stay at least 0.9 m apart', () => {
    const layout = officeLayout(INITIAL_ROWS);
    for (const name of CHATS) {
      const places = layout.hangouts.find((s) => s.name === name)!.places;
      const pair = places.map((place, i) => {
        const c = new Character(lookFor(`session-${i + 1}`));
        c.placeAt(layout.seats[i], 'done', place);
        return c;
      });
      for (let t = 0; t < 20; t += 0.05) {
        const heads = pair.map((c) => {
          c.update(t, 0.05);
          c.root.updateMatrixWorld(true);
          return c.head.getWorldPosition(new THREE.Vector3());
        });
        expect(heads[0].distanceTo(heads[1]), `${name} t=${t.toFixed(2)}`).toBeGreaterThanOrEqual(0.9);
      }
    }
  });

  it('#56 AC3 each chat place is on clear floor', () => {
    for (const rows of [INITIAL_ROWS, INITIAL_ROWS + 1]) {
      const { group, layout } = buildOffice(rows);
      const obstacles = obstaclesIn(group).filter((o) => o.kind !== 'wall');
      for (const name of CHATS) {
        for (const p of layout.hangouts.find((s) => s.name === name)!.places) {
          const hits = obstacles.filter((o) => p.x > o.box.min.x - 0.3 && p.x < o.box.max.x + 0.3 && p.z > o.box.min.z - 0.3 && p.z < o.box.max.z + 0.3);
          expect(hits.map((h) => h.kind), `${name} (${p.x}, ${p.z})`).toEqual([]);
        }
      }
    }
  });
});
