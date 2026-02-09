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
  createConnectToken,
  getConnectTokenStatus,
  handleTelegramUpdate,
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
 * Structured logging for debugging multiplayer issues.
 * Each log entry has a timestamp, event, and contextual data.
 */
function gameLog(event, data = {}) {
  const entry = {
    t: new Date().toISOString(),
    event,
    ...data,
  };
  console.log(`[GAME] ${JSON.stringify(entry)}`);
}

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

app.get('/debug/rooms', (req, res) => {
  const allRooms = [];
  for (const [id, room] of rooms) {
    allRooms.push({
      id,
      status: room.status,
      isInvite: room.isInviteRoom,
      inviteStatus: room.inviteStatus,
      host: room.host,
      guest: room.guest,
      hostChar: room.hostCharacter,
      guestChar: room.guestCharacter,
      hostMove: room.hostMove ? (room.hostMove.name || 'set') : null,
      guestMove: room.guestMove ? (room.guestMove.name || 'set') : null,
      hostInSocketRoom: room.host ? io.sockets.sockets.get(room.host)?.rooms?.has(id) : false,
      guestInSocketRoom: room.guest ? io.sockets.sockets.get(room.guest)?.rooms?.has(id) : false,
      age: Math.round((Date.now() - room.createdAt) / 1000) + 's',
    });
  }
  const playerList = [];
  for (const [socketId, roomCode] of playerRooms) {
    const alive = io.sockets.sockets.has(socketId);
    playerList.push({ socketId, roomCode, alive });
  }
  res.json({ rooms: allRooms, players: playerList, connectedSockets: io.sockets.sockets.size });
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

  const FRONTEND = process.env.FRONTEND_URL || 'https://lost-worlds-web.vercel.app';
  const joinUrl = `${FRONTEND}?room=${roomCode}&invite=true`;

  try {
    // Send invite to guest (email only — WhatsApp is click-to-send on client)
    const notifResults = await sendInvite(room);
    console.log(`Invite created: room=${roomCode}, notifications:`, notifResults);

    return res.json({
      success: true,
      roomCode,
      hostToken,
      joinUrl,  // Client uses this for WhatsApp click-to-send
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
// HTTP Endpoints - Telegram One-Time Connect
// ============================================

/**
 * Generate a one-time Telegram connect token + t.me URL.
 * User clicks the URL, taps /start in Telegram, and their chatId
 * is captured. Client polls /api/telegram/connect/status/:token
 * to retrieve it, then saves it to localStorage for reuse.
 */
app.post('/api/telegram/connect', (req, res) => {
  const link = createConnectToken();
  res.json({ success: true, ...link });
});

/**
 * Check if a Telegram connect token has been claimed
 */
app.get('/api/telegram/connect/status/:token', (req, res) => {
  const status = getConnectTokenStatus(req.params.token);
  res.json(status);
});

/**
 * Telegram webhook - receives /start commands from Telegram Bot API
 */
app.post('/api/telegram/webhook', (req, res) => {
  try {
    handleTelegramUpdate(req.body);
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
  gameLog('connect', { socketId: socket.id });

  /**
   * Rejoin a room after reconnection (client sends this when it detects reconnect)
   */
  socket.on('rejoin-room', ({ roomCode, token }, callback) => {
    const room = rooms.get(roomCode?.toUpperCase());
    if (!room) {
      gameLog('rejoin-fail', { socketId: socket.id, room: roomCode, reason: 'room-not-found' });
      callback({ success: false, error: 'Room not found' });
      return;
    }

    // Identify by token
    let role = null;
    if (room.hostToken && token === room.hostToken) {
      role = 'host';
      room.host = socket.id;
    } else if (room.guestToken && token === room.guestToken) {
      role = 'guest';
      room.guest = socket.id;
    }

    if (!role) {
      gameLog('rejoin-fail', { socketId: socket.id, room: roomCode, reason: 'invalid-token' });
      callback({ success: false, error: 'Invalid token' });
      return;
    }

    playerRooms.set(socket.id, roomCode.toUpperCase());
    socket.join(roomCode.toUpperCase());

    gameLog('rejoin-success', {
      socketId: socket.id, room: roomCode, role,
      hostConnected: !!room.host, guestConnected: !!room.guest,
    });

    callback({ success: true, role });

    // If both players are now connected after rejoin, (re-)emit battle-start
    if (room.host && room.guest) {
      room.status = 'battle';
      io.to(roomCode.toUpperCase()).emit('battle-start', {
        hostCharacter: room.hostCharacter,
        guestCharacter: room.guestCharacter,
      });
      gameLog('battle-start-after-rejoin', { room: roomCode });
    }
  });

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
        gameLog('invite-host-join', { socketId: socket.id, room: room.id, guestConnected: !!room.guest });

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
        gameLog('invite-guest-join', { socketId: socket.id, room: room.id, hostConnected: !!room.host });

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
      gameLog('submit-move-fail', { socketId: socket.id, reason: 'not-in-room' });
      callback({ success: false, error: 'Not in a room' });
      return;
    }

    const room = rooms.get(roomCode);
    if (!room) {
      gameLog('submit-move-fail', { socketId: socket.id, room: roomCode, reason: 'room-not-found' });
      callback({ success: false, error: 'Room not found' });
      return;
    }

    const isHost = room.host === socket.id;
    const role = isHost ? 'host' : 'guest';

    if (isHost) {
      room.hostMove = maneuver;
    } else {
      room.guestMove = maneuver;
    }

    gameLog('submit-move', {
      socketId: socket.id,
      room: roomCode,
      role,
      move: maneuver?.name || maneuver?.id || 'unknown',
      hostMove: !!room.hostMove,
      guestMove: !!room.guestMove,
      hostSocket: room.host,
      guestSocket: room.guest,
    });

    const opponentId = isHost ? room.guest : room.host;
    if (opponentId) {
      io.to(opponentId).emit('opponent-ready');
    }

    callback({ success: true });

    if (room.hostMove && room.guestMove) {
      gameLog('moves-revealed', {
        room: roomCode,
        hostMove: room.hostMove?.name || 'unknown',
        guestMove: room.guestMove?.name || 'unknown',
      });

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
    if (!roomCode) {
      gameLog('disconnect-no-room', { socketId: socket.id });
      return;
    }

    const room = rooms.get(roomCode);
    if (!room) {
      playerRooms.delete(socket.id);
      return;
    }

    // CRITICAL: Determine role by checking if this socket is ACTUALLY
    // the current host or guest. A stale socket (from a previous page load)
    // may still have a playerRooms entry but room.host/guest already points
    // to the new socket. We must NOT clobber the active player.
    const isCurrentHost = room.host === socket.id;
    const isCurrentGuest = room.guest === socket.id;
    const isStaleSocket = !isCurrentHost && !isCurrentGuest;

    gameLog('disconnect', {
      socketId: socket.id,
      room: roomCode,
      role: isCurrentHost ? 'host' : isCurrentGuest ? 'guest' : 'stale',
      isInvite: room.isInviteRoom,
      hostMove: !!room.hostMove,
      guestMove: !!room.guestMove,
    });

    // Always clean up the playerRooms entry for this socket
    playerRooms.delete(socket.id);

    // If this is a stale socket that's no longer the active host or guest,
    // just clean up and return — don't touch the room or notify anyone
    if (isStaleSocket) {
      gameLog('disconnect-stale', {
        socketId: socket.id,
        room: roomCode,
        currentHost: room.host,
        currentGuest: room.guest,
      });
      return;
    }

    const opponentId = isCurrentHost ? room.guest : room.host;

    // For invite rooms, don't delete the room when host/guest disconnects
    // They can reclaim it later with their token
    if (room.isInviteRoom) {
      if (isCurrentHost) {
        room.host = null;
      } else {
        room.guest = null;
      }

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

    if (isCurrentHost) {
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
// Periodic Cleanup: stale playerRooms entries
// ============================================
setInterval(() => {
  let cleaned = 0;
  for (const [socketId, roomCode] of playerRooms) {
    if (!io.sockets.sockets.has(socketId)) {
      playerRooms.delete(socketId);
      cleaned++;
    }
  }
  if (cleaned > 0) {
    console.log(`Cleaned ${cleaned} stale playerRooms entries`);
  }
}, 30 * 1000); // every 30 seconds

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
