import { writable } from "svelte/store";

export type Screen = "lobby" | "game";

export const screenStore = writable<Screen>("lobby");
