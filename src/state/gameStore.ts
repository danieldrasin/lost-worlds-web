/**
 * Game State Store for Lost Worlds Combat Game
 *
 * Uses Zustand for state management.
 */

import { create } from 'zustand';
import type { Character, Battle, Maneuver } from '../domain/types';
import { loadCharacter, getAvailableCharacters } from '../data/characterLoader';
import { resolveExchange, applyExchange } from '../domain/models/BattleEngine';

export type GameMode = 'menu' | 'selecting' | 'battle' | 'gameover';

interface GameState {
  // Core state
  mode: GameMode;
  availableCharacters: string[];
  battle: Battle | null;
  isVsAI: boolean;

  // Selection state
  player1Selection: Maneuver | null;
  player2Selection: Maneuver | null;

  // Loading state
  isLoading: boolean;
  error: string | null;

  // Actions
  initialize: () => Promise<void>;
  startBattle: (player1Id: string, player2Id: string, vsAI: boolean) => Promise<void>;
  selectManeuver: (player: 'player1' | 'player2', maneuver: Maneuver) => void;
  executeExchange: () => void;
  resetGame: () => void;

  // AI
  getAIMove: () => Maneuver | null;
}

export const useGameStore = create<GameState>((set, get) => ({
  // Initial state
  mode: 'menu',
  availableCharacters: [],
  battle: null,
  isVsAI: false,
  player1Selection: null,
  player2Selection: null,
  isLoading: false,
  error: null,

  // Initialize - load available characters
  initialize: async () => {
    set({ isLoading: true, error: null });
    try {
      const characters = await getAvailableCharacters();
      set({ availableCharacters: characters, isLoading: false });
    } catch (err) {
      set({ error: `Failed to load characters: ${err}`, isLoading: false });
    }
  },

  // Start a new battle
  startBattle: async (player1Id: string, player2Id: string, vsAI: boolean) => {
    set({ isLoading: true, error: null });
    try {
      const [player1, player2] = await Promise.all([
        loadCharacter(player1Id),
        loadCharacter(player2Id),
      ]);

      const battle: Battle = {
        id: `battle_${Date.now()}`,
        player1,
        player2,
        round: 0,
        status: 'AWAITING_MOVES',
        history: [],
        winner: null,
        isVsAI: vsAI,
      };

      set({
        battle,
        isVsAI: vsAI,
        mode: 'battle',
        player1Selection: null,
        player2Selection: null,
        isLoading: false,
      });
    } catch (err) {
      set({ error: `Failed to start battle: ${err}`, isLoading: false });
    }
  },

  // Select a maneuver
  selectManeuver: (player, maneuver) => {
    if (player === 'player1') {
      set({ player1Selection: maneuver });
    } else {
      set({ player2Selection: maneuver });
    }
  },

  // Execute the exchange
  executeExchange: () => {
    const { battle, player1Selection, player2Selection, isVsAI } = get();

    if (!battle || !player1Selection) {
      return;
    }

    // If vs AI and no player 2 selection, get AI move
    let p2Move = player2Selection;
    if (isVsAI && !p2Move) {
      p2Move = get().getAIMove();
    }

    if (!p2Move) {
      return;
    }

    try {
      // Resolve the exchange
      const exchange = resolveExchange(battle, player1Selection, p2Move);

      // Apply to battle
      const newBattle = applyExchange(battle, exchange);

      // Update state
      set({
        battle: newBattle,
        player1Selection: null,
        player2Selection: null,
        mode: newBattle.status === 'GAME_OVER' ? 'gameover' : 'battle',
      });
    } catch (err) {
      set({ error: `Failed to resolve exchange: ${err}` });
    }
  },

  // Reset game
  resetGame: () => {
    set({
      mode: 'menu',
      battle: null,
      player1Selection: null,
      player2Selection: null,
      error: null,
    });
  },

  // Get AI move (simple random selection)
  getAIMove: () => {
    const { battle } = get();
    if (!battle) return null;

    const validMoves = getValidMovesForCharacter(battle.player2);
    if (validMoves.length === 0) return null;

    // Simple AI: random valid move
    const randomIndex = Math.floor(Math.random() * validMoves.length);
    return validMoves[randomIndex];
  },
}));

/**
 * Get valid moves for a character based on current state
 */
function getValidMovesForCharacter(character: Character): Maneuver[] {
  const { state, sheet } = character;

  return sheet.maneuvers.filter(maneuver => {
    // Check weapon requirement
    if (!state.hasWeapon) {
      const category = maneuver.category;
      const name = maneuver.name.toUpperCase();

      // Without weapon, limited moves
      if (category !== 'JUMP' && category !== 'RAGE') {
        if (category !== 'SPECIAL' || (!name.includes('KICK') && !name.includes('RETRIEVE'))) {
          return false;
        }
      }
    }

    // Check all active restrictions
    for (const activeRestriction of state.activeRestrictions) {
      if (!checkManeuverAgainstRestriction(maneuver, activeRestriction.restriction)) {
        return false;
      }
    }

    return true;
  });
}

/**
 * Check if a maneuver passes a restriction
 */
function checkManeuverAgainstRestriction(maneuver: Maneuver, restriction: any): boolean {
  switch (restriction.type) {
    case 'NONE':
      return true;

    case 'NO_CATEGORY':
      return !restriction.categories.includes(maneuver.category);

    case 'ONLY_CATEGORY':
      return restriction.categories.includes(maneuver.category);

    case 'NO_COLOR':
      return !restriction.colors.includes(maneuver.color);

    case 'ONLY_COLOR':
      return restriction.colors.includes(maneuver.color);

    case 'NO_NAME':
      return !restriction.names.some((name: string) =>
        maneuver.name.toUpperCase().includes(name.toUpperCase())
      );

    case 'ONLY_NAME':
      return restriction.names.some((name: string) =>
        maneuver.name.toUpperCase().includes(name.toUpperCase())
      );

    case 'AND':
      return restriction.children.every((child: any) =>
        checkManeuverAgainstRestriction(maneuver, child)
      );

    case 'OR':
      return restriction.children.some((child: any) =>
        checkManeuverAgainstRestriction(maneuver, child)
      );

    default:
      return true;
  }
}

// Export helper to get valid moves
export { getValidMovesForCharacter };
