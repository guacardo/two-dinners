<script lang="ts">
  import { gameStore } from "../stores/game";

  $: pct = Math.max(0, $gameStore.hp) / $gameStore.maxHp;
</script>

<div class="hud">{$gameStore.connectionStatus}</div>

<div class="hp">
  <div class="hp-bar"><div class="hp-fill" style="width: {pct * 100}%"></div></div>
  <div class="hp-text">HP {Math.max(0, $gameStore.hp)} / {$gameStore.maxHp}</div>
</div>

<style>
  .hud {
    position: fixed;
    top: 12px;
    right: 16px;
    font-size: 12px;
    opacity: 0.55;
    pointer-events: none;
    z-index: 10;
  }
  .hp {
    position: fixed;
    left: 16px;
    bottom: 16px;
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 11px;
    pointer-events: none;
    z-index: 10;
  }
  .hp-bar { width: 200px; height: 10px; background: #000; }
  .hp-fill {
    height: 100%;
    background: #d0556a;
    width: 100%;
    transition: width 80ms linear;
  }
</style>
