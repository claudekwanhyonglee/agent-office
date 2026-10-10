import * as THREE from 'three';
import type { AgentRecord, OfficeState } from '../shared/agent.ts';
import type { Point } from './layout.ts';
import { SCREEN_OFF, screenColor } from './poses.ts';
import { at, cyl, tag } from './toon.ts';

/** What a desk screen (and its big-board tile) shows. */
export interface ScreenContent { name: string; state: OfficeState; lines: string[] }

/** Enough of a message to fill a screen; the card shows the whole thing. */
const MESSAGE_CHARS = 280;

/** Markdown down to the words, on one line. */
export const plainText = (markdown: string) => markdown
  .replace(/```[\s\S]*?```/g, ' ')
  .replace(/^\s*(#{1,6}|>|[-*+]|\d+\.)\s+/gm, '')
  .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
  .replace(/[*`]/g, '')
  .replace(/\s+/g, ' ')
  .trim()
  .slice(0, MESSAGE_CHARS);

/**
 * Working: the recent tool calls. Needs: the question (the transcript reader puts it in lastMessage,
 * or the last message when there's no question). Done and finished: the last message. Stale: zz.
 */
export function screenContent(record: AgentRecord | undefined): ScreenContent | null {
  if (!record) return null;
  const { name, state } = record;
  if (state === 'working') return { name, state, lines: [...record.activity] };
  if (state === 'stale') return { name, state, lines: ['zz'] };
  return { name, state, lines: [plainText(record.lastMessage ?? '')] };
}

export const SCREEN_SIZE = { width: 384, height: 240 };
const MONO = '"JetBrains Mono", ui-monospace, Menlo, monospace';
const ROUND = 'Nunito, Arial, sans-serif';
const THEME: Record<OfficeState, { bg: string; edge: string }> = {
  working: { bg: '#141A3E', edge: '#7FB2FF' },
  needs: { bg: '#33230A', edge: '#FFB648' },
  done: { bg: '#11291F', edge: '#7AD8A1' },
  finished: { bg: '#10225A', edge: '#4D86FF' },
  stale: { bg: '#18151F', edge: '#5B5275' },
};
const TOOL_COLOR: [string, string][] = [['Bash', '#FFCF7A'], ['Edit', '#8FB8FF'], ['Write', '#8FB8FF'], ['Read', '#CDB8FF'], ['Grep', '#CDB8FF']];
const toolColor = (line: string) => TOOL_COLOR.find(([tool]) => line.startsWith(tool))?.[1] ?? '#C9C0E3';
/** `text`, cut and ended with … if it's wider than `maxWidth` in the current font. */
function fit(g: CanvasRenderingContext2D, text: string, maxWidth: number) {
  if (g.measureText(text).width <= maxWidth) return text;
  let chars = text.length;
  while (chars > 0 && g.measureText(`${text.slice(0, chars)}…`).width > maxWidth) chars--;
  return `${text.slice(0, chars)}…`;
}

/** Draws `content` as a see-through holo screen. `typed` is how much of the newest working line has typed in (0–1). */
export function paintScreen(g: CanvasRenderingContext2D, content: ScreenContent, typed = 1) {
  const { width: w, height: h } = SCREEN_SIZE;
  const theme = THEME[content.state];
  g.clearRect(0, 0, w, h);
  g.globalAlpha = 0.62;
  g.fillStyle = theme.bg;
  roundRect(g, 2, 2, w - 4, h - 4, 14);
  g.fill();
  g.globalAlpha = 1;
  g.strokeStyle = theme.edge;
  g.lineWidth = 3;
  roundRect(g, 3, 3, w - 6, h - 6, 14);
  g.stroke();

  g.fillStyle = 'rgba(255,255,255,.07)';
  g.fillRect(4, 4, w - 8, 30);
  g.font = `700 15px ${MONO}`;
  g.textBaseline = 'middle';
  g.fillStyle = '#FFF8EC';
  g.fillText(fit(g, content.name, w - 50), 14, 20);
  g.fillStyle = theme.edge;
  g.beginPath();
  g.arc(w - 18, 19, 6, 0, Math.PI * 2);
  g.fill();
  g.textBaseline = 'alphabetic';

  const { state, lines } = content;
  if (state === 'working') paintActivity(g, lines, typed);
  else if (state === 'stale') {
    g.fillStyle = 'rgba(201,192,227,.6)';
    g.font = `800 64px ${ROUND}`;
    g.textAlign = 'center';
    g.fillText('zz', w / 2, 158);
    g.textAlign = 'left';
  } else {
    const [mark, color] = state === 'needs' ? ['?', '#FFB648'] : ['✓', state === 'done' ? '#2E9E66' : '#4D86FF'];
    g.fillStyle = color;
    g.beginPath();
    g.arc(44, 76, 24, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = state === 'needs' ? '#3A2400' : '#FFFFFF';
    g.font = `800 32px ${ROUND}`;
    g.textAlign = 'center';
    g.fillText(mark, 44, 88);
    g.textAlign = 'left';
    g.fillStyle = '#FFF8EC';
    g.font = `800 20px ${ROUND}`;
    g.fillText(state === 'needs' ? 'Needs you' : state === 'done' ? 'Turn done' : 'Finished', 80, 84);
    g.font = `700 17px ${ROUND}`;
    wrap(g, lines[0] ?? '', 18, 134, w - 36, 23, 4);
  }
}

/** Working lines that fit below the title bar; the newest are kept. */
const MAX_LINES = 7;

function paintActivity(g: CanvasRenderingContext2D, allLines: string[], typed: number) {
  g.font = `500 14px ${MONO}`;
  // Room for the typing cursor after the longest line.
  const lines = allLines.slice(-MAX_LINES).map((line) => fit(g, line, SCREEN_SIZE.width - 40));
  lines.forEach((line, i) => {
    const newest = i === lines.length - 1;
    const shown = newest ? line.slice(0, Math.ceil(line.length * typed)) : line;
    g.globalAlpha = newest ? 1 : 0.5 + (i / lines.length) * 0.4;
    g.fillStyle = toolColor(line);
    g.fillText(shown, 14, 60 + i * 28);
    if (newest && typed < 1) {
      g.fillStyle = '#FFF8EC';
      g.fillRect(16 + g.measureText(shown).width, 48 + i * 28, 8, 15);
    }
  });
  g.globalAlpha = 1;
}

/** Word-wraps `text` into at most `maxLines`, the last one cut with … if there's more. */
function wrap(g: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, lineHeight: number, maxLines: number) {
  const rows: string[] = [];
  let row = '';
  for (const word of text.split(' ')) {
    const next = row ? `${row} ${word}` : word;
    if (row && g.measureText(next).width > maxWidth) { rows.push(row); row = word; } else row = next;
  }
  if (row) rows.push(row);
  if (rows.length > maxLines) rows.splice(maxLines - 1, Infinity, `${rows[maxLines - 1]}…`);
  rows.forEach((r, i) => g.fillText(fit(g, r, maxWidth), x, y + i * lineHeight));
}

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

/** A 2D canvas, or null where there is none (tests). */
export function newCanvas(width: number, height: number) {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  let g: CanvasRenderingContext2D | null = null;
  try { g = canvas.getContext('2d'); } catch { /* no canvas support */ }
  return g && { canvas, g };
}

const TYPE_SECONDS = 0.8;

/**
 * A see-through screen in front of a desk: a pane that turns to face the camera, over a little
 * projector on the desk that glows in the state's colour. Builds without a DOM; draws when it has one.
 */
export class DeskScreen {
  readonly root = tag(new THREE.Group(), 'screen');
  readonly pane: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  readonly glow: THREE.Mesh<THREE.CylinderGeometry, THREE.MeshBasicMaterial>;
  content: ScreenContent | null = null;
  /** The drawn screen, for the big board to copy; null without a canvas. */
  readonly canvas: HTMLCanvasElement | null;
  private g: CanvasRenderingContext2D | null;
  private texture: THREE.CanvasTexture | null = null;
  private key = '';
  private typingFrom = -Infinity;
  private typed = 1;

  /** `at`: where the pane stands; `yaw`: the desk's facing; `deskBack`: how far behind the pane the projector sits. */
  constructor(spot: Point, yaw: number, deskBack: number) {
    const drawn = newCanvas(SCREEN_SIZE.width, SCREEN_SIZE.height);
    this.canvas = drawn?.canvas ?? null;
    this.g = drawn?.g ?? null;
    const material = new THREE.MeshBasicMaterial({ color: '#8FE3FF', transparent: true, opacity: 0.25, depthWrite: false });
    if (this.canvas) {
      this.texture = new THREE.CanvasTexture(this.canvas);
      this.texture.colorSpace = THREE.SRGBColorSpace;
      this.texture.anisotropy = 4;
      Object.assign(material, { map: this.texture, color: new THREE.Color('#FFFFFF'), opacity: 1 });
    }
    this.pane = at(new THREE.Mesh(new THREE.PlaneGeometry(1.15, 0.72), material), 0, 1.4, 0);
    this.pane.renderOrder = 5;
    this.pane.visible = false;
    this.glow = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.02, 20), new THREE.MeshBasicMaterial({ color: SCREEN_OFF }));
    const projector = at(cyl(0.16, 0.2, 0.05, '#3A3150', { outline: 0.04 }), 0, 0.815, -deskBack);
    projector.add(at(this.glow, 0, 0.03, 0));
    this.root.add(this.pane, projector);
    this.root.position.set(spot.x, 0, spot.z);
    this.root.rotation.y = yaw;
  }

  /** Shows `content` (null: an empty desk). Call every frame; it only redraws when something changed or is typing in. */
  show(content: ScreenContent | null, now: number) {
    const key = content ? JSON.stringify(content) : '';
    const changed = key !== this.key;
    if (changed) {
      const newLine = content?.state === 'working' && this.content?.state === 'working'
        && content.lines.at(-1) !== undefined && content.lines.at(-1) !== this.content.lines.at(-1);
      this.typingFrom = newLine ? now : -Infinity;
      this.key = key;
      this.content = content;
      this.pane.visible = !!content;
      this.glow.material.color.set(content ? screenColor(content.state) : SCREEN_OFF);
    }
    const typing = this.typed < 1;
    this.typed = Math.min(1, Math.max(0, (now - this.typingFrom) / TYPE_SECONDS));
    if (content && this.g && (changed || typing)) {
      paintScreen(this.g, content, this.typed);
      this.texture!.needsUpdate = true;
    }
  }

  /** Turns and tilts the pane to face the camera, so it always reads from the camera's side. */
  face(camera: THREE.Vector3) {
    const { x, z } = this.root.position;
    const dx = camera.x - x, dz = camera.z - z;
    this.pane.rotation.set(-Math.atan2(camera.y - this.pane.position.y, Math.hypot(dx, dz)), Math.atan2(dx, dz) - this.root.rotation.y, 0, 'YXZ');
  }
}
