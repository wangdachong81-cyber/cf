import { createServer } from "node:http";
import { createReadStream, existsSync, statSync } from "node:fs";
import { resolve, extname, sep } from "node:path";
import { randomInt } from "node:crypto";
import { WebSocket, WebSocketServer } from "ws";
import { Room, type Member } from "./game";
import { RULES } from "../shared/config";
const rooms = new Map<string, Room>();
const clients = new Map<
  WebSocket,
  { room?: Room; member?: Member; alive: boolean; lastPing: number }
>();
const root = resolve("dist");
const mime: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
};
const server = createServer((req, res) => {
  const pathname = new URL(req.url ?? "/", "http://localhost").pathname;
  if (pathname === "/api/rooms") {
    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify(
        [...rooms.values()].map((r) => ({
          code: r.code,
          players: r.players.length,
          spectators: r.members.size - r.players.length,
          phase: r.phase,
        })),
      ),
    );
    return;
  }
  if (pathname === "/api/health") {
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ ok: true, rooms: rooms.size }));
    return;
  }
  let file: string;
  try {
    file = resolve(root, "." + decodeURIComponent(pathname));
  } catch {
    res.writeHead(400).end();
    return;
  }
  if (file !== root && !file.startsWith(root + sep)) {
    res.writeHead(403).end();
    return;
  }
  if (!existsSync(root)) {
    res.writeHead(404).end("Run npm run build, or use Vite on port 5173.");
    return;
  }
  if (!existsSync(file) || !statSync(file).isFile()) {
    if (extname(file)) {
      res.writeHead(404).end();
      return;
    }
    file = resolve(root, "index.html");
  }
  res.setHeader(
    "Content-Type",
    mime[extname(file)] ?? "application/octet-stream",
  );
  createReadStream(file).pipe(res);
});
const wss = new WebSocketServer({ server, path: "/ws", maxPayload: 2048 });
function send(ws: WebSocket, message: unknown) {
  if (ws.readyState === WebSocket.OPEN && ws.bufferedAmount < 128 * 1024)
    ws.send(JSON.stringify(message));
}
wss.on("connection", (ws) => {
  if (clients.size >= 512) {
    ws.close(1013, "Server full");
    return;
  }
  const client = { alive: true, lastPing: 0 } as {
    room?: Room;
    member?: Member;
    alive: boolean;
    lastPing: number;
  };
  clients.set(ws, client);
  const joinTimeout = setTimeout(() => {
    if (!client.member) ws.close(1008, "Join timeout");
  }, 10000);
  ws.on("pong", () => (client.alive = true));
  ws.on("error", () => ws.close());
  ws.on("message", (data) => {
    let msg;
    try {
      msg = JSON.parse(data.toString());
    } catch {
      return;
    }
    if (!msg || typeof msg !== "object") return;
    const now = Date.now();
    if (msg.type === "ping") {
      if (now - client.lastPing > 800) {
        client.lastPing = now;
        send(ws, { type: "pong", time: msg.time });
      }
      return;
    }
    if (msg.type === "join") {
      if (client.member) return;
      if (msg.role !== "player" && msg.role !== "spectator") {
        send(ws, { type: "error", message: "请选择参战或观战" });
        return;
      }
      const name =
        typeof msg.name === "string"
          ? msg.name
              .replace(/[\x00-\x1f\x7f]/g, "")
              .trim()
              .slice(0, 12)
          : "";
      if (!name) {
        send(ws, { type: "error", message: "请填写昵称" });
        return;
      }
      let room: Room | undefined,
        created = false;
      if (msg.create === true) {
        if (rooms.size >= 64) {
          send(ws, { type: "error", message: "房间数量已达上限" });
          return;
        }
        let code;
        do {
          code = String(randomInt(100000, 1000000));
        } while (rooms.has(code));
        room = new Room(code);
        created = true;
      } else room = rooms.get(String(msg.room));
      if (!room) {
        send(ws, { type: "error", message: "房间不存在，请检查房间号" });
        return;
      }
      try {
        const member = room.add(name, msg.role, now);
        if (created) rooms.set(room.code, room);
        client.room = room;
        client.member = member;
        clearTimeout(joinTimeout);
        send(ws, {
          type: "welcome",
          id: member.id,
          room: room.code,
          role: member.role,
        });
        send(ws, room.snapshot(now));
      } catch (error) {
        send(ws, { type: "error", message: (error as Error).message });
      }
    }
    if (msg.type === "input" && client.room && client.member)
      client.room.input(client.member, msg.input, now);
  });
  ws.on("close", () => {
    clearTimeout(joinTimeout);
    client.room?.remove(client.member?.id ?? "");
    if (client.room && !client.room.members.size)
      rooms.delete(client.room.code);
    clients.delete(ws);
  });
});
const timer = setInterval(() => {
  const now = Date.now();
  for (const room of rooms.values()) room.tick(now);
  for (const [ws, c] of clients) if (c.room) send(ws, c.room.snapshot(now));
  for (const room of rooms.values()) room.shots = [];
}, 1000 / RULES.tickRate);
const heartbeat = setInterval(() => {
  for (const [ws, c] of clients) {
    if (!c.alive) {
      ws.terminate();
      continue;
    }
    c.alive = false;
    ws.ping();
  }
}, 15000);
let stopping = false;
function onServerError(error: NodeJS.ErrnoException) {
  if (stopping) return;
  const port = process.env.PORT ?? 3001;
  console.error(
    error.code === "EADDRINUSE"
      ? `[启动失败] 游戏服务端口 ${port} 已被占用。请停止旧服务，或使用 PORT=3002 指定其他端口。`
      : `[游戏服务错误] ${error.message}`,
  );
  process.exitCode = 1;
  stop();
}
// An attached WebSocketServer also forwards the HTTP server's listen errors.
server.on("error", onServerError);
wss.on("error", onServerError);
server.listen(Number(process.env.PORT ?? 3001), "0.0.0.0", () =>
  console.log(
    `Arena server: http://localhost:${(server.address() as { port: number }).port}`,
  ),
);
function stop() {
  if (stopping) return;
  stopping = true;
  clearInterval(timer);
  clearInterval(heartbeat);
  for (const ws of clients.keys()) ws.terminate();
  wss.close(() => {});
  server.close(() => {});
}
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
