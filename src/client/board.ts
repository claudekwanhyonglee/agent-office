import * as THREE from 'three';
import type { AgentRecord } from '../shared/agent.ts';
import { SCREEN_SIZE, newCanvas, paintScreen, screenContent, type ScreenContent } from './screen.ts';

/** Every agent's screen, in desk order. */
export interface BoardModel { tiles: ScreenContent[] }

/** `occupants`: each desk's agent, by seat index. */
export function boardModel(occupants: Map<number, AgentRecord>): BoardModel {
  const byDesk = [...occupants].sort(([a], [b]) => a - b).map(([, record]) => record);
  return { tiles: byDesk.map((r) => screenContent(r)!) };
}

export const BOARD_CANVAS = { width: 2048, height: 512 };
const PAD = 12, GAP = 10;
const ASPECT = SCREEN_SIZE.width / SCREEN_SIZE.height;
/** Agents that fit at full tile size: 8 columns of 3. */
const FULL_SIZE_AGENTS = 24;

export interface Rect { x: number; y: number; w: number; h: number }

/** The grid with the biggest tiles for `agents` tiles. */
function bestGrid(agents: number) {
  let best = { cols: 1, rows: 1, w: 0 };
  for (let rows = 1; rows <= agents; rows++) {
    const cols = Math.ceil(agents / rows);
    const w = Math.min(
      (BOARD_CANVAS.width - 2 * PAD - (cols - 1) * GAP) / cols,
      ((BOARD_CANVAS.height - 2 * PAD - (rows - 1) * GAP) / rows) * ASPECT,
    );
    if (w > best.w) best = { cols, rows, w };
  }
  return best;
}

/** Where each agent's tile goes on the board canvas. */
export function tileRects(agents: number): Rect[] {
  const { cols, rows, w } = bestGrid(Math.max(agents, FULL_SIZE_AGENTS));
  const h = w / ASPECT;
  const left = (BOARD_CANVAS.width - (cols * w + (cols - 1) * GAP)) / 2;
  const top = (BOARD_CANVAS.height - (rows * h + (rows - 1) * GAP)) / 2;
  return Array.from({ length: agents }, (_, i) => ({
    x: left + (i % cols) * (w + GAP), y: top + Math.floor(i / cols) * (h + GAP), w, h,
  }));
}

export function paintBoard(g: CanvasRenderingContext2D, model: BoardModel) {
  g.fillStyle = '#0E0B1A';
  g.fillRect(0, 0, BOARD_CANVAS.width, BOARD_CANVAS.height);
  const tiles = tileRects(model.tiles.length);
  model.tiles.forEach((content, i) => {
    const { x, y, w, h } = tiles[i];
    g.save();
    g.translate(x, y);
    g.scale(w / SCREEN_SIZE.width, h / SCREEN_SIZE.height);
    paintScreen(g, content);
    g.restore();
  });
}

/** The display on the back wall. Builds without a DOM; draws when it has one. */
export class BigBoard {
  readonly mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  model: BoardModel = boardModel(new Map());
  private g: CanvasRenderingContext2D | null;
  private texture: THREE.CanvasTexture | null = null;
  private key = '';

  constructor(width: number) {
    const drawn = newCanvas(BOARD_CANVAS.width, BOARD_CANVAS.height);
    this.g = drawn?.g ?? null;
    const material = new THREE.MeshBasicMaterial({ color: '#1E2440' });
    if (drawn) {
      this.texture = new THREE.CanvasTexture(drawn.canvas);
      this.texture.colorSpace = THREE.SRGBColorSpace;
      this.texture.anisotropy = 8;
      Object.assign(material, { map: this.texture, color: new THREE.Color('#FFFFFF') });
    }
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, (width * BOARD_CANVAS.height) / BOARD_CANVAS.width), material);
  }

  /** Call every frame with each desk's agent; it only redraws when the board changed. */
  update(occupants: Map<number, AgentRecord>) {
    this.model = boardModel(occupants);
    const key = JSON.stringify(this.model);
    if (key === this.key) return;
    this.key = key;
    if (this.g) {
      paintBoard(this.g, this.model);
      this.texture!.needsUpdate = true;
    }
  }
}
