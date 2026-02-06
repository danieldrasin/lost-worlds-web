/**
 * Effect Types for Lost Worlds Combat Game
 *
 * Effects are the outcomes of combat exchanges - damage, healing,
 * status changes, weapon interactions, etc.
 */

import type { Restriction } from './restrictions';
import type { ManeuverColor, ManeuverCategory } from './maneuver';

/**
 * All possible effect types
 */
export type Effect =
  | DamageEffect
  | HealingEffect
  | NextTurnDamageModifier
  | LoseWeaponEffect
  | RetrieveWeaponEffect
  | NoExtendedRangeEffect
  | OnlyExtendedRangeEffect
  | AlternateResultEffect
  | SetRangeEffect;

/**
 * Base damage - the primary outcome of most exchanges
 */
export interface DamageEffect {
  type: 'DAMAGE';
  amount: number;
}

/**
 * Healing - restores body points
 */
export interface HealingEffect {
  type: 'HEALING';
  amount: number;
  condition?: 'IF_NO_DAMAGE_TAKEN';  // Hill Troll regeneration
}

/**
 * Modifier to damage on next turn
 * Can be for all attacks, specific colors, or categories
 */
export interface NextTurnDamageModifier {
  type: 'NEXT_TURN_DAMAGE_MODIFIER';
  amount: number;
  forColor?: ManeuverColor;
  forCategory?: ManeuverCategory;
}

/**
 * Character loses their weapon
 */
export interface LoseWeaponEffect {
  type: 'LOSE_WEAPON';
}

/**
 * Character retrieves their weapon
 */
export interface RetrieveWeaponEffect {
  type: 'RETRIEVE_WEAPON';
}

/**
 * Cannot use extended range moves this turn
 */
export interface NoExtendedRangeEffect {
  type: 'NO_EXTENDED_RANGE';
}

/**
 * Must use extended range moves this turn
 */
export interface OnlyExtendedRangeEffect {
  type: 'ONLY_EXTENDED_RANGE';
}

/**
 * Conditional alternate result page
 * Original: "if scoring damage, go to page X"
 */
export interface AlternateResultEffect {
  type: 'ALTERNATE_RESULT';
  condition: 'IF_SCORING_DAMAGE';
  pageNumber: number;
}

/**
 * Set the range state (engaged or extended)
 */
export interface SetRangeEffect {
  type: 'SET_RANGE';
  isExtendedRange: boolean;
}

/**
 * Picture page result - the outcome shown on a picture page
 */
export interface PicturePageResult {
  pageNumber: number;
  title: string;
  isExtendedRange: boolean;    // Does this result put combatants at extended range?
  damage: number | null;       // null = no damage
  restriction: Restriction;     // Movement/action restrictions
  effects: Effect[];           // Additional effects (modifiers, weapon loss, etc.)
  imageUrl?: string;           // URL to the picture for this page (legacy single image)
  imageUrlBW?: string;         // URL to black & white version of the image
  imageUrlColor?: string;      // URL to color version of the image
}

/**
 * Lookup page - maps opponent's page to a result page
 */
export interface LookupPage {
  pageNumber: number;
  mapping: Record<number, number>;  // opponent page -> result page number
}

/**
 * Character's combat book
 */
export interface Book {
  picturePages: Map<number, PicturePageResult>;
  lookupPages: Map<number, LookupPage>;
}

/**
 * Helper to create a book from arrays (like the original Smalltalk)
 */
export function createBook(
  picturePageDefs: PicturePageResult[],
  lookupPageDefs: LookupPage[]
): Book {
  const picturePages = new Map<number, PicturePageResult>();
  const lookupPages = new Map<number, LookupPage>();

  for (const page of picturePageDefs) {
    picturePages.set(page.pageNumber, page);
  }

  for (const page of lookupPageDefs) {
    lookupPages.set(page.pageNumber, page);
  }

  return { picturePages, lookupPages };
}

/**
 * Look up the result of a combat exchange
 *
 * @param book - The attacker's book
 * @param myPage - The attacker's maneuver page
 * @param opponentPage - The defender's maneuver page
 * @returns The picture page result
 */
export function lookupResult(
  book: Book,
  myPage: number,
  opponentPage: number
): PicturePageResult {
  const lookupPage = book.lookupPages.get(myPage);
  if (!lookupPage) {
    throw new Error(`Lookup page ${myPage} not found in book`);
  }

  const resultPageNumber = lookupPage.mapping[opponentPage];
  if (resultPageNumber === undefined) {
    throw new Error(`No mapping for opponent page ${opponentPage} on lookup page ${myPage}`);
  }

  const result = book.picturePages.get(resultPageNumber);
  if (!result) {
    throw new Error(`Picture page ${resultPageNumber} not found in book`);
  }

  return result;
}
