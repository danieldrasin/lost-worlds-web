/**
 * Battle Types for Lost Worlds Combat Game
 *
 * Battles are the core gameplay loop:
 * 1. Both players simultaneously select maneuvers
 * 2. The exchange is resolved using the lookup tables
 * 3. Effects are applied (damage, restrictions, etc.)
 * 4. Repeat until one character is defeated
 */

import type { Character, CharacterState } from './character';
import type { Maneuver } from './maneuver';
import type { PicturePageResult, Effect } from './effects';
import type { ActiveRestriction } from './restrictions';

/**
 * Battle status
 */
export type BattleStatus =
  | 'SETUP'           // Selecting characters
  | 'AWAITING_MOVES'  // Waiting for move selection
  | 'RESOLVING'       // Computing exchange result
  | 'SHOW_RESULTS'    // Displaying results
  | 'GAME_OVER';      // Battle finished

/**
 * A single exchange (round) in battle
 */
export interface BattleExchange {
  roundNumber: number;
  player1Maneuver: Maneuver;
  player2Maneuver: Maneuver;
  player1Page: number;      // Page number used for lookup
  player2Page: number;      // Page number used for lookup
  player1Result: ExchangeResult;
  player2Result: ExchangeResult;
  timestamp: number;
}

/**
 * Result for one player in an exchange
 */
export interface ExchangeResult {
  picturePage: PicturePageResult;
  damageTaken: number;
  damageDealt: number;
  effectsApplied: Effect[];
  newRestrictions: ActiveRestriction[];
  stateAfter: CharacterState;
}

/**
 * Move selection for one player
 */
export interface MoveSelection {
  character: Character;
  maneuver: Maneuver;
  pageNumber: number;  // Which page to use (normal or extended based on range)
}

/**
 * Full battle state
 */
export interface Battle {
  id: string;
  player1: Character;
  player2: Character;
  round: number;
  status: BattleStatus;
  history: BattleExchange[];
  winner: 'player1' | 'player2' | null;
  isVsAI: boolean;
}

/**
 * Create a new battle between two characters
 */
export function createBattle(
  player1: Character,
  player2: Character,
  isVsAI: boolean = false
): Battle {
  return {
    id: generateBattleId(),
    player1,
    player2,
    round: 0,
    status: 'AWAITING_MOVES',
    history: [],
    winner: null,
    isVsAI,
  };
}

/**
 * Generate a unique battle ID
 */
function generateBattleId(): string {
  return `battle_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Check if battle is over
 */
export function isBattleOver(battle: Battle): boolean {
  return battle.player1.state.bodyPoints <= 0 || battle.player2.state.bodyPoints <= 0;
}

/**
 * Get the winner of a battle (if any)
 */
export function getWinner(battle: Battle): 'player1' | 'player2' | null {
  if (battle.player1.state.bodyPoints <= 0 && battle.player2.state.bodyPoints <= 0) {
    // Both dead - whoever has more HP wins (or tie goes to... player 2?)
    return battle.player1.state.bodyPoints > battle.player2.state.bodyPoints ? 'player1' : 'player2';
  }
  if (battle.player1.state.bodyPoints <= 0) {
    return 'player2';
  }
  if (battle.player2.state.bodyPoints <= 0) {
    return 'player1';
  }
  return null;
}

/**
 * Calculate damage after modifiers
 */
export function calculateDamage(
  baseDamage: number,
  maneuverModifier: number,
  heightModifier: number,
  attackerModifiers: Effect[],
  targetManeuver: Maneuver
): number {
  let damage = baseDamage + maneuverModifier + heightModifier;

  // Apply damage modifiers (from previous round effects)
  for (const effect of attackerModifiers) {
    if (effect.type === 'NEXT_TURN_DAMAGE_MODIFIER') {
      // Check if modifier applies to this attack
      const applies =
        (!effect.forColor || effect.forColor === targetManeuver.color) &&
        (!effect.forCategory || effect.forCategory === targetManeuver.category);

      if (applies) {
        damage += effect.amount;
      }
    }
  }

  // Damage cannot go below 0
  return Math.max(0, damage);
}

/**
 * Calculate height modifier
 * In Lost Worlds, taller characters deal more damage with certain moves
 */
export function calculateHeightModifier(
  attackerHeight: number,
  defenderHeight: number,
  maneuver: Maneuver
): number {
  // Height modifier only applies to certain color moves
  // (This is simplified - the original game had more complex rules)
  const usesHeightModifier = ['orange', 'red', 'blue'].includes(maneuver.color);

  if (!usesHeightModifier) {
    return 0;
  }

  return attackerHeight - defenderHeight;
}

/**
 * Get the page number to use for a maneuver based on range state
 */
export function getManeuverPage(maneuver: Maneuver, _isExtendedRange: boolean): number {
  // In the original game, some maneuvers use different pages at extended range
  // For simplicity, we'll use the normal page (extended range pages were for multi-character combat)
  return maneuver.normalPage;
}
