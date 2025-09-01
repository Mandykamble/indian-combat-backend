const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "https://indu-combat.vercel.app",
    methods: ["GET", "POST"],
  },
});

// Store game rooms and players
const rooms = {};

io.on("connection", (socket) => {
  console.log(`Player connected: ${socket.id}`);

  // Join a room
  socket.on("joinRoom", (roomId) => {
    if (!rooms[roomId]) {
      rooms[roomId] = { players: {}, gameState: { started: false } };
    }
    const room = rooms[roomId];

    // Limit to 2 players per room
    if (Object.keys(room.players).length >= 2) {
      socket.emit("roomFull");
      return;
    }

    // Add player to room
    room.players[socket.id] = {
      id: socket.id,
      position: { x: Object.keys(room.players).length === 0 ? -10 : 10, y: 2, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      health: 100,
      isAttacking: false,
      isBlocking: false,
      attackCooldown: 0,
      attackAnimationProgress: 0,
      blockAnimationProgress: 0,
      isPlayer1: Object.keys(room.players).length === 0,
    };
    socket.join(roomId);

    // Start game if 2 players
    if (Object.keys(room.players).length === 2) {
      room.gameState.started = true;
    }

    // Broadcast room state
    io.to(roomId).emit("updateRoom", room);
  });

  // Handle player movement
  socket.on("move", ({ roomId, position, rotation }) => {
    const room = rooms[roomId];
    if (room && room.players[socket.id]) {
      room.players[socket.id].position = position;
      room.players[socket.id].rotation = rotation;
      io.to(roomId).emit("updateRoom", room);
    }
  });

  // Handle attack
  socket.on("attack", ({ roomId }) => {
    const room = rooms[roomId];
    if (room && room.players[socket.id] && room.players[socket.id].attackCooldown <= 0) {
      room.players[socket.id].isAttacking = true;
      room.players[socket.id].attackCooldown = 20;
      room.players[socket.id].attackAnimationProgress = 0;
      io.to(roomId).emit("updateRoom", room);
    }
  });

  // Handle block
  socket.on("block", ({ roomId, isBlocking }) => {
    const room = rooms[roomId];
    if (room && room.players[socket.id]) {
      room.players[socket.id].isBlocking = isBlocking;
      room.players[socket.id].blockAnimationProgress = 0;
      io.to(roomId).emit("updateRoom", room);
    }
  });

  // Handle health update
  socket.on("updateHealth", ({ roomId, targetId, damage }) => {
    const room = rooms[roomId];
    if (room && room.players[targetId]) {
      room.players[targetId].health = Math.max(0, room.players[targetId].health - damage);
      if (room.players[targetId].health <= 0) {
        room.gameState.started = false;
        io.to(roomId).emit("gameOver", { winner: socket.id });
      }
      io.to(roomId).emit("updateRoom", room);
    }
  });

  // Handle disconnection
  socket.on("disconnect", () => {
    console.log(`Player disconnected: ${socket.id}`);
    for (const roomId in rooms) {
      if (rooms[roomId].players[socket.id]) {
        delete rooms[roomId].players[socket.id];
        rooms[roomId].gameState.started = false;
        io.to(roomId).emit("updateRoom", rooms[roomId]);
        if (Object.keys(rooms[roomId].players).length === 0) {
          delete rooms[roomId];
        }
      }
    }
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));