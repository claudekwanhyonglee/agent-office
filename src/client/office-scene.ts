import * as THREE from 'three';
import type { AgentRecord } from '../shared/agent.ts';
import { createView } from './view.ts';
import { OfficeController, type OfficeEvent } from './controller.ts';
import { Character } from './character.ts';
import { PaperPlanes } from './paper-planes.ts';
import { BinBall, BoardDarts, DeskMugs, FishingGear, PongBallMesh, PoolBalls, floatRings } from './break-room.ts';
import { PondFish, updateWater } from './water.ts';
import { Dog } from './dog.ts';
import { FetchBall, RELEASE_AT } from './fetch.ts';
import { lookFor } from './look.ts';
import { updateBackWall, updateScreens } from './office.ts';
import { doorsOpen } from './control-room-3d.ts';
import { CAST_SECONDS, landingFrom } from './fishing.ts';
import { CLIMBING_IN } from './float.ts';
import { bindLayoutPicker, savedLayout } from './layout-picker.ts';
import { fetchRun, floorAt, planeLanding, yawTowards, type Point } from './layout.ts';

/** The agent a picked mesh belongs to, if any. */
export function agentKeyOf(object: THREE.Object3D | null | undefined): string | null {
  let node = object ?? null;
  while (node && !node.userData.agentKey) node = node.parent;
  return node?.userData.agentKey ?? null;
}

/** The live office: the 3D view plus a character for every listed agent. */
export function createOfficeScene(host: HTMLElement) {
  const view = createView(host);
  const picker = document.getElementById('layout-picker');
  let preset = picker ? bindLayoutPicker(picker, switchLayout) : savedLayout();
  let controller = new OfficeController({}, preset);
  /** The feed as last shown, to place everyone again when the layout changes. */
  let records: AgentRecord[] = [];
  const characters = new Map<string, Character>();
  /** Walking out; kept until they're through the door. */
  const leaving = new Set<Character>();
  let office = view.setRows(controller.rows, preset);
  let selected: string | null = null;
  const planes = new PaperPlanes(view.scene);
  /** The floor's height under a point, in the office as it is now (#103). */
  const floor = (p: Point) => floorAt(office.layout, p);
  const mugs = new DeskMugs(view.scene, floor);
  const props = () => office.layout.props;
  const poolBalls = new PoolBalls(view.scene, props, floor);
  const pongBall = new PongBallMesh(view.scene, props, floor);
  const boardDarts = new BoardDarts(view.scene, props, floor);
  const binBall = new BinBall(view.scene, props, floor);
  const pondFish = new PondFish(view.scene, props);
  const fishingGear = new FishingGear(view.scene, props);
  let pondTime = 0;
  const dog = new Dog();
  dog.ground = floor;
  dog.placeAt(controller.dog.spot.dog, controller.dog.lying);
  view.scene.add(dog.root);
  const fetchBall = new FetchBall(view.scene, floor);
  /** A new character, standing on the floor. */
  const newCharacter = (key: string) => {
    const character = new Character(lookFor(key));
    character.ground = floor;
    return character;
  };
  /** `character` throws a paper plane at desk `desk` (it lands where the layout says, #103). */
  const throwPlane = (character: Character, desk: number) => {
    const { at, onFloor } = planeLanding(office.layout, office.seats[desk]);
    character.throwPlane((from) => planes.throw(from, at, onFloor));
  };

  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.55, 0.68, 40),
    new THREE.MeshBasicMaterial({ color: '#FFB648', transparent: true, opacity: 0.9, depthWrite: false }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.visible = false;
  view.scene.add(ring);

  const debugActivity = import.meta.env.DEV ? new URLSearchParams(location.search).get('activity') : null;

  function show(latest: AgentRecord[]) {
    records = latest;
    if (debugActivity) return; // the dev scene stays as set up, whatever the feed says
    apply(controller.update(records));
  }

  /** Rebuilds the office as preset `next` and seats everyone there afresh, as if the page had just opened (#104). */
  function switchLayout(next: string) {
    preset = next;
    for (const character of [...characters.values(), ...leaving]) view.scene.remove(character.root);
    characters.clear();
    leaving.clear();
    mugs.clear();
    fishingGear.stop();
    controller = new OfficeController({}, preset);
    office = view.setRows(controller.rows, preset);
    dog.placeAt(controller.dog.spot.dog, controller.dog.lying);
    apply(controller.update(records));
  }

  function apply(events: OfficeEvent[]) {
    for (const event of events) {
      if (event.type === 'rows') {
        office = view.setRows(event.count, preset);
      } else if (event.type === 'place') {
        const character = characters.get(event.key)!;
        if (event.place) character.placeAt(event.seat, event.state, event.place);
        else character.sitAt(event.seat, event.state);
      } else if (event.type === 'arrive') {
        const character = newCharacter(event.key);
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
        if (thrower) throwPlane(thrower, event.desk);
      } else if (event.type === 'high-five') {
        characters.get(event.key)?.highFive();
        characters.get(event.to)?.highFive();
      } else if (event.type === 'dog') {
        if (event.path.length === 1) dog.placeAt(event.path[0], event.lie);
        else dog.go(event.path, event.lie, event.wait);
      } else if (event.type === 'fetch') {
        characters.get(event.key)?.throwBall(event.to);
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
    floatRings(office.group, dip.map((p) => {
      const rider = riders.find((c) => c.place?.x === p.x && c.place.z === p.z);
      return rider ? rider.floatOffset() ?? CLIMBING_IN : null;
    }), props().pool, t, dt);
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
    office.doors?.update(doorsOpen(office.layout.door, [...characters.values(), ...leaving].map((c) => c.root.position)), dt);
    office.board.update(occupants);
    const target = selected ? characters.get(selected) : undefined;
    ring.visible = !!target;
    if (target) {
      ring.position.set(target.root.position.x, floor(target.root.position) + 0.02, target.root.position.z);
      ring.scale.setScalar(1 + Math.sin(t * 4) * 0.05);
    }
  });

  // Dev only: lets a visual check frame a desk and throw a plane at it.
  if (import.meta.env.DEV) Object.assign(window, { officeDebug: { camera: view.camera, planes, seats: () => office.seats } });
  /** Dev only (#84): `?activity=fishing` puts an angler on the jetty, casting over and over, with the camera on the pond. */
  function fishForever() {
    const place = office.layout.hangouts.find((s) => s.name === 'fishing')!.places[0];
    const angler = newCharacter('debug-angler');
    angler.placeAt(office.seats[0], 'done', place);
    view.scene.add(angler.root);
    characters.set('debug-angler', angler);
    let next = 0;
    const cast = () => {
      const c = { landing: landingFrom(Math.random, props()), fish: null };
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

  /**
   * Dev only (#87): `?activity=darts` puts a stand-in agent at each of that hangout's places (#112: all of them,
   * e.g. a full sofa) and looks over the first one's right shoulder.
   */
  function showActivity(name: string | null) {
    const places = office.layout.hangouts.find((s) => s.name === name)?.places ?? [];
    places.forEach((p, i) => {
      const character = newCharacter(`stand-in-${i}`);
      character.placeAt(office.seats[0], 'done', p);
      view.scene.add(character.root);
      characters.set(`stand-in-${i}`, character);
    });
    const [place] = places;
    if (!place) return;
    const forward = new THREE.Vector3(Math.sin(place.yaw), 0, Math.cos(place.yaw)), right = new THREE.Vector3(forward.z, 0, -forward.x);
    const ahead = new THREE.Vector3(place.x, floor(place) + 1.3, place.z).addScaledVector(forward, 1);
    view.camera.position.copy(ahead).addScaledVector(right, 3).addScaledVector(forward, -3.5).setY(ahead.y + 1.3);
    view.camera.lookAt(ahead);
  }
  /** Dev only (#86): `?activity=planes` puts a thrower at every paper-plane place, each throwing every few seconds. */
  function showPlaneThrowers() {
    office.layout.hangouts.find((s) => s.name === 'planes')!.places.forEach((place, i) => {
      const character = newCharacter(`planes-${i}`);
      character.placeAt(office.seats[0], 'done', place);
      view.scene.add(character.root);
      characters.set(`planes-${i}`, character);
      setInterval(() => throwPlane(character, (i * 5) % office.seats.length), 2500 + i * 300);
    });
  }
  /** Dev only (#114): `?activity=fetch` plays fetch in the hall, where the ball goes behind the thrower; `throwBall()` throws. */
  function playFetch() {
    const spot = office.layout.dogSpots.find((s) => s.name === 'hall')!, visitor = spot.visitors[0];
    const thrower = newCharacter('fetcher');
    thrower.placeAt(office.seats[0], 'done', { spot: 'dog', pose: 'throwing-ball', ...visitor.at, link: visitor.link, yaw: yawTowards(visitor.at, spot.dog) });
    view.scene.add(thrower.root);
    characters.set('fetcher', thrower);
    dog.placeAt(spot.dog, false);
    const throwBall = () => { thrower.throwBall(spot.fetch); fetchBall.throw(spot.fetch); dog.go(fetchRun(office.layout, spot), false, RELEASE_AT); };
    Object.assign(window, { throwBall });
    view.camera.position.set(visitor.at.x, floor(visitor.at) + 3.5, visitor.at.z + 6);
    view.camera.lookAt(visitor.at.x, floor(visitor.at) + 1, visitor.at.z);
  }
  if (debugActivity === 'fishing') fishForever();
  else if (debugActivity === 'fetch') playFetch();
  else if (debugActivity === 'planes') showPlaneThrowers();
  else if (debugActivity) showActivity(debugActivity);

  return { show, onPick, onHover, select: (key: string | null) => { selected = key; } };
}
