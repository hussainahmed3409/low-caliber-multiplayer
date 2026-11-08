
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();

app.get("/", (req, res) => {
  res.send("Low-Caliber multiplayer server is running!");
});

const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: true }
});

const MAX_PLAYERS = 16;
const MAX_ROOMS = 10;
const players = new Map();
const rooms = new Map();

io.on("connection", socket => {
  players.set(socket.id, { n: "Player" });

  socket.on("presence:update", data => {
    players.set(socket.id, {
      ...players.get(socket.id),
      ...data
    });
  });

  socket.on("room:join", async (data, ack) => {
    const room = String(data?.room || "");
    if (!/^lobby-(?:[1-9]|10)$/.test(room)) {
      return ack?.({ ok: false, error: "invalid_room" });
    }

    const members = io.sockets.adapter.rooms.get(room);
    if (members && members.size >= MAX_PLAYERS) {
      return ack?.({ ok: false, error: "room_full" });
    }

    await socket.join(room);
    rooms.set(socket.id, room);

    const peers = [...(io.sockets.adapter.rooms.get(room) || [])]
      .map(id => ({
        peer: id,
        sameTab: false,
        presence: players.get(id) || {}
      }));

    ack?.({ ok: true, peers });
    io.to(room).emit("room:state", { room, peers });
  });

  socket.on("room:presence", (data, ack) => {
    players.set(socket.id, {
      ...players.get(socket.id),
      ...data
    });

    const room = rooms.get(socket.id);
    if (room) {
      const peers = [...(io.sockets.adapter.rooms.get(room) || [])]
        .map(id => ({
          peer: id,
          sameTab: false,
          presence: players.get(id) || {}
        }));

      io.to(room).emit("room:state", { room, peers });
    }

    ack?.({ ok: true });
  });

  socket.on("room:leave", async (_data, ack) => {
    const room = rooms.get(socket.id);
    if (room) {
      await socket.leave(room);
      rooms.delete(socket.id);
    }
    ack?.({ ok: true });
  });

  socket.on("disconnect", () => {
    const room = rooms.get(socket.id);
    rooms.delete(socket.id);
    players.delete(socket.id);

    if (room) {
      const peers = [...(io.sockets.adapter.rooms.get(room) || [])]
        .map(id => ({
          peer: id,
          sameTab: false,
          presence: players.get(id) || {}
        }));

      io.to(room).emit("room:state", { room, peers });
    }
  });
});

const port = process.env.PORT || 3000;
server.listen(port, "0.0.0.0", () => {
  console.log("Low-Caliber server running on port " + port);
});
