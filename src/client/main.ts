import './style.css';
import { createOfficeScene } from './office-scene.ts';
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

interface Office { show(records: AgentRecord[]): void }

interface BootOptions {
  createOffice?: (host: HTMLElement) => Office;
}

export function boot({ createOffice }: BootOptions = {}) {
  if (!createOffice && !hasWebGL()) {
    showStatus("3D isn't available in this browser, so the office can't be shown. Try a browser with WebGL turned on.", true);
    return;
  }
  const office = (createOffice ?? createOfficeScene)(document.getElementById('scene')!);
  showStatus('No Claude Code sessions running');

  function applyFeed(payload: FeedPayload) {
    if (!Array.isArray(payload)) return showStatus(payload.error, true);
    office.show(payload);
    showStatus(payload.length ? null : 'No Claude Code sessions running');
  }

  return { applyFeed };
}

if (!import.meta.env.VITEST) {
  const app = boot();
  if (app) {
    const events = new EventSource('/api/events');
    events.onmessage = (e) => app.applyFeed(JSON.parse(e.data));
  }
}
