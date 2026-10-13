import * as THREE from 'three';
import type { AgentRecord } from '../shared/agent.ts';
import { createView } from './view.ts';
import { OfficeController, type OfficeEvent } from './controller.ts';
import { INITIAL_ROWS } from './layout.ts';
import { Character } from './character.ts';
import { PaperPlanes } from './paper-planes.ts';
import { BinBall, BoardDarts, DeskMugs, FishingGear, PongBallMesh, PoolBalls, floatRings } from './break-room.ts';
import { PondFish, updateWater } from './water.ts';
import { Dog } from './dog.ts';
import { FetchBall } from './fetch.ts';
import { lookFor } from './look.ts';
import { updateBackWall, updateScreens } from './office.ts';
import { CAST_SECONDS, landingFrom } from './fishing.ts';

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
  const poolBalls = new PoolBalls(view.scene);
  const pongBall = new PongBallMesh(view.scene);
  const boardDarts = new BoardDarts(view.scene);
  const binBall = new BinBall(view.scene);
  const pondFish = new PondFish(view.scene);
  const fishingGear = new FishingGear(view.scene);
  let pondTime = 0;
  const dog = new Dog();
  dog.placeAt(controller.dog.spot.dog, controller.dog.lying);
  view.scene.add(dog.root);
  const fetchBall = new FetchBall(view.scene);

  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.55, 0.68, 40),
    new THREE.MeshBasicMaterial({ color: '#FFB648', transparent: true, opacity: 0.9, depthWrite: false }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.visible = false;
  view.scene.add(ring);

  const debugActivity = import.meta.env.DEV ? new URLSearchParams(location.search).get('activity') : null;

  function show(records: AgentRecord[]) {
    if (debugActivity) return; // the dev scene stays as set up, whatever the feed says
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
        const desk = office.seats[event.desk].desk;
        characters.get(event.key)?.throwPlane((from) => planes.throw(from, desk));
      } else if (event.type === 'high-five') {
        characters.get(event.key)?.highFive();
        characters.get(event.to)?.highFive();
      } else if (event.type === 'dog') {
        if (event.path.length === 1) dog.placeAt(event.path[0], event.lie);
        else dog.go(event.path, event.lie, event.wait);
      } else if (event.type === 'fetch') {
        characters.get(event.key)?.throwBall();
        fetchBall.throw(event.to);
      } else if (event.type === 'cast') {
        const angler = characters.get(event.key);
        if (angler?.place) {
          angler.fish(event.cast);
          fishingGear.start(event.cast, angler.place, pondTime);
        }
      } else if (event.type === 'cheer') {
        for (const key of event.keys) characters.get(key)?.cheer();
      } else if (event.type === 'drift') {
        characters.get(event.key)?.float(event.drift);
      } else if (event.type === 'pong') {
        pongBall.play(event.rally);
        event.players.forEach((key, i) => characters.get(key)?.playRally(event.rally, i ? 1 : -1));
      } else if (event.type === 'pool') {
        poolBalls.play(event.shot);
        if (event.shot != null) characters.get(event.shooter)?.takeShot();
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
    poolBalls.update(dt);
    pongBall.update(dt);
    pondTime = t;
    updateWater(t);
    if ([...characters.values()].some((c) => c.fishing())) fishingGear.update(dt);
    else fishingGear.stop();
    pondFish.update(t, fishingGear.frame()?.fish ?? null);
    office.tv.update([...characters.values()].some((c) => c.onSofa()), t);
    const dip = office.layout.hangouts.find((s) => s.name === 'pool-dip')!.places;
    const riders = [...characters.values(), ...leaving];
    floatRings(office.group, dip.map((p) => riders.find((c) => c.place?.x === p.x && c.place.z === p.z)?.floatOffset() ?? null));
    boardDarts.update([...characters.values()].map((c) => c.dartsThrower()).find((d) => d) ?? null);
    binBall.update([...characters.values()].map((c) => c.hoopsShooter()).find((d) => d) ?? null);
    dog.update(t, dt);
    fetchBall.update(dt, [...characters.values()].find((c) => c.throwingBall()) ?? null, dog);
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

  // Dev only: lets a visual check frame a desk and throw a plane at it.
  if (import.meta.env.DEV) Object.assign(window, { officeDebug: { camera: view.camera, planes, seats: () => office.seats } });
  /** Dev only (#84): `?activity=fishing` puts an angler on the jetty, casting over and over, with the camera on the pond. */
  function fishForever() {
    const place = office.layout.hangouts.find((s) => s.name === 'fishing')!.places[0];
    const angler = new Character(lookFor('debug-angler'));
    angler.placeAt(office.seats[0], 'done', place);
    view.scene.add(angler.root);
    characters.set('debug-angler', angler);
    let next = 0;
    const cast = () => {
      const c = { landing: landingFrom(Math.random), fish: null };
      angler.fish(c);
      fishingGear.start(c, place, pondTime);
      clearTimeout(next);
      next = window.setTimeout(cast, CAST_SECONDS * 1000);
    };
    cast();
    Object.assign(window, { cast });
    const ahead = { x: place.x + 1.5 * Math.sin(place.yaw), z: place.z + 1.5 * Math.cos(place.yaw) };
    view.camera.position.set(ahead.x + 6 * Math.cos(place.yaw), 2, ahead.z - 6 * Math.sin(place.yaw));
    view.camera.lookAt(ahead.x, 1, ahead.z);
  }

  /** Dev only (#87): `?activity=darts` puts a stand-in agent at that hangout and looks over its right shoulder. */
  function showActivity(name: string | null) {
    const place = office.layout.hangouts.find((s) => s.name === name)?.places[0];
    if (!place) return;
    const character = new Character(lookFor('stand-in'));
    character.placeAt(office.seats[0], 'done', place);
    view.scene.add(character.root);
    characters.set('stand-in', character);
    const forward = new THREE.Vector3(Math.sin(place.yaw), 0, Math.cos(place.yaw)), right = new THREE.Vector3(forward.z, 0, -forward.x);
    const ahead = new THREE.Vector3(place.x, 1.3, place.z).addScaledVector(forward, 1);
    view.camera.position.copy(ahead).addScaledVector(right, 3).addScaledVector(forward, -3.5).setY(2.6);
    view.camera.lookAt(ahead);
  }
  /** Dev only (#86): `?activity=planes` puts a thrower at every paper-plane place, each throwing every few seconds. */
  function showPlaneThrowers() {
    office.layout.hangouts.find((s) => s.name === 'planes')!.places.forEach((place, i) => {
      const character = new Character(lookFor(`planes-${i}`));
      character.placeAt(office.seats[0], 'done', place);
      view.scene.add(character.root);
      characters.set(`planes-${i}`, character);
      const desk = office.seats[(i * 5) % office.seats.length].desk;
      setInterval(() => character.throwPlane((from) => planes.throw(from, desk)), 2500 + i * 300);
    });
  }
  if (debugActivity === 'fishing') fishForever();
  else if (debugActivity === 'planes') showPlaneThrowers();
  else if (debugActivity) showActivity(debugActivity);

  return { show, onPick, onHover, select: (key: string | null) => { selected = key; } };
}
