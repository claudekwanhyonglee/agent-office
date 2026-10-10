import './style.css';
import { createView } from './view.ts';

const INITIAL_PODS = 2;

export function hasWebGL() {
  const probe = document.createElement('canvas');
  try {
    return !!(probe.getContext('webgl2') || probe.getContext('webgl'));
  } catch {
    return false;
  }
}

function showStatus(text: string, problem = false) {
  const status = document.getElementById('status')!;
  status.hidden = false;
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
}

if (!import.meta.env.VITEST) boot();
