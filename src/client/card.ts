import type { AgentRecord, OfficeState } from '../shared/agent.ts';

export const STATE_LABEL: Record<OfficeState, string> = {
  working: 'Working',
  needs: 'Needs you',
  done: 'Done',
  stale: 'Stale',
  finished: 'Finished',
};

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

interface CardActions {
  close(): void;
  acknowledge(record: AgentRecord): void;
}

export const attachCommand = (record: AgentRecord) => `claude attach ${record.id}`;
export const canDismiss = (record: AgentRecord) => record.state === 'finished' || record.state === 'stale';

/** Fills the agent card: what it's doing and how to pick it up. */
export function renderCard(card: HTMLElement, record: AgentRecord, actions: CardActions) {
  const command = attachCommand(record);
  card.innerHTML = `
    <header>
      <h2>${escapeHtml(record.name)}</h2>
      <button class="btn icon" data-close aria-label="Close">×</button>
    </header>
    <div class="meta">
      <span>${escapeHtml(record.project)}</span>
      ${record.branch ? `<span>· ${escapeHtml(record.branch)}</span>` : ''}
      <span class="pill ${record.state}">${STATE_LABEL[record.state]}</span>
    </div>
    ${record.lastMessage ? `<div class="section"><span class="label">Last message</span><p class="desc">${escapeHtml(record.lastMessage)}</p></div>` : ''}
    <div class="section">
      <span class="label">Pick it up</span>
      <div class="command"><code>${escapeHtml(command)}</code><button class="btn" data-copy>Copy</button></div>
    </div>
    ${canDismiss(record) ? '<div><button class="btn primary" data-ack>Got it</button></div>' : ''}`;
  card.hidden = false;

  card.querySelector<HTMLButtonElement>('[data-close]')!.onclick = actions.close;
  const copy = card.querySelector<HTMLButtonElement>('[data-copy]')!;
  copy.onclick = () => {
    navigator.clipboard?.writeText(command).then(() => { copy.textContent = 'Copied'; }, () => { copy.textContent = 'Copy failed'; });
  };
  const ack = card.querySelector<HTMLButtonElement>('[data-ack]');
  if (ack) ack.onclick = () => { ack.disabled = true; actions.acknowledge(record); };
}

export function renderCounts(el: HTMLElement, records: AgentRecord[]) {
  const count = (state: OfficeState) => records.filter((r) => r.state === state).length;
  const needs = count('needs');
  el.innerHTML = `<span class="count needs"><b>${needs}</b> ${needs === 1 ? 'needs' : 'need'} you</span> · `
    + `<span class="count"><b>${count('working')}</b> working</span> · `
    + `<span class="count"><b>${count('done')}</b> done</span>`;
}

export function showTooltip(el: HTMLElement, record: AgentRecord | undefined, x: number, y: number) {
  el.hidden = !record;
  if (!record) return;
  el.innerHTML = `${escapeHtml(record.name)} <span>· ${escapeHtml(record.project)}</span>`;
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
}
