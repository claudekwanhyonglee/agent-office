import { describe, expect, it } from 'vitest';
import { INITIAL_ROWS, departurePath, officeLayout } from '../src/client/layout.ts';
import { Character } from '../src/client/character.ts';
import { lookFor } from '../src/client/look.ts';

const seat = officeLayout(INITIAL_ROWS).seats[0];

function finishedAgent() {
  const character = new Character(lookFor('session-1'));
  character.sitAt(seat, 'finished');
  character.update(0, 0.016);
  return character;
}

describe('#49 the tick pops when an agent is sent off', () => {
  it('#49 AC1 when leaving starts the bubble grows for about 0.2 s, then is hidden', () => {
    const character = finishedAgent();
    const before = character.bubble.scale.x;
    expect(character.bubbleKind).toBe('finished');
    character.leave(departurePath(officeLayout(INITIAL_ROWS), seat));
    const scales: number[] = [];
    let t = 0;
    for (; t < 0.18; t += 0.02) {
      character.update(t, 0.02);
      expect(character.bubbleKind).toBe('finished');
      scales.push(character.bubble.scale.x);
    }
    expect(scales.every((s, i) => i === 0 || s >= scales[i - 1])).toBe(true);
    expect(scales.at(-1)!).toBeGreaterThan(before * 1.2);
    for (; t < 0.3; t += 0.02) character.update(t, 0.02);
    expect(character.bubbleKind).toBeNull();
    expect(character.bubble.visible).toBe(false);
  });

  it('#49 AC2 a leaving agent shows no bubble for the rest of its walk to the door', () => {
    const character = finishedAgent();
    character.leave(departurePath(officeLayout(INITIAL_ROWS), seat));
    for (let t = 0; t < 0.3; t += 0.02) character.update(t, 0.02);
    let walked = 0;
    for (let t = 0.3; t < 60 && character.mode !== 'gone'; t += 0.05) {
      character.update(t, 0.05);
      if (character.mode === 'walking') walked++;
      expect(character.bubbleKind).toBeNull();
      expect(character.bubble.visible).toBe(false);
    }
    expect(walked).toBeGreaterThan(10);
    expect(character.mode).toBe('gone');
  });
});
