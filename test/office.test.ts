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
  it('#2 AC3 has two desk pods with 10 desks, each with a monitor and chair', () => {
    const office = buildOffice(2);
    const count = kinds(office.group);
    expect(office.seats).toHaveLength(10);
    expect(count.pod).toBe(2);
    expect(count.desk).toBe(10);
    expect(count.monitor).toBe(10);
    expect(count.chair).toBe(10);
  });

  it('#2 AC3 has the rest of the prototype office', () => {
    const count = kinds(buildOffice(2).group);
    for (const kind of ['floor', 'wall', 'window', 'door', 'sofa', 'rug', 'coffee-machine', 'water-cooler', 'plant']) {
      expect(count[kind], kind).toBeGreaterThan(0);
    }
  });

  it('#2 AC3 desks do not overlap between pods', () => {
    const { seats } = buildOffice(2);
    const spots = new Set(seats.map((s) => `${s.x},${s.deskZ}`));
    expect(spots.size).toBe(10);
  });
});
