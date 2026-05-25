import { Room, Client } from "@colyseus/core";
import { Schema, MapSchema, type } from "@colyseus/schema";
import { aabbOverlap } from "./collision";
import { CHARACTERS, isCharacterId, CharacterId, AbilityId } from "./characters";
import { ABILITIES, primaryAbility } from "./abilities";

class Player extends Schema {
  @type("number") x: number = 400;
  @type("number") y: number = 300;
  @type("number") hp: number = 50;
  @type("string") color: string = "#fff";
  @type("string") name: string = "";
  @type("string") characterId: string = "";

  static readonly HALF_W = 16;
  static readonly HALF_D = 16;
}

class Projectile extends Schema {
  @type("number") x: number = 0;
  @type("number") y: number = 0;
  @type("number") vx: number = 0;
  @type("number") vy: number = 0;
  @type("string") ownerId: string = "";
  @type("string") kind: string = "bolt";

  static readonly HALF_W = 5;
  static readonly HALF_D = 5;
}

class Enemy extends Schema {
  @type("number") x: number = 0;
  @type("number") y: number = 0;
  @type("number") hp: number = 10;

  static readonly HALF_W = 14;
  static readonly HALF_D = 14;
}

class Boss extends Schema {
  @type("number") x: number = 0;
  @type("number") y: number = 0;
  @type("boolean") doorOpen: boolean = false;

  static readonly HALF_W = 60;
  static readonly HALF_D = 50;
}

class GameState extends Schema {
  @type({ map: Player }) players = new MapSchema<Player>();
  @type({ map: Projectile }) projectiles = new MapSchema<Projectile>();
  @type({ map: Enemy }) enemies = new MapSchema<Enemy>();
  // Map keyed by boss kind ("oven", later "fridge", etc). A 0-or-1 collection
  // beats a singleton field — same add/remove idiom as players/enemies/bolts.
  @type({ map: Boss }) bosses = new MapSchema<Boss>();
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

const ENEMY_SPEED = 90;
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

    const oven = new Boss();
    oven.x = WORLD_W / 2;
    oven.y = WORLD_H * 0.3;
    this.state.bosses.set("oven", oven);

    this.onMessage("input", (client, input: Input) => {
      this.inputs.set(client.sessionId, input);
    });

    this.onMessage("cast", (client, msg: CastMessage) => {
      this.handleCast(client.sessionId, msg);
    });

    for (let i = 0; i < TARGET_ENEMY_COUNT; i++) this.spawnEnemy();

    this.setSimulationInterval((dtMs) => this.tick(dtMs / 1000), 1000 / TICK_RATE);
  }

  onJoin(client: Client, options: { characterId?: string } = {}) {
    const characterId = options.characterId && isCharacterId(options.characterId)
      ? options.characterId as CharacterId
      : null;
    const character = characterId ? CHARACTERS[characterId] : null;

    const player = new Player();
    player.x = 80 + Math.random() * (WORLD_W - 160);
    player.y = 80 + Math.random() * (WORLD_H - 160);
    player.hp = PLAYER_MAX_HP;
    player.color = character?.color ?? `hsl(${Math.floor(Math.random() * 360)}, 70%, 60%)`;
    player.name = character?.name ?? "";
    player.characterId = character?.id ?? "";
    this.state.players.set(client.sessionId, player);
    this.inputs.set(client.sessionId, { up: false, down: false, left: false, right: false });
    this.castCooldowns.set(client.sessionId, 0);
    console.log(`+ ${client.sessionId} joined as ${character?.name ?? "(no character)"} (${this.clients.length} total)`);
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

    const abilityId = primaryAbility(player.characterId);
    if (!abilityId) return;
    const def = ABILITIES[abilityId];

    const len = Math.hypot(msg.dx, msg.dy);
    if (!isFinite(len) || len < 1e-4) return;

    const nx = msg.dx / len;
    const ny = msg.dy / len;
    const bolt = new Projectile();
    bolt.kind = abilityId;
    bolt.x = player.x + nx * (Player.HALF_W + Projectile.HALF_W + 2);
    bolt.y = player.y + ny * (Player.HALF_D + Projectile.HALF_D + 2);
    bolt.vx = nx * def.projectileSpeed;
    bolt.vy = ny * def.projectileSpeed;
    bolt.ownerId = sessionId;
    this.state.projectiles.set(this.allocId("p"), bolt);
    this.castCooldowns.set(sessionId, def.cooldown);
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
        player.x = clamp(player.x + (dx / len) * SPEED * dt, Player.HALF_W, WORLD_W - Player.HALF_W);
        player.y = clamp(player.y + (dy / len) * SPEED * dt, Player.HALF_D, WORLD_H - Player.HALF_D);
      }
    });

    this.castCooldowns.forEach((cd, id) => {
      if (cd > 0) this.castCooldowns.set(id, Math.max(0, cd - dt));
    });

    const projectileIdsToRemove: string[] = [];
    this.state.projectiles.forEach((bolt, id) => {
      bolt.x += bolt.vx * dt;
      bolt.y += bolt.vy * dt;
      if (bolt.x < -Projectile.HALF_W || bolt.x > WORLD_W + Projectile.HALF_W ||
          bolt.y < -Projectile.HALF_D || bolt.y > WORLD_H + Projectile.HALF_D) {
        projectileIdsToRemove.push(id);
        return;
      }

      let hitEnemy: string | null = null;
      this.state.enemies.forEach((enemy, eid) => {
        if (hitEnemy) return;
        if (aabbOverlap(bolt, Projectile, enemy, Enemy)) hitEnemy = eid;
      });
      if (hitEnemy) {
        const enemy = this.state.enemies.get(hitEnemy)!;
        const def = ABILITIES[bolt.kind as AbilityId] ?? ABILITIES.bolt;
        enemy.hp -= def.damage;
        projectileIdsToRemove.push(id);
        if (enemy.hp <= 0) this.state.enemies.delete(hitEnemy);
        return;
      }

      let hitBossId: string | null = null;
      this.state.bosses.forEach((boss, bid) => {
        if (hitBossId) return;
        if (aabbOverlap(bolt, Projectile, boss, Boss)) hitBossId = bid;
      });
      if (hitBossId) {
        const boss = this.state.bosses.get(hitBossId)!;
        boss.doorOpen = !boss.doorOpen;
        projectileIdsToRemove.push(id);
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
          enemy.x = clamp(enemy.x + (dx / len) * ENEMY_SPEED * dt, Enemy.HALF_W, WORLD_W - Enemy.HALF_W);
          enemy.y = clamp(enemy.y + (dy / len) * ENEMY_SPEED * dt, Enemy.HALF_D, WORLD_H - Enemy.HALF_D);
        }
        if (aabbOverlap(enemy, Enemy, target, Player)) {
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
    enemy.x = Enemy.HALF_W + Math.random() * (WORLD_W - 2 * Enemy.HALF_W);
    enemy.y = Enemy.HALF_D + Math.random() * (WORLD_H - 2 * Enemy.HALF_D);
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
