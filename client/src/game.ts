import { Client, Room } from "colyseus.js";
import * as THREE from "three";
import { setListener, unlockAudio } from "./audio";
import { PlayerView } from "./views/PlayerView";
import { EnemyView } from "./views/EnemyView";
import { BoltView } from "./views/BoltView";
import { DaintyTipView } from "./views/DaintyTipView";
import { OvenView } from "./views/OvenView";
import { SeatReservation } from "./connection/lobby";
import { gameStore } from "./stores/game";

type ProjectileView = BoltView | DaintyTipView;

const WORLD_W = 800;
const WORLD_H = 600;

// Camera-space units per CSS pixel. Smaller = more zoomed in; larger = see more
// world on bigger monitors (Escape-from-Duckov style). Tune by feel.
const WORLD_UNITS_PER_PIXEL = 0.75;

export async function startGame(client: Client, reservation: SeatReservation): Promise<void> {
  const canvas = document.getElementById("game") as HTMLCanvasElement;

  gameStore.set({
    hp: PlayerView.MAX_HP,
    maxHp: PlayerView.MAX_HP,
    sessionId: null,
    connectionStatus: "connecting…",
  });

  // ─── three setup ──────────────────────────────────────────────────────────

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x16181d);

  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -2000, 4000);
  const worldCenter = new THREE.Vector3(WORLD_W / 2, 0, WORLD_H / 2);
  camera.position.set(worldCenter.x + 600, 600, worldCenter.z + 600);
  camera.lookAt(worldCenter);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  function resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    renderer.setSize(w, h, false);
    const viewW = w * WORLD_UNITS_PER_PIXEL;
    const viewH = h * WORLD_UNITS_PER_PIXEL;
    camera.left = -viewW / 2;
    camera.right = viewW / 2;
    camera.top = viewH / 2;
    camera.bottom = -viewH / 2;
    camera.updateProjectionMatrix();
  }
  resize();
  window.addEventListener("resize", resize);

  scene.add(new THREE.AmbientLight(0xffffff, 0.55));
  const dir = new THREE.DirectionalLight(0xffffff, 0.8);
  dir.position.set(worldCenter.x - 400, 900, worldCenter.z - 300);
  dir.target.position.copy(worldCenter);
  dir.castShadow = true;
  dir.shadow.camera.left = -700;
  dir.shadow.camera.right = 700;
  dir.shadow.camera.top = 700;
  dir.shadow.camera.bottom = -700;
  dir.shadow.camera.near = 1;
  dir.shadow.camera.far = 2500;
  dir.shadow.mapSize.set(1024, 1024);
  scene.add(dir);
  scene.add(dir.target);

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(WORLD_W, WORLD_H),
    new THREE.MeshLambertMaterial({ color: 0x1c1f24 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.copy(worldCenter);
  ground.receiveShadow = true;
  scene.add(ground);

  {
    const positions: number[] = [];
    const step = 40;
    for (let x = 0; x <= WORLD_W; x += step) positions.push(x, 0.05, 0, x, 0.05, WORLD_H);
    for (let z = 0; z <= WORLD_H; z += step) positions.push(0, 0.05, z, WORLD_W, 0.05, z);
    const geom = new THREE.BufferGeometry();
    geom.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    scene.add(new THREE.LineSegments(geom, new THREE.LineBasicMaterial({ color: 0x232730 })));
  }

  {
    const p = [
      0,0.1,0,             WORLD_W,0.1,0,
      WORLD_W,0.1,0,       WORLD_W,0.1,WORLD_H,
      WORLD_W,0.1,WORLD_H, 0,0.1,WORLD_H,
      0,0.1,WORLD_H,       0,0.1,0,
    ];
    const geom = new THREE.BufferGeometry();
    geom.setAttribute("position", new THREE.Float32BufferAttribute(p, 3));
    scene.add(new THREE.LineSegments(geom, new THREE.LineBasicMaterial({ color: 0x2f343d })));
  }

  // ─── view registries ──────────────────────────────────────────────────────

  const players     = new Map<string, PlayerView>();
  const enemies     = new Map<string, EnemyView>();
  const projectiles = new Map<string, ProjectileView>();
  const bosses      = new Map<string, OvenView>();

  let mySessionId: string | null = null;
  const predicted = { x: 0, y: 0 };
  let sendCast: ((dx: number, dy: number) => void) | null = null;
  let suppressSpawnUntil = 0;

  // ─── input ────────────────────────────────────────────────────────────────

  type Key = "up" | "down" | "left" | "right";
  const input: Record<Key, boolean> = { up: false, down: false, left: false, right: false };
  const keymap: Record<string, Key> = {
    KeyW: "up", ArrowUp: "up",
    KeyS: "down", ArrowDown: "down",
    KeyA: "left", ArrowLeft: "left",
    KeyD: "right", ArrowRight: "right",
  };
  addEventListener("keydown", (e) => { const k = keymap[e.code]; if (k) { input[k] = true; e.preventDefault(); } });
  addEventListener("keyup",   (e) => { const k = keymap[e.code]; if (k) { input[k] = false; e.preventDefault(); } });

  const firstGesture = () => {
    unlockAudio();
    removeEventListener("keydown", firstGesture);
    removeEventListener("mousedown", firstGesture);
  };
  addEventListener("keydown", firstGesture);
  addEventListener("mousedown", firstGesture);

  // ─── mouse (raycast to ground) ────────────────────────────────────────────

  const mouseWorld = { x: WORLD_W / 2, y: WORLD_H / 2 };
  const raycaster = new THREE.Raycaster();
  const mouseNDC = new THREE.Vector2();
  const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const hitPoint = new THREE.Vector3();

  canvas.addEventListener("mousemove", (e) => {
    const rect = canvas.getBoundingClientRect();
    mouseNDC.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    mouseNDC.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(mouseNDC, camera);
    if (raycaster.ray.intersectPlane(groundPlane, hitPoint)) {
      mouseWorld.x = hitPoint.x;
      mouseWorld.y = hitPoint.z;
    }
  });

  canvas.addEventListener("mousedown", (e) => {
    if (e.button !== 0 || !sendCast || !mySessionId) return;
    const dx = mouseWorld.x - predicted.x;
    const dy = mouseWorld.y - predicted.y;
    if (Math.hypot(dx, dy) < 1e-4) return;
    sendCast(dx, dy);
  });

  // ─── connection ───────────────────────────────────────────────────────────

  const room: Room<any> = await client.consumeSeatReservation<any>(reservation);
  mySessionId = room.sessionId;
  gameStore.update((s) => ({
    ...s,
    sessionId: mySessionId,
    connectionStatus: `connected · session ${mySessionId!.slice(0, 6)}`,
  }));
  suppressSpawnUntil = performance.now() + 750;

  room.state.players.onAdd((player: any, sessionId: string) => {
    const view = new PlayerView(player);
    scene.add(view);
    players.set(sessionId, view);

    if (sessionId === mySessionId) {
      predicted.x = player.x;
      predicted.y = player.y;
    }

    player.onChange(() => {
      const v = players.get(sessionId);
      if (!v) return;
      const prevHp = v.hp;
      v.applyServerState(player);
      if (sessionId === mySessionId) {
        predicted.x = player.x;
        predicted.y = player.y;
      }
      if (player.hp < prevHp) {
        console.log("[player damage]", sessionId.slice(0,4), prevHp, "→", player.hp);
      }
    });
  });
  room.state.players.onRemove((_p: any, sessionId: string) => {
    const v = players.get(sessionId);
    if (v) v.dispose();
    players.delete(sessionId);
  });

  room.state.enemies.onAdd((enemy: any, id: string) => {
    const playSpawnSfx = performance.now() >= suppressSpawnUntil;
    const view = new EnemyView(enemy, { playSpawnSfx });
    scene.add(view);
    enemies.set(id, view);
    enemy.onChange(() => {
      const v = enemies.get(id);
      if (!v) return;
      v.applyServerState(enemy);
    });
  });
  room.state.enemies.onRemove((_e: any, id: string) => {
    console.log("[enemy-]", id);
    const v = enemies.get(id);
    if (v) v.dispose();
    enemies.delete(id);
  });

  room.state.projectiles.onAdd((bolt: any, id: string) => {
    console.log("[proj+]", id, bolt.kind, "spawn=", bolt.x.toFixed(0), bolt.y.toFixed(0), "v=", bolt.vx.toFixed(0), bolt.vy.toFixed(0));
    const view: ProjectileView = bolt.kind === "daintyTip"
      ? new DaintyTipView(bolt)
      : new BoltView(bolt);
    scene.add(view);
    projectiles.set(id, view);
    let changes = 0;
    bolt.onChange(() => {
      changes++;
      if (changes <= 3 || changes % 5 === 0) console.log("[proj~]", id, "#", changes, "pos=", bolt.x.toFixed(0), bolt.y.toFixed(0));
      const v = projectiles.get(id);
      if (!v) return;
      v.applyServerState(bolt);
    });
  });
  room.state.projectiles.onRemove((_b: any, id: string) => {
    console.log("[proj-]", id);
    const v = projectiles.get(id);
    if (v) v.dispose();
    projectiles.delete(id);
  });

  room.state.bosses.onAdd((boss: any, id: string) => {
    // The map key is the boss kind; when more boss types exist we'll dispatch
    // here on `id` to pick the right view class.
    const view = new OvenView({ x: boss.x, z: boss.y });
    view.setDoorOpen(boss.doorOpen);
    scene.add(view);
    bosses.set(id, view);
    boss.onChange(() => view.setDoorOpen(boss.doorOpen));
  });
  room.state.bosses.onRemove((_b: any, id: string) => {
    const v = bosses.get(id);
    if (v) v.removeFromParent();
    bosses.delete(id);
  });

  setInterval(() => room.send("input", input), 1000 / 30);
  sendCast = (dx, dy) => room.send("cast", { dx, dy });

  room.onLeave(() => {
    gameStore.update((s) => ({ ...s, connectionStatus: "disconnected" }));
  });

  // ─── game loop ────────────────────────────────────────────────────────────

  let lastTime = performance.now();
  function frame(now: number) {
    const dt = Math.min(0.1, (now - lastTime) / 1000);
    lastTime = now;

    if (mySessionId) {
      let dx = 0, dy = 0;
      if (input.up) dy -= 1;
      if (input.down) dy += 1;
      if (input.left) dx -= 1;
      if (input.right) dx += 1;
      if (dx || dy) {
        const len = Math.hypot(dx, dy);
        predicted.x = clamp(
          predicted.x + (dx / len) * PlayerView.SPEED * dt,
          PlayerView.RADIUS, WORLD_W - PlayerView.RADIUS,
        );
        predicted.y = clamp(
          predicted.y + (dy / len) * PlayerView.SPEED * dt,
          PlayerView.RADIUS, WORLD_H - PlayerView.RADIUS,
        );
      }
    }

    players.forEach((view, id) => {
      if (id === mySessionId) view.setPredictedPosition(predicted.x, predicted.y);
      else view.update(dt);
    });
    enemies.forEach((view) => view.update(dt));
    projectiles.forEach((view) => view.update(dt));

    bosses.forEach((view) => {
      view.update(dt);
      if (mySessionId) view.faceToward(predicted.x, predicted.y);
    });

    if (mySessionId) {
      const me = players.get(mySessionId);
      if (me) {
        setListener(predicted.x, predicted.y);
        gameStore.update((s) => (s.hp === me.hp ? s : { ...s, hp: me.hp }));
      }
    }

    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }

  (window as any).__game = { players, enemies, projectiles, bosses, predicted };

  requestAnimationFrame(frame);
}

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}
