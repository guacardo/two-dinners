import { Room, Client, matchMaker } from "@colyseus/core";
import { Schema, MapSchema, type } from "@colyseus/schema";
import { CHARACTERS, isCharacterId, CharacterId } from "./characters";

class LobbyPlayer extends Schema {
  @type("string") characterId: string = "";
  @type("boolean") ready: boolean = false;
}

class LobbyState extends Schema {
  @type({ map: LobbyPlayer }) players = new MapSchema<LobbyPlayer>();
  @type("boolean") launching: boolean = false;
}

interface PickCharacterMessage { characterId: string; }
interface SetReadyMessage { ready: boolean; }

export class LobbyRoom extends Room<LobbyState> {
  maxClients = 5;

  onCreate() {
    this.setState(new LobbyState());

    this.onMessage("pickCharacter", (client, msg: PickCharacterMessage) => {
      const player = this.state.players.get(client.sessionId);
      if (!player || this.state.launching) return;
      if (!isCharacterId(msg.characterId)) return;
      if (this.isCharacterTaken(msg.characterId, client.sessionId)) return;
      player.characterId = msg.characterId;
    });

    this.onMessage("setReady", (client, msg: SetReadyMessage) => {
      const player = this.state.players.get(client.sessionId);
      if (!player || this.state.launching) return;
      if (msg.ready && !player.characterId) return;
      player.ready = !!msg.ready;
      this.maybeLaunch();
    });
  }

  onJoin(client: Client) {
    this.state.players.set(client.sessionId, new LobbyPlayer());
    console.log(`[lobby] + ${client.sessionId} (${this.clients.length} total)`);
  }

  onLeave(client: Client) {
    this.state.players.delete(client.sessionId);
    console.log(`[lobby] - ${client.sessionId}`);
  }

  private isCharacterTaken(id: CharacterId, exceptSessionId: string): boolean {
    let taken = false;
    this.state.players.forEach((p, sid) => {
      if (sid !== exceptSessionId && p.characterId === id) taken = true;
    });
    return taken;
  }

  private maybeLaunch() {
    if (this.state.launching) return;
    if (this.state.players.size === 0) return;
    let allReady = true;
    this.state.players.forEach((p) => {
      if (!p.ready || !p.characterId) allReady = false;
    });
    if (!allReady) return;
    void this.launchGame();
  }

  private async launchGame() {
    this.state.launching = true;
    this.lock(); // no more lobby joins while we transition

    const picks: Array<{ sessionId: string; characterId: string }> = [];
    this.state.players.forEach((p, sid) => {
      picks.push({ sessionId: sid, characterId: p.characterId });
    });

    try {
      const room = await matchMaker.createRoom("game", {});
      for (const pick of picks) {
        const reservation = await matchMaker.reserveSeatFor(room, { characterId: pick.characterId });
        const client = this.clients.find((c) => c.sessionId === pick.sessionId);
        if (client) client.send("gameReady", reservation);
      }
      console.log(`[lobby] launched game ${room.roomId} for ${picks.length} player(s)`);
    } catch (err) {
      console.error("[lobby] failed to launch game:", err);
      this.state.launching = false;
      this.unlock();
    }
  }
}
