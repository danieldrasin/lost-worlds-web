/**
 * Invite View Component
 *
 * Allows a host to create an invite and send it to an opponent via email.
 * Also handles the guest join flow (when arriving via invite link)
 * and the reclaim flow (when returning via notification link).
 */

import React, { useState, useEffect } from 'react';
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
  const [hostEmail, setHostEmail] = useState(savedPrefs.email || '');
  const [guestEmail, setGuestEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [roomCode, setRoomCode] = useState(inviteRoomCode || '');

  // Notification prefs for guest join
  const [myEmail, setMyEmail] = useState(savedPrefs.email || '');

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
    if (!guestEmail.trim()) {
      setError("Enter your opponent's email address");
      return;
    }
    if (!hostEmail.trim()) {
      setError('Enter your email so we can notify you when they join');
      return;
    }

    setStep('sending');
    setError(null);

    // Save preferences
    socket.saveNotificationPrefs({ email: hostEmail });

    const result = await socket.createInvite({
      hostCharacterId: character,
      hostEmail: hostEmail.trim(),
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

    // Save preferences
    if (myEmail.trim()) {
      socket.saveNotificationPrefs({ email: myEmail });
    }

    // Join via REST (creates guest token, notifies host)
    const result = await socket.joinInvite({
      roomCode: roomCode,
      characterId: character,
      guestEmail: myEmail.trim() || undefined,
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

  const getCharacterName = (id: string) => {
    return availableCharacters.find(c => c.id === id)?.name || id;
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
                      {char.id === 'man-in-chainmail' && 'Balanced fighter with shield • 12 HP'}
                      {char.id === 'hill-troll' && 'Powerful brute with regeneration • 35 HP'}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Your Email */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-300 mb-1">
                Your Email <span className="text-gray-500">(for notification when they join)</span>
              </label>
              <input
                type="email"
                value={hostEmail}
                onChange={(e) => setHostEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full px-4 py-3 bg-gray-700 text-white rounded-lg border border-gray-600
                         focus:border-blue-500 focus:outline-none placeholder:text-gray-500"
              />
            </div>

            {/* Opponent's Email */}
            <div className="mb-6">
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

            {/* Send Button */}
            <button
              onClick={handleSendInvite}
              disabled={!character || !guestEmail.trim() || !hostEmail.trim()}
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
            <div className="text-5xl mb-4">📧</div>
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
                You'll get an email at <span className="font-medium">{hostEmail}</span> when they join.
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
                      {char.id === 'man-in-chainmail' && 'Balanced fighter with shield • 12 HP'}
                      {char.id === 'hill-troll' && 'Powerful brute with regeneration • 35 HP'}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Your Email (optional, for notification when host returns) */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-300 mb-1">
                Your Email <span className="text-gray-500">(optional — we'll notify you when opponent joins)</span>
              </label>
              <input
                type="email"
                value={myEmail}
                onChange={(e) => setMyEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full px-4 py-3 bg-gray-700 text-white rounded-lg border border-gray-600
                         focus:border-blue-500 focus:outline-none placeholder:text-gray-500"
              />
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
            <div className="text-5xl mb-4">⚔️</div>
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
                {myEmail || hostEmail
                  ? `We'll email you at ${myEmail || hostEmail} when they're ready. Feel free to close this page!`
                  : "You'll need to wait here, or go back and add your email to get notified."
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
            <div className="text-5xl mb-4">❌</div>
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
