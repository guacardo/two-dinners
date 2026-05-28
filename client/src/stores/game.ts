import { writable } from "svelte/store";

export interface GameUiState {
  hp: number;
  maxHp: number;
  sessionId: string | null;
  connectionStatus: string;
}

export const gameStore = writable<GameUiState>({
  hp: 50,
  maxHp: 50,
  sessionId: null,
  connectionStatus: "connecting…",
});
