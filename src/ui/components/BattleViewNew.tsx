/**
 * Battle View Component - Redesigned
 *
 * Implements the authentic Lost Worlds book mechanic:
 * - You look at your OPPONENT's book (see pictures of them)
 * - The picture shows the RESULT of their maneuver against you
 *
 * Desktop: Two-panel layout (your moves | opponent's picture)
 * Mobile: Bottom tabs (View | Move | History)
 */

import React, { useState, useEffect } from 'react';
import { useGameStore, getValidMovesForCharacter } from '../../state/gameStore';
import { PicturePage } from './PicturePage';
import * as socket from '../../multiplayer/socket';
import type { Maneuver, BattleExchange } from '../../domain/types';

type MobileTab = 'view' | 'move' | 'history';

export const BattleViewNew: React.FC = () => {
  const {
    battle,
    isVsAI,
    isMultiplayer,
    isHost,
    opponentReady,
    waitingForOpponent,
    player1Selection,
    selectManeuver,
    executeExchange,
    setWaitingForOpponent,
    setOpponentReady,
    applyMultiplayerExchange,
    resetGame,
    mode,
  } = useGameStore();

  const [mobileTab, setMobileTab] = useState<MobileTab>('view');
  const [isConnected, setIsConnected] = useState(true);

  // Track socket connection status for multiplayer
  useEffect(() => {
    if (!isMultiplayer) return;

    const sock = socket.getSocket();
    if (sock) {
      // Set initial state
      setIsConnected(sock.connected);

      // Listen for connection changes
      const handleConnect = () => {
        console.log('Socket reconnected');
        setIsConnected(true);
      };
      const handleDisconnect = () => {
        console.log('Socket disconnected');
        setIsConnected(false);
      };

      sock.on('connect', handleConnect);
      sock.on('disconnect', handleDisconnect);

      return () => {
        sock.off('connect', handleConnect);
        sock.off('disconnect', handleDisconnect);
      };
    }
  }, [isMultiplayer]);

  // Set up multiplayer event listeners
  useEffect(() => {
    if (!isMultiplayer) return;

    // Opponent has submitted their move (but we don't see it yet)
    socket.onOpponentReady(() => {
      console.log('Opponent is ready!');
      setOpponentReady(true);
    });

    // Both moves revealed - resolve the exchange
    socket.onMovesRevealed(({ hostMove, guestMove }) => {
      console.log('Moves revealed:', { hostMove, guestMove });
      // I'm player1 in my view, so my move depends on whether I'm host
      const myMove = isHost ? hostMove : guestMove;
      const oppMove = isHost ? guestMove : hostMove;
      applyMultiplayerExchange(myMove, oppMove);
    });

    return () => {
      // Clean up listeners when component unmounts or multiplayer changes
    };
  }, [isMultiplayer, isHost, setOpponentReady, applyMultiplayerExchange]);

  if (!battle) {
    return <div className="min-h-screen bg-gray-900 flex items-center justify-center text-white">No battle in progress</div>;
  }

  const lastExchange = battle.history[battle.history.length - 1];
  const isGameOver = mode === 'gameover';
  const myCharacter = battle.player1;
  const opponent = battle.player2;

  // What I see: The result from OPPONENT's book showing THEM
  // This is the picture page that results from the lookup
  const opponentPicture = lastExchange?.player2Result.picturePage;

  const validMoves = getValidMovesForCharacter(myCharacter);
  // In multiplayer, also require connection to fight
  const canFight = player1Selection !== null && !waitingForOpponent && (!isMultiplayer || isConnected);

  const handleSelectMove = (maneuver: Maneuver) => {
    selectManeuver('player1', maneuver);
    // On mobile, switch to view tab after selecting
    if (window.innerWidth < 1024) {
      setMobileTab('view');
    }
  };

  const handleFight = async () => {
    if (isMultiplayer) {
      // In multiplayer, send move to server and wait
      if (!player1Selection) return;

      setWaitingForOpponent(true);
      const result = await socket.submitMove(player1Selection);

      if (!result.success) {
        console.error('Failed to submit move:', result.error);
        setWaitingForOpponent(false);
      }
      // The exchange will be resolved when we receive 'moves-revealed' event
    } else {
      // Local game - execute immediately
      executeExchange();
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 flex flex-col">
      {/* Status Bar - Always visible */}
      <StatusBar
        myName={myCharacter.name}
        myHP={myCharacter.state.bodyPoints}
        myMaxHP={myCharacter.state.maxBodyPoints}
        oppName={opponent.name}
        oppHP={opponent.state.bodyPoints}
        oppMaxHP={opponent.state.maxBodyPoints}
        isVsAI={isVsAI}
        isMultiplayer={isMultiplayer}
        round={battle.round}
        onNewGame={resetGame}
      />

      {/* Connection Warning Banner */}
      {isMultiplayer && !isConnected && (
        <div className="bg-red-900/90 border-b border-red-700 px-4 py-2 text-center">
          <span className="text-red-200 text-sm">
            ⚠️ Disconnected from server - reconnecting...
          </span>
        </div>
      )}

      {/* Game Over Overlay */}
      {isGameOver && (
        <GameOverOverlay
          winner={battle.winner === 'player1' ? myCharacter.name : opponent.name}
          onPlayAgain={resetGame}
        />
      )}

      {/* Desktop Layout (lg and up) */}
      <div className="hidden lg:flex flex-1 p-4 gap-4">
        {/* Left: My Move Selection */}
        <div className="w-1/3 flex flex-col">
          <div className="bg-gray-800 rounded-lg p-4 flex-1 overflow-auto">
            <h2 className="text-white font-bold mb-3 text-center">Your Moves</h2>
            <MoveSelector
              character={myCharacter}
              validMoves={validMoves}
              selectedMove={player1Selection}
              onSelect={handleSelectMove}
              disabled={isGameOver}
            />
          </div>
          {player1Selection && (
            <div className="mt-4 text-center">
              <div className="text-green-400 mb-2">
                Selected: <span className="font-bold">{player1Selection.name}</span>
              </div>
              {waitingForOpponent ? (
                <div className="px-8 py-3 bg-yellow-600 text-white font-bold text-xl rounded-lg">
                  <div className="flex items-center justify-center gap-2">
                    <div className="animate-spin w-5 h-5 border-2 border-white border-t-transparent rounded-full" />
                    Waiting for opponent...
                    {opponentReady && <span className="text-green-300">✓ Ready!</span>}
                  </div>
                </div>
              ) : isMultiplayer && !isConnected ? (
                <div className="px-8 py-3 bg-red-800 text-white font-bold text-xl rounded-lg">
                  <div className="flex items-center justify-center gap-2">
                    <div className="animate-pulse w-3 h-3 bg-red-400 rounded-full" />
                    Reconnecting...
                  </div>
                </div>
              ) : (
                <button
                  onClick={handleFight}
                  disabled={!canFight || isGameOver}
                  className="px-8 py-3 bg-red-600 text-white font-bold text-xl rounded-lg
                           hover:bg-red-700 disabled:bg-gray-600 disabled:cursor-not-allowed
                           transition-colors shadow-lg"
                >
                  ⚔️ FIGHT!
                </button>
              )}
            </div>
          )}
        </div>

        {/* Right: Opponent's Picture (What I See) */}
        <div className="w-2/3 flex flex-col">
          <div className="bg-gray-800 rounded-lg p-4 flex-1 flex flex-col">
            <h2 className="text-white font-bold mb-3 text-center">
              What You See <span className="text-gray-400 text-sm">(Opponent's Book)</span>
            </h2>
            <div className="flex-1 flex items-center justify-center">
              {opponentPicture ? (
                <div className="max-w-md w-full">
                  <PicturePage
                    result={opponentPicture}
                    characterName={opponent.name}
                    damage={lastExchange?.player1Result.damageTaken}
                  />
                  <div className="mt-4 text-center text-gray-400 text-sm">
                    {opponent.name} used <span className="text-white font-bold">{lastExchange?.player2Maneuver.name}</span>
                    {lastExchange?.player1Result.damageTaken > 0 && (
                      <span className="text-red-400"> — You took {lastExchange.player1Result.damageTaken} damage!</span>
                    )}
                  </div>
                </div>
              ) : (
                <div className="text-gray-500 text-center">
                  <div className="text-6xl mb-4">📖</div>
                  <div>Select your move and fight!</div>
                  <div className="text-sm mt-2">The opponent's result will appear here</div>
                </div>
              )}
            </div>
          </div>

          {/* History Panel */}
          {battle.history.length > 0 && (
            <div className="mt-4 bg-gray-800 rounded-lg p-3">
              <h3 className="text-white font-bold text-sm mb-2">Recent History</h3>
              <HistoryList history={battle.history.slice(-3)} myName={myCharacter.name} oppName={opponent.name} />
            </div>
          )}
        </div>
      </div>

      {/* Mobile Layout (below lg) */}
      <div className="lg:hidden flex-1 flex flex-col">
        {/* Content Area */}
        <div className="flex-1 overflow-auto p-4">
          {mobileTab === 'view' && (
            <MobileViewTab
              opponentPicture={opponentPicture}
              opponent={opponent}
              lastExchange={lastExchange}
              selectedMove={player1Selection}
              canFight={canFight}
              isGameOver={isGameOver}
              onFight={handleFight}
              waitingForOpponent={waitingForOpponent}
              opponentReady={opponentReady}
              isMultiplayer={isMultiplayer}
              isConnected={isConnected}
            />
          )}
          {mobileTab === 'move' && (
            <MobileMoveTab
              character={myCharacter}
              validMoves={validMoves}
              selectedMove={player1Selection}
              onSelect={handleSelectMove}
              disabled={isGameOver}
            />
          )}
          {mobileTab === 'history' && (
            <MobileHistoryTab
              history={battle.history}
              myName={myCharacter.name}
              oppName={opponent.name}
            />
          )}
        </div>

        {/* Bottom Tab Bar */}
        <div className="bg-gray-800 border-t border-gray-700 safe-area-bottom">
          <div className="flex">
            <TabButton
              icon="👁️"
              label="View"
              active={mobileTab === 'view'}
              onClick={() => setMobileTab('view')}
              badge={opponentPicture ? undefined : undefined}
            />
            <TabButton
              icon="⚔️"
              label="Move"
              active={mobileTab === 'move'}
              onClick={() => setMobileTab('move')}
              badge={player1Selection ? '✓' : undefined}
            />
            <TabButton
              icon="📜"
              label="History"
              active={mobileTab === 'history'}
              onClick={() => setMobileTab('history')}
              badge={battle.history.length > 0 ? String(battle.history.length) : undefined}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

// ============================================
// Sub-components
// ============================================

interface StatusBarProps {
  myName: string;
  myHP: number;
  myMaxHP: number;
  oppName: string;
  oppHP: number;
  oppMaxHP: number;
  isVsAI: boolean;
  isMultiplayer?: boolean;
  round: number;
  onNewGame: () => void;
}

const StatusBar: React.FC<StatusBarProps> = ({
  myName, myHP, myMaxHP, oppName, oppHP, oppMaxHP, isVsAI, isMultiplayer, round, onNewGame
}) => (
  <div className="bg-gray-800 border-b border-gray-700 px-4 py-2 safe-area-top">
    <div className="flex items-center justify-between max-w-4xl mx-auto">
      {/* My Stats */}
      <div className="flex items-center gap-2">
        <span className="text-blue-400 font-bold text-sm truncate max-w-24">{myName}</span>
        <HPBar current={myHP} max={myMaxHP} color="blue" />
        <span className="text-white font-mono text-sm">{myHP}</span>
      </div>

      {/* Round / Menu */}
      <div className="flex items-center gap-2">
        <span className="text-gray-400 text-xs">R{round + 1}</span>
        <button
          onClick={onNewGame}
          className="text-gray-400 hover:text-white p-1"
          title="New Game"
        >
          ✕
        </button>
      </div>

      {/* Opponent Stats */}
      <div className="flex items-center gap-2">
        <span className="text-white font-mono text-sm">{oppHP}</span>
        <HPBar current={oppHP} max={oppMaxHP} color="red" />
        <span className="text-red-400 font-bold text-sm truncate max-w-24">
          {oppName}
          {isVsAI && <span className="text-gray-500 text-xs ml-1">AI</span>}
          {isMultiplayer && <span className="text-green-400 text-xs ml-1">🌐</span>}
        </span>
      </div>
    </div>
  </div>
);

const HPBar: React.FC<{ current: number; max: number; color: 'blue' | 'red' }> = ({ current, max, color }) => {
  const pct = Math.max(0, Math.min(100, (current / max) * 100));
  const bgColor = color === 'blue' ? 'bg-blue-500' : 'bg-red-500';
  const lowColor = pct <= 25 ? 'bg-red-600' : pct <= 50 ? 'bg-yellow-500' : bgColor;

  return (
    <div className="w-16 h-2 bg-gray-600 rounded-full overflow-hidden">
      <div className={`h-full ${lowColor} transition-all duration-300`} style={{ width: `${pct}%` }} />
    </div>
  );
};

interface MoveSelectorProps {
  character: any;
  validMoves: Maneuver[];
  selectedMove: Maneuver | null;
  onSelect: (m: Maneuver) => void;
  disabled: boolean;
}

const MoveSelector: React.FC<MoveSelectorProps> = ({ character, validMoves, selectedMove, onSelect, disabled }) => {
  const validIds = new Set(validMoves.map(m => m.id));

  // Group by category
  const grouped = new Map<string, Maneuver[]>();
  for (const m of character.sheet.maneuvers) {
    const list = grouped.get(m.category) || [];
    list.push(m);
    grouped.set(m.category, list);
  }

  const categoryOrder = ['DOWN_SWING', 'SIDE_SWING', 'THRUST', 'FAKE', 'PROTECTED_ATTACK', 'RAGE', 'SPECIAL', 'SHIELD_BLOCK', 'JUMP', 'EXTENDED_RANGE'];
  const categoryNames: Record<string, string> = {
    DOWN_SWING: 'Down Swing', SIDE_SWING: 'Side Swing', THRUST: 'Thrust',
    FAKE: 'Fake', PROTECTED_ATTACK: 'Protected', RAGE: 'Rage',
    SPECIAL: 'Special', SHIELD_BLOCK: 'Block', JUMP: 'Jump', EXTENDED_RANGE: 'Extended'
  };

  return (
    <div className="space-y-3">
      {categoryOrder.map(cat => {
        const moves = grouped.get(cat);
        if (!moves || moves.length === 0) return null;

        return (
          <div key={cat}>
            <div className="text-gray-400 text-xs font-bold mb-1">{categoryNames[cat] || cat}</div>
            <div className="flex flex-wrap gap-1">
              {moves.map(m => {
                const isValid = validIds.has(m.id);
                const isSelected = selectedMove?.id === m.id;
                return (
                  <button
                    key={m.id}
                    onClick={() => isValid && !disabled && onSelect(m)}
                    disabled={!isValid || disabled}
                    className={`
                      px-2 py-1 text-xs rounded border transition-all
                      ${isSelected ? 'ring-2 ring-yellow-400' : ''}
                      ${isValid
                        ? 'bg-gray-700 text-white hover:bg-gray-600 border-gray-600'
                        : 'bg-gray-800 text-gray-500 line-through border-gray-700 cursor-not-allowed'}
                    `}
                    style={isValid ? { borderLeftColor: getColorHex(m.color), borderLeftWidth: 3 } : {}}
                  >
                    {m.name}
                    {m.modifier !== 0 && (
                      <span className="ml-1 opacity-75">{m.modifier > 0 ? `+${m.modifier}` : m.modifier}</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
};

interface HistoryListProps {
  history: BattleExchange[];
  myName: string;
  oppName: string;
}

const HistoryList: React.FC<HistoryListProps> = ({ history, myName, oppName }) => (
  <div className="space-y-2 text-sm">
    {history.map((ex, i) => (
      <div key={i} className="text-gray-300 border-l-2 border-gray-600 pl-2">
        <div className="text-gray-500 text-xs">Round {ex.roundNumber}</div>
        <div>
          <span className="text-blue-400">{myName}</span>: {ex.player1Maneuver.name}
          {ex.player1Result.damageTaken > 0 && <span className="text-red-400 ml-1">(-{ex.player1Result.damageTaken})</span>}
        </div>
        <div>
          <span className="text-red-400">{oppName}</span>: {ex.player2Maneuver.name}
          {ex.player2Result.damageTaken > 0 && <span className="text-red-400 ml-1">(-{ex.player2Result.damageTaken})</span>}
        </div>
      </div>
    ))}
  </div>
);

// Mobile-specific components

interface MobileViewTabProps {
  opponentPicture: any;
  opponent: any;
  lastExchange: BattleExchange | undefined;
  selectedMove: Maneuver | null;
  canFight: boolean;
  isGameOver: boolean;
  onFight: () => void;
  waitingForOpponent?: boolean;
  opponentReady?: boolean;
  isMultiplayer?: boolean;
  isConnected?: boolean;
}

const MobileViewTab: React.FC<MobileViewTabProps> = ({
  opponentPicture, opponent, lastExchange, selectedMove, canFight, isGameOver, onFight,
  waitingForOpponent = false, opponentReady = false, isMultiplayer = false, isConnected = true
}) => (
  <div className="flex flex-col h-full">
    <div className="flex-1 flex flex-col items-center justify-center">
      {opponentPicture ? (
        <>
          <div className="w-full max-w-sm">
            <PicturePage
              result={opponentPicture}
              characterName={opponent.name}
              damage={lastExchange?.player1Result.damageTaken}
            />
          </div>
          <div className="mt-3 text-center text-gray-400 text-sm">
            {opponent.name} used <span className="text-white font-bold">{lastExchange?.player2Maneuver.name}</span>
          </div>
        </>
      ) : (
        <div className="text-gray-500 text-center">
          <div className="text-6xl mb-4">📖</div>
          <div>Swipe to "Move" tab to select your attack</div>
        </div>
      )}
    </div>

    {/* Fight button area */}
    <div className="mt-4 text-center">
      {selectedMove && (
        <div className="text-green-400 mb-2 text-sm">
          Your move: <span className="font-bold">{selectedMove.name}</span>
        </div>
      )}
      {waitingForOpponent ? (
        <div className="w-full max-w-xs py-4 mx-auto bg-yellow-600 text-white font-bold text-xl rounded-lg">
          <div className="flex items-center justify-center gap-2">
            <div className="animate-spin w-5 h-5 border-2 border-white border-t-transparent rounded-full" />
            Waiting...
            {opponentReady && <span className="text-green-300">✓</span>}
          </div>
        </div>
      ) : isMultiplayer && !isConnected ? (
        <div className="w-full max-w-xs py-4 mx-auto bg-red-800 text-white font-bold text-xl rounded-lg">
          <div className="flex items-center justify-center gap-2">
            <div className="animate-pulse w-3 h-3 bg-red-400 rounded-full" />
            Reconnecting...
          </div>
        </div>
      ) : (
        <button
          onClick={onFight}
          disabled={!canFight || isGameOver}
          className={`
            w-full max-w-xs py-4 font-bold text-xl rounded-lg transition-colors shadow-lg
            ${canFight && !isGameOver
              ? 'bg-red-600 text-white hover:bg-red-700'
              : 'bg-gray-700 text-gray-400 cursor-not-allowed'}
          `}
        >
          ⚔️ FIGHT!
        </button>
      )}
    </div>
  </div>
);

const MobileMoveTab: React.FC<MoveSelectorProps> = (props) => (
  <div>
    <h2 className="text-white font-bold mb-3 text-center">Select Your Move</h2>
    <MoveSelector {...props} />
  </div>
);

const MobileHistoryTab: React.FC<HistoryListProps> = ({ history, myName, oppName }) => (
  <div>
    <h2 className="text-white font-bold mb-3 text-center">Battle History</h2>
    {history.length === 0 ? (
      <div className="text-gray-500 text-center">No moves yet</div>
    ) : (
      <HistoryList history={[...history].reverse()} myName={myName} oppName={oppName} />
    )}
  </div>
);

interface TabButtonProps {
  icon: string;
  label: string;
  active: boolean;
  onClick: () => void;
  badge?: string;
}

const TabButton: React.FC<TabButtonProps> = ({ icon, label, active, onClick, badge }) => (
  <button
    onClick={onClick}
    className={`
      flex-1 py-3 flex flex-col items-center justify-center relative
      ${active ? 'text-white bg-gray-700' : 'text-gray-400'}
    `}
  >
    <span className="text-xl">{icon}</span>
    <span className="text-xs mt-1">{label}</span>
    {badge && (
      <span className="absolute top-1 right-1/4 bg-green-500 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center">
        {badge}
      </span>
    )}
  </button>
);

const GameOverOverlay: React.FC<{ winner: string; onPlayAgain: () => void }> = ({ winner, onPlayAgain }) => (
  <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
    <div className="bg-gray-800 rounded-xl p-8 text-center max-w-sm w-full">
      <div className="text-6xl mb-4">🏆</div>
      <h2 className="text-3xl font-bold text-white mb-2">Victory!</h2>
      <p className="text-xl text-yellow-400 mb-6">{winner} wins!</p>
      <button
        onClick={onPlayAgain}
        className="px-8 py-3 bg-green-600 text-white font-bold rounded-lg hover:bg-green-700"
      >
        Play Again
      </button>
    </div>
  </div>
);

// Helper
function getColorHex(color: string): string {
  const colors: Record<string, string> = {
    red: '#dc2626', blue: '#2563eb', orange: '#ea580c', green: '#16a34a',
    yellow: '#eab308', white: '#f5f5f5', black: '#1f2937', brown: '#78350f'
  };
  return colors[color] || '#6b7280';
}

export default BattleViewNew;
