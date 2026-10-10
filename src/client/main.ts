import './style.css';
import { createView } from './view.ts';
import type { FeedPayload } from '../shared/agent.ts';

const INITIAL_PODS = 2;

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

interface BootOptions {
  createView?: (host: HTMLElement) => Pick<ReturnType<typeof createView>, 'setPodCount'>;
}

export function boot({ createView: makeView }: BootOptions = {}) {
  if (!makeView && !hasWebGL()) {
    showStatus("3D isn't available in this browser, so the office can't be shown. Try a browser with WebGL turned on.", true);
    return;
  }
  const view = (makeView ?? createView)(document.getElementById('scene')!);
  view.setPodCount(INITIAL_PODS);
  showStatus('No Claude Code sessions running');

  function applyFeed(payload: FeedPayload) {
    if (!Array.isArray(payload)) return showStatus(payload.error, true);
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
