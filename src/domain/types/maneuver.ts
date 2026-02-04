/**
 * Maneuver Types for Lost Worlds Combat Game
 *
 * Maneuvers are the combat moves available to each character.
 * Each maneuver has a color (for restriction matching), category,
 * and page numbers that are used in the lookup system.
 */

// Color types matching the original game
export type ManeuverColor =
  | 'red'
  | 'blue'
  | 'orange'
  | 'green'
  | 'yellow'
  | 'white'
  | 'black'
  | 'brown';

// Categories of maneuvers - each character has moves organized by category
export type ManeuverCategory =
  | 'DOWN_SWING'
  | 'SIDE_SWING'
  | 'THRUST'
  | 'FAKE'
  | 'PROTECTED_ATTACK'
  | 'SPECIAL'
  | 'SHIELD_BLOCK'
  | 'JUMP'
  | 'EXTENDED_RANGE'
  | 'RAGE';  // Hill Troll specific

/**
 * A single maneuver (combat move)
 */
export interface Maneuver {
  id: string;
  name: string;
  category: ManeuverCategory;
  color: ManeuverColor;
  normalPage: number;      // Page number when at normal (engaged) range
  extendedPage: number;    // Page number when at extended range
  modifier: number;        // Damage modifier for this move
}

/**
 * Character sheet - the available maneuvers for a character
 */
export interface Sheet {
  height: number;          // Character height (affects damage calculations)
  bodyPoints: number;      // Starting body points (health)
  maneuvers: Maneuver[];   // All available maneuvers
}

/**
 * Get maneuvers grouped by category
 */
export function groupManeuversByCategory(maneuvers: Maneuver[]): Map<ManeuverCategory, Maneuver[]> {
  const grouped = new Map<ManeuverCategory, Maneuver[]>();
  for (const maneuver of maneuvers) {
    const category = maneuver.category;
    if (!grouped.has(category)) {
      grouped.set(category, []);
    }
    grouped.get(category)!.push(maneuver);
  }
  return grouped;
}

/**
 * Category display names for UI
 */
export const CATEGORY_DISPLAY_NAMES: Record<ManeuverCategory, string> = {
  DOWN_SWING: 'Down Swing',
  SIDE_SWING: 'Side Swing',
  THRUST: 'Thrust',
  FAKE: 'Fake',
  PROTECTED_ATTACK: 'Protected Attack',
  SPECIAL: 'Special',
  SHIELD_BLOCK: 'Shield Block',
  JUMP: 'Jump',
  EXTENDED_RANGE: 'Extended Range',
  RAGE: 'Rage',
};
