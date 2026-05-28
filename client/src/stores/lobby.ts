import { writable } from "svelte/store";
import type { CharacterId } from "../characters";

export interface LobbyPlayer {
  characterId: string;
  ready: boolean;
}

export interface LobbyState {
  players: Map<string, LobbyPlayer>;
  mySessionId: string | null;
  myPick: CharacterId | null;
  myReady: boolean;
  status: string;
}

export const lobbyStore = writable<LobbyState>({
  players: new Map(),
  mySessionId: null,
  myPick: null,
  myReady: false,
  status: "connecting…",
});
