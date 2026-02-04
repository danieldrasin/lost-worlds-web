/**
 * Restriction Types for Lost Worlds Combat Game
 *
 * Restrictions control which maneuvers a character can perform.
 * After certain outcomes, characters are restricted to specific
 * colors, categories, or move names.
 *
 * This is a typed system that replaces the original string-based DSL
 * (e.g., "no category EXTENDED RANGE" becomes { type: 'NO_CATEGORY', categories: ['EXTENDED_RANGE'] })
 */

import type { ManeuverCategory, ManeuverColor, Maneuver } from './maneuver';

/**
 * Base restriction types - can be combined with AND/OR
 */
export type Restriction =
  | NoCategoryRestriction
  | OnlyCategoryRestriction
  | NoColorRestriction
  | OnlyColorRestriction
  | NoNameRestriction
  | OnlyNameRestriction
  | AndRestriction
  | OrRestriction
  | NoRestriction;

/**
 * Disallows maneuvers from specified categories
 * Original DSL: "no category EXTENDED RANGE"
 */
export interface NoCategoryRestriction {
  type: 'NO_CATEGORY';
  categories: ManeuverCategory[];
}

/**
 * Only allows maneuvers from specified categories
 * Original DSL: "only category JUMP"
 */
export interface OnlyCategoryRestriction {
  type: 'ONLY_CATEGORY';
  categories: ManeuverCategory[];
}

/**
 * Disallows maneuvers of specified colors
 * Original DSL: "no color RED and ORANGE"
 */
export interface NoColorRestriction {
  type: 'NO_COLOR';
  colors: ManeuverColor[];
}

/**
 * Only allows maneuvers of specified colors
 * Original DSL: "only color GREEN and YELLOW"
 */
export interface OnlyColorRestriction {
  type: 'ONLY_COLOR';
  colors: ManeuverColor[];
}

/**
 * Disallows maneuvers with specified names
 * Original DSL: "no name WILD SWING"
 */
export interface NoNameRestriction {
  type: 'NO_NAME';
  names: string[];
}

/**
 * Only allows maneuvers with specified names
 * Original DSL: "only name KICK"
 */
export interface OnlyNameRestriction {
  type: 'ONLY_NAME';
  names: string[];
}

/**
 * Combines restrictions with AND - all must pass
 * Original DSL: "only color GREEN and YELLOW and no category EXTENDED RANGE"
 */
export interface AndRestriction {
  type: 'AND';
  children: Restriction[];
}

/**
 * Combines restrictions with OR - at least one must pass
 */
export interface OrRestriction {
  type: 'OR';
  children: Restriction[];
}

/**
 * No restriction - all maneuvers allowed
 */
export interface NoRestriction {
  type: 'NONE';
}

/**
 * Result of evaluating a restriction against a maneuver
 */
export interface RestrictionCheckResult {
  isAllowed: boolean;
  reason?: string;  // Why the maneuver is disallowed
}

/**
 * Active restriction on a character (with duration tracking)
 */
export interface ActiveRestriction {
  restriction: Restriction;
  duration: number;  // Rounds remaining, 0 = permanent, -1 = until end of turn
  source: string;    // What caused this restriction (for display)
}

/**
 * Check if a maneuver passes a restriction
 */
export function checkRestriction(maneuver: Maneuver, restriction: Restriction): RestrictionCheckResult {
  switch (restriction.type) {
    case 'NONE':
      return { isAllowed: true };

    case 'NO_CATEGORY':
      if (restriction.categories.includes(maneuver.category)) {
        return { isAllowed: false, reason: `Cannot use ${maneuver.category} maneuvers` };
      }
      return { isAllowed: true };

    case 'ONLY_CATEGORY':
      if (!restriction.categories.includes(maneuver.category)) {
        return { isAllowed: false, reason: `Can only use ${restriction.categories.join(' or ')} maneuvers` };
      }
      return { isAllowed: true };

    case 'NO_COLOR':
      if (restriction.colors.includes(maneuver.color)) {
        return { isAllowed: false, reason: `Cannot use ${maneuver.color} maneuvers` };
      }
      return { isAllowed: true };

    case 'ONLY_COLOR':
      if (!restriction.colors.includes(maneuver.color)) {
        return { isAllowed: false, reason: `Can only use ${restriction.colors.join(' or ')} maneuvers` };
      }
      return { isAllowed: true };

    case 'NO_NAME':
      if (restriction.names.some(name => maneuver.name.toUpperCase().includes(name.toUpperCase()))) {
        return { isAllowed: false, reason: `Cannot use ${maneuver.name}` };
      }
      return { isAllowed: true };

    case 'ONLY_NAME':
      if (!restriction.names.some(name => maneuver.name.toUpperCase().includes(name.toUpperCase()))) {
        return { isAllowed: false, reason: `Can only use ${restriction.names.join(' or ')}` };
      }
      return { isAllowed: true };

    case 'AND':
      for (const child of restriction.children) {
        const result = checkRestriction(maneuver, child);
        if (!result.isAllowed) {
          return result;
        }
      }
      return { isAllowed: true };

    case 'OR':
      for (const child of restriction.children) {
        const result = checkRestriction(maneuver, child);
        if (result.isAllowed) {
          return { isAllowed: true };
        }
      }
      return { isAllowed: false, reason: 'Does not match any allowed option' };

    default:
      return { isAllowed: true };
  }
}

/**
 * Check if a maneuver passes all active restrictions
 */
export function checkAllRestrictions(
  maneuver: Maneuver,
  activeRestrictions: ActiveRestriction[]
): RestrictionCheckResult {
  for (const active of activeRestrictions) {
    const result = checkRestriction(maneuver, active.restriction);
    if (!result.isAllowed) {
      return result;
    }
  }
  return { isAllowed: true };
}

/**
 * Helper to create common restrictions
 */
export const Restrictions = {
  none: (): NoRestriction => ({ type: 'NONE' }),

  noCategory: (...categories: ManeuverCategory[]): NoCategoryRestriction => ({
    type: 'NO_CATEGORY',
    categories,
  }),

  onlyCategory: (...categories: ManeuverCategory[]): OnlyCategoryRestriction => ({
    type: 'ONLY_CATEGORY',
    categories,
  }),

  noColor: (...colors: ManeuverColor[]): NoColorRestriction => ({
    type: 'NO_COLOR',
    colors,
  }),

  onlyColor: (...colors: ManeuverColor[]): OnlyColorRestriction => ({
    type: 'ONLY_COLOR',
    colors,
  }),

  noName: (...names: string[]): NoNameRestriction => ({
    type: 'NO_NAME',
    names,
  }),

  onlyName: (...names: string[]): OnlyNameRestriction => ({
    type: 'ONLY_NAME',
    names,
  }),

  and: (...children: Restriction[]): AndRestriction => ({
    type: 'AND',
    children,
  }),

  or: (...children: Restriction[]): OrRestriction => ({
    type: 'OR',
    children,
  }),
};
