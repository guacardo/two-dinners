import { Client } from "colyseus.js";
import App from "./ui/App.svelte";
import { runLobby } from "./connection/lobby";
import { startGame } from "./game";
import { lobbyStore } from "./stores/lobby";
import { screenStore } from "./stores/screen";

new App({ target: document.getElementById("app")! });

async function main() {
  const client = new Client(`ws://${location.hostname}:2567`);
  const reservation = await runLobby(client);
  screenStore.set("game");
  await startGame(client, reservation);
}

main().catch((err) => {
  console.error(err);
  lobbyStore.update((s) => ({
    ...s,
    status: `connection failed: ${err.message} — is the server running on :2567?`,
  }));
});
