// An agent's look comes from its session id, so it's the same on every reload.

export type HatKind = 'headphones' | 'cap' | 'beanie' | 'chef' | 'tuft' | 'bun';

export interface Look {
  shirt: string;
  hat: HatKind;
  hatColor: string;
  skin: string;
}

const SHIRTS = ['#4D86FF', '#F07A4A', '#8C8FA0', '#5BA37A', '#E2B347', '#C25B7A', '#7E6BD6', '#3FB3A6', '#F07A9A', '#9BC53D'];
const HATS: HatKind[] = ['headphones', 'cap', 'beanie', 'chef', 'tuft', 'bun'];
const HAT_COLORS = ['#3A3150', '#3E6799', '#6B5B95', '#3B2A20', '#2B1E16', '#F07A4A', '#E2B347', '#4D86FF'];
const SKIN = ['#F6CFA8', '#E8B48A', '#C98E62', '#9C6644', '#FFE0C4'];

/** FNV-1a: small, stable string hash. */
function hash(text: string) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  return h >>> 0;
}

export function lookFor(sessionId: string): Look {
  const h = hash(sessionId);
  const pick = <T>(list: T[], shift: number) => list[Math.floor(h / 2 ** shift) % list.length];
  const hat = pick(HATS, 4);
  return {
    shirt: pick(SHIRTS, 0),
    hat,
    hatColor: hat === 'chef' ? '#FFFFFF' : pick(HAT_COLORS, 8),
    skin: pick(SKIN, 12),
  };
}
