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

// ============================================
// Invite System (REST-based, not WebSocket)
// ============================================

/**
 * Create an invite room and send notification to guest
 */
export async function createInvite(params: {
  hostCharacterId: string;
  hostEmail?: string;
  hostTelegramChatId?: string;
  guestEmail?: string;
}): Promise<{
  success: boolean;
  roomCode?: string;
  hostToken?: string;
  joinUrl?: string;
  error?: string;
}> {
  try {
    const response = await fetch(`${SERVER_URL}/api/invites/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    return await response.json();
  } catch (err) {
    return { success: false, error: 'Failed to connect to server' };
  }
}

/**
 * Join an invite room as guest
 */
export async function joinInvite(params: {
  roomCode: string;
  characterId: string;
  guestEmail?: string;
  guestTelegramChatId?: string;
}): Promise<{
  success: boolean;
  roomCode?: string;
  guestToken?: string;
  hostCharacter?: string;
  error?: string;
}> {
  try {
    const response = await fetch(`${SERVER_URL}/api/invites/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    return await response.json();
  } catch (err) {
    return { success: false, error: 'Failed to connect to server' };
  }
}

/**
 * Reclaim a room using a token (host or guest returning via notification link)
 */
export async function reclaimRoom(params: {
  roomCode: string;
  token: string;
}): Promise<{
  success: boolean;
  role?: string;
  roomCode?: string;
  hostCharacter?: string;
  guestCharacter?: string;
  opponentConnected?: boolean;
  inviteStatus?: string;
  error?: string;
}> {
  try {
    const response = await fetch(`${SERVER_URL}/api/invites/reclaim`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    return await response.json();
  } catch (err) {
    return { success: false, error: 'Failed to connect to server' };
  }
}

/**
 * Generate a one-time Telegram connect token.
 * Returns a t.me URL for the user to click.
 */
export async function telegramConnect(): Promise<{
  success: boolean;
  token?: string;
  url?: string;
}> {
  try {
    const response = await fetch(`${SERVER_URL}/api/telegram/connect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    return await response.json();
  } catch (err) {
    return { success: false };
  }
}

/**
 * Check if Telegram connect token has been claimed (user tapped /start)
 */
export async function checkTelegramConnect(token: string): Promise<{
  found: boolean;
  connected?: boolean;
  chatId?: string;
}> {
  try {
    const response = await fetch(`${SERVER_URL}/api/telegram/connect/status/${token}`);
    return await response.json();
  } catch (err) {
    return { found: false };
  }
}

/**
 * Build the invite message text for any channel.
 * The URL is placed on its own line so messenger clients auto-link it.
 */
export function buildInviteText(joinUrl: string): string {
  return `You've been challenged to a Lost Worlds battle!\n\n${joinUrl}`;
}

/**
 * Build a WhatsApp click-to-send URL.
 * The challenger clicks this to send the invite message via WhatsApp.
 */
export function buildWhatsAppUrl(phoneNumber: string, joinUrl: string): string {
  const message = buildInviteText(joinUrl);
  // Strip non-digits from phone number for wa.me link
  const cleanNumber = phoneNumber.replace(/\D/g, '');
  return `https://wa.me/${cleanNumber}?text=${encodeURIComponent(message)}`;
}

/**
 * Join a room via socket with a token (for invite room reclaim after REST reclaim)
 */
export function joinRoomWithToken(roomCode: string, characterId: string, token: string): Promise<{
  success: boolean;
  roomCode?: string;
  isHost?: boolean;
  hostCharacter?: string;
  guestCharacter?: string;
  guestJoined?: boolean;
  hostJoined?: boolean;
  error?: string;
}> {
  const sock = connect();
  return new Promise((resolve) => {
    sock.emit('join-room', { roomCode, characterId, token }, resolve);
  });
}

// ============================================
// Notification Preferences (localStorage)
// ============================================

const PREFS_KEY = 'lostworlds_notification_prefs';

export interface NotificationPrefs {
  email?: string;
  telegramChatId?: string;
}

export function loadNotificationPrefs(): NotificationPrefs {
  try {
    const stored = localStorage.getItem(PREFS_KEY);
    return stored ? JSON.parse(stored) : {};
  } catch {
    return {};
  }
}

export function saveNotificationPrefs(prefs: NotificationPrefs): void {
  try {
    const existing = loadNotificationPrefs();
    localStorage.setItem(PREFS_KEY, JSON.stringify({ ...existing, ...prefs }));
  } catch {
    // localStorage not available
  }
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
