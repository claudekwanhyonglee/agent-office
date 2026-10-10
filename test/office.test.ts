import { describe, expect, it } from 'vitest';
import type { Object3D } from 'three';
import { buildOffice } from '../src/client/office.ts';

function kinds(root: Object3D) {
  const count: Record<string, number> = {};
  root.traverse((o) => {
    const kind = o.userData.kind as string | undefined;
    if (kind) count[kind] = (count[kind] ?? 0) + 1;
  });
  return count;
}

describe('#2 AC3 empty office', () => {
  // #13 changed the starting office to four pods of 4 desks.
  it('#2 AC3 has desk pods with a monitor and chair at every desk', () => {
    const office = buildOffice(4);
    const count = kinds(office.group);
    expect(office.seats).toHaveLength(16);
    expect(count.pod).toBe(4);
    expect(count.desk).toBe(16);
    expect(count.monitor).toBe(16);
    expect(count.chair).toBe(16);
  });

  it('#2 AC3 has the rest of the prototype office', () => {
    const count = kinds(buildOffice(4).group);
    for (const kind of ['floor', 'wall', 'window', 'door', 'sofa', 'rug', 'coffee-machine', 'water-cooler', 'plant']) {
      expect(count[kind], kind).toBeGreaterThan(0);
    }
  });

  it('#2 AC3 desks do not overlap between pods', () => {
    const { seats } = buildOffice(4);
    const spots = new Set(seats.map((s) => `${s.x},${s.deskZ}`));
    expect(spots.size).toBe(16);
  });
});
