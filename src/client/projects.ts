import type { AgentRecord } from '../shared/agent.ts';
import { escapeHtml } from './markdown.ts';

const HIDDEN_KEY = 'agent-office:hidden-projects';
const COLLAPSED_KEY = 'agent-office:projects-collapsed';

function load<T>(key: string, fallback: T): T {
  try { return JSON.parse(localStorage.getItem(key) ?? '') as T; } catch { return fallback; }
}
function save(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* not remembered in this browser */ }
}

/**
 * A list of projects with a checkbox each, to hide a whole project's agents from the office.
 * Hidden projects are remembered in this browser.
 */
export function mountProjectFilter(el: HTMLElement, onChange: () => void) {
  const hidden = new Set<string>(load<string[]>(HIDDEN_KEY, []));
  let collapsed = load<boolean>(COLLAPSED_KEY, false);
  let counts = new Map<string, number>();

  function render() {
    el.hidden = counts.size === 0;
    const rows = [...counts].sort(([a], [b]) => a.localeCompare(b)).map(([project, n]) => `
      <li><label><input type="checkbox" data-project="${escapeHtml(project)}" ${hidden.has(project) ? '' : 'checked'}>
        <span>${escapeHtml(project)}</span><b>${n}</b></label></li>`).join('');
    el.innerHTML = `
      <div class="usage-head">
        <span class="label">Projects</span>
        <button class="btn icon" data-toggle aria-expanded="${!collapsed}" aria-label="${collapsed ? 'Show' : 'Hide'} projects">${collapsed ? '▸' : '▾'}</button>
      </div>
      <div class="usage-body" ${collapsed ? 'hidden' : ''}><ul class="project-filter">${rows}</ul></div>`;
    el.querySelector<HTMLButtonElement>('[data-toggle]')!.onclick = () => { collapsed = !collapsed; save(COLLAPSED_KEY, collapsed); render(); };
    el.querySelectorAll<HTMLInputElement>('input[data-project]').forEach((box) => {
      box.onchange = () => {
        const project = box.dataset.project!;
        if (box.checked) hidden.delete(project); else hidden.add(project);
        save(HIDDEN_KEY, [...hidden]);
        onChange();
      };
    });
  }

  return {
    /** Updates the list from the latest agents and returns the ones to show. */
    filter(records: AgentRecord[]) {
      const next = new Map<string, number>();
      for (const r of records) next.set(r.project, (next.get(r.project) ?? 0) + 1);
      if (JSON.stringify([...next]) !== JSON.stringify([...counts])) { counts = next; render(); }
      return records.filter((r) => !hidden.has(r.project));
    },
  };
}
