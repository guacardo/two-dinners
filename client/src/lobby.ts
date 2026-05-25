import { Client, Room } from "colyseus.js";
import { CHARACTERS, CHARACTER_ORDER, CharacterId } from "./characters";

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

const grid = document.getElementById("char-grid") as HTMLDivElement;
const roster = document.getElementById("roster") as HTMLDivElement;
const countEl = document.getElementById("lobby-count") as HTMLSpanElement;
const readyBtn = document.getElementById("ready-btn") as HTMLButtonElement;
const statusEl = document.getElementById("lobby-status") as HTMLDivElement;

interface CellRefs { button: HTMLButtonElement; takenLabel: HTMLSpanElement; }
const cells: Record<CharacterId, CellRefs> = {} as Record<CharacterId, CellRefs>;

for (const id of CHARACTER_ORDER) {
  const c = CHARACTERS[id];
  const btn = document.createElement("button");
  btn.className = "char-cell";
  btn.type = "button";
  btn.setAttribute("aria-pressed", "false");
  btn.dataset.characterId = id;

  const swatch = document.createElement("div");
  swatch.className = "char-swatch";
  swatch.style.background = c.color;
  btn.appendChild(swatch);

  const name = document.createElement("div");
  name.className = "char-name";
  name.textContent = c.name;
  btn.appendChild(name);

  const abilities = document.createElement("div");
  abilities.className = "char-abilities";
  abilities.textContent = c.abilities.join(", ");
  btn.appendChild(abilities);

  const taken = document.createElement("span");
  taken.className = "char-taken";
  taken.textContent = "";
  btn.appendChild(taken);

  grid.appendChild(btn);
  cells[id] = { button: btn, takenLabel: taken };
}

function setStatus(text: string) { statusEl.textContent = text; }

export async function runLobby(client: Client): Promise<SeatReservation> {
  setStatus("connecting…");
  const room: Room<LobbyStateSchema> = await client.joinOrCreate<LobbyStateSchema>("lobby");
  setStatus(`in lobby · session ${room.sessionId.slice(0, 6)}`);

  let myPick: CharacterId | null = null;
  let myReady = false;
  // Local state mirrors what we last saw on the server, used to render the
  // roster and decide which character cells are taken.
  const localPlayers = new Map<string, { characterId: string; ready: boolean }>();

  function render() {
    countEl.textContent = String(localPlayers.size);

    for (const id of CHARACTER_ORDER) {
      const refs = cells[id];
      const takenBy = takenSessionId(id);
      const isMine = takenBy === room.sessionId;
      const isTakenByOther = takenBy !== null && !isMine;
      refs.button.disabled = isTakenByOther || myReady;
      refs.button.setAttribute("aria-pressed", isMine ? "true" : "false");
      refs.takenLabel.textContent = isTakenByOther ? "TAKEN" : "";
    }

    roster.innerHTML = "";
    if (localPlayers.size === 0) {
      const empty = document.createElement("div");
      empty.className = "roster-row";
      const name = document.createElement("div");
      name.className = "roster-name empty";
      name.textContent = "no players yet";
      empty.appendChild(name);
      roster.appendChild(empty);
    } else {
      localPlayers.forEach((p, sid) => {
        const row = document.createElement("div");
        row.className = "roster-row";

        const swatch = document.createElement("div");
        swatch.className = "roster-swatch";
        const c = p.characterId && p.characterId in CHARACTERS
          ? CHARACTERS[p.characterId as CharacterId]
          : null;
        swatch.style.background = c?.color ?? "transparent";
        if (!c) swatch.style.borderStyle = "dashed";
        row.appendChild(swatch);

        const name = document.createElement("div");
        name.className = "roster-name" + (sid === room.sessionId ? " self" : "");
        const tag = sid === room.sessionId ? " (you)" : "";
        name.textContent = (c?.name ?? "picking…") + tag;
        row.appendChild(name);

        const ready = document.createElement("div");
        ready.className = "roster-ready" + (p.ready ? " is-ready" : "");
        ready.textContent = p.ready ? "READY" : "—";
        row.appendChild(ready);

        roster.appendChild(row);
      });
    }

    readyBtn.disabled = !myPick;
    readyBtn.classList.toggle("is-ready", myReady);
    readyBtn.textContent = myReady ? "unready" : "ready";
  }

  function takenSessionId(characterId: CharacterId): string | null {
    let owner: string | null = null;
    localPlayers.forEach((p, sid) => {
      if (p.characterId === characterId) owner = sid;
    });
    return owner;
  }

  function bindPlayer(player: LobbyPlayerSchema, sessionId: string) {
    localPlayers.set(sessionId, { characterId: player.characterId, ready: player.ready });
    player.onChange(() => {
      localPlayers.set(sessionId, { characterId: player.characterId, ready: player.ready });
      if (sessionId === room.sessionId) {
        myPick = (player.characterId && player.characterId in CHARACTERS)
          ? player.characterId as CharacterId
          : null;
        myReady = player.ready;
      }
      render();
    });
  }

  room.state.players.onAdd((player, sessionId) => {
    bindPlayer(player, sessionId);
    render();
  });
  room.state.players.onRemove((_p, sessionId) => {
    localPlayers.delete(sessionId);
    render();
  });

  for (const cell of Object.values(cells)) {
    cell.button.addEventListener("click", () => {
      const id = cell.button.dataset.characterId as CharacterId;
      if (myReady) return;
      room.send("pickCharacter", { characterId: id });
    });
  }

  readyBtn.addEventListener("click", () => {
    if (!myPick) return;
    room.send("setReady", { ready: !myReady });
  });

  render();

  return new Promise<SeatReservation>((resolve, reject) => {
    let gotReservation = false;
    room.onMessage("gameReady", (reservation: SeatReservation) => {
      gotReservation = true;
      setStatus("launching game…");
      // Resolve immediately so main.ts can start consuming the reservation;
      // the lobby socket closes in the background.
      resolve(reservation);
      void room.leave();
    });
    room.onLeave((code) => {
      if (!gotReservation) reject(new Error(`lobby closed (code ${code})`));
    });
    room.onError((code, message) => reject(new Error(`lobby error ${code}: ${message}`)));
  });
}

export function hideLobby() {
  document.getElementById("lobby-screen")?.classList.add("hidden");
}
