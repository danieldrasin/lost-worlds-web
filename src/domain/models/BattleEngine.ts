/**
 * Battle Engine for Lost Worlds Combat Game
 *
 * This is the core game engine that resolves combat exchanges.
 * It implements the page lookup system and applies effects.
 */

import type {
  Character,
  CharacterState,
  Maneuver,
  Battle,
  BattleExchange,
  ExchangeResult,
  PicturePageResult,
  Effect,
  ActiveRestriction,
} from '../types';

/**
 * Resolve a combat exchange between two characters
 */
export function resolveExchange(
  battle: Battle,
  player1Maneuver: Maneuver,
  player2Maneuver: Maneuver
): BattleExchange {
  const { player1, player2 } = battle;

  // Get page numbers based on range state
  const player1Page = getManeuverPage(player1Maneuver, player1.state.isExtendedRange);
  const player2Page = getManeuverPage(player2Maneuver, player2.state.isExtendedRange);

  // Look up results for each player
  const player1PictureResult = lookupResult(player1, player1Page, player2Page);
  const player2PictureResult = lookupResult(player2, player2Page, player1Page);

  // Calculate damage
  const heightMod1to2 = player1.height - player2.height;
  const heightMod2to1 = player2.height - player1.height;

  const player1Damage = calculateDamage(
    player2PictureResult,  // Damage TO player 1 comes from player 2's result against them
    player2Maneuver,
    heightMod2to1,
    player2.state.damageModifiers
  );

  const player2Damage = calculateDamage(
    player1PictureResult,  // Damage TO player 2 comes from player 1's result against them
    player1Maneuver,
    heightMod1to2,
    player1.state.damageModifiers
  );

  // Create new states with damage applied
  const player1NewState = applyExchangeResult(
    player1.state,
    player1PictureResult,  // Player 1's state is affected by THEIR result page
    player1Damage,
    player2Damage > 0      // Did player 1 score damage?
  );

  const player2NewState = applyExchangeResult(
    player2.state,
    player2PictureResult,  // Player 2's state is affected by THEIR result page
    player2Damage,
    player1Damage > 0      // Did player 2 score damage?
  );

  // Build exchange results
  const player1Result: ExchangeResult = {
    picturePage: player1PictureResult,
    damageTaken: player1Damage,
    damageDealt: player2Damage,
    effectsApplied: player1PictureResult.effects,
    newRestrictions: extractRestrictions(player1PictureResult),
    stateAfter: player1NewState,
  };

  const player2Result: ExchangeResult = {
    picturePage: player2PictureResult,
    damageTaken: player2Damage,
    damageDealt: player1Damage,
    effectsApplied: player2PictureResult.effects,
    newRestrictions: extractRestrictions(player2PictureResult),
    stateAfter: player2NewState,
  };

  return {
    roundNumber: battle.round + 1,
    player1Maneuver,
    player2Maneuver,
    player1Page,
    player2Page,
    player1Result,
    player2Result,
    timestamp: Date.now(),
  };
}

/**
 * Get the page number for a maneuver based on range state
 */
function getManeuverPage(maneuver: Maneuver, _isExtendedRange: boolean): number {
  // For now, we use normalPage. Extended pages were for multi-character combat.
  return maneuver.normalPage;
}

/**
 * Look up the result page when I use myPage against opponent's opponentPage
 */
function lookupResult(
  character: Character,
  myPage: number,
  opponentPage: number
): PicturePageResult {
  const lookupPage = character.book.lookupPages.get(myPage);
  if (!lookupPage) {
    throw new Error(`Lookup page ${myPage} not found for ${character.name}`);
  }

  const resultPageNumber = lookupPage.mapping[opponentPage];
  if (resultPageNumber === undefined || resultPageNumber === 0) {
    // 0 means no result (shouldn't happen in valid gameplay)
    throw new Error(`No mapping for opponent page ${opponentPage} on lookup page ${myPage}`);
  }

  const picturePage = character.book.picturePages.get(resultPageNumber);
  if (!picturePage) {
    throw new Error(`Picture page ${resultPageNumber} not found for ${character.name}`);
  }

  return picturePage;
}

/**
 * Calculate total damage from a result
 */
function calculateDamage(
  result: PicturePageResult,
  attackerManeuver: Maneuver,
  heightModifier: number,
  damageModifiers: Effect[]
): number {
  // Base damage from picture page
  let damage = result.damage ?? 0;

  // Add maneuver modifier
  damage += attackerManeuver.modifier;

  // Add height modifier for certain colors
  if (shouldApplyHeightModifier(attackerManeuver)) {
    damage += heightModifier;
  }

  // Apply damage modifiers from previous round
  for (const effect of damageModifiers) {
    if (effect.type === 'NEXT_TURN_DAMAGE_MODIFIER') {
      const applies = matchesModifierCondition(effect, attackerManeuver);
      if (applies) {
        damage += effect.amount;
      }
    }
  }

  // Damage cannot be negative (it would heal!)
  return Math.max(0, damage);
}

/**
 * Check if height modifier should apply to this maneuver
 */
function shouldApplyHeightModifier(maneuver: Maneuver): boolean {
  // Height modifier typically applies to orange, red, and blue attacks
  return ['orange', 'red', 'blue'].includes(maneuver.color);
}

/**
 * Check if a damage modifier applies to this maneuver
 */
function matchesModifierCondition(effect: Effect, maneuver: Maneuver): boolean {
  if (effect.type !== 'NEXT_TURN_DAMAGE_MODIFIER') return false;

  if (effect.forColor && effect.forColor !== maneuver.color) {
    return false;
  }

  if (effect.forCategory && effect.forCategory !== maneuver.category) {
    return false;
  }

  return true;
}

/**
 * Apply exchange result to character state
 */
function applyExchangeResult(
  currentState: CharacterState,
  result: PicturePageResult,
  damageTaken: number,
  _scoredDamage: boolean
): CharacterState {
  let newState = { ...currentState };

  // Apply damage
  newState.bodyPoints = currentState.bodyPoints - damageTaken;

  // Update range state
  newState.isExtendedRange = result.isExtendedRange;

  // Clear old restrictions and damage modifiers (they expire after the turn)
  newState.activeRestrictions = [];
  newState.damageModifiers = [];

  // Apply new restrictions from this result
  if (result.restriction && result.restriction.type !== 'NONE') {
    newState.activeRestrictions.push({
      restriction: result.restriction,
      duration: 1,  // Until next turn
      source: result.title,
    });
  }

  // Apply effects
  for (const effect of result.effects) {
    newState = applyEffect(newState, effect, damageTaken, _scoredDamage);
  }

  // Update current picture
  newState.currentPicture = result.pageNumber;

  return newState;
}

/**
 * Apply a single effect to character state
 */
function applyEffect(
  state: CharacterState,
  effect: Effect,
  damageTaken: number,
  _scoredDamage: boolean
): CharacterState {
  switch (effect.type) {
    case 'NEXT_TURN_DAMAGE_MODIFIER':
      return {
        ...state,
        damageModifiers: [...state.damageModifiers, effect],
      };

    case 'LOSE_WEAPON':
      return {
        ...state,
        hasWeapon: false,
      };

    case 'RETRIEVE_WEAPON':
      return {
        ...state,
        hasWeapon: true,
      };

    case 'HEALING':
      // Conditional healing (Hill Troll regeneration)
      if (effect.condition === 'IF_NO_DAMAGE_TAKEN' && damageTaken > 0) {
        return state;  // No healing if took damage
      }
      return {
        ...state,
        bodyPoints: Math.min(state.maxBodyPoints, state.bodyPoints + effect.amount),
      };

    case 'NO_EXTENDED_RANGE':
      // Add restriction against extended range moves
      return {
        ...state,
        activeRestrictions: [
          ...state.activeRestrictions,
          {
            restriction: { type: 'NO_CATEGORY', categories: ['EXTENDED_RANGE'] },
            duration: 1,
            source: 'No Extended Range',
          },
        ],
      };

    case 'ONLY_EXTENDED_RANGE':
      // Add restriction to only allow extended range moves
      return {
        ...state,
        activeRestrictions: [
          ...state.activeRestrictions,
          {
            restriction: { type: 'ONLY_CATEGORY', categories: ['EXTENDED_RANGE'] },
            duration: 1,
            source: 'Must use Extended Range',
          },
        ],
      };

    case 'SET_RANGE':
      return {
        ...state,
        isExtendedRange: effect.isExtendedRange,
      };

    case 'ALTERNATE_RESULT':
      // This is handled during resolution, not here
      return state;

    case 'DAMAGE':
      // Direct damage effect (rare)
      return {
        ...state,
        bodyPoints: state.bodyPoints - effect.amount,
      };

    default:
      return state;
  }
}

/**
 * Extract restrictions from a picture page result
 */
function extractRestrictions(result: PicturePageResult): ActiveRestriction[] {
  const restrictions: ActiveRestriction[] = [];

  if (result.restriction && result.restriction.type !== 'NONE') {
    restrictions.push({
      restriction: result.restriction,
      duration: 1,
      source: result.title,
    });
  }

  return restrictions;
}

/**
 * Apply an exchange to the battle, updating both characters
 */
export function applyExchange(battle: Battle, exchange: BattleExchange): Battle {
  return {
    ...battle,
    player1: {
      ...battle.player1,
      state: exchange.player1Result.stateAfter,
    },
    player2: {
      ...battle.player2,
      state: exchange.player2Result.stateAfter,
    },
    round: exchange.roundNumber,
    history: [...battle.history, exchange],
    status: isBattleOver({ ...battle, player1: { ...battle.player1, state: exchange.player1Result.stateAfter }, player2: { ...battle.player2, state: exchange.player2Result.stateAfter } })
      ? 'GAME_OVER'
      : 'AWAITING_MOVES',
    winner: getWinner({ ...battle, player1: { ...battle.player1, state: exchange.player1Result.stateAfter }, player2: { ...battle.player2, state: exchange.player2Result.stateAfter } }),
  };
}

/**
 * Check if battle is over
 */
function isBattleOver(battle: Battle): boolean {
  return battle.player1.state.bodyPoints <= 0 || battle.player2.state.bodyPoints <= 0;
}

/**
 * Get the winner
 */
function getWinner(battle: Battle): 'player1' | 'player2' | null {
  if (battle.player1.state.bodyPoints <= 0 && battle.player2.state.bodyPoints <= 0) {
    // Both dead - higher HP wins
    return battle.player1.state.bodyPoints > battle.player2.state.bodyPoints
      ? 'player1'
      : 'player2';
  }
  if (battle.player1.state.bodyPoints <= 0) return 'player2';
  if (battle.player2.state.bodyPoints <= 0) return 'player1';
  return null;
}
