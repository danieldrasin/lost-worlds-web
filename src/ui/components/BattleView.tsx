/**
 * Battle View Component
 *
 * Main battle screen showing both character sheets and battle state.
 */

import React from 'react';
import { useGameStore } from '../../state/gameStore';
import { CharacterSheet } from './CharacterSheet';
import { PicturePage } from './PicturePage';

export const BattleView: React.FC = () => {
  const {
    battle,
    isVsAI,
    player1Selection,
    player2Selection,
    selectManeuver,
    executeExchange,
    resetGame,
    mode,
  } = useGameStore();

  if (!battle) {
    return <div>No battle in progress</div>;
  }

  const lastExchange = battle.history[battle.history.length - 1];
  const isGameOver = mode === 'gameover';

  // For AI games, execute automatically when player 1 selects
  const handlePlayer1Select = (maneuver: any) => {
    selectManeuver('player1', maneuver);
  };

  const canExecute = player1Selection && (isVsAI || player2Selection);

  return (
    <div className="min-h-screen bg-gray-100 p-4">
      {/* Header */}
      <div className="max-w-7xl mx-auto mb-4">
        <div className="flex justify-between items-center bg-white rounded-lg shadow p-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">Lost Worlds Combat</h1>
            <p className="text-gray-600">Round {battle.round + 1}</p>
          </div>
          <button
            onClick={resetGame}
            className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700"
          >
            New Game
          </button>
        </div>
      </div>

      {/* Battle Status */}
      <div className="max-w-7xl mx-auto mb-4">
        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex justify-between items-center">
            {/* Player 1 Status */}
            <div className="text-center">
              <div className="text-lg font-bold">{battle.player1.name}</div>
              <div className="text-3xl font-bold text-blue-600">
                {battle.player1.state.bodyPoints}
              </div>
              <div className="text-sm text-gray-500">
                / {battle.player1.state.maxBodyPoints} HP
              </div>
              <HealthBar
                current={battle.player1.state.bodyPoints}
                max={battle.player1.state.maxBodyPoints}
              />
            </div>

            {/* VS */}
            <div className="text-4xl font-bold text-gray-400">VS</div>

            {/* Player 2 Status */}
            <div className="text-center">
              <div className="text-lg font-bold">
                {battle.player2.name}
                {isVsAI && <span className="text-sm text-gray-500"> (AI)</span>}
              </div>
              <div className="text-3xl font-bold text-red-600">
                {battle.player2.state.bodyPoints}
              </div>
              <div className="text-sm text-gray-500">
                / {battle.player2.state.maxBodyPoints} HP
              </div>
              <HealthBar
                current={battle.player2.state.bodyPoints}
                max={battle.player2.state.maxBodyPoints}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Last Exchange Result - Picture Pages */}
      {lastExchange && (
        <div className="max-w-7xl mx-auto mb-4">
          <div className="bg-gray-900 rounded-lg shadow-xl p-4">
            <h3 className="text-white font-bold text-center mb-4 text-xl">
              Round {lastExchange.roundNumber} - Combat Results
            </h3>
            <div className="grid grid-cols-2 gap-6">
              {/* Player 1's view (what they see of opponent) */}
              <div>
                <div className="text-center text-gray-400 text-sm mb-2">
                  {battle.player1.name} used <span className="text-blue-400 font-bold">{lastExchange.player1Maneuver.name}</span>
                </div>
                <PicturePage
                  result={lastExchange.player1Result.picturePage}
                  characterName={battle.player1.name}
                  damage={lastExchange.player1Result.damageTaken}
                />
              </div>
              {/* Player 2's view (what they see of opponent) */}
              <div>
                <div className="text-center text-gray-400 text-sm mb-2">
                  {battle.player2.name} used <span className="text-red-400 font-bold">{lastExchange.player2Maneuver.name}</span>
                </div>
                <PicturePage
                  result={lastExchange.player2Result.picturePage}
                  characterName={battle.player2.name}
                  damage={lastExchange.player2Result.damageTaken}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Game Over */}
      {isGameOver && (
        <div className="max-w-7xl mx-auto mb-4">
          <div className="bg-green-100 border border-green-300 rounded-lg shadow p-6 text-center">
            <h2 className="text-3xl font-bold text-green-800 mb-2">Battle Over!</h2>
            <p className="text-xl">
              {battle.winner === 'player1' ? battle.player1.name : battle.player2.name} wins!
            </p>
            <button
              onClick={resetGame}
              className="mt-4 px-6 py-3 bg-green-600 text-white rounded-lg text-lg hover:bg-green-700"
            >
              Play Again
            </button>
          </div>
        </div>
      )}

      {/* Character Sheets */}
      {!isGameOver && (
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Player 1 */}
            <div>
              <div className="mb-2 text-center">
                <span className="bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm font-medium">
                  Your Turn - Select a Maneuver
                </span>
              </div>
              <CharacterSheet
                character={battle.player1}
                selectedManeuver={player1Selection}
                onSelectManeuver={handlePlayer1Select}
                disabled={isGameOver}
              />
              {player1Selection && (
                <div className="mt-2 text-center text-green-600 font-medium">
                  Selected: {player1Selection.name}
                </div>
              )}
            </div>

            {/* Player 2 */}
            <div>
              {!isVsAI && (
                <div className="mb-2 text-center">
                  <span className="bg-red-100 text-red-800 px-3 py-1 rounded-full text-sm font-medium">
                    Player 2 - Select a Maneuver
                  </span>
                </div>
              )}
              {isVsAI ? (
                <div className="bg-gray-200 rounded-lg p-4 text-center">
                  <div className="text-gray-600 mb-2">AI Opponent</div>
                  <div className="text-2xl font-bold">{battle.player2.name}</div>
                  <div className="text-gray-500 mt-2">
                    The AI will choose randomly from valid moves
                  </div>
                </div>
              ) : (
                <CharacterSheet
                  character={battle.player2}
                  selectedManeuver={player2Selection}
                  onSelectManeuver={(m) => selectManeuver('player2', m)}
                  disabled={isGameOver}
                />
              )}
            </div>
          </div>

          {/* Execute Button */}
          <div className="mt-6 text-center">
            <button
              onClick={executeExchange}
              disabled={!canExecute}
              className={`
                px-8 py-4 text-xl font-bold rounded-lg shadow-lg
                ${canExecute
                  ? 'bg-green-600 text-white hover:bg-green-700'
                  : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                }
              `}
            >
              {isVsAI ? 'Fight!' : 'Execute Exchange'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

/**
 * Health Bar Component
 */
const HealthBar: React.FC<{ current: number; max: number }> = ({ current, max }) => {
  const percentage = Math.max(0, Math.min(100, (current / max) * 100));
  const color = percentage > 50 ? 'bg-green-500' : percentage > 25 ? 'bg-yellow-500' : 'bg-red-500';

  return (
    <div className="w-32 h-3 bg-gray-200 rounded-full overflow-hidden mt-1">
      <div
        className={`h-full ${color} transition-all duration-300`}
        style={{ width: `${percentage}%` }}
      />
    </div>
  );
};

export default BattleView;
