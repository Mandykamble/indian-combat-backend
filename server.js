const express = require('express');
const { Server } = require('socket.io');
const http = require('http');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: [
      'https://indu-combat.vercel.app',
      'http://localhost:3000'
    ],
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type'],
    credentials: true
  },
  transports: ['websocket', 'polling'], // Explicitly allow both transports
  allowEIO3: true // Support for older Socket.IO clients if needed
});

// Serve a simple endpoint for Vercel health checks
app.get('/', (req, res) => {
  res.send('Indian Combat Backend');
});

const rooms = {};

io.on('connection', (socket) => {
  console.log(`Player connected: ${socket.id}`);

  socket.on('joinRoom', (roomId) => {
    if (!roomId || typeof roomId !== 'string') {
      socket.emit('roomFull', 'Invalid room ID');
      return;
    }

    if (!rooms[roomId]) {
      rooms[roomId] = {
        players: {},
        gameState: { started: false }
      };
    }

    const room = rooms[roomId];
    const playerCount = Object.keys(room.players).length;

    if (playerCount >= 2) {
      socket.emit('roomFull', 'Room is full. Try another room.');
      return;
    }

    const isPlayer1 = playerCount === 0;
    room.players[socket.id] = {
      health: 100,
      position: isPlayer1
        ? { x: -10, y: 2, z: 0 }
        : { x: 10, y: 2, z: 0 },
      rotation: { x: 0, y: isPlayer1 ? Math.PI / 2 : -Math.PI / 2, z: 0 },
      isAttacking: false,
      isBlocking: false,
      attackCooldown: 0,
      attackAnimationProgress: 0,
      blockAnimationProgress: 0,
      isPlayer1
    };

    socket.join(roomId);
    console.log(`Player ${socket.id} joined room ${roomId}`);

    if (playerCount === 1) {
      room.gameState.started = true;
    }

    io.to(roomId).emit('updateRoom', room);
  });

  socket.on('move', ({ roomId, position, rotation }) => {
    if (rooms[roomId] && rooms[roomId].players[socket.id]) {
      rooms[roomId].players[socket.id].position = position;
      rooms[roomId].players[socket.id].rotation = rotation;
      io.to(roomId).emit('updateRoom', rooms[roomId]);
    }
  });

  socket.on('attack', ({ roomId }) => {
    if (rooms[roomId] && rooms[roomId].players[socket.id]) {
      const player = rooms[roomId].players[socket.id];
      if (player.attackCooldown <= 0) {
        player.isAttacking = true;
        player.attackAnimationProgress = 0;
        player.attackCooldown = 30;
        io.to(roomId).emit('updateRoom', rooms[roomId]);
      }
    }
  });

  socket.on('block', ({ roomId, isBlocking }) => {
    if (rooms[roomId] && rooms[roomId].players[socket.id]) {
      rooms[roomId].players[socket.id].isBlocking = isBlocking;
      rooms[roomId].players[socket.id].blockAnimationProgress = isBlocking ? 0 : rooms[roomId].players[socket.id].blockAnimationProgress;
      io.to(roomId).emit('updateRoom', rooms[roomId]);
    }
  });

  socket.on('updateHealth', ({ roomId, targetId, damage }) => {
    if (rooms[roomId] && rooms[roomId].players[targetId]) {
      const target = rooms[roomId].players[targetId];
      if (!target.isBlocking) {
        target.health = Math.max(0, target.health - damage);
        if (target.health <= 0) {
          io.to(roomId).emit('gameOver', { winner: socket.id });
          delete rooms[roomId];
        } else {
          io.to(roomId).emit('updateRoom', rooms[roomId]);
        }
      }
    }
  });

  socket.on('disconnect', () => {
    console.log(`Player disconnected: ${socket.id}`);
    for (const roomId in rooms) {
      if (rooms[roomId].players[socket.id]) {
        delete rooms[roomId].players[socket.id];
        if (Object.keys(rooms[roomId].players).length === 0) {
          delete rooms[roomId];
        } else {
          io.to(roomId).emit('updateRoom', rooms[roomId]);
        }
      }
    }
  });

  // Periodically update attack cooldowns
  setInterval(() => {
    for (const roomId in rooms) {
      for (const playerId in rooms[roomId].players) {
        const player = rooms[roomId].players[playerId];
        if (player.attackCooldown > 0) {
          player.attackCooldown -= 1;
        }
        if (player.isAttacking) {
          player.attackAnimationProgress += 0.1;
          if (player.attackAnimationProgress >= 1) {
            player.isAttacking = false;
          }
        }
        if (player.isBlocking) {
          player.blockAnimationProgress += 0.05;
        }
      }
      io.to(roomId).emit('updateRoom', rooms[roomId]);
    }
  }, 1000 / 60);
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

module.exports = app; // Export for Vercel