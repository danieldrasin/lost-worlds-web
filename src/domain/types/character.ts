/**
 * Character Types for Lost Worlds Combat Game
 *
 * Characters are the combatants in battle. Each character has:
 * - A book (picture pages and lookup tables)
 * - A sheet (available maneuvers)
 * - A state (current HP, restrictions, modifiers)
 */

import type { Maneuver, Sheet } from './maneuver';
import type { ActiveRestriction, Restriction } from './restrictions';
import type { Book, Effect, NextTurnDamageModifier } from './effects';

/**
 * Character definition - loaded from JSON
 */
export interface CharacterDefinition {
  id: string;
  name: string;
  height: number;
  bodyPoints: number;
  startingPicturePage?: number;  // The picture page shown at start of combat (e.g., 57)
  maneuvers: ManeuverDefinition[];
  picturePages: PicturePageDefinition[];
  lookupPages: LookupPageDefinition[];
}

/**
 * Maneuver definition in JSON format
 */
export interface ManeuverDefinition {
  category: string;
  moves: {
    name: string;
    color: string;
    normalPage: number;
    extendedPage: number;
    modifier: number;
  }[];
}

/**
 * Picture page definition in JSON format
 */
export interface PicturePageDefinition {
  number: number;
  title: string;
  isExtendedRange: boolean;
  damage: number | null;
  restriction: Restriction;
  effects: Effect[];
  imageUrl?: string;          // Legacy single image URL
  imageUrlBW?: string;        // Black & white version
  imageUrlColor?: string;     // Color version
}

/**
 * Lookup page definition in JSON format
 */
export interface LookupPageDefinition {
  number: number;
  mapping: Record<string, number>;
}

/**
 * Character state - mutable during battle
 */
export interface CharacterState {
  bodyPoints: number;
  maxBodyPoints: number;
  isExtendedRange: boolean;
  hasWeapon: boolean;
  activeRestrictions: ActiveRestriction[];
  damageModifiers: NextTurnDamageModifier[];
  currentPicture: number | null;  // Current picture page being shown
}

/**
 * Full character instance in battle
 */
export interface Character {
  id: string;
  name: string;
  height: number;
  startingPicturePage?: number;  // The picture page shown at start of combat
  sheet: Sheet;
  book: Book;
  state: CharacterState;
}

/**
 * Create initial character state
 */
export function createInitialState(bodyPoints: number): CharacterState {
  return {
    bodyPoints,
    maxBodyPoints: bodyPoints,
    isExtendedRange: false,
    hasWeapon: true,
    activeRestrictions: [],
    damageModifiers: [],
    currentPicture: null,
  };
}

/**
 * Check if character is knocked out
 */
export function isKnockedOut(state: CharacterState): boolean {
  return state.bodyPoints <= 0;
}

/**
 * Check if character is dead
 */
export function isDead(state: CharacterState): boolean {
  return state.bodyPoints <= -5;
}

/**
 * Get character status string
 */
export function getStatusString(state: CharacterState): string {
  if (isDead(state)) {
    return `DEAD (${state.bodyPoints})`;
  }
  if (isKnockedOut(state)) {
    return `KNOCKED OUT (${state.bodyPoints})`;
  }
  return `ALIVE (${state.bodyPoints}/${state.maxBodyPoints})`;
}

/**
 * Apply damage to character state
 */
export function applyDamage(state: CharacterState, damage: number): CharacterState {
  return {
    ...state,
    bodyPoints: state.bodyPoints - damage,
  };
}

/**
 * Apply healing to character state
 */
export function applyHealing(state: CharacterState, amount: number): CharacterState {
  return {
    ...state,
    bodyPoints: Math.min(state.maxBodyPoints, state.bodyPoints + amount),
  };
}

/**
 * Get valid maneuvers for a character based on current state
 */
export function getValidManeuvers(character: Character): Maneuver[] {
  const { state, sheet } = character;

  return sheet.maneuvers.filter(maneuver => {
    // Check weapon requirement
    if (!state.hasWeapon) {
      // Without weapon, only certain moves are valid:
      // JUMP, RAGE, KICK, RETRIEVE, and non-attack EXTENDED_RANGE moves
      const allowedWithoutWeapon = ['JUMP', 'RAGE'];
      if (!allowedWithoutWeapon.includes(maneuver.category)) {
        if (maneuver.category === 'EXTENDED_RANGE') {
          // At extended range without weapon: allow movement/defense moves, not attacks
          const nameUpper = maneuver.name.toUpperCase();
          const weaponFreeExtended = ['CHARGE', 'DODGE', 'JUMP BACK', 'BLOCK & CLOSE', 'BLOCK'];
          if (!weaponFreeExtended.some(m => nameUpper.includes(m))) {
            return false;
          }
        } else if (maneuver.category !== 'SPECIAL') {
          return false;
        } else {
          // Check if it's a kick or retrieve weapon
          const nameUpper = maneuver.name.toUpperCase();
          if (!nameUpper.includes('KICK') && !nameUpper.includes('RETRIEVE')) {
            return false;
          }
        }
      }
    }

    // Check all active restrictions
    for (const activeRestriction of state.activeRestrictions) {
      const result = checkManeuverAgainstRestriction(maneuver, activeRestriction.restriction);
      if (!result) {
        return false;
      }
    }

    return true;
  });
}

/**
 * Helper to check a maneuver against a restriction
 */
function checkManeuverAgainstRestriction(maneuver: Maneuver, restriction: Restriction): boolean {
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
      return !restriction.names.some(name =>
        maneuver.name.toUpperCase().includes(name.toUpperCase())
      );

    case 'ONLY_NAME':
      return restriction.names.some(name =>
        maneuver.name.toUpperCase().includes(name.toUpperCase())
      );

    case 'AND':
      return restriction.children.every(child =>
        checkManeuverAgainstRestriction(maneuver, child)
      );

    case 'OR':
      return restriction.children.some(child =>
        checkManeuverAgainstRestriction(maneuver, child)
      );

    default:
      return true;
  }
}
