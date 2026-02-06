/**
 * Character Loader for Lost Worlds Combat Game
 *
 * Loads character definitions from JSON files and converts them
 * to the domain model format.
 */

import type {
  Character,
  CharacterDefinition,
  CharacterState,
  Sheet,
  Maneuver,
  ManeuverCategory,
  ManeuverColor,
  Book,
  PicturePageResult,
  LookupPage,
  Restriction,
} from '../domain/types';

/**
 * Cache of loaded characters
 */
const characterCache = new Map<string, CharacterDefinition>();

/**
 * Load a character definition from JSON
 */
export async function loadCharacterDefinition(characterId: string): Promise<CharacterDefinition> {
  // Check cache first
  if (characterCache.has(characterId)) {
    return characterCache.get(characterId)!;
  }

  const response = await fetch(`/characters/${characterId}.json`);
  if (!response.ok) {
    throw new Error(`Failed to load character ${characterId}: ${response.statusText}`);
  }

  const definition = await response.json() as CharacterDefinition;
  characterCache.set(characterId, definition);
  return definition;
}

/**
 * Create a Character instance from a definition
 */
export function createCharacterFromDefinition(definition: CharacterDefinition): Character {
  const sheet = createSheet(definition);
  const book = createBook(definition);
  const state = createInitialState(definition.bodyPoints);

  return {
    id: definition.id,
    name: definition.name,
    height: definition.height,
    sheet,
    book,
    state,
  };
}

/**
 * Create a Sheet from definition
 */
function createSheet(definition: CharacterDefinition): Sheet {
  const maneuvers: Maneuver[] = [];

  for (const categoryDef of definition.maneuvers) {
    for (const moveDef of categoryDef.moves) {
      maneuvers.push({
        id: `${definition.id}_${categoryDef.category}_${moveDef.name}`.replace(/\s+/g, '_').toLowerCase(),
        name: moveDef.name,
        category: categoryDef.category as ManeuverCategory,
        color: moveDef.color as ManeuverColor,
        normalPage: moveDef.normalPage,
        extendedPage: moveDef.extendedPage,
        modifier: moveDef.modifier,
      });
    }
  }

  return {
    height: definition.height,
    bodyPoints: definition.bodyPoints,
    maneuvers,
  };
}

/**
 * Create a Book from definition
 */
function createBook(definition: CharacterDefinition): Book {
  const picturePages = new Map<number, PicturePageResult>();
  const lookupPages = new Map<number, LookupPage>();

  for (const pageDef of definition.picturePages) {
    picturePages.set(pageDef.number, {
      pageNumber: pageDef.number,
      title: pageDef.title,
      isExtendedRange: pageDef.isExtendedRange,
      damage: pageDef.damage,
      restriction: pageDef.restriction,
      effects: pageDef.effects || [],
      imageUrl: pageDef.imageUrl,
      imageUrlBW: pageDef.imageUrlBW,
      imageUrlColor: pageDef.imageUrlColor,
    });
  }

  for (const pageDef of definition.lookupPages) {
    // Convert string keys to numbers in the mapping
    const mapping: Record<number, number> = {};
    for (const [key, value] of Object.entries(pageDef.mapping)) {
      mapping[parseInt(key, 10)] = value;
    }

    lookupPages.set(pageDef.number, {
      pageNumber: pageDef.number,
      mapping,
    });
  }

  return { picturePages, lookupPages };
}

/**
 * Create initial character state
 */
function createInitialState(bodyPoints: number): CharacterState {
  return {
    bodyPoints,
    maxBodyPoints: bodyPoints,
    isExtendedRange: true,  // Combat starts at extended range (far apart)
    hasWeapon: true,
    activeRestrictions: [
      {
        restriction: { type: 'ONLY_CATEGORY', categories: ['EXTENDED_RANGE'] },
        duration: 1,
        source: 'Starting at extended range',
      }
    ],
    damageModifiers: [],
    currentPicture: null,
  };
}

/**
 * Load and create a Character instance
 */
export async function loadCharacter(characterId: string): Promise<Character> {
  const definition = await loadCharacterDefinition(characterId);
  return createCharacterFromDefinition(definition);
}

/**
 * Get list of available character IDs
 */
export async function getAvailableCharacters(): Promise<string[]> {
  try {
    const response = await fetch('/characters/index.json');
    if (!response.ok) {
      return ['man-in-chainmail', 'hill-troll'];  // Default fallback
    }
    return await response.json();
  } catch {
    return ['man-in-chainmail', 'hill-troll'];
  }
}

/**
 * Parse a restriction string from the original Smalltalk format
 * Example: "no category EXTENDED RANGE" -> { type: 'NO_CATEGORY', categories: ['EXTENDED_RANGE'] }
 *
 * This is provided for backwards compatibility but the preferred approach
 * is to use typed restrictions directly in JSON.
 */
export function parseRestrictionString(str: string): Restriction {
  if (!str || str.trim() === '') {
    return { type: 'NONE' };
  }

  const normalized = str.trim().toLowerCase();

  // Handle "and" splits
  if (normalized.includes(' and ')) {
    const parts = normalized.split(' and ').map(s => s.trim());
    const children = parts.map(parseRestrictionString);
    return { type: 'AND', children };
  }

  // Handle "or" splits
  if (normalized.includes(' or ')) {
    const parts = normalized.split(' or ').map(s => s.trim());
    const children = parts.map(parseRestrictionString);
    return { type: 'OR', children };
  }

  // Parse single restriction
  if (normalized.startsWith('no category ')) {
    const categories = normalized.replace('no category ', '').toUpperCase().split(/\s+/).join('_');
    return { type: 'NO_CATEGORY', categories: [categories as ManeuverCategory] };
  }

  if (normalized.startsWith('only category ')) {
    const categories = normalized.replace('only category ', '').toUpperCase().split(/\s+/).join('_');
    return { type: 'ONLY_CATEGORY', categories: [categories as ManeuverCategory] };
  }

  if (normalized.startsWith('no color ')) {
    const colors = normalized.replace('no color ', '').split(/\s+/);
    return { type: 'NO_COLOR', colors: colors as ManeuverColor[] };
  }

  if (normalized.startsWith('only color ')) {
    const colors = normalized.replace('only color ', '').split(/\s+/);
    return { type: 'ONLY_COLOR', colors: colors as ManeuverColor[] };
  }

  if (normalized.startsWith('no name ')) {
    const names = normalized.replace('no name ', '').toUpperCase().split(/\s+/);
    return { type: 'NO_NAME', names };
  }

  if (normalized.startsWith('only name ')) {
    const names = normalized.replace('only name ', '').toUpperCase().split(/\s+/);
    return { type: 'ONLY_NAME', names };
  }

  // Unknown format - treat as no restriction
  console.warn(`Unknown restriction format: ${str}`);
  return { type: 'NONE' };
}
