import { Client, Room } from "colyseus.js";
import { CHARACTERS, type CharacterId } from "../characters";
import { lobbyStore } from "../stores/lobby";
import { get } from "svelte/store";

interface LobbyPlayerSchema {
  characterId: string;
  ready: boolean;
  onChange(cb: () => void): void;
}

interface LobbyStateSchema {
  players: {
    onAdd(cb: (player: LobbyPlayerSchema, sessionId: string) => void): void;
    onRemove(cb: (player: LobbyPlayerSchema, sessionId: string) => void): void;
    forEach(cb: (player: LobbyPlayerSchema, sessionId: string) => void): void;
    size: number;
  };
  launching: boolean;
  onChange(cb: () => void): void;
}

export interface SeatReservation {
  sessionId: string;
  room: { roomId: string; name: string; processId: string; publicAddress?: string };
  [k: string]: unknown;
}

let activeRoom: Room<LobbyStateSchema> | null = null;

function setStatus(text: string) {
  lobbyStore.update((s) => ({ ...s, status: text }));
}

function setPlayer(sid: string, p: LobbyPlayerSchema) {
  lobbyStore.update((s) => {
    const players = new Map(s.players);
    players.set(sid, { characterId: p.characterId, ready: p.ready });
    const next = { ...s, players };
    if (sid === s.mySessionId) {
      next.myPick = p.characterId && p.characterId in CHARACTERS
        ? (p.characterId as CharacterId)
        : null;
      next.myReady = p.ready;
    }
    return next;
  });
}

function deletePlayer(sid: string) {
  lobbyStore.update((s) => {
    const players = new Map(s.players);
    players.delete(sid);
    return { ...s, players };
  });
}

export function pickCharacter(id: CharacterId) {
  activeRoom?.send("pickCharacter", { characterId: id });
}

export function toggleReady() {
  const { myReady, myPick } = get(lobbyStore);
  if (!myPick) return;
  activeRoom?.send("setReady", { ready: !myReady });
}

export async function runLobby(client: Client): Promise<SeatReservation> {
  setStatus("connecting…");
  const room: Room<LobbyStateSchema> = await client.joinOrCreate<LobbyStateSchema>("lobby");
  activeRoom = room;

  lobbyStore.update((s) => ({
    ...s,
    mySessionId: room.sessionId,
    status: `in lobby · session ${room.sessionId.slice(0, 6)}`,
  }));

  room.state.players.onAdd((player, sessionId) => {
    setPlayer(sessionId, player);
    player.onChange(() => setPlayer(sessionId, player));
  });
  room.state.players.onRemove((_p, sessionId) => {
    deletePlayer(sessionId);
  });

  return new Promise<SeatReservation>((resolve, reject) => {
    let gotReservation = false;
    room.onMessage("gameReady", (reservation: SeatReservation) => {
      gotReservation = true;
      setStatus("launching game…");
      resolve(reservation);
      void room.leave();
      activeRoom = null;
    });
    room.onLeave((code) => {
      if (!gotReservation) reject(new Error(`lobby closed (code ${code})`));
    });
    room.onError((code, message) => reject(new Error(`lobby error ${code}: ${message}`)));
  });
}
