/**
 * Multiplayer Lobby Component
 *
 * Handles creating/joining multiplayer rooms.
 */

import React, { useState, useEffect } from 'react';
import * as socket from '../../multiplayer/socket';

interface MultiplayerLobbyProps {
  selectedCharacter: string;
  availableCharacters: { id: string; name: string }[];
  onBattleStart: (isHost: boolean, opponentCharacter: string) => void;
  onBack: () => void;
}

export const MultiplayerLobby: React.FC<MultiplayerLobbyProps> = ({
  selectedCharacter,
  availableCharacters,
  onBattleStart,
  onBack,
}) => {
  const [mode, setMode] = useState<'menu' | 'creating' | 'waiting' | 'joining'>('menu');
  const [roomCode, setRoomCode] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    // Connect to server
    const sock = socket.connect();

    sock.on('connect', () => setIsConnected(true));
    sock.on('disconnect', () => setIsConnected(false));

    // Listen for guest joining (when we're host)
    socket.onGuestJoined(({ guestCharacter }) => {
      onBattleStart(true, guestCharacter);
    });

    // Listen for battle start (when we're guest)
    socket.onBattleStart(({ hostCharacter }) => {
      onBattleStart(false, hostCharacter);
    });

    socket.onOpponentDisconnected(() => {
      setError('Opponent disconnected');
      setMode('menu');
    });

    return () => {
      // Only remove listeners this component set up - NOT all listeners
      // BattleViewNew needs opponent-ready and moves-revealed to stay active
      const sock = socket.getSocket();
      if (sock) {
        sock.off('guest-joined');
        sock.off('battle-start');
        sock.off('opponent-disconnected');
      }
    };
  }, [onBattleStart]);

  const handleCreateRoom = async () => {
    setMode('creating');
    setError(null);

    const result = await socket.createRoom(selectedCharacter);

    if (result.success && result.roomCode) {
      setRoomCode(result.roomCode);
      setMode('waiting');
    } else {
      setError(result.error || 'Failed to create room');
      setMode('menu');
    }
  };

  const handleJoinRoom = async () => {
    if (!joinCode.trim()) {
      setError('Please enter a room code');
      return;
    }

    setError(null);
    const result = await socket.joinRoom(joinCode.trim(), selectedCharacter);

    if (!result.success) {
      setError(result.error || 'Failed to join room');
    }
    // If successful, onBattleStart will be called via the event listener
  };

  const handleBack = () => {
    socket.leaveRoom();
    setMode('menu');
    setRoomCode('');
    setJoinCode('');
    setError(null);
    onBack();
  };

  const getCharacterName = (id: string) => {
    const char = availableCharacters.find(c => c.id === id);
    return char?.name || id;
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-900 to-gray-800 flex items-center justify-center p-4">
      <div className="bg-gray-800 rounded-xl shadow-2xl p-8 max-w-md w-full">
        <h2 className="text-3xl font-bold text-white text-center mb-2">
          Online Multiplayer
        </h2>

        <div className="text-center mb-6">
          <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm ${
            isConnected ? 'bg-green-900 text-green-300' : 'bg-red-900 text-red-300'
          }`}>
            <span className={`w-2 h-2 rounded-full mr-2 ${
              isConnected ? 'bg-green-400' : 'bg-red-400'
            }`} />
            {isConnected ? 'Connected' : 'Connecting...'}
          </span>
        </div>

        <div className="text-center text-gray-400 mb-6">
          Playing as: <span className="text-white font-bold">{getCharacterName(selectedCharacter)}</span>
        </div>

        {error && (
          <div className="bg-red-900/50 border border-red-700 text-red-300 px-4 py-3 rounded-lg mb-4 text-center">
            {error}
          </div>
        )}

        {mode === 'menu' && (
          <div className="space-y-4">
            <button
              onClick={handleCreateRoom}
              disabled={!isConnected}
              className="w-full py-4 bg-blue-600 text-white rounded-lg text-xl font-bold
                       hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed
                       transition-colors"
            >
              Create Room
            </button>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-600" />
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-gray-800 text-gray-400">or</span>
              </div>
            </div>

            <div>
              <input
                type="text"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                placeholder="Enter Room Code"
                maxLength={6}
                className="w-full px-4 py-3 bg-gray-700 text-white text-center text-2xl font-mono
                         rounded-lg border border-gray-600 focus:border-blue-500 focus:outline-none
                         placeholder:text-gray-500 tracking-widest"
              />
              <button
                onClick={handleJoinRoom}
                disabled={!isConnected || !joinCode.trim()}
                className="w-full mt-2 py-3 bg-green-600 text-white rounded-lg text-lg font-bold
                         hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed
                         transition-colors"
              >
                Join Room
              </button>
            </div>

            <button
              onClick={handleBack}
              className="w-full py-3 bg-gray-600 text-white rounded-lg hover:bg-gray-500
                       transition-colors"
            >
              Back to Menu
            </button>
          </div>
        )}

        {mode === 'creating' && (
          <div className="text-center py-8">
            <div className="animate-spin w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full mx-auto mb-4" />
            <p className="text-gray-400">Creating room...</p>
          </div>
        )}

        {mode === 'waiting' && (
          <div className="text-center py-4">
            <p className="text-gray-400 mb-4">Share this code with your opponent:</p>

            <div className="bg-gray-900 rounded-xl p-6 mb-6">
              <div className="text-5xl font-mono font-bold text-white tracking-widest mb-2">
                {roomCode}
              </div>
              <button
                onClick={() => navigator.clipboard.writeText(roomCode)}
                className="text-blue-400 hover:text-blue-300 text-sm"
              >
                📋 Copy to clipboard
              </button>
            </div>

            <div className="flex items-center justify-center text-gray-400 mb-6">
              <div className="animate-pulse w-3 h-3 bg-yellow-500 rounded-full mr-2" />
              Waiting for opponent to join...
            </div>

            <button
              onClick={() => {
                socket.leaveRoom();
                setMode('menu');
                setRoomCode('');
              }}
              className="px-6 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-500"
            >
              Cancel
            </button>
          </div>
        )}

        {mode === 'joining' && (
          <div className="text-center py-8">
            <div className="animate-spin w-12 h-12 border-4 border-green-500 border-t-transparent rounded-full mx-auto mb-4" />
            <p className="text-gray-400">Joining room...</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default MultiplayerLobby;
