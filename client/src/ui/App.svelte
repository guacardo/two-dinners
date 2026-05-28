<script lang="ts">
  import { screenStore } from "../stores/screen";
  import Lobby from "./Lobby.svelte";
  import Hud from "./Hud.svelte";
</script>

{#if $screenStore === "lobby"}
  <Lobby />
{:else}
  <Hud />
{/if}
