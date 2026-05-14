import { Client } from "colyseus.js";

const SPEED = 220;
const WORLD_W = 800;
const WORLD_H = 600;
const PLAYER_RADIUS = 16;
const BOLT_RADIUS = 5;
const ENEMY_RADIUS = 14;
const ENEMY_MAX_HP = 10;
const PLAYER_MAX_HP = 50;

const canvas = document.getElementById("game") as HTMLCanvasElement;
const ctx = canvas.getContext("2d")!;
const hud = document.getElementById("hud")!;

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

const mouse = { x: WORLD_W / 2, y: WORLD_H / 2 };
canvas.addEventListener("mousemove", (e) => {
  const rect = canvas.getBoundingClientRect();
  mouse.x = ((e.clientX - rect.left) / rect.width) * WORLD_W;
  mouse.y = ((e.clientY - rect.top) / rect.height) * WORLD_H;
});

interface RenderedPlayer {
  x: number; y: number;
  serverX: number; serverY: number;
  hp: number;
  color: string;
}
interface RenderedEnemy { x: number; y: number; serverX: number; serverY: number; hp: number; }
interface RenderedBolt  { x: number; y: number; serverX: number; serverY: number; }

const players = new Map<string, RenderedPlayer>();
const enemies = new Map<string, RenderedEnemy>();
const bolts   = new Map<string, RenderedBolt>();

let mySessionId: string | null = null;
const predicted = { x: 0, y: 0 };
let sendCast: ((dx: number, dy: number) => void) | null = null;

async function connect() {
  const client = new Client(`ws://${location.hostname}:2567`);
  const room = await client.joinOrCreate<any>("game");
  mySessionId = room.sessionId;
  hud.textContent = `connected · session ${mySessionId.slice(0, 6)}`;

  room.state.players.onAdd((player: any, sessionId: string) => {
    players.set(sessionId, {
      x: player.x, y: player.y,
      serverX: player.x, serverY: player.y,
      hp: player.hp,
      color: player.color,
    });
    if (sessionId === mySessionId) {
      predicted.x = player.x;
      predicted.y = player.y;
    }
    player.onChange(() => {
      const r = players.get(sessionId);
      if (!r) return;
      r.serverX = player.x;
      r.serverY = player.y;
      r.hp = player.hp;
      if (sessionId === mySessionId) {
        predicted.x = player.x;
        predicted.y = player.y;
      }
    });
  });
  room.state.players.onRemove((_p: any, sessionId: string) => { players.delete(sessionId); });

  room.state.enemies.onAdd((enemy: any, id: string) => {
    enemies.set(id, { x: enemy.x, y: enemy.y, serverX: enemy.x, serverY: enemy.y, hp: enemy.hp });
    enemy.onChange(() => {
      const r = enemies.get(id);
      if (!r) return;
      r.serverX = enemy.x;
      r.serverY = enemy.y;
      r.hp = enemy.hp;
    });
  });
  room.state.enemies.onRemove((_e: any, id: string) => { enemies.delete(id); });

  room.state.projectiles.onAdd((bolt: any, id: string) => {
    bolts.set(id, { x: bolt.x, y: bolt.y, serverX: bolt.x, serverY: bolt.y });
    bolt.onChange(() => {
      const r = bolts.get(id);
      if (!r) return;
      r.serverX = bolt.x;
      r.serverY = bolt.y;
    });
  });
  room.state.projectiles.onRemove((_b: any, id: string) => { bolts.delete(id); });

  setInterval(() => room.send("input", input), 1000 / 30);
  sendCast = (dx, dy) => room.send("cast", { dx, dy });

  room.onLeave(() => { hud.textContent = "disconnected"; });
  return room;
}

canvas.addEventListener("mousedown", (e) => {
  if (e.button !== 0 || !sendCast || !mySessionId) return;
  const me = players.get(mySessionId);
  if (!me) return;
  const fromX = predicted.x;
  const fromY = predicted.y;
  const dx = mouse.x - fromX;
  const dy = mouse.y - fromY;
  if (Math.hypot(dx, dy) < 1e-4) return;
  sendCast(dx, dy);
});

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

  ctx.fillStyle = "#16181d";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.strokeStyle = "#1f2228";
  ctx.lineWidth = 1;
  for (let x = 0; x < WORLD_W; x += 40) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, WORLD_H); ctx.stroke();
  }
  for (let y = 0; y < WORLD_H; y += 40) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(WORLD_W, y); ctx.stroke();
  }

  enemies.forEach((r) => {
    ctx.beginPath();
    ctx.arc(r.x, r.y, ENEMY_RADIUS, 0, Math.PI * 2);
    ctx.fillStyle = "#c64a3a";
    ctx.fill();
    const w = ENEMY_RADIUS * 2;
    const pct = Math.max(0, r.hp) / ENEMY_MAX_HP;
    ctx.fillStyle = "#000";
    ctx.fillRect(r.x - ENEMY_RADIUS, r.y - ENEMY_RADIUS - 6, w, 3);
    ctx.fillStyle = "#6ed36e";
    ctx.fillRect(r.x - ENEMY_RADIUS, r.y - ENEMY_RADIUS - 6, w * pct, 3);
  });

  bolts.forEach((r) => {
    ctx.beginPath();
    ctx.arc(r.x, r.y, BOLT_RADIUS, 0, Math.PI * 2);
    ctx.fillStyle = "#f0e36a";
    ctx.fill();
  });

  players.forEach((r, id) => {
    const isMe = id === mySessionId;
    const x = isMe ? predicted.x : r.x;
    const y = isMe ? predicted.y : r.y;
    ctx.beginPath();
    ctx.arc(x, y, PLAYER_RADIUS, 0, Math.PI * 2);
    ctx.fillStyle = r.color;
    ctx.fill();
    if (isMe) {
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  });

  if (mySessionId) {
    const me = players.get(mySessionId);
    if (me) {
      const ax = 12, ay = WORLD_H - 22;
      const w = 200, h = 10;
      ctx.fillStyle = "#000";
      ctx.fillRect(ax, ay, w, h);
      ctx.fillStyle = "#d0556a";
      ctx.fillRect(ax, ay, w * (Math.max(0, me.hp) / PLAYER_MAX_HP), h);
      ctx.fillStyle = "#cfd2d8";
      ctx.font = "11px ui-monospace, Menlo, monospace";
      ctx.fillText(`HP ${Math.max(0, me.hp)} / ${PLAYER_MAX_HP}`, ax + w + 8, ay + 9);
    }
  }

  requestAnimationFrame(frame);
}

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

connect()
  .then(() => requestAnimationFrame(frame))
  .catch((err) => {
    console.error(err);
    hud.textContent = `connection failed: ${err.message} — is the server running on :2567?`;
  });
