import './style.css';
import { createOfficeScene } from './office-scene.ts';
import { renderCard, showTooltip } from './card.ts';
import { startUsagePanel } from './usage.ts';
import type { AgentRecord, FeedPayload } from '../shared/agent.ts';

export function hasWebGL() {
  const probe = document.createElement('canvas');
  try {
    return !!(probe.getContext('webgl2') || probe.getContext('webgl'));
  } catch {
    return false;
  }
}

function showStatus(text: string | null, problem = false) {
  const status = document.getElementById('status')!;
  status.hidden = text == null;
  status.className = problem ? 'status problem' : 'status';
  status.textContent = text;
}

/** The 3D side, as the page sees it. Keys are session ids; null means the floor. */
export interface Office {
  show(records: AgentRecord[]): void;
  onPick(handle: (key: string | null) => void): void;
  onHover(handle: (key: string | null, x: number, y: number) => void): void;
  select?(key: string | null): void;
}

interface BootOptions {
  createOffice?: (host: HTMLElement) => Office;
}

export function boot({ createOffice }: BootOptions = {}) {
  if (!createOffice && !hasWebGL()) {
    showStatus("3D isn't available in this browser, so the office can't be shown. Try a browser with WebGL turned on.", true);
    return;
  }
  const office = (createOffice ?? createOfficeScene)(document.getElementById('scene')!);
  const card = document.getElementById('card')!;
  const tooltip = document.getElementById('tooltip')!;
  let records = new Map<string, AgentRecord>();
  let selected: string | null = null;
  /** The open card's last message is shown in full; kept across live re-renders of the same agent. */
  let expanded = false;
  showStatus(null);

  function select(key: string | null) {
    const next = key && records.has(key) ? key : null;
    if (next !== selected) expanded = false;
    selected = next;
    office.select?.(selected);
    if (!selected) { card.hidden = true; return; }
    renderCard(card, records.get(selected)!, {
      close: () => select(null),
      acknowledge,
      expanded,
      toggleMessage: () => { expanded = !expanded; select(selected); },
    });
  }

  function acknowledge(record: AgentRecord) {
    // The server drops the session from the feed, and the agent walks out.
    fetch('/api/acknowledge', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sessionId: record.sessionId }),
    }).then(() => select(null), () => select(selected));
  }

  office.onPick(select);
  office.onHover((key, x, y) => showTooltip(tooltip, key ? records.get(key) : undefined, x, y));

  function applyFeed(payload: FeedPayload) {
    if (!Array.isArray(payload)) return showStatus(payload.error, true);
    records = new Map(payload.map((r) => [r.sessionId, r]));
    office.show(payload);
    showStatus(null);
    if (selected) select(selected);
  }

  return { applyFeed };
}

if (!import.meta.env.VITEST) {
  startUsagePanel(document.getElementById('usage')!);
  const app = boot();
  if (app) {
    const events = new EventSource('/api/events');
    events.onmessage = (e) => app.applyFeed(JSON.parse(e.data));
  }
}
