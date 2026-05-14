import { Client } from "colyseus.js";

const SPEED = 220;
const WORLD_W = 800;
const WORLD_H = 600;
const RADIUS = 16;

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

interface Rendered {
  x: number; y: number;           // displayed
  serverX: number; serverY: number; // last authoritative
  color: string;
}

const rendered = new Map<string, Rendered>();
let mySessionId: string | null = null;
const predicted = { x: 0, y: 0 };

async function connect() {
  const client = new Client(`ws://${location.hostname}:2567`);
  const room = await client.joinOrCreate<any>("game");
  mySessionId = room.sessionId;
  hud.textContent = `connected · session ${mySessionId.slice(0, 6)}`;

  room.state.players.onAdd((player: any, sessionId: string) => {
    rendered.set(sessionId, {
      x: player.x, y: player.y,
      serverX: player.x, serverY: player.y,
      color: player.color,
    });
    if (sessionId === mySessionId) {
      predicted.x = player.x;
      predicted.y = player.y;
    }
    player.onChange(() => {
      const r = rendered.get(sessionId);
      if (!r) return;
      r.serverX = player.x;
      r.serverY = player.y;
      // For our own player, snap predicted state to server.
      // Real reconciliation would replay unacked inputs from this snapshot forward;
      // for a low-speed ARPG over LAN, snap is fine and feels invisible.
      if (sessionId === mySessionId) {
        predicted.x = player.x;
        predicted.y = player.y;
      }
    });
  });

  room.state.players.onRemove((_p: any, sessionId: string) => {
    rendered.delete(sessionId);
  });

  // Send inputs at 30Hz. Server ticks at 20Hz; over-sampling is fine.
  setInterval(() => room.send("input", input), 1000 / 30);

  room.onLeave(() => { hud.textContent = "disconnected"; });
  return room;
}

let lastTime = performance.now();
function frame(now: number) {
  const dt = Math.min(0.1, (now - lastTime) / 1000);
  lastTime = now;

  // Client-side prediction for self.
  if (mySessionId) {
    let dx = 0, dy = 0;
    if (input.up) dy -= 1;
    if (input.down) dy += 1;
    if (input.left) dx -= 1;
    if (input.right) dx += 1;
    if (dx || dy) {
      const len = Math.hypot(dx, dy);
      predicted.x = clamp(predicted.x + (dx / len) * SPEED * dt, RADIUS, WORLD_W - RADIUS);
      predicted.y = clamp(predicted.y + (dy / len) * SPEED * dt, RADIUS, WORLD_H - RADIUS);
    }
  }

  // Smooth interpolation for other players toward their latest server position.
  const lerp = 1 - Math.exp(-15 * dt);
  rendered.forEach((r, id) => {
    if (id === mySessionId) return;
    r.x += (r.serverX - r.x) * lerp;
    r.y += (r.serverY - r.y) * lerp;
  });

  // Draw
  ctx.fillStyle = "#16181d";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Grid for parallax feel
  ctx.strokeStyle = "#1f2228";
  ctx.lineWidth = 1;
  for (let x = 0; x < WORLD_W; x += 40) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, WORLD_H); ctx.stroke();
  }
  for (let y = 0; y < WORLD_H; y += 40) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(WORLD_W, y); ctx.stroke();
  }

  rendered.forEach((r, id) => {
    const isMe = id === mySessionId;
    const x = isMe ? predicted.x : r.x;
    const y = isMe ? predicted.y : r.y;
    ctx.beginPath();
    ctx.arc(x, y, RADIUS, 0, Math.PI * 2);
    ctx.fillStyle = r.color;
    ctx.fill();
    if (isMe) {
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  });

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
