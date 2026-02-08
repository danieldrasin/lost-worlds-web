/**
 * Invite View Component
 *
 * Handles the 4-step invite flow:
 *   1. Challenger sends invite (email or WhatsApp click-to-send)
 *   2. Challenged receives message, clicks link, enters room
 *   3. Notification sent to challenger (email or Telegram)
 *   4. Challenger clicks link, enters room, game begins
 *
 * Also handles:
 *   - Guest join flow (arriving via invite link)
 *   - Reclaim flow (returning via notification link)
 */

import React, { useState, useEffect, useCallback } from 'react';
import * as socket from '../../multiplayer/socket';

interface InviteViewProps {
  availableCharacters: { id: string; name: string }[];
  selectedCharacter: string;
  onCharacterChange: (charId: string) => void;
  onBattleStart: (isHost: boolean, opponentCharacter: string, roomCode?: string, token?: string) => void;
  onBack: () => void;
  inviteRoomCode?: string;
  reclaimToken?: string;
  reclaimRole?: 'host' | 'guest';
}

type InviteStep = 'form' | 'sending' | 'sent' | 'guest-join' | 'guest-joining' | 'waiting' | 'error';
type ChallengeChannel = 'email' | 'whatsapp' | 'copy';
type NotifyChannel = 'email' | 'telegram';

// ============================================
// Telegram One-Time Connect Component
// ============================================

const TelegramConnect: React.FC<{
  onConnected: (chatId: string) => void;
}> = ({ onConnected }) => {
  const [connectUrl, setConnectUrl] = useState<string | null>(null);
  const [connectToken, setConnectToken] = useState<string | null>(null);
  const [status, setStatus] = useState<'idle' | 'loading' | 'waiting' | 'connected' | 'error'>('idle');

  const startConnect = useCallback(async () => {
    setStatus('loading');
    const result = await socket.telegramConnect();
    if (result.success && result.url && result.token) {
      setConnectUrl(result.url);
      setConnectToken(result.token);
      setStatus('waiting');
      // Open Telegram in new tab
      window.open(result.url, '_blank');
    } else {
      setStatus('error');
    }
  }, []);

  // Poll for connection
  useEffect(() => {
    if (!connectToken || status !== 'waiting') return;

    const interval = setInterval(async () => {
      const result = await socket.checkTelegramConnect(connectToken);
      if (result.connected && result.chatId) {
        setStatus('connected');
        onConnected(result.chatId);
        clearInterval(interval);
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [connectToken, status, onConnected]);

  if (status === 'connected') {
    return (
      <div className="flex items-center gap-2 text-green-400 text-sm py-2">
        <span>&#10003;</span> Telegram connected
      </div>
    );
  }

  if (status === 'waiting') {
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-yellow-400 text-sm">
          <div className="animate-pulse w-2 h-2 bg-yellow-400 rounded-full" />
          Waiting for you to tap "Start" in Telegram...
        </div>
        <a
          href={connectUrl!}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-400 text-xs underline"
        >
          Didn't open? Click here
        </a>
      </div>
    );
  }

  if (status === 'error') {
    return <p className="text-red-400 text-sm">Failed to generate connect link. Try email instead.</p>;
  }

  return (
    <button
      type="button"
      onClick={startConnect}
      disabled={status === 'loading'}
      className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm
               hover:bg-blue-700 disabled:bg-gray-600 transition-colors"
    >
      {status === 'loading' ? 'Loading...' : 'Connect Telegram Bot'}
    </button>
  );
};

// ============================================
// Channel Picker
// ============================================

function ChannelPicker<T extends string>({ options, value, onChange }: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex gap-2 mb-3">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={`flex-1 py-2 px-3 rounded-lg border-2 text-sm transition-all ${
            value === opt.value
              ? 'border-blue-500 bg-blue-900/30 text-white'
              : 'border-gray-600 bg-gray-700/50 text-gray-400 hover:border-gray-500'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

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
  const savedPrefs = socket.loadNotificationPrefs();

  const [step, setStep] = useState<InviteStep>(() => {
    if (reclaimToken) return 'waiting';
    if (inviteRoomCode) return 'guest-join';
    return 'form';
  });

  const [character, setCharacter] = useState(selectedCharacter);
  const [error, setError] = useState<string | null>(null);
  const [roomCode, setRoomCode] = useState(inviteRoomCode || '');

  // --- Host form: How to reach the challenged (Step 1) ---
  const [challengeChannel, setChallengeChannel] = useState<ChallengeChannel>('email');
  const [challengedEmail, setChallengedEmail] = useState('');
  const [challengedPhone, setChallengedPhone] = useState('');

  // --- Host form: How to notify the challenger (Step 3) ---
  const [notifyChannel, setNotifyChannel] = useState<NotifyChannel>(
    savedPrefs.telegramChatId ? 'telegram' : 'email'
  );
  const [challengerEmail, setChallengerEmail] = useState(savedPrefs.email || '');
  const [challengerTelegramChatId, setChallengerTelegramChatId] = useState(savedPrefs.telegramChatId || '');

  // WhatsApp link (generated after room creation)
  const [whatsAppUrl, setWhatsAppUrl] = useState<string | null>(null);
  // Copyable invite text (for 'copy' channel)
  const [inviteText, setInviteText] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Reclaim flow
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

      const charId = result.role === 'host' ? result.hostCharacter! : result.guestCharacter!;
      const joinResult = await socket.joinRoomWithToken(inviteRoomCode, charId, reclaimToken);

      if (!joinResult.success) {
        setError(joinResult.error || 'Failed to connect to room');
        setStep('error');
        return;
      }

      socket.onBattleStart(({ hostCharacter, guestCharacter }) => {
        const isHost = result.role === 'host';
        const opponentChar = isHost ? guestCharacter : hostCharacter;
        onBattleStart(isHost, opponentChar, inviteRoomCode, reclaimToken);
      });

      if (!result.opponentConnected) {
        setStep('waiting');
      }

      socket.onGuestJoined(({ guestCharacter }) => {
        onBattleStart(true, guestCharacter, inviteRoomCode, reclaimToken);
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

  // Send invite (Step 1)
  const handleSendInvite = async () => {
    // Validate challenge channel
    if (challengeChannel === 'email' && !challengedEmail.trim()) {
      setError("Enter your opponent's email address");
      return;
    }
    if (challengeChannel === 'whatsapp' && !challengedPhone.trim()) {
      setError("Enter your opponent's phone number");
      return;
    }
    // 'copy' channel needs no recipient validation

    // Validate notification channel
    if (notifyChannel === 'email' && !challengerEmail.trim()) {
      setError('Enter your email for notifications');
      return;
    }
    if (notifyChannel === 'telegram' && !challengerTelegramChatId) {
      setError('Connect your Telegram first');
      return;
    }

    setStep('sending');
    setError(null);

    // Save preferences
    socket.saveNotificationPrefs({
      email: challengerEmail.trim() || undefined,
      telegramChatId: challengerTelegramChatId || undefined,
    });

    const result = await socket.createInvite({
      hostCharacterId: character,
      hostEmail: notifyChannel === 'email' ? challengerEmail.trim() : undefined,
      hostTelegramChatId: notifyChannel === 'telegram' ? challengerTelegramChatId : undefined,
      guestEmail: challengeChannel === 'email' ? challengedEmail.trim() : undefined,
    });

    if (!result.success) {
      setError(result.error || 'Failed to create invite');
      setStep('form');
      return;
    }

    setRoomCode(result.roomCode!);

    // Build channel-specific share content
    if (result.joinUrl) {
      if (challengeChannel === 'whatsapp') {
        setWhatsAppUrl(socket.buildWhatsAppUrl(challengedPhone, result.joinUrl));
      }
      if (challengeChannel === 'copy') {
        setInviteText(socket.buildInviteText(result.joinUrl));
      }
    }

    setStep('sent');
  };

  // Guest join (Step 2)
  const handleGuestJoin = async () => {
    if (!character) {
      setError('Please select a character');
      return;
    }

    setStep('guest-joining');
    setError(null);

    const result = await socket.joinInvite({
      roomCode: roomCode,
      characterId: character,
    });

    if (!result.success) {
      setError(result.error || 'Failed to join room');
      setStep('guest-join');
      return;
    }

    const joinResult = await socket.joinRoomWithToken(roomCode, character, result.guestToken!);

    if (!joinResult.success) {
      setError(joinResult.error || 'Failed to connect to room');
      setStep('guest-join');
      return;
    }

    const guestToken = result.guestToken!;
    socket.onBattleStart(({ hostCharacter }) => {
      onBattleStart(false, hostCharacter, roomCode, guestToken);
    });

    setStep('waiting');
  };

  const handleTelegramConnected = useCallback((chatId: string) => {
    setChallengerTelegramChatId(chatId);
    socket.saveNotificationPrefs({ telegramChatId: chatId });
  }, []);

  const getCharacterName = (id: string) =>
    availableCharacters.find(c => c.id === id)?.name || id;

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
            <div className="mb-5">
              <label className="block text-sm font-medium text-gray-300 mb-2">Your Character</label>
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
                  </button>
                ))}
              </div>
            </div>

            {/* --- Section: How to reach the challenged --- */}
            <div className="mb-5">
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Send challenge via
              </label>
              <ChannelPicker<ChallengeChannel>
                options={[
                  { value: 'email', label: 'Email' },
                  { value: 'whatsapp', label: 'WhatsApp' },
                  { value: 'copy', label: 'Copy Link' },
                ]}
                value={challengeChannel}
                onChange={setChallengeChannel}
              />
              {challengeChannel === 'email' && (
                <input
                  type="email"
                  value={challengedEmail}
                  onChange={(e) => setChallengedEmail(e.target.value)}
                  placeholder="opponent@example.com"
                  className="w-full px-4 py-3 bg-gray-700 text-white rounded-lg border border-gray-600
                           focus:border-blue-500 focus:outline-none placeholder:text-gray-500"
                />
              )}
              {challengeChannel === 'whatsapp' && (
                <>
                  <input
                    type="tel"
                    value={challengedPhone}
                    onChange={(e) => setChallengedPhone(e.target.value)}
                    placeholder="+1 555 123 4567"
                    className="w-full px-4 py-3 bg-gray-700 text-white rounded-lg border border-gray-600
                             focus:border-blue-500 focus:outline-none placeholder:text-gray-500"
                  />
                  <p className="text-gray-500 text-xs mt-1">
                    Include country code. We'll open WhatsApp with the invite message for you to send.
                  </p>
                </>
              )}
              {challengeChannel === 'copy' && (
                <p className="text-gray-500 text-xs mt-1">
                  We'll give you a message with a link to paste into any app — SMS, Slack, Discord, etc.
                </p>
              )}
            </div>

            {/* --- Section: How to notify the challenger (Step 3) --- */}
            <div className="mb-5">
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Notify me when they join via
              </label>
              <ChannelPicker<NotifyChannel>
                options={[
                  { value: 'email', label: 'Email' },
                  { value: 'telegram', label: 'Telegram' },
                ]}
                value={notifyChannel}
                onChange={setNotifyChannel}
              />
              {notifyChannel === 'email' && (
                <input
                  type="email"
                  value={challengerEmail}
                  onChange={(e) => setChallengerEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full px-4 py-3 bg-gray-700 text-white rounded-lg border border-gray-600
                           focus:border-blue-500 focus:outline-none placeholder:text-gray-500"
                />
              )}
              {notifyChannel === 'telegram' && (
                challengerTelegramChatId ? (
                  <div className="flex items-center justify-between py-2">
                    <span className="text-green-400 text-sm">&#10003; Telegram connected</span>
                    <button
                      type="button"
                      onClick={() => setChallengerTelegramChatId('')}
                      className="text-gray-500 text-xs underline hover:text-gray-400"
                    >
                      Reconnect
                    </button>
                  </div>
                ) : (
                  <div>
                    <TelegramConnect onConnected={handleTelegramConnected} />
                    <p className="text-gray-500 text-xs mt-2">
                      One-time setup. After connecting, Telegram notifications work for all future invites.
                    </p>
                  </div>
                )
              )}
            </div>

            {/* Send Button */}
            <button
              onClick={handleSendInvite}
              disabled={!character}
              className="w-full py-4 bg-green-600 text-white rounded-lg text-xl font-bold
                       hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed
                       transition-colors mb-4"
            >
              {challengeChannel === 'email' ? 'Send Invite' : 'Create Invite'}
            </button>

            <button onClick={onBack}
              className="w-full py-3 bg-gray-600 text-white rounded-lg hover:bg-gray-500 transition-colors">
              Back
            </button>
          </>
        )}

        {/* ===== SENDING ===== */}
        {step === 'sending' && (
          <div className="text-center py-12">
            <div className="animate-spin w-12 h-12 border-4 border-green-500 border-t-transparent rounded-full mx-auto mb-4" />
            <p className="text-gray-300">Creating invite...</p>
          </div>
        )}

        {/* ===== INVITE SENT / CREATED ===== */}
        {step === 'sent' && (
          <div className="text-center">
            <div className="text-5xl mb-4">&#9989;</div>
            <h2 className="text-2xl font-bold text-white mb-2">
              {challengeChannel === 'email' ? 'Invite Sent!' : 'Invite Created!'}
            </h2>

            {challengeChannel === 'email' && (
              <p className="text-gray-400 mb-6">
                We've emailed <span className="text-white">{challengedEmail}</span> with a link to join.
              </p>
            )}

            {challengeChannel === 'whatsapp' && whatsAppUrl && (
              <div className="mb-6">
                <p className="text-gray-400 mb-4">
                  Now send the invite to your opponent via WhatsApp:
                </p>
                <a
                  href={whatsAppUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block px-6 py-3 bg-green-500 text-white rounded-lg font-bold
                           hover:bg-green-600 transition-colors"
                >
                  Open WhatsApp &amp; Send
                </a>
              </div>
            )}

            {challengeChannel === 'copy' && inviteText && (
              <div className="mb-6">
                <p className="text-gray-400 mb-3">
                  Copy this message and send it to your opponent:
                </p>
                <div className="bg-gray-900 rounded-lg p-4 text-left mb-3">
                  <p className="text-white text-sm whitespace-pre-wrap break-all font-mono">{inviteText}</p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(inviteText);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  }}
                  className={`px-6 py-3 rounded-lg font-bold transition-colors ${
                    copied
                      ? 'bg-green-600 text-white'
                      : 'bg-blue-500 text-white hover:bg-blue-600'
                  }`}
                >
                  {copied ? 'Copied!' : 'Copy to Clipboard'}
                </button>
              </div>
            )}

            <div className="bg-gray-900 rounded-lg p-4 mb-6">
              <p className="text-gray-500 text-sm mb-1">Room Code</p>
              <p className="text-3xl font-mono font-bold text-white tracking-widest">{roomCode}</p>
            </div>

            <div className="bg-blue-900/30 border border-blue-700 rounded-lg p-4 mb-6">
              <p className="text-blue-300 text-sm">
                {notifyChannel === 'email'
                  ? `You'll get an email at ${challengerEmail} when they join.`
                  : "You'll get a Telegram message when they join."
                }
                {' '}You can close this page!
              </p>
            </div>

            <button onClick={onBack}
              className="w-full py-3 bg-gray-600 text-white rounded-lg hover:bg-gray-500 transition-colors">
              Back to Menu
            </button>
          </div>
        )}

        {/* ===== GUEST JOIN (from invite link) ===== */}
        {step === 'guest-join' && (
          <>
            <h2 className="text-3xl font-bold text-white text-center mb-2">Join Battle</h2>

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
              <label className="block text-sm font-medium text-gray-300 mb-2">Choose Your Character</label>
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
                  </button>
                ))}
              </div>
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

            <button onClick={onBack}
              className="w-full py-3 bg-gray-600 text-white rounded-lg hover:bg-gray-500 transition-colors">
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
                {(challengerEmail || challengerTelegramChatId)
                  ? "We'll notify you when they're ready. Feel free to close this page!"
                  : "You'll need to wait here, or go back and add your contact info to get notified."
                }
              </p>
            </div>

            <button onClick={onBack}
              className="w-full py-3 bg-gray-600 text-white rounded-lg hover:bg-gray-500 transition-colors">
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
            <button onClick={onBack}
              className="w-full py-3 bg-gray-600 text-white rounded-lg hover:bg-gray-500 transition-colors">
              Back to Menu
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default InviteView;
