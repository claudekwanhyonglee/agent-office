import * as THREE from 'three';
import type { AgentRecord } from '../shared/agent.ts';
import { createView } from './view.ts';
import { OfficeController, type OfficeEvent } from './controller.ts';
import { INITIAL_ROWS } from './layout.ts';
import { Character } from './character.ts';
import { PaperPlanes } from './paper-planes.ts';
import { DeskMugs } from './break-room.ts';
import { lookFor } from './look.ts';
import { updateBackWall, updateScreens } from './office.ts';

/** The agent a picked mesh belongs to, if any. */
export function agentKeyOf(object: THREE.Object3D | null | undefined): string | null {
  let node = object ?? null;
  while (node && !node.userData.agentKey) node = node.parent;
  return node?.userData.agentKey ?? null;
}

/** The live office: the 3D view plus a character for every listed agent. */
export function createOfficeScene(host: HTMLElement) {
  const view = createView(host);
  const controller = new OfficeController();
  const characters = new Map<string, Character>();
  /** Walking out; kept until they're through the door. */
  const leaving = new Set<Character>();
  let office = view.setRows(INITIAL_ROWS);
  let selected: string | null = null;
  const planes = new PaperPlanes(view.scene);
  const mugs = new DeskMugs(view.scene);

  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.55, 0.68, 40),
    new THREE.MeshBasicMaterial({ color: '#FFB648', transparent: true, opacity: 0.9, depthWrite: false }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.visible = false;
  view.scene.add(ring);

  function show(records: AgentRecord[]) {
    apply(controller.update(records));
  }

  function apply(events: OfficeEvent[]) {
    for (const event of events) {
      if (event.type === 'rows') {
        office = view.setRows(event.count);
      } else if (event.type === 'place') {
        const character = characters.get(event.key)!;
        if (event.place) character.placeAt(event.seat, event.state, event.place);
        else character.sitAt(event.seat, event.state);
      } else if (event.type === 'arrive') {
        const character = new Character(lookFor(event.key));
        character.root.userData.agentKey = event.key;
        view.scene.add(character.root);
        characters.set(event.key, character);
        if (event.walk) character.arrive(event.seat, event.record.state, event.path);
        else if (event.place) character.placeAt(event.seat, event.record.state, event.place);
        else character.sitAt(event.seat, event.record.state);
      } else if (event.type === 'walk') {
        characters.get(event.key)?.go(event.path, event.place);
      } else if (event.type === 'state') {
        characters.get(event.key)?.setState(event.state);
      } else if (event.type === 'plane') {
        const thrower = characters.get(event.key);
        if (thrower) planes.throw(thrower.root.position, office.seats[event.desk].desk);
      } else if (event.type === 'high-five') {
        characters.get(event.key)?.highFive();
        characters.get(event.to)?.highFive();
      } else if (event.type === 'mug') {
        mugs.set(office.seats[event.desk], event.on);
      } else if (event.type === 'leave') {
        const character = characters.get(event.key)!;
        characters.delete(event.key);
        leaving.add(character);
        character.leave(event.path);
      }
    }
  }

  // Picking: which agent (if any) is under the pointer.
  const raycaster = new THREE.Raycaster();
  function agentAt(e: PointerEvent): string | null {
    const r = view.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    raycaster.setFromCamera(ndc, view.camera);
    const hit = raycaster.intersectObjects([...characters.values()].map((c) => c.root), true)[0];
    return agentKeyOf(hit?.object);
  }

  function onPick(handle: (key: string | null) => void) {
    view.onClick((e) => handle(agentAt(e)));
  }

  function onHover(handle: (key: string | null, x: number, y: number) => void) {
    view.canvas.addEventListener('pointermove', (e) => {
      if (e.buttons) return handle(null, 0, 0); // dragging the camera
      const key = agentAt(e);
      view.canvas.classList.toggle('pointing', !!key);
      const r = view.canvas.getBoundingClientRect();
      handle(key, e.clientX - r.left, e.clientY - r.top);
    });
    view.canvas.addEventListener('pointerleave', () => handle(null, 0, 0));
  }

  view.onFrame((t, dt) => {
    apply(controller.tick());
    characters.forEach((c) => c.update(t, dt));
    planes.update(dt);
    for (const c of leaving) {
      c.update(t, dt);
      if (c.mode === 'gone') { view.scene.remove(c.root); leaving.delete(c); }
    }
    const occupants = controller.occupants();
    updateScreens(office.seats, occupants, t);
    updateBackWall(office, view.camera.position);
    office.board.update(occupants);
    const target = selected ? characters.get(selected) : undefined;
    ring.visible = !!target;
    if (target) {
      ring.position.set(target.root.position.x, 0.02, target.root.position.z);
      ring.scale.setScalar(1 + Math.sin(t * 4) * 0.05);
    }
  });

  return { show, onPick, onHover, select: (key: string | null) => { selected = key; } };
}
