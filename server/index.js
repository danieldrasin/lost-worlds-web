/**
 * Lost Worlds Multiplayer Server
 *
 * WebSocket server for real-time multiplayer combat.
 * Uses Socket.io for communication.
 */

import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { nanoid } from 'nanoid';

const app = express();
const httpServer = createServer(app);

// Configure CORS for production and development
const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:3000',
  'http://127.0.0.1:5173',
  'https://lost-worlds-web.vercel.app',
  process.env.CLIENT_URL
].filter(Boolean);

const io = new Server(httpServer, {
  cors: {
    origin: allowedOrigins,
    methods: ['GET', 'POST']
  }
});

app.use(cors({ origin: allowedOrigins }));
app.use(express.json());

// ============================================
// Game Room Management
// ============================================

/**
 * @typedef {Object} Room
 * @property {string} id
 * @property {string} host - Socket ID of host
 * @property {string|null} guest - Socket ID of guest
 * @property {string} hostCharacter - Character ID
 * @property {string|null} guestCharacter - Character ID
 * @property {'waiting'|'selecting'|'battle'|'gameover'} status
 * @property {Object|null} battle - Battle state
 * @property {Object|null} hostMove - Selected move
 * @property {Object|null} guestMove - Selected move
 * @property {number} createdAt
 */

/** @type {Map<string, Room>} */
const rooms = new Map();

/** @type {Map<string, string>} Socket ID -> Room ID */
const playerRooms = new Map();

/**
 * Generate a short, readable room code
 */
function generateRoomCode() {
  // Generate 6-character alphanumeric code (easy to type on phone)
  return nanoid(6).toUpperCase();
}

/**
 * Clean up old/empty rooms periodically
 */
function cleanupRooms() {
  const now = Date.now();
  const maxAge = 30 * 60 * 1000; // 30 minutes

  for (const [roomId, room] of rooms) {
    if (now - room.createdAt > maxAge && room.status === 'waiting') {
      rooms.delete(roomId);
      console.log(`Cleaned up stale room: ${roomId}`);
    }
  }
}

// Run cleanup every 5 minutes
setInterval(cleanupRooms, 5 * 60 * 1000);

// ============================================
// HTTP Endpoints
// ============================================

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    rooms: rooms.size,
    players: playerRooms.size
  });
});

app.get('/rooms', (req, res) => {
  // List public waiting rooms
  const waitingRooms = [];
  for (const [id, room] of rooms) {
    if (room.status === 'waiting' && !room.guest) {
      waitingRooms.push({
        id,
        hostCharacter: room.hostCharacter,
        createdAt: room.createdAt
      });
    }
  }
  res.json(waitingRooms);
});

// ============================================
// WebSocket Events
// ============================================

io.on('connection', (socket) => {
  console.log(`Player connected: ${socket.id}`);

  /**
   * Create a new room
   */
  socket.on('create-room', ({ characterId }, callback) => {
    const roomCode = generateRoomCode();

    const room = {
      id: roomCode,
      host: socket.id,
      guest: null,
      hostCharacter: characterId,
      guestCharacter: null,
      status: 'waiting',
      battle: null,
      hostMove: null,
      guestMove: null,
      createdAt: Date.now()
    };

    rooms.set(roomCode, room);
    playerRooms.set(socket.id, roomCode);
    socket.join(roomCode);

    console.log(`Room created: ${roomCode} by ${socket.id}`);

    callback({
      success: true,
      roomCode,
      isHost: true
    });
  });

  /**
   * Join an existing room
   */
  socket.on('join-room', ({ roomCode, characterId }, callback) => {
    const room = rooms.get(roomCode.toUpperCase());

    if (!room) {
      callback({ success: false, error: 'Room not found' });
      return;
    }

    if (room.guest) {
      callback({ success: false, error: 'Room is full' });
      return;
    }

    if (room.host === socket.id) {
      callback({ success: false, error: 'You cannot join your own room' });
      return;
    }

    // Join the room
    room.guest = socket.id;
    room.guestCharacter = characterId;
    room.status = 'battle';
    playerRooms.set(socket.id, roomCode.toUpperCase());
    socket.join(roomCode.toUpperCase());

    console.log(`Player ${socket.id} joined room ${roomCode}`);

    // Notify both players
    callback({
      success: true,
      roomCode: room.id,
      isHost: false,
      hostCharacter: room.hostCharacter
    });

    // Notify host that guest joined
    io.to(room.host).emit('guest-joined', {
      guestCharacter: characterId
    });

    // Start the battle
    io.to(room.id).emit('battle-start', {
      hostCharacter: room.hostCharacter,
      guestCharacter: room.guestCharacter
    });
  });

  /**
   * Submit a move
   */
  socket.on('submit-move', ({ maneuver }, callback) => {
    const roomCode = playerRooms.get(socket.id);
    if (!roomCode) {
      callback({ success: false, error: 'Not in a room' });
      return;
    }

    const room = rooms.get(roomCode);
    if (!room) {
      callback({ success: false, error: 'Room not found' });
      return;
    }

    const isHost = room.host === socket.id;

    // Store the move
    if (isHost) {
      room.hostMove = maneuver;
    } else {
      room.guestMove = maneuver;
    }

    // Notify opponent that move is ready (but not what it is)
    const opponentId = isHost ? room.guest : room.host;
    if (opponentId) {
      io.to(opponentId).emit('opponent-ready');
    }

    callback({ success: true });

    // Check if both players have submitted
    if (room.hostMove && room.guestMove) {
      // Reveal moves to both players
      io.to(room.id).emit('moves-revealed', {
        hostMove: room.hostMove,
        guestMove: room.guestMove
      });

      // Clear moves for next round
      room.hostMove = null;
      room.guestMove = null;
    }
  });

  /**
   * Report exchange result (host calculates, sends to server for sync)
   */
  socket.on('exchange-result', ({ exchange, battleState }) => {
    const roomCode = playerRooms.get(socket.id);
    if (!roomCode) return;

    const room = rooms.get(roomCode);
    if (!room || room.host !== socket.id) return; // Only host can submit results

    room.battle = battleState;

    // Broadcast to both players
    io.to(room.id).emit('exchange-resolved', { exchange, battleState });

    // Check for game over
    if (battleState.status === 'GAME_OVER') {
      room.status = 'gameover';
      io.to(room.id).emit('game-over', {
        winner: battleState.winner,
        battle: battleState
      });
    }
  });

  /**
   * Request rematch
   */
  socket.on('request-rematch', () => {
    const roomCode = playerRooms.get(socket.id);
    if (!roomCode) return;

    const room = rooms.get(roomCode);
    if (!room) return;

    const opponentId = room.host === socket.id ? room.guest : room.host;
    if (opponentId) {
      io.to(opponentId).emit('rematch-requested');
    }
  });

  /**
   * Accept rematch
   */
  socket.on('accept-rematch', () => {
    const roomCode = playerRooms.get(socket.id);
    if (!roomCode) return;

    const room = rooms.get(roomCode);
    if (!room) return;

    // Reset room state
    room.status = 'battle';
    room.battle = null;
    room.hostMove = null;
    room.guestMove = null;

    io.to(room.id).emit('rematch-start', {
      hostCharacter: room.hostCharacter,
      guestCharacter: room.guestCharacter
    });
  });

  /**
   * Leave room
   */
  socket.on('leave-room', () => {
    handleDisconnect(socket);
  });

  /**
   * Handle disconnection
   */
  socket.on('disconnect', () => {
    handleDisconnect(socket);
  });

  function handleDisconnect(socket) {
    const roomCode = playerRooms.get(socket.id);
    if (!roomCode) return;

    const room = rooms.get(roomCode);
    if (!room) return;

    console.log(`Player ${socket.id} disconnected from room ${roomCode}`);

    // Notify opponent
    const opponentId = room.host === socket.id ? room.guest : room.host;
    if (opponentId) {
      io.to(opponentId).emit('opponent-disconnected');
    }

    // Clean up
    playerRooms.delete(socket.id);

    if (room.host === socket.id) {
      // Host left - if there's a guest, they become host
      if (room.guest) {
        room.host = room.guest;
        room.hostCharacter = room.guestCharacter;
        room.guest = null;
        room.guestCharacter = null;
        room.status = 'waiting';
      } else {
        // No one left, delete room
        rooms.delete(roomCode);
      }
    } else {
      // Guest left
      room.guest = null;
      room.guestCharacter = null;
      room.status = 'waiting';
    }
  }
});

// ============================================
// Start Server
// ============================================

const PORT = process.env.PORT || 3001;

httpServer.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════════════════════════╗
║        LOST WORLDS MULTIPLAYER SERVER                      ║
╠════════════════════════════════════════════════════════════╣
║  Server running on port ${PORT}                              ║
║  Health check: http://localhost:${PORT}/health               ║
╚════════════════════════════════════════════════════════════╝
  `);
});
