import { Client } from "colyseus.js";
import { hideLobby, runLobby } from "./lobby";
import { startGame } from "./game";

const stage = document.getElementById("stage")!;
const hud = document.getElementById("hud")!;
const lobbyStatus = document.getElementById("lobby-status")!;

async function main() {
  const client = new Client(`ws://${location.hostname}:2567`);
  const reservation = await runLobby(client);
  hideLobby();
  stage.classList.remove("hidden");
  hud.classList.remove("hidden");
  await startGame(client, reservation);
}

main().catch((err) => {
  console.error(err);
  lobbyStatus.textContent = `connection failed: ${err.message} — is the server running on :2567?`;
});
