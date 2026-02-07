/**
 * Invite View Component
 *
 * Allows a host to create an invite and send it to an opponent via email.
 * Supports email and Telegram notifications for both host and guest.
 * Also handles the guest join flow (when arriving via invite link)
 * and the reclaim flow (when returning via notification link).
 */

import React, { useState, useEffect, useCallback } from 'react';
import * as socket from '../../multiplayer/socket';

interface InviteViewProps {
  availableCharacters: { id: string; name: string }[];
  /** Pre-selected character from MenuView */
  selectedCharacter: string;
  onCharacterChange: (charId: string) => void;
  /** Called when both players are connected and battle should start */
  onBattleStart: (isHost: boolean, opponentCharacter: string) => void;
  onBack: () => void;
  /** If set, we're joining an existing invite */
  inviteRoomCode?: string;
  /** If set, we're returning via a notification link */
  reclaimToken?: string;
  reclaimRole?: 'host' | 'guest';
}

type InviteStep = 'form' | 'sending' | 'sent' | 'guest-join' | 'guest-joining' | 'waiting' | 'error';
type NotifyMethod = 'email' | 'telegram' | 'both';

// ============================================
// Telegram Link Component
// ============================================

const TelegramLink: React.FC<{
  roomCode: string;
  role: 'host' | 'guest';
  onConnected: (chatId: string) => void;
}> = ({ roomCode, role, onConnected }) => {
  const [linkUrl, setLinkUrl] = useState<string | null>(null);
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'connected' | 'error'>('loading');

  // Get the Telegram link
  useEffect(() => {
    const getLink = async () => {
      const result = await socket.getTelegramLink(roomCode || 'setup', role);
      if (result.success) {
        setLinkUrl(result.url!);
        setLinkToken(result.token!);
        setStatus('ready');
      } else {
        setStatus('error');
      }
    };
    getLink();
  }, [roomCode, role]);

  // Poll for connection status
  useEffect(() => {
    if (!linkToken || status === 'connected') return;

    const interval = setInterval(async () => {
      const result = await socket.checkTelegramLink(linkToken);
      if (result.connected && result.chatId) {
        setStatus('connected');
        onConnected(result.chatId);
        clearInterval(interval);
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [linkToken, status, onConnected]);

  if (status === 'loading') {
    return <p className="text-gray-500 text-sm">Loading Telegram link...</p>;
  }

  if (status === 'error') {
    return <p className="text-red-400 text-sm">Failed to generate Telegram link. Try email instead.</p>;
  }

  if (status === 'connected') {
    return (
      <div className="flex items-center gap-2 text-green-400 text-sm">
        <span>&#10003;</span> Telegram connected!
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <a
        href={linkUrl!}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-block px-4 py-2 bg-blue-500 text-white rounded-lg text-sm
                 hover:bg-blue-600 transition-colors"
      >
        Connect Telegram Bot
      </a>
      <p className="text-gray-500 text-xs">
        Click to open Telegram, then tap "Start" to connect. This page will update automatically.
      </p>
    </div>
  );
};

// ============================================
// Notification Method Picker
// ============================================

const NotifyMethodPicker: React.FC<{
  value: NotifyMethod;
  onChange: (method: NotifyMethod) => void;
}> = ({ value, onChange }) => {
  return (
    <div className="flex gap-2 mb-3">
      {(['email', 'telegram', 'both'] as NotifyMethod[]).map((method) => (
        <button
          key={method}
          type="button"
          onClick={() => onChange(method)}
          className={`flex-1 py-2 px-2 rounded-lg border-2 text-sm transition-all ${
            value === method
              ? 'border-blue-500 bg-blue-900/30 text-white'
              : 'border-gray-600 bg-gray-700/50 text-gray-400 hover:border-gray-500'
          }`}
        >
          {method === 'email' && 'Email'}
          {method === 'telegram' && 'Telegram'}
          {method === 'both' && 'Both'}
        </button>
      ))}
    </div>
  );
};

// ============================================
// Main InviteView Component
// ============================================

export const InviteView: React.FC<InviteViewProps> = ({
  availableCharacters,
  selectedCharacter,
  onCharacterChange,
  onBattleStart,
  onBack,
  inviteRoomCode,
  reclaimToken,
  reclaimRole: _reclaimRole,
}) => {
  // Load saved preferences
  const savedPrefs = socket.loadNotificationPrefs();

  const [step, setStep] = useState<InviteStep>(() => {
    if (reclaimToken) return 'waiting'; // Returning via notification
    if (inviteRoomCode) return 'guest-join'; // Joining via invite link
    return 'form'; // Creating new invite
  });

  const [character, setCharacter] = useState(selectedCharacter);
  const [error, setError] = useState<string | null>(null);
  const [roomCode, setRoomCode] = useState(inviteRoomCode || '');

  // Host form fields
  const [hostEmail, setHostEmail] = useState(savedPrefs.email || '');
  const [hostNotifyMethod, setHostNotifyMethod] = useState<NotifyMethod>(savedPrefs.preferredMethod || 'email');
  const [hostTelegramChatId, setHostTelegramChatId] = useState(savedPrefs.telegramChatId || '');
  const [guestEmail, setGuestEmail] = useState('');

  // Guest form fields
  const [myEmail, setMyEmail] = useState(savedPrefs.email || '');
  const [myNotifyMethod, setMyNotifyMethod] = useState<NotifyMethod>(savedPrefs.preferredMethod || 'email');
  const [myTelegramChatId, setMyTelegramChatId] = useState(savedPrefs.telegramChatId || '');

  // Handle reclaim flow (returning via notification link)
  useEffect(() => {
    if (!reclaimToken || !inviteRoomCode) return;

    const doReclaim = async () => {
      const result = await socket.reclaimRoom({
        roomCode: inviteRoomCode,
        token: reclaimToken,
      });

      if (!result.success) {
        setError(result.error || 'Failed to rejoin room');
        setStep('error');
        return;
      }

      // Now join via socket for real-time play
      const charId = result.role === 'host' ? result.hostCharacter! : result.guestCharacter!;
      const joinResult = await socket.joinRoomWithToken(
        inviteRoomCode,
        charId,
        reclaimToken
      );

      if (!joinResult.success) {
        setError(joinResult.error || 'Failed to connect to room');
        setStep('error');
        return;
      }

      // Set up listeners for battle start
      socket.onBattleStart(({ hostCharacter, guestCharacter }) => {
        const isHost = result.role === 'host';
        const opponentChar = isHost ? guestCharacter : hostCharacter;
        onBattleStart(isHost, opponentChar);
      });

      // Check if opponent is connected
      if (result.opponentConnected) {
        // Battle should start via the event listener
      } else {
        setStep('waiting');
      }

      // Listen for guest joining (if we're host waiting)
      socket.onGuestJoined(({ guestCharacter }) => {
        onBattleStart(true, guestCharacter);
      });
    };

    doReclaim();

    return () => {
      const sock = socket.getSocket();
      if (sock) {
        sock.off('battle-start');
        sock.off('guest-joined');
      }
    };
  }, [reclaimToken, inviteRoomCode, onBattleStart]);

  // Handle creating an invite
  const handleSendInvite = async () => {
    // Validate: must have at least guest email (how we reach them)
    if (!guestEmail.trim()) {
      setError("Enter your opponent's email address");
      return;
    }

    // Validate: host must have at least one notification method
    const useHostEmail = hostNotifyMethod === 'email' || hostNotifyMethod === 'both';
    const useHostTelegram = hostNotifyMethod === 'telegram' || hostNotifyMethod === 'both';

    if (useHostEmail && !hostEmail.trim()) {
      setError('Enter your email for notifications');
      return;
    }
    if (useHostTelegram && !hostTelegramChatId) {
      setError('Connect your Telegram first (click the button above)');
      return;
    }

    setStep('sending');
    setError(null);

    // Save preferences
    socket.saveNotificationPrefs({
      email: hostEmail.trim() || undefined,
      telegramChatId: hostTelegramChatId || undefined,
      preferredMethod: hostNotifyMethod,
    });

    const result = await socket.createInvite({
      hostCharacterId: character,
      hostEmail: useHostEmail ? hostEmail.trim() : undefined,
      hostTelegramChatId: useHostTelegram ? hostTelegramChatId : undefined,
      guestEmail: guestEmail.trim(),
    });

    if (!result.success) {
      setError(result.error || 'Failed to send invite');
      setStep('form');
      return;
    }

    setRoomCode(result.roomCode!);
    setStep('sent');
  };

  // Handle guest joining via invite link
  const handleGuestJoin = async () => {
    if (!character) {
      setError('Please select a character');
      return;
    }

    setStep('guest-joining');
    setError(null);

    // Determine which notification methods to use
    const useMyEmail = myNotifyMethod === 'email' || myNotifyMethod === 'both';
    const useMyTelegram = myNotifyMethod === 'telegram' || myNotifyMethod === 'both';

    // Save preferences
    socket.saveNotificationPrefs({
      email: myEmail.trim() || undefined,
      telegramChatId: myTelegramChatId || undefined,
      preferredMethod: myNotifyMethod,
    });

    // Join via REST (creates guest token, notifies host)
    const result = await socket.joinInvite({
      roomCode: roomCode,
      characterId: character,
      guestEmail: useMyEmail ? myEmail.trim() || undefined : undefined,
      guestTelegramChatId: useMyTelegram ? myTelegramChatId || undefined : undefined,
    });

    if (!result.success) {
      setError(result.error || 'Failed to join room');
      setStep('guest-join');
      return;
    }

    // Now join via socket for real-time play
    const joinResult = await socket.joinRoomWithToken(
      roomCode,
      character,
      result.guestToken!
    );

    if (!joinResult.success) {
      setError(joinResult.error || 'Failed to connect to room');
      setStep('guest-join');
      return;
    }

    // Set up listeners
    socket.onBattleStart(({ hostCharacter }) => {
      onBattleStart(false, hostCharacter);
    });

    // If host is already connected, battle should start immediately
    // Otherwise, wait for host
    setStep('waiting');
  };

  const handleHostTelegramConnected = useCallback((chatId: string) => {
    setHostTelegramChatId(chatId);
  }, []);

  const handleMyTelegramConnected = useCallback((chatId: string) => {
    setMyTelegramChatId(chatId);
  }, []);

  const getCharacterName = (id: string) => {
    return availableCharacters.find(c => c.id === id)?.name || id;
  };

  // Notification summary for the "sent" screen
  const getNotifySummary = () => {
    const parts: string[] = [];
    if (hostNotifyMethod === 'email' || hostNotifyMethod === 'both') {
      parts.push(`email at ${hostEmail}`);
    }
    if (hostNotifyMethod === 'telegram' || hostNotifyMethod === 'both') {
      parts.push('Telegram');
    }
    return parts.join(' and ');
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-900 to-gray-800 flex items-center justify-center p-4">
      <div className="bg-gray-800 rounded-xl shadow-2xl p-8 max-w-md w-full">

        {/* ===== CREATE INVITE FORM ===== */}
        {step === 'form' && (
          <>
            <h2 className="text-3xl font-bold text-white text-center mb-6">
              Invite a Friend
            </h2>

            {error && (
              <div className="bg-red-900/50 border border-red-700 text-red-300 px-4 py-3 rounded-lg mb-4 text-center text-sm">
                {error}
              </div>
            )}

            {/* Character Selection */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Your Character
              </label>
              <div className="space-y-2">
                {availableCharacters.map((char) => (
                  <button
                    key={char.id}
                    onClick={() => { setCharacter(char.id); onCharacterChange(char.id); }}
                    className={`w-full p-3 rounded-lg border-2 transition-all text-left ${
                      character === char.id
                        ? 'border-blue-500 bg-blue-900/30 text-white'
                        : 'border-gray-600 bg-gray-700/50 text-gray-300 hover:border-gray-500'
                    }`}
                  >
                    <div className="font-bold">{char.name}</div>
                    <div className="text-xs opacity-75">
                      {char.id === 'man-in-chainmail' && 'Balanced fighter with shield \u2022 12 HP'}
                      {char.id === 'hill-troll' && 'Powerful brute with regeneration \u2022 35 HP'}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Opponent's Email (always required — how we reach them) */}
            <div className="mb-5">
              <label className="block text-sm font-medium text-gray-300 mb-1">
                Opponent's Email
              </label>
              <input
                type="email"
                value={guestEmail}
                onChange={(e) => setGuestEmail(e.target.value)}
                placeholder="friend@example.com"
                className="w-full px-4 py-3 bg-gray-700 text-white rounded-lg border border-gray-600
                         focus:border-blue-500 focus:outline-none placeholder:text-gray-500"
              />
            </div>

            {/* Your Notification Preferences */}
            <div className="mb-5">
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Notify me when they join via:
              </label>
              <NotifyMethodPicker value={hostNotifyMethod} onChange={setHostNotifyMethod} />

              {/* Email field */}
              {(hostNotifyMethod === 'email' || hostNotifyMethod === 'both') && (
                <div className="mb-3">
                  <input
                    type="email"
                    value={hostEmail}
                    onChange={(e) => setHostEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="w-full px-4 py-3 bg-gray-700 text-white rounded-lg border border-gray-600
                             focus:border-blue-500 focus:outline-none placeholder:text-gray-500"
                  />
                </div>
              )}

              {/* Telegram link */}
              {(hostNotifyMethod === 'telegram' || hostNotifyMethod === 'both') && (
                <div className="mb-3">
                  {hostTelegramChatId ? (
                    <div className="flex items-center gap-2 text-green-400 text-sm py-2">
                      <span>&#10003;</span> Telegram connected
                    </div>
                  ) : (
                    <TelegramLink
                      roomCode={roomCode || 'new'}
                      role="host"
                      onConnected={handleHostTelegramConnected}
                    />
                  )}
                </div>
              )}
            </div>

            {/* Send Button */}
            <button
              onClick={handleSendInvite}
              disabled={!character || !guestEmail.trim()}
              className="w-full py-4 bg-green-600 text-white rounded-lg text-xl font-bold
                       hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed
                       transition-colors mb-4"
            >
              Send Invite
            </button>

            <button
              onClick={onBack}
              className="w-full py-3 bg-gray-600 text-white rounded-lg hover:bg-gray-500 transition-colors"
            >
              Back
            </button>
          </>
        )}

        {/* ===== SENDING ===== */}
        {step === 'sending' && (
          <div className="text-center py-12">
            <div className="animate-spin w-12 h-12 border-4 border-green-500 border-t-transparent rounded-full mx-auto mb-4" />
            <p className="text-gray-300">Sending invite...</p>
          </div>
        )}

        {/* ===== INVITE SENT ===== */}
        {step === 'sent' && (
          <div className="text-center">
            <div className="text-5xl mb-4">&#9989;</div>
            <h2 className="text-2xl font-bold text-white mb-2">Invite Sent!</h2>
            <p className="text-gray-400 mb-6">
              We've emailed <span className="text-white">{guestEmail}</span> with a link to join your battle.
            </p>

            <div className="bg-gray-900 rounded-lg p-4 mb-6">
              <p className="text-gray-500 text-sm mb-1">Room Code</p>
              <p className="text-3xl font-mono font-bold text-white tracking-widest">{roomCode}</p>
            </div>

            <div className="bg-blue-900/30 border border-blue-700 rounded-lg p-4 mb-6">
              <p className="text-blue-300 text-sm">
                You'll be notified via {getNotifySummary()} when they join.
                You can close this page — just click the link in the notification to start playing!
              </p>
            </div>

            <button
              onClick={onBack}
              className="w-full py-3 bg-gray-600 text-white rounded-lg hover:bg-gray-500 transition-colors"
            >
              Back to Menu
            </button>
          </div>
        )}

        {/* ===== GUEST JOIN (from invite link) ===== */}
        {step === 'guest-join' && (
          <>
            <h2 className="text-3xl font-bold text-white text-center mb-2">
              Join Battle
            </h2>

            <div className="bg-blue-900/30 border border-blue-700 rounded-lg p-4 mb-6 text-center">
              <p className="text-blue-300">
                You've been invited to room <span className="font-mono font-bold">{roomCode}</span>
              </p>
            </div>

            {error && (
              <div className="bg-red-900/50 border border-red-700 text-red-300 px-4 py-3 rounded-lg mb-4 text-center text-sm">
                {error}
              </div>
            )}

            {/* Character Selection */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Choose Your Character
              </label>
              <div className="space-y-2">
                {availableCharacters.map((char) => (
                  <button
                    key={char.id}
                    onClick={() => { setCharacter(char.id); onCharacterChange(char.id); }}
                    className={`w-full p-3 rounded-lg border-2 transition-all text-left ${
                      character === char.id
                        ? 'border-green-500 bg-green-900/30 text-white'
                        : 'border-gray-600 bg-gray-700/50 text-gray-300 hover:border-gray-500'
                    }`}
                  >
                    <div className="font-bold">{char.name}</div>
                    <div className="text-xs opacity-75">
                      {char.id === 'man-in-chainmail' && 'Balanced fighter with shield \u2022 12 HP'}
                      {char.id === 'hill-troll' && 'Powerful brute with regeneration \u2022 35 HP'}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Guest Notification Preferences */}
            <div className="mb-5">
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Notify me when opponent returns via:
                <span className="text-gray-500"> (optional)</span>
              </label>
              <NotifyMethodPicker value={myNotifyMethod} onChange={setMyNotifyMethod} />

              {/* Email field */}
              {(myNotifyMethod === 'email' || myNotifyMethod === 'both') && (
                <div className="mb-3">
                  <input
                    type="email"
                    value={myEmail}
                    onChange={(e) => setMyEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="w-full px-4 py-3 bg-gray-700 text-white rounded-lg border border-gray-600
                             focus:border-blue-500 focus:outline-none placeholder:text-gray-500"
                  />
                </div>
              )}

              {/* Telegram link */}
              {(myNotifyMethod === 'telegram' || myNotifyMethod === 'both') && (
                <div className="mb-3">
                  {myTelegramChatId ? (
                    <div className="flex items-center gap-2 text-green-400 text-sm py-2">
                      <span>&#10003;</span> Telegram connected
                    </div>
                  ) : (
                    <TelegramLink
                      roomCode={roomCode}
                      role="guest"
                      onConnected={handleMyTelegramConnected}
                    />
                  )}
                </div>
              )}
            </div>

            <button
              onClick={handleGuestJoin}
              disabled={!character}
              className="w-full py-4 bg-green-600 text-white rounded-lg text-xl font-bold
                       hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed
                       transition-colors mb-4"
            >
              Join as {getCharacterName(character)}
            </button>

            <button
              onClick={onBack}
              className="w-full py-3 bg-gray-600 text-white rounded-lg hover:bg-gray-500 transition-colors"
            >
              Cancel
            </button>
          </>
        )}

        {/* ===== GUEST JOINING ===== */}
        {step === 'guest-joining' && (
          <div className="text-center py-12">
            <div className="animate-spin w-12 h-12 border-4 border-green-500 border-t-transparent rounded-full mx-auto mb-4" />
            <p className="text-gray-300">Joining room...</p>
          </div>
        )}

        {/* ===== WAITING FOR OPPONENT ===== */}
        {step === 'waiting' && (
          <div className="text-center">
            <div className="text-5xl mb-4">&#9876;&#65039;</div>
            <h2 className="text-2xl font-bold text-white mb-4">Waiting for Opponent</h2>

            <div className="bg-gray-900 rounded-lg p-4 mb-4">
              <p className="text-gray-500 text-sm mb-1">Room</p>
              <p className="text-2xl font-mono font-bold text-white tracking-widest">{roomCode}</p>
            </div>

            <div className="flex items-center justify-center text-gray-400 mb-6">
              <div className="animate-pulse w-3 h-3 bg-yellow-500 rounded-full mr-2" />
              Your opponent hasn't connected yet...
            </div>

            <div className="bg-blue-900/30 border border-blue-700 rounded-lg p-4 mb-6">
              <p className="text-blue-300 text-sm">
                {(myEmail || hostEmail || myTelegramChatId || hostTelegramChatId)
                  ? "We'll notify you when they're ready. Feel free to close this page!"
                  : "You'll need to wait here, or go back and add your contact info to get notified."
                }
              </p>
            </div>

            <button
              onClick={onBack}
              className="w-full py-3 bg-gray-600 text-white rounded-lg hover:bg-gray-500 transition-colors"
            >
              Back to Menu
            </button>
          </div>
        )}

        {/* ===== ERROR ===== */}
        {step === 'error' && (
          <div className="text-center">
            <div className="text-5xl mb-4">&#10060;</div>
            <h2 className="text-2xl font-bold text-white mb-4">Something went wrong</h2>
            <p className="text-red-300 mb-6">{error}</p>
            <button
              onClick={onBack}
              className="w-full py-3 bg-gray-600 text-white rounded-lg hover:bg-gray-500 transition-colors"
            >
              Back to Menu
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default InviteView;
