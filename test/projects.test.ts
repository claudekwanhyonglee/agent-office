// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { mountProjectFilter } from '../src/client/projects.ts';
import { nameProjects } from '../src/server/cloud.ts';
import type { AgentRecord } from '../src/shared/agent.ts';

const rec = (sessionId: string, project: string): AgentRecord =>
  ({ id: sessionId, sessionId, name: sessionId, project, cwd: '', state: 'working', lastMessage: null, branch: null, activity: [] });

describe('nameProjects', () => {
  it('names threads after their coordinator and leaves other sessions alone', () => {
    const [thread, other] = nameProjects(
      [{ id: 'cse_t', tags: ['hearth-thread'], parent_session_id: 'session_c' }, { id: 'cse_o' }],
      [{ id: 'cse_c', title: 'Project coordinator ("Agent Office")' }],
    );
    expect(thread.project_name).toBe('Agent Office');
    expect(other.project_name).toBeUndefined();
  });
});

describe('mountProjectFilter', () => {
  it('lists projects and hides unticked ones', () => {
    localStorage.clear();
    const el = document.createElement('aside');
    let changes = 0;
    const filter = mountProjectFilter(el, () => { changes += 1; });
    const records = [rec('a', 'Agent Office'), rec('b', 'Trading'), rec('c', 'Trading')];
    expect(filter.filter(records)).toHaveLength(3);
    expect(el.hidden).toBe(false);
    const box = el.querySelector<HTMLInputElement>('input[data-project="Trading"]')!;
    box.checked = false;
    box.dispatchEvent(new Event('change'));
    expect(changes).toBe(1);
    expect(filter.filter(records).map((r) => r.sessionId)).toEqual(['a']);
  });
});
