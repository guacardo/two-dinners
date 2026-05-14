import { createServer } from "http";
import express from "express";
import { Server } from "@colyseus/core";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { GameRoom } from "./GameRoom";

const port = Number(process.env.PORT) || 2567;
const app = express();

app.get("/health", (_req, res) => res.json({ ok: true }));

const gameServer = new Server({
  transport: new WebSocketTransport({ server: createServer(app) }),
});

gameServer.define("game", GameRoom);
gameServer.listen(port);
console.log(`two-dinners server listening on ws://localhost:${port}`);
