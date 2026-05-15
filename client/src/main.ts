import { Client } from "colyseus.js";
import * as THREE from "three";
import { sfx, unlockAudio, setListener } from "./audio";

const SPEED = 220;
const WORLD_W = 800;
const WORLD_H = 600;
const PLAYER_RADIUS = 16;
const BOLT_RADIUS = 5;
const ENEMY_RADIUS = 14;
const PLAYER_MAX_HP = 50;

const PLAYER_HEIGHT = PLAYER_RADIUS * 3;
const ENEMY_HEIGHT  = ENEMY_RADIUS * 3;
const BOLT_Y        = PLAYER_RADIUS * 1.6;

const canvas = document.getElementById("game") as HTMLCanvasElement;
const hud = document.getElementById("hud")!;
const hpFill = document.getElementById("hp-fill") as HTMLDivElement;
const hpText = document.getElementById("hp-text") as HTMLDivElement;

// ─── three setup ────────────────────────────────────────────────────────────

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x16181d);

const ASPECT = canvas.width / canvas.height;
const VIEW_W = 1100;
const VIEW_H = VIEW_W / ASPECT;
const camera = new THREE.OrthographicCamera(-VIEW_W / 2, VIEW_W / 2, VIEW_H / 2, -VIEW_H / 2, -2000, 4000);

const worldCenter = new THREE.Vector3(WORLD_W / 2, 0, WORLD_H / 2);
// True isometric: 45° around Y, ~35.26° down (1:1:1 offset from target).
camera.position.set(worldCenter.x + 600, 600, worldCenter.z + 600);
camera.lookAt(worldCenter);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setSize(canvas.width, canvas.height, false);
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

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

// ─── shared geometries/materials ────────────────────────────────────────────

const playerGeom = new THREE.BoxGeometry(PLAYER_RADIUS * 2, PLAYER_HEIGHT, PLAYER_RADIUS * 2);
const enemyGeom  = new THREE.BoxGeometry(ENEMY_RADIUS * 2,  ENEMY_HEIGHT,  ENEMY_RADIUS * 2);
const enemyMat   = new THREE.MeshLambertMaterial({ color: 0xc64a3a });
const boltGeom   = new THREE.SphereGeometry(BOLT_RADIUS, 12, 8);
const boltMat    = new THREE.MeshBasicMaterial({ color: 0xf0e36a });

// ─── rendered state ─────────────────────────────────────────────────────────

interface RenderedPlayer { x: number; y: number; serverX: number; serverY: number; hp: number; }
interface RenderedEnemy  { x: number; y: number; serverX: number; serverY: number; hp: number; }
interface RenderedBolt   { x: number; y: number; serverX: number; serverY: number; }

const players = new Map<string, RenderedPlayer>();
const enemies = new Map<string, RenderedEnemy>();
const bolts   = new Map<string, RenderedBolt>();
const playerMeshes = new Map<string, THREE.Mesh>();
const enemyMeshes  = new Map<string, THREE.Mesh>();
const boltMeshes   = new Map<string, THREE.Mesh>();

let mySessionId: string | null = null;
const predicted = { x: 0, y: 0 };
let sendCast: ((dx: number, dy: number) => void) | null = null;
let suppressSpawnUntil = 0;

// ─── input ──────────────────────────────────────────────────────────────────

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

// unlock the AudioContext on first user gesture
const firstGesture = () => {
  unlockAudio();
  removeEventListener("keydown", firstGesture);
  removeEventListener("mousedown", firstGesture);
};
addEventListener("keydown", firstGesture);
addEventListener("mousedown", firstGesture);

// ─── mouse (raycast to ground) ──────────────────────────────────────────────

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

// ─── connection ─────────────────────────────────────────────────────────────

async function connect() {
  const client = new Client(`ws://${location.hostname}:2567`);
  const room = await client.joinOrCreate<any>("game");
  mySessionId = room.sessionId;
  hud.textContent = `connected · session ${mySessionId.slice(0, 6)}`;
  // suppress the spawn SFX barrage from the initial enemy population
  suppressSpawnUntil = performance.now() + 750;

  room.state.players.onAdd((player: any, sessionId: string) => {
    players.set(sessionId, {
      x: player.x, y: player.y,
      serverX: player.x, serverY: player.y,
      hp: player.hp,
    });

    const mat = new THREE.MeshLambertMaterial({ color: new THREE.Color(player.color) });
    const mesh = new THREE.Mesh(playerGeom, mat);
    mesh.position.set(player.x, PLAYER_HEIGHT / 2, player.y);
    mesh.castShadow = true;
    scene.add(mesh);
    playerMeshes.set(sessionId, mesh);

    if (sessionId === mySessionId) {
      predicted.x = player.x;
      predicted.y = player.y;
    }

    let prevHp = player.hp;
    player.onChange(() => {
      const r = players.get(sessionId);
      if (!r) return;
      r.serverX = player.x;
      r.serverY = player.y;
      if (sessionId === mySessionId) {
        predicted.x = player.x;
        predicted.y = player.y;
      }
      if (player.hp < prevHp) {
        console.log("[player damage]", sessionId.slice(0,4), prevHp, "→", player.hp);
        sfx.damage(player.x, player.y);
      }
      prevHp = player.hp;
      r.hp = player.hp;
    });
  });
  room.state.players.onRemove((_p: any, sessionId: string) => {
    const mesh = playerMeshes.get(sessionId);
    if (mesh) {
      scene.remove(mesh);
      (mesh.material as THREE.Material).dispose();
    }
    playerMeshes.delete(sessionId);
    players.delete(sessionId);
  });

  room.state.enemies.onAdd((enemy: any, id: string) => {
    enemies.set(id, { x: enemy.x, y: enemy.y, serverX: enemy.x, serverY: enemy.y, hp: enemy.hp });
    const mesh = new THREE.Mesh(enemyGeom, enemyMat);
    mesh.position.set(enemy.x, ENEMY_HEIGHT / 2, enemy.y);
    mesh.castShadow = true;
    scene.add(mesh);
    enemyMeshes.set(id, mesh);
    if (performance.now() >= suppressSpawnUntil) sfx.spawn(enemy.x, enemy.y);
    enemy.onChange(() => {
      const r = enemies.get(id);
      if (!r) return;
      r.serverX = enemy.x;
      r.serverY = enemy.y;
      r.hp = enemy.hp;
    });
  });
  room.state.enemies.onRemove((_e: any, id: string) => {
    console.log("[enemy-]", id);
    const mesh = enemyMeshes.get(id);
    if (mesh) {
      sfx.kill(mesh.position.x, mesh.position.z);
      scene.remove(mesh);
    }
    enemyMeshes.delete(id);
    enemies.delete(id);
  });

  room.state.projectiles.onAdd((bolt: any, id: string) => {
    console.log("[bolt+]", id, "spawn=", bolt.x.toFixed(0), bolt.y.toFixed(0), "v=", bolt.vx.toFixed(0), bolt.vy.toFixed(0));
    bolts.set(id, { x: bolt.x, y: bolt.y, serverX: bolt.x, serverY: bolt.y });
    const mesh = new THREE.Mesh(boltGeom, boltMat);
    mesh.position.set(bolt.x, BOLT_Y, bolt.y);
    scene.add(mesh);
    boltMeshes.set(id, mesh);
    sfx.cast(bolt.x, bolt.y);
    let changes = 0;
    bolt.onChange(() => {
      changes++;
      if (changes <= 3 || changes % 5 === 0) console.log("[bolt~]", id, "#", changes, "pos=", bolt.x.toFixed(0), bolt.y.toFixed(0));
      const r = bolts.get(id);
      if (!r) return;
      r.serverX = bolt.x;
      r.serverY = bolt.y;
    });
  });
  room.state.projectiles.onRemove((_b: any, id: string) => {
    console.log("[bolt-]", id);
    const mesh = boltMeshes.get(id);
    if (mesh) {
      sfx.hit(mesh.position.x, mesh.position.z);
      scene.remove(mesh);
    }
    boltMeshes.delete(id);
    bolts.delete(id);
  });

  setInterval(() => room.send("input", input), 1000 / 30);
  sendCast = (dx, dy) => room.send("cast", { dx, dy });

  room.onLeave(() => { hud.textContent = "disconnected"; });
  return room;
}

// ─── game loop ──────────────────────────────────────────────────────────────

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
      predicted.x = clamp(predicted.x + (dx / len) * SPEED * dt, PLAYER_RADIUS, WORLD_W - PLAYER_RADIUS);
      predicted.y = clamp(predicted.y + (dy / len) * SPEED * dt, PLAYER_RADIUS, WORLD_H - PLAYER_RADIUS);
    }
  }

  const lerp = 1 - Math.exp(-15 * dt);
  players.forEach((r, id) => {
    if (id === mySessionId) return;
    r.x += (r.serverX - r.x) * lerp;
    r.y += (r.serverY - r.y) * lerp;
  });
  enemies.forEach((r) => {
    r.x += (r.serverX - r.x) * lerp;
    r.y += (r.serverY - r.y) * lerp;
  });
  const boltLerp = 1 - Math.exp(-30 * dt);
  bolts.forEach((r) => {
    r.x += (r.serverX - r.x) * boltLerp;
    r.y += (r.serverY - r.y) * boltLerp;
  });

  playerMeshes.forEach((mesh, id) => {
    const isMe = id === mySessionId;
    const r = players.get(id);
    if (!r) return;
    mesh.position.x = isMe ? predicted.x : r.x;
    mesh.position.z = isMe ? predicted.y : r.y;
  });
  enemyMeshes.forEach((mesh, id) => {
    const r = enemies.get(id);
    if (!r) return;
    mesh.position.x = r.x;
    mesh.position.z = r.y;
  });
  boltMeshes.forEach((mesh, id) => {
    const r = bolts.get(id);
    if (!r) return;
    mesh.position.x = r.x;
    mesh.position.z = r.y;
  });

  if (mySessionId) {
    const me = players.get(mySessionId);
    if (me) {
      setListener(predicted.x, predicted.y);
      const pct = Math.max(0, me.hp) / PLAYER_MAX_HP;
      hpFill.style.width = `${pct * 100}%`;
      hpText.textContent = `HP ${Math.max(0, me.hp)} / ${PLAYER_MAX_HP}`;
    }
  }

  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

(window as any).__game = { players, enemies, bolts, playerMeshes, enemyMeshes, boltMeshes, predicted };

connect()
  .then(() => requestAnimationFrame(frame))
  .catch((err) => {
    console.error(err);
    hud.textContent = `connection failed: ${err.message} — is the server running on :2567?`;
  });
