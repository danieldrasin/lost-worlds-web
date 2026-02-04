/**
 * Socket.io Client for Multiplayer
 */

import { io, Socket } from 'socket.io-client';

// Server URL - configurable via environment
const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001';

let socket: Socket | null = null;

/**
 * Connect to the multiplayer server
 */
export function connect(): Socket {
  if (socket?.connected) {
    return socket;
  }

  socket = io(SERVER_URL, {
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: 5,
    reconnectionDelay: 1000,
  });

  socket.on('connect', () => {
    console.log('Connected to multiplayer server');
  });

  socket.on('disconnect', () => {
    console.log('Disconnected from multiplayer server');
  });

  socket.on('connect_error', (error: Error) => {
    console.error('Connection error:', error);
  });

  return socket;
}

/**
 * Disconnect from the server
 */
export function disconnect(): void {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}

/**
 * Get the current socket instance
 */
export function getSocket(): Socket | null {
  return socket;
}

/**
 * Create a new room
 */
export function createRoom(characterId: string): Promise<{
  success: boolean;
  roomCode?: string;
  isHost?: boolean;
  error?: string;
}> {
  const sock = connect();
  return new Promise((resolve) => {
    sock.emit('create-room', { characterId }, resolve);
  });
}

/**
 * Join an existing room
 */
export function joinRoom(roomCode: string, characterId: string): Promise<{
  success: boolean;
  roomCode?: string;
  isHost?: boolean;
  hostCharacter?: string;
  error?: string;
}> {
  const sock = connect();
  return new Promise((resolve) => {
    sock.emit('join-room', { roomCode, characterId }, resolve);
  });
}

/**
 * Submit a move
 */
export function submitMove(maneuver: any): Promise<{ success: boolean; error?: string }> {
  const sock = getSocket();
  if (!sock) {
    return Promise.resolve({ success: false, error: 'Not connected' });
  }
  return new Promise((resolve) => {
    sock.emit('submit-move', { maneuver }, resolve);
  });
}

/**
 * Send exchange result (host only)
 */
export function sendExchangeResult(exchange: any, battleState: any): void {
  const sock = getSocket();
  if (sock) {
    sock.emit('exchange-result', { exchange, battleState });
  }
}

/**
 * Request a rematch
 */
export function requestRematch(): void {
  const sock = getSocket();
  if (sock) {
    sock.emit('request-rematch');
  }
}

/**
 * Accept a rematch
 */
export function acceptRematch(): void {
  const sock = getSocket();
  if (sock) {
    sock.emit('accept-rematch');
  }
}

/**
 * Leave the current room
 */
export function leaveRoom(): void {
  const sock = getSocket();
  if (sock) {
    sock.emit('leave-room');
  }
}

// Event listener helpers
export function onGuestJoined(callback: (data: { guestCharacter: string }) => void): void {
  getSocket()?.on('guest-joined', callback);
}

export function onBattleStart(callback: (data: { hostCharacter: string; guestCharacter: string }) => void): void {
  getSocket()?.on('battle-start', callback);
}

export function onOpponentReady(callback: () => void): void {
  getSocket()?.on('opponent-ready', callback);
}

export function onMovesRevealed(callback: (data: { hostMove: any; guestMove: any }) => void): void {
  getSocket()?.on('moves-revealed', callback);
}

export function onExchangeResolved(callback: (data: { exchange: any; battleState: any }) => void): void {
  getSocket()?.on('exchange-resolved', callback);
}

export function onGameOver(callback: (data: { winner: string; battle: any }) => void): void {
  getSocket()?.on('game-over', callback);
}

export function onRematchRequested(callback: () => void): void {
  getSocket()?.on('rematch-requested', callback);
}

export function onRematchStart(callback: (data: { hostCharacter: string; guestCharacter: string }) => void): void {
  getSocket()?.on('rematch-start', callback);
}

export function onOpponentDisconnected(callback: () => void): void {
  getSocket()?.on('opponent-disconnected', callback);
}

// Remove listeners
export function removeAllListeners(): void {
  const sock = getSocket();
  if (sock) {
    sock.off('guest-joined');
    sock.off('battle-start');
    sock.off('opponent-ready');
    sock.off('moves-revealed');
    sock.off('exchange-resolved');
    sock.off('game-over');
    sock.off('rematch-requested');
    sock.off('rematch-start');
    sock.off('opponent-disconnected');
  }
}
