/**
 * Menu View Component
 *
 * Character selection and game mode selection.
 */

import React, { useState, useEffect } from 'react';
import { useGameStore } from '../../state/gameStore';
import { MultiplayerLobby } from './MultiplayerLobby';

type GameMode = 'ai' | 'local' | 'online';

export const MenuView: React.FC = () => {
  const { availableCharacters, startBattle, isLoading, error, initialize } = useGameStore();

  const [player1Char, setPlayer1Char] = useState<string>('');
  const [player2Char, setPlayer2Char] = useState<string>('');
  const [gameMode, setGameMode] = useState<GameMode>('ai');
  const [showMultiplayerLobby, setShowMultiplayerLobby] = useState(false);

  useEffect(() => {
    initialize();
  }, [initialize]);

  useEffect(() => {
    if (availableCharacters.length > 0) {
      setPlayer1Char(availableCharacters[0]);
      setPlayer2Char(availableCharacters.length > 1 ? availableCharacters[1] : availableCharacters[0]);
    }
  }, [availableCharacters]);

  const handleStartGame = () => {
    if (gameMode === 'online') {
      setShowMultiplayerLobby(true);
      return;
    }

    if (player1Char && player2Char) {
      startBattle(player1Char, player2Char, gameMode === 'ai');
    }
  };

  const handleMultiplayerBattleStart = (isHost: boolean, opponentCharacter: string) => {
    // For multiplayer, we'll use a special flow
    // The host is player 1, guest is player 2
    if (isHost) {
      startBattle(player1Char, opponentCharacter, false);
    } else {
      startBattle(player1Char, opponentCharacter, false);
    }
    setShowMultiplayerLobby(false);
  };

  // Show multiplayer lobby if in online mode
  if (showMultiplayerLobby) {
    return (
      <MultiplayerLobby
        selectedCharacter={player1Char}
        availableCharacters={availableCharacters.map(id => ({
          id,
          name: characterDisplayName(id)
        }))}
        onBattleStart={handleMultiplayerBattleStart}
        onBack={() => setShowMultiplayerLobby(false)}
      />
    );
  }

  const characterDisplayName = (id: string): string => {
    const names: Record<string, string> = {
      'man-in-chainmail': 'Man in Chainmail',
      'hill-troll': 'Hill Troll with Club',
    };
    return names[id] || id;
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-800 to-gray-900 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-lg w-full">
        <h1 className="text-4xl font-bold text-center text-gray-800 mb-2">
          Lost Worlds
        </h1>
        <p className="text-center text-gray-600 mb-8">
          Combat Book Game
        </p>

        {error && (
          <div className="bg-red-100 border border-red-300 text-red-700 px-4 py-3 rounded mb-4">
            {error}
          </div>
        )}

        {isLoading ? (
          <div className="text-center py-8">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-800 mx-auto"></div>
            <p className="mt-4 text-gray-600">Loading characters...</p>
          </div>
        ) : (
          <>
            {/* Game Mode */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Game Mode
              </label>
              <div className="flex gap-2">
                <button
                  onClick={() => setGameMode('ai')}
                  className={`flex-1 py-3 px-3 rounded-lg border-2 transition-all ${
                    gameMode === 'ai'
                      ? 'border-blue-500 bg-blue-50 text-blue-700'
                      : 'border-gray-300 bg-white text-gray-700 hover:border-gray-400'
                  }`}
                >
                  <div className="font-medium">🤖 vs AI</div>
                  <div className="text-xs opacity-75">Computer opponent</div>
                </button>
                <button
                  onClick={() => setGameMode('local')}
                  className={`flex-1 py-3 px-3 rounded-lg border-2 transition-all ${
                    gameMode === 'local'
                      ? 'border-blue-500 bg-blue-50 text-blue-700'
                      : 'border-gray-300 bg-white text-gray-700 hover:border-gray-400'
                  }`}
                >
                  <div className="font-medium">👥 Local</div>
                  <div className="text-xs opacity-75">Same device</div>
                </button>
                <button
                  onClick={() => setGameMode('online')}
                  className={`flex-1 py-3 px-3 rounded-lg border-2 transition-all ${
                    gameMode === 'online'
                      ? 'border-green-500 bg-green-50 text-green-700'
                      : 'border-gray-300 bg-white text-gray-700 hover:border-gray-400'
                  }`}
                >
                  <div className="font-medium">🌐 Online</div>
                  <div className="text-xs opacity-75">Play a friend</div>
                </button>
              </div>
            </div>

            {/* Player 1 Character */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Your Character
              </label>
              <select
                value={player1Char}
                onChange={(e) => setPlayer1Char(e.target.value)}
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                {availableCharacters.map((char) => (
                  <option key={char} value={char}>
                    {characterDisplayName(char)}
                  </option>
                ))}
              </select>
            </div>

            {/* Player 2 / Opponent Character - only show for non-online modes */}
            {gameMode !== 'online' && (
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {gameMode === 'ai' ? 'Opponent' : 'Player 2'} Character
                </label>
                <select
                  value={player2Char}
                  onChange={(e) => setPlayer2Char(e.target.value)}
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  {availableCharacters.map((char) => (
                    <option key={char} value={char}>
                      {characterDisplayName(char)}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {gameMode === 'online' && (
              <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg">
                <p className="text-green-800 text-sm">
                  🌐 Create or join a room to play against someone on another device!
                </p>
              </div>
            )}

            {/* Start Button */}
            <button
              onClick={handleStartGame}
              disabled={!player1Char || (gameMode !== 'online' && !player2Char)}
              className={`w-full py-4 text-white text-xl font-bold rounded-lg transition-all shadow-lg disabled:opacity-50 disabled:cursor-not-allowed ${
                gameMode === 'online'
                  ? 'bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800'
                  : 'bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800'
              }`}
            >
              {gameMode === 'online' ? 'Find Opponent' : 'Start Battle!'}
            </button>

            {/* Character Info */}
            <div className={`mt-6 grid gap-4 text-sm ${gameMode === 'online' ? 'grid-cols-1' : 'grid-cols-2'}`}>
              <CharacterCard id={player1Char} />
              {gameMode !== 'online' && <CharacterCard id={player2Char} />}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

/**
 * Character Card showing basic info
 */
const CharacterCard: React.FC<{ id: string }> = ({ id }) => {
  const stats: Record<string, { name: string; height: number; hp: number; desc: string }> = {
    'man-in-chainmail': {
      name: 'Man in Chainmail',
      height: 4,
      hp: 12,
      desc: 'Balanced fighter with shield',
    },
    'hill-troll': {
      name: 'Hill Troll',
      height: 5,
      hp: 35,
      desc: 'Powerful brute with regeneration',
    },
  };

  const char = stats[id];
  if (!char) return null;

  return (
    <div className="bg-gray-50 rounded-lg p-3 border">
      <div className="font-medium text-gray-800">{char.name}</div>
      <div className="text-xs text-gray-600 mt-1">
        <div>Height: {char.height}</div>
        <div>HP: {char.hp}</div>
        <div className="mt-1 italic">{char.desc}</div>
      </div>
    </div>
  );
};

export default MenuView;
