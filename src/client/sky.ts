import * as THREE from 'three';
import { partsIn, sunTimes, type SunTimes } from './sun-times.ts';

type Rgb = number[];
type Today = Pick<SunTimes, 'rise' | 'set'>;
/** A body's state: how far through its day or night (0..1), whether it is up, and its elevation (-1..1). */
export interface BodyState { progress: number; up: boolean; e: number }

const hex = (h: string): Rgb => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const mix = (a: Rgb, b: Rgb, k: number) => a.map((v, i) => v + (b[i] - v) * k);
const rgb = (c: Rgb, a = 1) => `rgba(${c.map(Math.round).join(',')},${a})`;
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const smooth = (v: number) => v * v * (3 - 2 * v);

// Sky colours by sun elevation (-1 deep night … 1 noon): [zenith, middle, horizon].
const SKY_STOPS = ([
  [-1.0, '#04051A', '#0A0E2E', '#171C47'],
  [-0.3, '#070923', '#121842', '#272B5E'],
  [-0.14, '#10173F', '#26306C', '#5A4F8E'],
  [-0.04, '#1D2860', '#4E5594', '#D98F8E'],
  [0.05, '#3565AE', '#86A9D8', '#FFCFA2'],
  [0.25, '#3A82D3', '#79B4E8', '#CDE5F4'],
  [1.0, '#2C74CC', '#6CADE8', '#BEDFF5'],
] as const).map(([e, ...colours]) => ({ e, colours: colours.map(hex) }));

/** [zenith, middle, horizon] for a sun elevation, smoothly blended between the stops. */
export function skyColours(e: number): Rgb[] {
  for (let i = 1; i < SKY_STOPS.length; i++) {
    if (e <= SKY_STOPS[i].e) {
      const from = SKY_STOPS[i - 1], to = SKY_STOPS[i];
      const k = smooth(clamp01((e - from.e) / (to.e - from.e)));
      return from.colours.map((c, j) => mix(c, to.colours[j], k));
    }
  }
  return SKY_STOPS.at(-1)!.colours;
}

/** The sun at local `hour`: progress through daylight (rise→set) or through the night (set→rise). */
export function sunState(hour: number, { rise, set }: Today): BodyState {
  const dayLength = (set - rise + 24) % 24;
  const sinceRise = (hour - rise + 24) % 24;
  if (sinceRise < dayLength) {
    const progress = sinceRise / dayLength;
    return { progress, up: true, e: Math.sin(Math.PI * progress) };
  }
  const progress = (sinceRise - dayLength) / (24 - dayLength);
  return { progress, up: false, e: -Math.sin(Math.PI * progress) };
}

/** The moon crosses while the sun is down (no phases or real moonrise, on purpose). */
export const moonState = (sun: BodyState): BodyState => ({ progress: sun.progress, up: !sun.up, e: -sun.e });

/**
 * A wide, shallow path: in from beyond the left edge, up across the sky, down past the right edge.
 * Below the horizon a body waits just off the side it set on, then the side it will rise on, so its glow shows there.
 */
export function skyPath(body: BodyState, W: number, H: number) {
  const lowY = H * 0.5, highY = H * 0.14;
  if (!body.up) return { x: W * (body.progress < 0.5 ? 1.1 : -0.1), y: lowY, up: false };
  return { x: W * (-0.1 + 1.2 * body.progress), y: lowY - (lowY - highY) * Math.sin(Math.PI * body.progress), up: true };
}

/** How much of the starry night shows (0 by day, 1 in deep night), from the sun's elevation. */
export const starVisibility = (sunE: number) => clamp01((-sunE - 0.02) / 0.25);

/** Local hour and today's sunrise/sunset in `zone`, recomputed when the date there changes. */
export function createSunClock(zone: string) {
  let day = '', today: SunTimes;
  return {
    at(date: Date) {
      const { year, month, day: dayOfMonth, hour } = partsIn(zone, date);
      const key = `${year}-${month}-${dayOfMonth}`;
      if (key !== day) { day = key; today = sunTimes(zone, date); }
      return { hour, today };
    },
  };
}

// --- drawing -----------------------------------------------------------------

const rand = ((seed) => () => (seed = (seed * 16807) % 2147483647) / 2147483647)(11);

function offscreen(w: number, h: number, paint: (g: CanvasRenderingContext2D, w: number, h: number) => void) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  paint(c.getContext('2d')!, w, h);
  return c;
}

/** Soft round star sprites in three tints; the bright one gets faint diffraction spikes. */
function starSprites() {
  const tints = ['#FFFFFF', '#CFE0FF', '#FFE6C4'].map((tint) => offscreen(32, 32, (g) => {
    const r = g.createRadialGradient(16, 16, 0, 16, 16, 16);
    r.addColorStop(0, tint); r.addColorStop(0.18, tint); r.addColorStop(0.45, tint + '40'); r.addColorStop(1, tint + '00');
    g.fillStyle = r; g.fillRect(0, 0, 32, 32);
  }));
  const bright = offscreen(48, 48, (g) => {
    g.drawImage(tints[0], 8, 8);
    const spike = (x0: number, y0: number, x1: number, y1: number) => {
      const l = g.createLinearGradient(x0, y0, x1, y1);
      l.addColorStop(0, '#FFFFFF00'); l.addColorStop(0.5, '#FFFFFFAA'); l.addColorStop(1, '#FFFFFF00');
      g.strokeStyle = l; g.lineWidth = 1; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
    };
    spike(0, 24, 48, 24); spike(24, 0, 24, 48);
  });
  return { tints, bright };
}

function createStars() {
  const sprites = starSprites();
  return Array.from({ length: 700 }, () => {
    const bright = rand() < 0.04;
    return {
      radius: Math.sqrt(rand()),
      angle: rand() * Math.PI * 2,
      size: bright ? 1 : 0.25 + Math.pow(rand(), 3) * 0.6,
      sprite: bright ? sprites.bright : sprites.tints[rand() < 0.7 ? 0 : rand() < 0.5 ? 1 : 2],
      twinkleSpeed: 1 + rand() * 3,
      twinklePhase: rand() * Math.PI * 2,
    };
  });
}

/** Fine grain laid over the whole sky so the gradients don't band. */
const grain = () => offscreen(160, 160, (g, w, h) => {
  const img = g.createImageData(w, h);
  for (let i = 0; i < img.data.length; i += 4) {
    img.data[i] = img.data[i + 1] = img.data[i + 2] = rand() * 255;
    img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
});

/**
 * The living sky, painted on a 2D canvas used as the scene's background texture, so it stays fixed on screen
 * while the camera moves.
 */
export function createSky() {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const stars = createStars();
  const grainPattern = ctx.createPattern(grain(), 'repeat')!;
  let W = 1, H = 1;

  /** A radial glow squashed into an ellipse, for light that spreads along the horizon. */
  function ellipseGlow(cx: number, cy: number, rx: number, ry: number, stops: [number, string][]) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(rx / ry, 1);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, ry);
    for (const [at, colour] of stops) g.addColorStop(at, colour);
    ctx.fillStyle = g;
    ctx.fillRect(-ry, -ry, ry * 2, ry * 2);
    ctx.restore();
  }

  function drawGradient([zenith, middle, horizon]: Rgb[]) {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, rgb(zenith));
    g.addColorStop(0.5, rgb(middle));
    g.addColorStop(0.85, rgb(horizon));
    g.addColorStop(1, rgb(mix(horizon, middle, 0.3)));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }

  function drawStars(hour: number, today: Today, seconds: number, visibility: number) {
    if (visibility < 0.01) return;
    const poleX = W * 0.5, poleY = -H * 0.35;
    const reach = Math.hypot(W * 0.6, H * 1.4);
    const turn = (((hour - today.set + 24) % 24) * 8 * Math.PI) / 180; // 8° an hour: slower than the real 15°, so it reads as drift
    const scale = W / 900;
    for (const s of stars) {
      const a = s.angle + turn;
      const x = poleX + Math.cos(a) * s.radius * reach;
      const y = poleY + Math.sin(a) * s.radius * reach;
      if (x < -10 || x > W + 10 || y < -10 || y > H) continue;
      const twinkle = 0.6 + 0.4 * Math.sin(seconds * s.twinkleSpeed + s.twinklePhase);
      const thinnerLow = clamp01((H * 0.85 - y) / (H * 0.35)); // stars dim into the haze near the horizon
      ctx.globalAlpha = visibility * twinkle * thinnerLow;
      const size = s.sprite.width * 0.5 * s.size * scale;
      ctx.drawImage(s.sprite, x - size / 2, y - size / 2, size, size);
    }
    ctx.globalAlpha = 1;
  }

  /** Sunrise and sunset: warm light spreads along the horizon on the sun's side; a pink band rises on the other. */
  function drawTwilight(sun: { x: number; y: number }, e: number) {
    const strength = Math.exp(-(((e + 0.02) / 0.2) ** 2));
    if (strength < 0.01) return;
    ellipseGlow(sun.x, Math.min(sun.y, H * 0.5), W, H * 0.75, [
      [0, `rgba(255, 210, 140, ${0.9 * strength})`],
      [0.2, `rgba(255, 150, 90, ${0.6 * strength})`],
      [0.55, `rgba(220, 100, 130, ${0.25 * strength})`],
      [1, 'rgba(220, 100, 130, 0)'],
    ]);
    const oppositeX = sun.x < W / 2 ? W * 1.05 : -W * 0.05;
    ellipseGlow(oppositeX, H * 0.74, W * 0.8, H * 0.18, [
      [0, `rgba(238, 160, 190, ${0.35 * strength})`],
      [1, 'rgba(238, 160, 190, 0)'],
    ]);
  }

  function drawSun(sun: { x: number; y: number }, e: number) {
    const low = 1 - clamp01(e / 0.35); // 1 at the horizon, 0 once well up
    const size = W * 0.034 * (1 + 0.15 * low);
    ellipseGlow(sun.x, sun.y, W * 0.28, W * 0.28, [
      [0, `rgba(255, 245, 210, ${0.55 - 0.15 * low})`],
      [0.25, 'rgba(255, 225, 170, 0.18)'],
      [1, 'rgba(255, 225, 170, 0)'],
    ]);
    const edge = mix(hex('#FFE9A8'), hex('#FF8A3D'), low), core = mix(hex('#FFFDF2'), hex('#FFD08A'), low);
    const disc = ctx.createRadialGradient(sun.x, sun.y, 0, sun.x, sun.y, size);
    disc.addColorStop(0, rgb(core)); disc.addColorStop(0.75, rgb(mix(core, edge, 0.6))); disc.addColorStop(1, rgb(edge));
    ctx.fillStyle = disc;
    ctx.beginPath(); ctx.arc(sun.x, sun.y, size, 0, Math.PI * 2); ctx.fill();
  }

  function drawMoon(moon: { x: number; y: number }, e: number, nightness: number) {
    const low = 1 - clamp01(e / 0.3);
    const size = W * 0.028;
    const tint = mix(hex('#F4F0E2'), hex('#F2C894'), low * 0.7);
    ellipseGlow(moon.x, moon.y, W * 0.2, W * 0.2, [
      [0, rgb(tint, 0.28 * nightness)], [0.3, rgb(tint, 0.08 * nightness)], [1, rgb(tint, 0)],
    ]);
    ctx.save();
    ctx.globalAlpha = 0.35 + 0.65 * nightness; // a pale moon at the very ends of the night
    const disc = ctx.createRadialGradient(moon.x - size * 0.3, moon.y - size * 0.3, 0, moon.x, moon.y, size);
    disc.addColorStop(0, rgb(mix(tint, [255, 255, 255], 0.5))); disc.addColorStop(1, rgb(mix(tint, hex('#B9B2A0'), 0.35)));
    ctx.fillStyle = disc;
    ctx.beginPath(); ctx.arc(moon.x, moon.y, size, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(150, 140, 120, 0.28)';
    for (const [dx, dy, r] of [[-0.3, -0.15, 0.24], [0.28, 0.3, 0.15], [0.2, -0.42, 0.1], [-0.05, 0.45, 0.12]]) {
      ctx.beginPath(); ctx.arc(moon.x + dx * size, moon.y + dy * size, r * size, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  function drawFinish(nightness: number) {
    ellipseGlow(W / 2, H * 0.45, W * 0.8, H * 0.8, [[0.55, 'rgba(0,0,12,0)'], [1, `rgba(0,0,12,${0.35 * nightness})`]]);
    ctx.save();
    ctx.globalAlpha = 0.035;
    ctx.globalCompositeOperation = 'overlay';
    ctx.fillStyle = grainPattern;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }

  return {
    texture,
    /** Match the screen, in CSS pixels: the sky is soft enough not to need the device's full resolution. */
    resize(width: number, height: number) {
      W = canvas.width = Math.max(1, Math.round(width));
      H = canvas.height = Math.max(1, Math.round(height));
    },
    draw(hour: number, today: Today, seconds: number) {
      const sunNow = sunState(hour, today), moonNow = moonState(sunNow);
      const sun = skyPath(sunNow, W, H), moon = skyPath(moonNow, W, H);
      const nightness = starVisibility(sunNow.e);
      drawGradient(skyColours(sunNow.e));
      drawStars(hour, today, seconds, nightness);
      drawTwilight(sun, sunNow.e);
      if (moon.up) drawMoon(moon, moonNow.e, nightness);
      if (sun.up) drawSun(sun, sunNow.e);
      drawFinish(nightness);
      texture.needsUpdate = true;
    },
  };
}
