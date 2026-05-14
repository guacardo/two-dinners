import { Room, Client } from "@colyseus/core";
import { Schema, MapSchema, type } from "@colyseus/schema";

class Player extends Schema {
  @type("number") x: number = 400;
  @type("number") y: number = 300;
  @type("number") hp: number = 50;
  @type("string") color: string = "#fff";
}

class Projectile extends Schema {
  @type("number") x: number = 0;
  @type("number") y: number = 0;
  @type("number") vx: number = 0;
  @type("number") vy: number = 0;
  @type("string") ownerId: string = "";
}

class Enemy extends Schema {
  @type("number") x: number = 0;
  @type("number") y: number = 0;
  @type("number") hp: number = 10;
}

class GameState extends Schema {
  @type({ map: Player }) players = new MapSchema<Player>();
  @type({ map: Projectile }) projectiles = new MapSchema<Projectile>();
  @type({ map: Enemy }) enemies = new MapSchema<Enemy>();
}

interface Input {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
}

interface CastMessage {
  dx: number;
  dy: number;
}

const SPEED = 220;
const TICK_RATE = 20;
const WORLD_W = 800;
const WORLD_H = 600;
const PLAYER_RADIUS = 16;

const BOLT_SPEED = 600;
const BOLT_RADIUS = 5;
const BOLT_DAMAGE = 5;
const CAST_COOLDOWN = 0.4;

const ENEMY_SPEED = 90;
const ENEMY_RADIUS = 14;
const ENEMY_MAX_HP = 10;
const ENEMY_DAMAGE = 5;
const TARGET_ENEMY_COUNT = 5;

const PLAYER_MAX_HP = 50;

export class GameRoom extends Room<GameState> {
  maxClients = 8;
  private inputs = new Map<string, Input>();
  private castCooldowns = new Map<string, number>();
  private nextEntityId = 1;

  onCreate() {
    this.setState(new GameState());

    this.onMessage("input", (client, input: Input) => {
      this.inputs.set(client.sessionId, input);
    });

    this.onMessage("cast", (client, msg: CastMessage) => {
      this.handleCast(client.sessionId, msg);
    });

    for (let i = 0; i < TARGET_ENEMY_COUNT; i++) this.spawnEnemy();

    this.setSimulationInterval((dtMs) => this.tick(dtMs / 1000), 1000 / TICK_RATE);
  }

  onJoin(client: Client) {
    const player = new Player();
    player.x = 80 + Math.random() * (WORLD_W - 160);
    player.y = 80 + Math.random() * (WORLD_H - 160);
    player.hp = PLAYER_MAX_HP;
    player.color = `hsl(${Math.floor(Math.random() * 360)}, 70%, 60%)`;
    this.state.players.set(client.sessionId, player);
    this.inputs.set(client.sessionId, { up: false, down: false, left: false, right: false });
    this.castCooldowns.set(client.sessionId, 0);
    console.log(`+ ${client.sessionId} joined (${this.clients.length} total)`);
  }

  onLeave(client: Client) {
    this.state.players.delete(client.sessionId);
    this.inputs.delete(client.sessionId);
    this.castCooldowns.delete(client.sessionId);
    console.log(`- ${client.sessionId} left`);
  }

  private handleCast(sessionId: string, msg: CastMessage) {
    const player = this.state.players.get(sessionId);
    if (!player) return;
    if ((this.castCooldowns.get(sessionId) ?? 0) > 0) return;
    const len = Math.hypot(msg.dx, msg.dy);
    if (!isFinite(len) || len < 1e-4) return;

    const nx = msg.dx / len;
    const ny = msg.dy / len;
    const bolt = new Projectile();
    bolt.x = player.x + nx * (PLAYER_RADIUS + BOLT_RADIUS + 2);
    bolt.y = player.y + ny * (PLAYER_RADIUS + BOLT_RADIUS + 2);
    bolt.vx = nx * BOLT_SPEED;
    bolt.vy = ny * BOLT_SPEED;
    bolt.ownerId = sessionId;
    this.state.projectiles.set(this.allocId("p"), bolt);
    this.castCooldowns.set(sessionId, CAST_COOLDOWN);
  }

  private tick(dt: number) {
    this.state.players.forEach((player, id) => {
      const input = this.inputs.get(id);
      if (!input) return;
      let dx = 0, dy = 0;
      if (input.up) dy -= 1;
      if (input.down) dy += 1;
      if (input.left) dx -= 1;
      if (input.right) dx += 1;
      if (dx !== 0 || dy !== 0) {
        const len = Math.hypot(dx, dy);
        player.x = clamp(player.x + (dx / len) * SPEED * dt, PLAYER_RADIUS, WORLD_W - PLAYER_RADIUS);
        player.y = clamp(player.y + (dy / len) * SPEED * dt, PLAYER_RADIUS, WORLD_H - PLAYER_RADIUS);
      }
    });

    this.castCooldowns.forEach((cd, id) => {
      if (cd > 0) this.castCooldowns.set(id, Math.max(0, cd - dt));
    });

    const projectileIdsToRemove: string[] = [];
    this.state.projectiles.forEach((bolt, id) => {
      bolt.x += bolt.vx * dt;
      bolt.y += bolt.vy * dt;
      if (bolt.x < -BOLT_RADIUS || bolt.x > WORLD_W + BOLT_RADIUS ||
          bolt.y < -BOLT_RADIUS || bolt.y > WORLD_H + BOLT_RADIUS) {
        projectileIdsToRemove.push(id);
        return;
      }
      let hit: string | null = null;
      this.state.enemies.forEach((enemy, eid) => {
        if (hit) return;
        const dx = enemy.x - bolt.x;
        const dy = enemy.y - bolt.y;
        const r = ENEMY_RADIUS + BOLT_RADIUS;
        if (dx * dx + dy * dy <= r * r) hit = eid;
      });
      if (hit) {
        const enemy = this.state.enemies.get(hit)!;
        enemy.hp -= BOLT_DAMAGE;
        projectileIdsToRemove.push(id);
        if (enemy.hp <= 0) this.state.enemies.delete(hit);
      }
    });
    for (const id of projectileIdsToRemove) this.state.projectiles.delete(id);

    const enemyIdsToRemove: string[] = [];
    this.state.enemies.forEach((enemy, eid) => {
      const target = this.nearestPlayer(enemy.x, enemy.y);
      if (target) {
        const dx = target.x - enemy.x;
        const dy = target.y - enemy.y;
        const len = Math.hypot(dx, dy);
        if (len > 1e-4) {
          enemy.x = clamp(enemy.x + (dx / len) * ENEMY_SPEED * dt, ENEMY_RADIUS, WORLD_W - ENEMY_RADIUS);
          enemy.y = clamp(enemy.y + (dy / len) * ENEMY_SPEED * dt, ENEMY_RADIUS, WORLD_H - ENEMY_RADIUS);
        }
        const touchR = PLAYER_RADIUS + ENEMY_RADIUS;
        const tdx = target.x - enemy.x;
        const tdy = target.y - enemy.y;
        if (tdx * tdx + tdy * tdy <= touchR * touchR) {
          target.hp = Math.max(0, target.hp - ENEMY_DAMAGE);
          enemyIdsToRemove.push(eid);
        }
      }
    });
    for (const id of enemyIdsToRemove) this.state.enemies.delete(id);

    while (this.state.enemies.size < TARGET_ENEMY_COUNT) this.spawnEnemy();
  }

  private nearestPlayer(x: number, y: number): Player | null {
    let best: Player | null = null;
    let bestDist = Infinity;
    this.state.players.forEach((p) => {
      const dx = p.x - x;
      const dy = p.y - y;
      const d = dx * dx + dy * dy;
      if (d < bestDist) { bestDist = d; best = p; }
    });
    return best;
  }

  private spawnEnemy() {
    const enemy = new Enemy();
    enemy.x = ENEMY_RADIUS + Math.random() * (WORLD_W - 2 * ENEMY_RADIUS);
    enemy.y = ENEMY_RADIUS + Math.random() * (WORLD_H - 2 * ENEMY_RADIUS);
    enemy.hp = ENEMY_MAX_HP;
    this.state.enemies.set(this.allocId("e"), enemy);
  }

  private allocId(prefix: string) {
    return `${prefix}${this.nextEntityId++}`;
  }
}

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}
