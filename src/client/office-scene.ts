import type { AgentRecord } from '../shared/agent.ts';
import { createView } from './view.ts';
import { OfficeController, INITIAL_PODS } from './controller.ts';
import { Character } from './character.ts';
import { lookFor } from './look.ts';
import { updateScreens, type Seat } from './office.ts';

/** The live office: the 3D view plus a character for every listed agent. */
export function createOfficeScene(host: HTMLElement) {
  const view = createView(host);
  const controller = new OfficeController();
  const characters = new Map<string, Character>();
  /** Walking out; kept until they're through the door. */
  const leaving = new Set<Character>();
  let seats: Seat[] = view.setPodCount(INITIAL_PODS);

  function show(records: AgentRecord[]) {
    for (const event of controller.update(records)) {
      if (event.type === 'pods') {
        seats = view.setPodCount(event.count);
      } else if (event.type === 'arrive') {
        const character = new Character(lookFor(event.key));
        character.root.userData.agentKey = event.key;
        view.scene.add(character.root);
        characters.set(event.key, character);
        if (event.walk) character.arrive(event.seat, event.record.state, event.path);
        else character.sitAt(event.seat, event.record.state);
      } else if (event.type === 'state') {
        characters.get(event.key)?.setState(event.state);
      } else if (event.type === 'leave') {
        const character = characters.get(event.key)!;
        characters.delete(event.key);
        leaving.add(character);
        character.leave(event.path);
      }
    }
  }

  view.onFrame((t, dt) => {
    characters.forEach((c) => c.update(t, dt));
    for (const c of leaving) {
      c.update(t, dt);
      if (c.mode === 'gone') { view.scene.remove(c.root); leaving.delete(c); }
    }
    updateScreens(seats, controller.occupants());
  });

  return { view, controller, characters, show };
}

export type OfficeScene = ReturnType<typeof createOfficeScene>;
