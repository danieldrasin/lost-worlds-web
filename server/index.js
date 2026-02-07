/**
 * Lost Worlds Multiplayer Server
 *
 * WebSocket server for real-time multiplayer combat.
 * REST endpoints for async invite system.
 * Uses Socket.io for communication.
 */

import 'dotenv/config';
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { nanoid } from 'nanoid';
import crypto from 'crypto';
import {
  sendInvite,
  sendReadyNotification,
  createTelegramLinkToken,
  handleTelegramUpdate,
  getTelegramLinkStatus,
  registerTelegramWebhook,
} from './services/notifications.js';

const app = express();
const httpServer = createServer(app);

// Configure CORS for production and development
const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:3000',
  'http://127.0.0.1:5173',
  'https://lost-worlds-web.vercel.app',
  process.env.CLIENT_URL,
  process.env.FRONTEND_URL
].filter(Boolean);

const io = new Server(httpServer, {
  cors: {
    origin: allowedOrigins,
    methods: ['GET', 'POST']
  }
});

app.use(cors({ origin: allowedOrigins }));
app.use(express.json());

const FRONTEND_URL = process.env.FRONTEND_URL || 'https://lost-worlds-web.vercel.app';
const INVITE_ROOM_TTL = parseInt(process.env.INVITE_ROOM_TTL || '86400') * 1000; // 24h default

// ============================================
// Game Room Management
// ============================================

/**
 * @typedef {Object} Room
 * @property {string} id
 * @property {string|null} host - Socket ID of host (null if disconnected)
 * @property {string|null} guest - Socket ID of guest (null if disconnected)
 * @property {string} hostCharacter - Character ID
 * @property {string|null} guestCharacter - Character ID
 * @property {'waiting'|'selecting'|'battle'|'gameover'} status
 * @property {Object|null} battle - Battle state
 * @property {Object|null} hostMove - Selected move
 * @property {Object|null} guestMove - Selected move
 * @property {number} createdAt
 *
 * // Invite system fields
 * @property {boolean} isInviteRoom
 * @property {string|null} hostToken - Secret for host to reclaim room
 * @property {string|null} guestToken - Secret for guest to reclaim room
 * @property {string|null} hostEmail
 * @property {string|null} hostTelegramChatId
 * @property {string|null} guestEmail
 * @property {string|null} guestTelegramChatId
 * @property {'pending'|'guest-joined'|'host-returned'|'both-ready'} inviteStatus
 */

/** @type {Map<string, Room>} */
const rooms = new Map();

/** @type {Map<string, string>} Socket ID -> Room ID */
const playerRooms = new Map();

/**
 * Generate a short, readable room code
 */
function generateRoomCode() {
  return nanoid(6).toUpperCase();
}

/**
 * Generate a secure token for room reclamation
 */
function generateToken() {
  return crypto.randomBytes(24).toString('hex');
}

/**
 * Clean up old/empty rooms periodically
 */
function cleanupRooms() {
  const now = Date.now();

  for (const [roomId, room] of rooms) {
    const maxAge = room.isInviteRoom ? INVITE_ROOM_TTL : 30 * 60 * 1000;

    if (now - room.createdAt > maxAge && (room.status === 'waiting' || room.inviteStatus === 'pending')) {
      rooms.delete(roomId);
      console.log(`Cleaned up ${room.isInviteRoom ? 'invite' : 'regular'} room: ${roomId}`);
    }
  }
}

// Run cleanup every 5 minutes
setInterval(cleanupRooms, 5 * 60 * 1000);

// ============================================
// HTTP Endpoints - Health & Rooms
// ============================================

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    rooms: rooms.size,
    players: playerRooms.size,
    inviteRooms: [...rooms.values()].filter(r => r.isInviteRoom).length
  });
});

app.get('/rooms', (req, res) => {
  const waitingRooms = [];
  for (const [id, room] of rooms) {
    if (room.status === 'waiting' && !room.guest && !room.isInviteRoom) {
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
// HTTP Endpoints - Invite System
// ============================================

/**
 * Create an invite room and send notification to guest
 */
app.post('/api/invites/create', async (req, res) => {
  const {
    hostCharacterId,
    hostEmail,
    hostTelegramChatId,
    guestEmail,
    guestTelegramChatId,
  } = req.body;

  // Validation
  if (!hostCharacterId) {
    return res.status(400).json({ success: false, error: 'Character selection required' });
  }
  if (!guestEmail && !guestTelegramChatId) {
    return res.status(400).json({ success: false, error: "Opponent's email is required" });
  }

  const roomCode = generateRoomCode();
  const hostToken = generateToken();

  const room = {
    id: roomCode,
    host: null, // Host not connected via socket yet
    guest: null,
    hostCharacter: hostCharacterId,
    guestCharacter: null,
    status: 'waiting',
    battle: null,
    hostMove: null,
    guestMove: null,
    createdAt: Date.now(),

    // Invite fields
    isInviteRoom: true,
    hostToken,
    guestToken: null,
    hostEmail: hostEmail || null,
    hostTelegramChatId: hostTelegramChatId || null,
    guestEmail: guestEmail || null,
    guestTelegramChatId: guestTelegramChatId || null,
    inviteStatus: 'pending',
  };

  rooms.set(roomCode, room);

  try {
    // Send invite to guest
    const notifResults = await sendInvite(room);
    console.log(`Invite created: room=${roomCode}, notifications:`, notifResults);

    return res.json({
      success: true,
      roomCode,
      hostToken,
    });
  } catch (err) {
    console.error('Failed to send invite:', err);
    rooms.delete(roomCode);
    return res.status(500).json({
      success: false,
      error: 'Failed to send invite. Please try again.',
    });
  }
});

/**
 * Guest joins an invite room - provides their contact info and triggers host notification
 */
app.post('/api/invites/join', async (req, res) => {
  const {
    roomCode,
    characterId,
    guestEmail,
    guestTelegramChatId,
  } = req.body;

  const room = rooms.get(roomCode?.toUpperCase());
  if (!room) {
    return res.status(404).json({ success: false, error: 'Room not found. The invite may have expired.' });
  }
  if (!room.isInviteRoom) {
    return res.status(400).json({ success: false, error: 'Not an invite room. Use the regular join flow.' });
  }

  // Check TTL
  if (Date.now() - room.createdAt > INVITE_ROOM_TTL) {
    rooms.delete(roomCode.toUpperCase());
    return res.status(410).json({ success: false, error: 'This invite has expired.' });
  }

  // Generate guest token for reconnection
  const guestToken = generateToken();
  room.guestToken = guestToken;
  room.guestCharacter = characterId || null;
  room.inviteStatus = 'guest-joined';

  // Update guest contact info (for notifications when host returns)
  if (guestEmail) room.guestEmail = guestEmail;
  if (guestTelegramChatId) room.guestTelegramChatId = guestTelegramChatId;

  // Notify host that guest joined
  const hostPlayUrl = `${FRONTEND_URL}?room=${room.id}&token=${room.hostToken}&role=host`;
  try {
    const notifResults = await sendReadyNotification(
      { email: room.hostEmail, telegramChatId: room.hostTelegramChatId },
      hostPlayUrl,
      room.id
    );
    console.log(`Guest joined room=${room.id}, host notified:`, notifResults);
  } catch (err) {
    console.error('Failed to notify host:', err);
    // Don't fail the join - host notification is best-effort
  }

  // If host is currently connected via socket, notify them in real-time too
  if (room.host) {
    io.to(room.host).emit('guest-joined', { guestCharacter: room.guestCharacter });
  }

  return res.json({
    success: true,
    roomCode: room.id,
    guestToken,
    hostCharacter: room.hostCharacter,
  });
});

/**
 * Reclaim a room using a token (works for both host and guest returning)
 */
app.post('/api/invites/reclaim', async (req, res) => {
  const { roomCode, token } = req.body;

  const room = rooms.get(roomCode?.toUpperCase());
  if (!room) {
    return res.status(404).json({ success: false, error: 'Room not found. The invite may have expired.' });
  }

  // Check TTL
  if (Date.now() - room.createdAt > INVITE_ROOM_TTL) {
    rooms.delete(roomCode.toUpperCase());
    return res.status(410).json({ success: false, error: 'This room has expired.' });
  }

  // Determine role from token
  let role = null;
  if (token === room.hostToken) {
    role = 'host';
  } else if (token === room.guestToken) {
    role = 'guest';
  } else {
    return res.status(403).json({ success: false, error: 'Invalid token.' });
  }

  // Update invite status
  if (role === 'host') {
    if (room.inviteStatus === 'guest-joined') {
      room.inviteStatus = 'both-ready';
    } else {
      room.inviteStatus = 'host-returned';
    }
  } else {
    if (room.inviteStatus === 'host-returned') {
      room.inviteStatus = 'both-ready';
    }
  }

  // If the other player is NOT connected, notify them
  const otherConnected = role === 'host' ? !!room.guest : !!room.host;
  if (!otherConnected) {
    const otherContact = role === 'host'
      ? { email: room.guestEmail, telegramChatId: room.guestTelegramChatId }
      : { email: room.hostEmail, telegramChatId: room.hostTelegramChatId };

    const otherToken = role === 'host' ? room.guestToken : room.hostToken;
    const otherRole = role === 'host' ? 'guest' : 'host';

    if (otherToken && (otherContact.email || otherContact.telegramChatId)) {
      const playUrl = `${FRONTEND_URL}?room=${room.id}&token=${otherToken}&role=${otherRole}`;
      sendReadyNotification(otherContact, playUrl, room.id).catch(err => {
        console.error('Failed to notify other player:', err);
      });
    }
  }

  return res.json({
    success: true,
    role,
    roomCode: room.id,
    hostCharacter: room.hostCharacter,
    guestCharacter: room.guestCharacter,
    opponentConnected: otherConnected,
    inviteStatus: room.inviteStatus,
  });
});

/**
 * Check invite room status
 */
app.get('/api/invites/status/:roomCode', (req, res) => {
  const room = rooms.get(req.params.roomCode?.toUpperCase());
  if (!room || !room.isInviteRoom) {
    return res.status(404).json({ success: false, error: 'Room not found' });
  }

  return res.json({
    success: true,
    roomCode: room.id,
    inviteStatus: room.inviteStatus,
    hostConnected: !!room.host,
    guestConnected: !!room.guest,
    hostCharacter: room.hostCharacter,
    guestCharacter: room.guestCharacter,
  });
});

// ============================================
// HTTP Endpoints - Telegram Bot
// ============================================

/**
 * Generate a Telegram connection link
 */
app.post('/api/telegram/link', (req, res) => {
  const { roomCode, role } = req.body;
  const link = createTelegramLinkToken(roomCode || '', role || '');
  res.json({ success: true, ...link });
});

/**
 * Check if Telegram link has been claimed
 */
app.get('/api/telegram/status/:token', (req, res) => {
  const status = getTelegramLinkStatus(req.params.token);
  res.json(status);
});

/**
 * Telegram webhook - receives updates when users message the bot
 */
app.post('/api/telegram/webhook', (req, res) => {
  try {
    const result = handleTelegramUpdate(req.body);
    if (result) {
      // If this was a /start with a token, update the room's contact info
      const room = rooms.get(result.roomCode?.toUpperCase());
      if (room) {
        if (result.role === 'host') {
          room.hostTelegramChatId = result.chatId.toString();
        } else if (result.role === 'guest') {
          room.guestTelegramChatId = result.chatId.toString();
        }
      }
    }
  } catch (err) {
    console.error('Telegram webhook error:', err);
  }
  // Always respond 200 to Telegram
  res.sendStatus(200);
});

// ============================================
// WebSocket Events
// ============================================

io.on('connection', (socket) => {
  console.log(`Player connected: ${socket.id}`);

  /**
   * Create a new room (regular, non-invite)
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
      createdAt: Date.now(),
      isInviteRoom: false,
      hostToken: null,
      guestToken: null,
      hostEmail: null,
      hostTelegramChatId: null,
      guestEmail: null,
      guestTelegramChatId: null,
      inviteStatus: null,
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
   * Join an existing room (regular join OR invite room reclaim via socket)
   */
  socket.on('join-room', ({ roomCode, characterId, token }, callback) => {
    const room = rooms.get(roomCode.toUpperCase());

    if (!room) {
      callback({ success: false, error: 'Room not found' });
      return;
    }

    // Handle invite room token-based join (host or guest reclaiming)
    if (room.isInviteRoom && token) {
      if (token === room.hostToken) {
        // Host reclaiming
        room.host = socket.id;
        playerRooms.set(socket.id, roomCode.toUpperCase());
        socket.join(roomCode.toUpperCase());

        callback({
          success: true,
          roomCode: room.id,
          isHost: true,
          hostCharacter: room.hostCharacter,
          guestCharacter: room.guestCharacter,
          guestJoined: !!room.guest,
        });

        // If guest is connected, start the battle
        if (room.guest) {
          room.status = 'battle';
          io.to(room.id).emit('battle-start', {
            hostCharacter: room.hostCharacter,
            guestCharacter: room.guestCharacter,
          });
        }
        return;
      }

      if (token === room.guestToken) {
        // Guest reclaiming
        room.guest = socket.id;
        if (characterId) room.guestCharacter = characterId;
        playerRooms.set(socket.id, roomCode.toUpperCase());
        socket.join(roomCode.toUpperCase());

        callback({
          success: true,
          roomCode: room.id,
          isHost: false,
          hostCharacter: room.hostCharacter,
          guestCharacter: room.guestCharacter,
          hostJoined: !!room.host,
        });

        // If host is connected, start the battle
        if (room.host) {
          room.status = 'battle';
          io.to(room.id).emit('battle-start', {
            hostCharacter: room.hostCharacter,
            guestCharacter: room.guestCharacter,
          });
        }
        return;
      }
    }

    // Regular guest join
    if (room.guest) {
      callback({ success: false, error: 'Room is full' });
      return;
    }

    if (room.host === socket.id) {
      callback({ success: false, error: 'You cannot join your own room' });
      return;
    }

    room.guest = socket.id;
    room.guestCharacter = characterId;
    playerRooms.set(socket.id, roomCode.toUpperCase());
    socket.join(roomCode.toUpperCase());

    console.log(`Player ${socket.id} joined room ${roomCode}`);

    callback({
      success: true,
      roomCode: room.id,
      isHost: false,
      hostCharacter: room.hostCharacter
    });

    // Notify host
    if (room.host) {
      io.to(room.host).emit('guest-joined', {
        guestCharacter: characterId
      });
    }

    // Start battle (only if host is connected for non-invite rooms, or both connected for invite)
    if (room.host) {
      room.status = 'battle';
      io.to(room.id).emit('battle-start', {
        hostCharacter: room.hostCharacter,
        guestCharacter: room.guestCharacter
      });
    }
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

    if (isHost) {
      room.hostMove = maneuver;
    } else {
      room.guestMove = maneuver;
    }

    const opponentId = isHost ? room.guest : room.host;
    if (opponentId) {
      io.to(opponentId).emit('opponent-ready');
    }

    callback({ success: true });

    if (room.hostMove && room.guestMove) {
      io.to(room.id).emit('moves-revealed', {
        hostMove: room.hostMove,
        guestMove: room.guestMove
      });

      room.hostMove = null;
      room.guestMove = null;
    }
  });

  /**
   * Report exchange result
   */
  socket.on('exchange-result', ({ exchange, battleState }) => {
    const roomCode = playerRooms.get(socket.id);
    if (!roomCode) return;

    const room = rooms.get(roomCode);
    if (!room || room.host !== socket.id) return;

    room.battle = battleState;

    io.to(room.id).emit('exchange-resolved', { exchange, battleState });

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

    const isHost = room.host === socket.id;
    const opponentId = isHost ? room.guest : room.host;

    // For invite rooms, don't delete the room when host/guest disconnects
    // They can reclaim it later with their token
    if (room.isInviteRoom) {
      if (isHost) {
        room.host = null;
      } else {
        room.guest = null;
      }
      playerRooms.delete(socket.id);

      // Notify opponent if they're still connected
      if (opponentId) {
        io.to(opponentId).emit('opponent-disconnected');
      }
      return;
    }

    // Regular room disconnect behavior
    if (opponentId) {
      io.to(opponentId).emit('opponent-disconnected');
    }

    playerRooms.delete(socket.id);

    if (isHost) {
      if (room.guest) {
        room.host = room.guest;
        room.hostCharacter = room.guestCharacter;
        room.guest = null;
        room.guestCharacter = null;
        room.status = 'waiting';
      } else {
        rooms.delete(roomCode);
      }
    } else {
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
║  Invite system: ENABLED                                    ║
║  Email (Resend): ${process.env.RESEND_API_KEY ? 'CONFIGURED' : 'NOT SET'}                          ║
║  Telegram: ${process.env.TELEGRAM_BOT_TOKEN ? 'CONFIGURED' : 'NOT SET'}                               ║
╚════════════════════════════════════════════════════════════╝
  `);

  // Register Telegram webhook after server starts
  if (process.env.TELEGRAM_BOT_TOKEN) {
    const serverUrl = process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`;
    registerTelegramWebhook(`${serverUrl}/api/telegram/webhook`);
  }
});
