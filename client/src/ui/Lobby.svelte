<script lang="ts">
  import { lobbyStore } from "../stores/lobby";
  import { CHARACTERS, CHARACTER_ORDER, type CharacterId } from "../characters";
  import { pickCharacter, toggleReady } from "../connection/lobby";

  $: lobby = $lobbyStore;

  function takenSessionId(id: CharacterId): string | null {
    let owner: string | null = null;
    lobby.players.forEach((p, sid) => {
      if (p.characterId === id) owner = sid;
    });
    return owner;
  }

  function rosterEntries(players: Map<string, { characterId: string; ready: boolean }>) {
    return Array.from(players.entries());
  }

  function characterOf(characterId: string) {
    return characterId && characterId in CHARACTERS
      ? CHARACTERS[characterId as CharacterId]
      : null;
  }
</script>

<div class="lobby-screen">
  <h1>choose your chumb</h1>

  <section class="section">
    <h2>character</h2>
    <div class="grid">
      {#each CHARACTER_ORDER as id (id)}
        {@const c = CHARACTERS[id]}
        {@const owner = takenSessionId(id)}
        {@const isMine = owner === lobby.mySessionId}
        {@const isTakenByOther = owner !== null && !isMine}
        {@const disabled = isTakenByOther || lobby.myReady}
        <button
          class="cell"
          class:selected={isMine}
          aria-pressed={isMine}
          {disabled}
          on:click={() => pickCharacter(id)}
        >
          <div class="swatch" style="background: {c.color}"></div>
          <div class="name">{c.name}</div>
          <div class="abilities">{c.abilities.join(", ")}</div>
          <span class="taken">{isTakenByOther ? "TAKEN" : ""}</span>
        </button>
      {/each}
    </div>
  </section>

  <section class="section">
    <h2>lobby ({lobby.players.size})</h2>
    <div class="roster">
      {#if lobby.players.size === 0}
        <div class="roster-row"><div class="roster-name empty">no players yet</div></div>
      {:else}
        {#each rosterEntries(lobby.players) as [sid, p] (sid)}
          {@const c = characterOf(p.characterId)}
          {@const isSelf = sid === lobby.mySessionId}
          <div class="roster-row">
            <div
              class="roster-swatch"
              style="background: {c?.color ?? 'transparent'};
                     border-style: {c ? 'solid' : 'dashed'}"
            ></div>
            <div class="roster-name" class:self={isSelf}>
              {(c?.name ?? "picking…") + (isSelf ? " (you)" : "")}
            </div>
            <div class="roster-ready" class:is-ready={p.ready}>{p.ready ? "READY" : "—"}</div>
          </div>
        {/each}
      {/if}
    </div>
  </section>

  <div class="controls">
    <button
      class="ready-btn"
      class:is-ready={lobby.myReady}
      disabled={!lobby.myPick}
      on:click={() => toggleReady()}
    >
      {lobby.myReady ? "unready" : "ready"}
    </button>
    <div class="status">{lobby.status}</div>
  </div>
</div>

<style>
  .lobby-screen {
    position: fixed;
    inset: 0;
    padding: 16px;
    overflow: auto;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 16px;
  }
  .lobby-screen > * {
    width: 100%;
    max-width: 720px;
  }

  h1 {
    font-size: 14px;
    font-weight: 500;
    margin: 0;
    opacity: 0.7;
  }

  .section {
    border: 1px solid #2a2d33;
    padding: 12px;
  }
  .section h2 {
    margin: 0 0 10px;
    font-size: 11px;
    font-weight: 500;
    opacity: 0.6;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 8px;
  }
  .cell {
    border: 1px solid #2a2d33;
    background: #16181d;
    color: inherit;
    font: inherit;
    padding: 10px 8px;
    cursor: pointer;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    text-align: center;
  }
  .cell:hover:not([disabled]) { border-color: #4a90e2; }
  .cell.selected { border-color: #4a90e2; background: #1a2231; }
  .cell[disabled] { opacity: 0.35; cursor: not-allowed; }
  .swatch {
    width: 36px;
    height: 36px;
    border: 1px solid #2a2d33;
  }
  .name { font-size: 12px; }
  .abilities { font-size: 10px; opacity: 0.5; }
  .taken { font-size: 9px; opacity: 0.5; letter-spacing: 0.05em; }

  .roster {
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: 12px;
  }
  .roster-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px 0;
  }
  .roster-swatch {
    width: 14px;
    height: 14px;
    border: 1px solid #2a2d33;
    flex-shrink: 0;
  }
  .roster-name { flex: 1; }
  .roster-name.self { color: #fff; }
  .roster-name.empty { opacity: 0.4; font-style: italic; }
  .roster-ready {
    font-size: 10px;
    opacity: 0.55;
    letter-spacing: 0.08em;
  }
  .roster-ready.is-ready { color: #3fb950; opacity: 1; }

  .controls {
    display: flex;
    gap: 8px;
    align-items: center;
  }
  .ready-btn {
    background: #16181d;
    color: #cfd2d8;
    border: 1px solid #2a2d33;
    padding: 10px 16px;
    font: inherit;
    font-size: 12px;
    cursor: pointer;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }
  .ready-btn:hover:not([disabled]) { border-color: #4a90e2; }
  .ready-btn[disabled] { opacity: 0.35; cursor: not-allowed; }
  .ready-btn.is-ready { border-color: #3fb950; color: #3fb950; }
  .status { font-size: 11px; opacity: 0.55; }
</style>
