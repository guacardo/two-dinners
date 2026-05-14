import { Room, Client } from "@colyseus/core";
import { Schema, MapSchema, type } from "@colyseus/schema";

class Player extends Schema {
  @type("number") x: number = 400;
  @type("number") y: number = 300;
  @type("string") color: string = "#fff";
}

class GameState extends Schema {
  @type({ map: Player }) players = new MapSchema<Player>();
}

interface Input {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
}

const SPEED = 220;
const TICK_RATE = 20;
const WORLD_W = 800;
const WORLD_H = 600;
const RADIUS = 16;

export class GameRoom extends Room<GameState> {
  maxClients = 8;
  private inputs = new Map<string, Input>();

  onCreate() {
    this.setState(new GameState());

    this.onMessage("input", (client, input: Input) => {
      this.inputs.set(client.sessionId, input);
    });

    this.setSimulationInterval((dtMs) => this.tick(dtMs / 1000), 1000 / TICK_RATE);
  }

  onJoin(client: Client) {
    const player = new Player();
    player.x = 80 + Math.random() * (WORLD_W - 160);
    player.y = 80 + Math.random() * (WORLD_H - 160);
    player.color = `hsl(${Math.floor(Math.random() * 360)}, 70%, 60%)`;
    this.state.players.set(client.sessionId, player);
    this.inputs.set(client.sessionId, { up: false, down: false, left: false, right: false });
    console.log(`+ ${client.sessionId} joined (${this.clients.length} total)`);
  }

  onLeave(client: Client) {
    this.state.players.delete(client.sessionId);
    this.inputs.delete(client.sessionId);
    console.log(`- ${client.sessionId} left`);
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
      if (dx === 0 && dy === 0) return;
      const len = Math.hypot(dx, dy);
      player.x = clamp(player.x + (dx / len) * SPEED * dt, RADIUS, WORLD_W - RADIUS);
      player.y = clamp(player.y + (dy / len) * SPEED * dt, RADIUS, WORLD_H - RADIUS);
    });
  }
}

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}
