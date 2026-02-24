/**
 * Exhaustive Combat Tests
 *
 * TEST A: Tests every move combination from every reachable game state
 *         to find invalid states, missing page mappings, or stuck conditions.
 *
 * TEST B: Simulates online-style battles (host resolves, guest applies)
 *         for Troll v Troll and MC v MC to find timing/state-sync issues.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { createCharacterFromDefinition } from '../data/characterLoader';
import { resolveExchange, applyExchange } from '../domain/models/BattleEngine';
import type { Battle, Character, Maneuver, CharacterDefinition } from '../domain/types';

// ============================================
// Helpers
// ============================================

function loadCharacterSync(characterId: string): Character {
  const filePath = join(process.cwd(), 'public', 'characters', `${characterId}.json`);
  const json = readFileSync(filePath, 'utf-8');
  const definition = JSON.parse(json) as CharacterDefinition;
  return createCharacterFromDefinition(definition);
}

function getValidMoves(character: Character): Maneuver[] {
  const { state, sheet } = character;
  return sheet.maneuvers.filter(maneuver => {
    if (!state.hasWeapon) {
      const category = maneuver.category;
      const name = maneuver.name.toUpperCase();
      if (category !== 'JUMP' && category !== 'RAGE') {
        if (category === 'EXTENDED_RANGE') {
          const weaponFreeExtended = ['CHARGE', 'DODGE', 'JUMP BACK', 'BLOCK & CLOSE', 'BLOCK'];
          if (!weaponFreeExtended.some(m => name.includes(m))) {
            return false;
          }
        } else if (category !== 'SPECIAL' || (!name.includes('KICK') && !name.includes('RETRIEVE'))) {
          return false;
        }
      }
    }
    for (const activeRestriction of state.activeRestrictions) {
      if (!checkRestriction(maneuver, activeRestriction.restriction)) {
        return false;
      }
    }
    return true;
  });
}

function checkRestriction(maneuver: Maneuver, restriction: any): boolean {
  switch (restriction.type) {
    case 'NONE': return true;
    case 'NO_CATEGORY': return !restriction.categories.includes(maneuver.category);
    case 'ONLY_CATEGORY': return restriction.categories.includes(maneuver.category);
    case 'NO_COLOR': return !restriction.colors.includes(maneuver.color);
    case 'ONLY_COLOR': return restriction.colors.includes(maneuver.color);
    case 'NO_NAME': return !restriction.names?.some((n: string) => maneuver.name.toUpperCase().includes(n.toUpperCase()));
    case 'ONLY_NAME': return restriction.names?.some((n: string) => maneuver.name.toUpperCase().includes(n.toUpperCase()));
    case 'AND': return restriction.children?.every((c: any) => checkRestriction(maneuver, c));
    case 'OR': return restriction.children?.some((c: any) => checkRestriction(maneuver, c));
    default: return true;
  }
}

function createBattle(char1Id: string, char2Id: string): Battle {
  const player1 = loadCharacterSync(char1Id);
  const player2 = loadCharacterSync(char2Id);
  return {
    id: `test_battle_${Date.now()}`,
    player1,
    player2,
    round: 0,
    status: 'AWAITING_MOVES',
    history: [],
    winner: null,
    isVsAI: false,
  };
}

function deepClone<T>(obj: T): T {
  // JSON.parse/stringify destroys Map objects, so we need a smarter clone
  // that preserves the book's Map-based lookupPages and picturePages
  if (obj === null || typeof obj !== 'object') return obj;

  if (obj instanceof Map) {
    const clonedMap = new Map();
    for (const [key, value] of obj) {
      clonedMap.set(key, deepClone(value));
    }
    return clonedMap as unknown as T;
  }

  if (Array.isArray(obj)) {
    return obj.map(item => deepClone(item)) as unknown as T;
  }

  const cloned: any = {};
  for (const key of Object.keys(obj)) {
    cloned[key] = deepClone((obj as any)[key]);
  }
  return cloned as T;
}

// ============================================
// TEST A: Exhaustive Page-Pair Testing
// ============================================
// Every even page is a lookup page. Every pair of even pages
// (p1Page, p2Page) is a possible combat intersection.
// We test every such intersection for both normal range (pages 2-48)
// and extended range (pages 50-64), then from each resulting state
// we check that both players have valid moves for the next round.

interface PagePairIssue {
  type: 'MISSING_MAPPING' | 'NO_VALID_MOVES' | 'EXCEPTION';
  p1Page: number;
  p2Page: number;
  p1Move: string;
  p2Move: string;
  range: 'normal' | 'extended';
  details: string;
  p1Restrictions?: string;
  p2Restrictions?: string;
  p1HasWeapon?: boolean;
  p2HasWeapon?: boolean;
}

/**
 * Build a map from page number -> list of maneuvers that use that page.
 * For normal range, key is normalPage; for extended, key is extendedPage.
 */
function buildPageToMovesMap(character: Character, extended: boolean): Map<number, Maneuver[]> {
  const map = new Map<number, Maneuver[]>();
  for (const maneuver of character.sheet.maneuvers) {
    const page = extended ? maneuver.extendedPage : maneuver.normalPage;
    if (!map.has(page)) map.set(page, []);
    map.get(page)!.push(maneuver);
  }
  return map;
}

describe('TEST A: Exhaustive Page-Pair Testing', () => {
  const matchups = [
    ['man-in-chainmail', 'hill-troll'],
    ['hill-troll', 'man-in-chainmail'],
    ['man-in-chainmail', 'man-in-chainmail'],
    ['hill-troll', 'hill-troll'],
  ];

  // All even pages
  const normalPages = Array.from({ length: 24 }, (_, i) => (i + 1) * 2);   // 2,4,...,48
  const extendedPages = Array.from({ length: 8 }, (_, i) => 50 + i * 2);    // 50,52,...,64

  for (const [char1Id, char2Id] of matchups) {
    describe(`${char1Id} vs ${char2Id}`, () => {

      it('should resolve all normal-range page pairs (2-48 × 2-48) without crashes', () => {
        const issues: PagePairIssue[] = [];
        const battle = createBattle(char1Id, char2Id);
        // Set to normal range
        battle.player1.state.isExtendedRange = false;
        battle.player2.state.isExtendedRange = false;
        battle.player1.state.activeRestrictions = [];
        battle.player2.state.activeRestrictions = [];

        const p1PageMap = buildPageToMovesMap(battle.player1, false);
        const p2PageMap = buildPageToMovesMap(battle.player2, false);

        let tested = 0;

        for (const p1Page of normalPages) {
          for (const p2Page of normalPages) {
            // Get a representative move for each page (or skip if no move maps to this page)
            const p1Moves = p1PageMap.get(p1Page);
            const p2Moves = p2PageMap.get(p2Page);
            if (!p1Moves || !p2Moves) continue;

            // Test every move combination that produces this page pair
            for (const p1Move of p1Moves) {
              for (const p2Move of p2Moves) {
                const testBattle = deepClone(battle);
                testBattle.player1.state.isExtendedRange = false;
                testBattle.player2.state.isExtendedRange = false;
                testBattle.player1.state.activeRestrictions = [];
                testBattle.player2.state.activeRestrictions = [];

                try {
                  const exchange = resolveExchange(testBattle, p1Move, p2Move);
                  const newBattle = applyExchange(testBattle, exchange);
                  tested++;

                  // Check for stuck states
                  if (newBattle.status !== 'GAME_OVER') {
                    const nextP1Moves = getValidMoves(newBattle.player1);
                    const nextP2Moves = getValidMoves(newBattle.player2);

                    if (nextP1Moves.length === 0) {
                      issues.push({
                        type: 'NO_VALID_MOVES',
                        p1Page, p2Page,
                        p1Move: p1Move.name, p2Move: p2Move.name,
                        range: 'normal',
                        details: `P1 (${char1Id}) has 0 valid moves after resolution`,
                        p1Restrictions: JSON.stringify(newBattle.player1.state.activeRestrictions.map(r => r.restriction)),
                        p2Restrictions: JSON.stringify(newBattle.player2.state.activeRestrictions.map(r => r.restriction)),
                        p1HasWeapon: newBattle.player1.state.hasWeapon,
                        p2HasWeapon: newBattle.player2.state.hasWeapon,
                      });
                    }
                    if (nextP2Moves.length === 0) {
                      issues.push({
                        type: 'NO_VALID_MOVES',
                        p1Page, p2Page,
                        p1Move: p1Move.name, p2Move: p2Move.name,
                        range: 'normal',
                        details: `P2 (${char2Id}) has 0 valid moves after resolution`,
                        p1Restrictions: JSON.stringify(newBattle.player1.state.activeRestrictions.map(r => r.restriction)),
                        p2Restrictions: JSON.stringify(newBattle.player2.state.activeRestrictions.map(r => r.restriction)),
                        p1HasWeapon: newBattle.player1.state.hasWeapon,
                        p2HasWeapon: newBattle.player2.state.hasWeapon,
                      });
                    }
                  }
                } catch (err: any) {
                  issues.push({
                    type: 'EXCEPTION',
                    p1Page, p2Page,
                    p1Move: p1Move.name, p2Move: p2Move.name,
                    range: 'normal',
                    details: err.message,
                  });
                }
              }
            }
          }
        }

        console.log(`  Normal range: tested ${tested} move combinations across all page pairs`);
        if (issues.length > 0) {
          console.log(`  ISSUES: ${issues.length}`);
          const byType: Record<string, number> = {};
          for (const i of issues) { byType[i.type] = (byType[i.type] || 0) + 1; }
          console.log(`  Breakdown:`, byType);
          for (const i of issues.slice(0, 20)) {
            console.log(`    [${i.type}] p${i.p1Page} vs p${i.p2Page} (${i.p1Move} vs ${i.p2Move}): ${i.details}`);
            if (i.p1Restrictions) console.log(`      P1 restrictions: ${i.p1Restrictions}, weapon: ${i.p1HasWeapon}`);
            if (i.p2Restrictions) console.log(`      P2 restrictions: ${i.p2Restrictions}, weapon: ${i.p2HasWeapon}`);
          }
        }
        expect(tested).toBeGreaterThan(0);
        expect(issues.filter(i => i.type === 'EXCEPTION').length).toBe(0);
        expect(issues.filter(i => i.type === 'NO_VALID_MOVES').length).toBe(0);
      });

      it('should resolve all extended-range page pairs (50-64 × 50-64) without crashes', () => {
        const issues: PagePairIssue[] = [];
        const battle = createBattle(char1Id, char2Id);
        // Set to extended range
        battle.player1.state.isExtendedRange = true;
        battle.player2.state.isExtendedRange = true;
        battle.player1.state.activeRestrictions = [{
          restriction: { type: 'ONLY_CATEGORY', categories: ['EXTENDED_RANGE'] },
          duration: 1,
          source: 'test',
        }];
        battle.player2.state.activeRestrictions = [{
          restriction: { type: 'ONLY_CATEGORY', categories: ['EXTENDED_RANGE'] },
          duration: 1,
          source: 'test',
        }];

        const p1PageMap = buildPageToMovesMap(battle.player1, true);
        const p2PageMap = buildPageToMovesMap(battle.player2, true);

        let tested = 0;

        for (const p1Page of extendedPages) {
          for (const p2Page of extendedPages) {
            const p1Moves = p1PageMap.get(p1Page);
            const p2Moves = p2PageMap.get(p2Page);
            if (!p1Moves || !p2Moves) continue;

            for (const p1Move of p1Moves) {
              for (const p2Move of p2Moves) {
                const testBattle = deepClone(battle);

                try {
                  const exchange = resolveExchange(testBattle, p1Move, p2Move);
                  const newBattle = applyExchange(testBattle, exchange);
                  tested++;

                  if (newBattle.status !== 'GAME_OVER') {
                    const nextP1Moves = getValidMoves(newBattle.player1);
                    const nextP2Moves = getValidMoves(newBattle.player2);

                    if (nextP1Moves.length === 0) {
                      issues.push({
                        type: 'NO_VALID_MOVES',
                        p1Page, p2Page,
                        p1Move: p1Move.name, p2Move: p2Move.name,
                        range: 'extended',
                        details: `P1 (${char1Id}) has 0 valid moves after resolution`,
                        p1Restrictions: JSON.stringify(newBattle.player1.state.activeRestrictions.map(r => r.restriction)),
                        p2Restrictions: JSON.stringify(newBattle.player2.state.activeRestrictions.map(r => r.restriction)),
                        p1HasWeapon: newBattle.player1.state.hasWeapon,
                        p2HasWeapon: newBattle.player2.state.hasWeapon,
                      });
                    }
                    if (nextP2Moves.length === 0) {
                      issues.push({
                        type: 'NO_VALID_MOVES',
                        p1Page, p2Page,
                        p1Move: p1Move.name, p2Move: p2Move.name,
                        range: 'extended',
                        details: `P2 (${char2Id}) has 0 valid moves after resolution`,
                        p1Restrictions: JSON.stringify(newBattle.player1.state.activeRestrictions.map(r => r.restriction)),
                        p2Restrictions: JSON.stringify(newBattle.player2.state.activeRestrictions.map(r => r.restriction)),
                        p1HasWeapon: newBattle.player1.state.hasWeapon,
                        p2HasWeapon: newBattle.player2.state.hasWeapon,
                      });
                    }
                  }
                } catch (err: any) {
                  issues.push({
                    type: 'EXCEPTION',
                    p1Page, p2Page,
                    p1Move: p1Move.name, p2Move: p2Move.name,
                    range: 'extended',
                    details: err.message,
                  });
                }
              }
            }
          }
        }

        console.log(`  Extended range: tested ${tested} move combinations across all page pairs`);
        if (issues.length > 0) {
          console.log(`  ISSUES: ${issues.length}`);
          const byType: Record<string, number> = {};
          for (const i of issues) { byType[i.type] = (byType[i.type] || 0) + 1; }
          console.log(`  Breakdown:`, byType);
          for (const i of issues.slice(0, 20)) {
            console.log(`    [${i.type}] p${i.p1Page} vs p${i.p2Page} (${i.p1Move} vs ${i.p2Move}): ${i.details}`);
            if (i.p1Restrictions) console.log(`      P1 restrictions: ${i.p1Restrictions}, weapon: ${i.p1HasWeapon}`);
            if (i.p2Restrictions) console.log(`      P2 restrictions: ${i.p2Restrictions}, weapon: ${i.p2HasWeapon}`);
          }
        }
        expect(tested).toBeGreaterThan(0);
        expect(issues.filter(i => i.type === 'EXCEPTION').length).toBe(0);
        expect(issues.filter(i => i.type === 'NO_VALID_MOVES').length).toBe(0);
      });

      it('should resolve all cross-range page pairs (normal vs extended) without crashes', () => {
        // Test what happens when one player is on a normal page and the other on an extended page.
        // This can happen due to range sync in applyExchange and tests the fallback behavior.
        const issues: PagePairIssue[] = [];
        const battle = createBattle(char1Id, char2Id);

        // All moves for each character
        const allP1Moves = battle.player1.sheet.maneuvers;
        const allP2Moves = battle.player2.sheet.maneuvers;

        let tested = 0;

        // For each normal-range move of P1 vs extended-range move of P2
        for (const p1Move of allP1Moves) {
          for (const p2Move of allP2Moves) {
            const p1NormalPage = p1Move.normalPage;
            const p2ExtPage = p2Move.extendedPage;

            // Skip if pages are in the same range
            if (p1NormalPage >= 50 || p2ExtPage < 50) continue;

            const testBattle = deepClone(battle);
            // Force normal range for P1, but use extendedPage for P2's move
            testBattle.player1.state.isExtendedRange = false;
            testBattle.player2.state.isExtendedRange = true;
            testBattle.player1.state.activeRestrictions = [];
            testBattle.player2.state.activeRestrictions = [{
              restriction: { type: 'ONLY_CATEGORY', categories: ['EXTENDED_RANGE'] },
              duration: 1,
          source: 'test',
            }];

            try {
              const exchange = resolveExchange(testBattle, p1Move, p2Move);
              applyExchange(testBattle, exchange);
              tested++;
              // These will likely produce fallback lookups (missing mappings)
              // That's expected since normal pages only map to other normal pages
            } catch (err: any) {
              issues.push({
                type: 'EXCEPTION',
                p1Page: p1NormalPage, p2Page: p2ExtPage,
                p1Move: p1Move.name, p2Move: p2Move.name,
                range: 'normal',
                details: err.message,
              });
            }
          }
        }

        console.log(`  Cross-range: tested ${tested} combinations`);
        if (issues.length > 0) {
          console.log(`  EXCEPTIONS: ${issues.length}`);
          for (const i of issues.slice(0, 10)) {
            console.log(`    [${i.type}] p${i.p1Page} vs p${i.p2Page}: ${i.details}`);
          }
        }
        // Cross-range should not crash even if lookups fall back
        expect(issues.filter(i => i.type === 'EXCEPTION').length).toBe(0);
      });

      it('should complete 20 random battles without getting stuck', () => {
        const stuckBattles: { battleNum: number; round: number; details: string }[] = [];

        for (let i = 0; i < 20; i++) {
          let battle = createBattle(char1Id, char2Id);
          let round = 0;
          let stuck = false;
          let consecutiveRetries = 0;
          const maxRounds = 100;
          const maxRetries = 50;

          while (battle.status !== 'GAME_OVER' && round < maxRounds) {
            const p1Moves = getValidMoves(battle.player1);
            const p2Moves = getValidMoves(battle.player2);

            if (p1Moves.length === 0 || p2Moves.length === 0) {
              stuckBattles.push({
                battleNum: i + 1,
                round,
                details: `No valid moves: P1=${p1Moves.length}, P2=${p2Moves.length}. ` +
                  `P1 restrictions: ${JSON.stringify(battle.player1.state.activeRestrictions.map(r => r.restriction))}. ` +
                  `P2 restrictions: ${JSON.stringify(battle.player2.state.activeRestrictions.map(r => r.restriction))}. ` +
                  `Extended: ${battle.player1.state.isExtendedRange}. ` +
                  `P1 weapon: ${battle.player1.state.hasWeapon}. P2 weapon: ${battle.player2.state.hasWeapon}`
              });
              stuck = true;
              break;
            }

            const p1Move = p1Moves[Math.floor(Math.random() * p1Moves.length)];
            const p2Move = p2Moves[Math.floor(Math.random() * p2Moves.length)];

            try {
              const exchange = resolveExchange(battle, p1Move, p2Move);
              battle = applyExchange(battle, exchange);
              round++;
              consecutiveRetries = 0;
            } catch {
              consecutiveRetries++;
              if (consecutiveRetries >= maxRetries) {
                stuckBattles.push({
                  battleNum: i + 1,
                  round,
                  details: `Stuck in retry loop after ${maxRetries} consecutive failures`
                });
                stuck = true;
                break;
              }
            }
          }

          if (!stuck && round >= maxRounds) {
            stuckBattles.push({
              battleNum: i + 1,
              round,
              details: `Battle exceeded ${maxRounds} rounds without ending`
            });
          }
        }

        if (stuckBattles.length > 0) {
          console.log(`  STUCK BATTLES: ${stuckBattles.length}/20`);
          for (const sb of stuckBattles) {
            console.log(`    Battle ${sb.battleNum}, round ${sb.round}: ${sb.details}`);
          }
        }
        expect(stuckBattles.length).toBe(0);
      });
    });
  }
});

// ============================================
// TEST B: Online Battle Simulation
// ============================================

/**
 * Simulates multiplayer where:
 * - Both players select moves independently
 * - Host resolves the exchange
 * - Result is broadcast to both players
 * - Both players update their local state
 *
 * The key difference from local play: in online, the guest
 * receives the exchange result and applies it to their LOCAL
 * battle state. If there's any state drift between host and
 * guest, moves could get stuck.
 */

interface OnlineBattleLog {
  round: number;
  hostMove: string;
  guestMove: string;
  hostP1HP: number;
  hostP2HP: number;
  guestP1HP: number;
  guestP2HP: number;
  hostExtended: boolean;
  guestExtended: boolean;
  stateMatch: boolean;
  hostP1Restrictions: string;
  guestP1Restrictions: string;
  hostP2Restrictions: string;
  guestP2Restrictions: string;
}

function simulateOnlineBattle(
  char1Id: string,
  char2Id: string,
  maxRounds: number = 50,
): {
  log: OnlineBattleLog[];
  issues: string[];
  winner: string | null;
  rounds: number;
} {
  // HOST creates battle: player1 = host's character, player2 = guest's character
  let hostBattle = createBattle(char1Id, char2Id);
  // GUEST creates battle: player1 = guest's character (their local), player2 = host's character
  // BUT in the actual code, the guest also has player1=their char, player2=opponent
  // So guest's player1 = char2, guest's player2 = char1
  let guestBattle = createBattle(char2Id, char1Id);

  const log: OnlineBattleLog[] = [];
  const issues: string[] = [];
  let round = 0;

  while (hostBattle.status !== 'GAME_OVER' && round < maxRounds) {
    // Both players get valid moves from THEIR perspective
    const hostMoves = getValidMoves(hostBattle.player1);  // Host's char
    const guestMoves = getValidMoves(guestBattle.player1); // Guest's char

    if (hostMoves.length === 0) {
      issues.push(`Round ${round}: Host (${char1Id}) has no valid moves. ` +
        `Restrictions: ${JSON.stringify(hostBattle.player1.state.activeRestrictions.map(r => r.restriction))}. ` +
        `Extended: ${hostBattle.player1.state.isExtendedRange}, Weapon: ${hostBattle.player1.state.hasWeapon}`);
      break;
    }
    if (guestMoves.length === 0) {
      issues.push(`Round ${round}: Guest (${char2Id}) has no valid moves. ` +
        `Restrictions: ${JSON.stringify(guestBattle.player1.state.activeRestrictions.map(r => r.restriction))}. ` +
        `Extended: ${guestBattle.player1.state.isExtendedRange}, Weapon: ${guestBattle.player1.state.hasWeapon}`);
      break;
    }

    // Random move selection
    const hostMove = hostMoves[Math.floor(Math.random() * hostMoves.length)];
    const guestMove = guestMoves[Math.floor(Math.random() * guestMoves.length)];

    // HOST resolves: hostMove = player1's move, guestMove = player2's move
    try {
      const hostExchange = resolveExchange(hostBattle, hostMove, guestMove);
      hostBattle = applyExchange(hostBattle, hostExchange);
    } catch (err: any) {
      issues.push(`Round ${round}: HOST resolve failed: ${err.message} ` +
        `(${hostMove.name} vs ${guestMove.name})`);
      break;
    }

    // GUEST resolves: guestMove = player1's move, hostMove = player2's move
    // This mirrors what happens in applyMultiplayerExchange on the guest side
    try {
      const guestExchange = resolveExchange(guestBattle, guestMove, hostMove);
      guestBattle = applyExchange(guestBattle, guestExchange);
    } catch (err: any) {
      issues.push(`Round ${round}: GUEST resolve failed: ${err.message} ` +
        `(${guestMove.name} vs ${hostMove.name})`);
      break;
    }

    round++;

    // Compare states: host's player1 should match guest's player2 and vice versa
    const hostP1HP = hostBattle.player1.state.bodyPoints;
    const hostP2HP = hostBattle.player2.state.bodyPoints;
    const guestP1HP = guestBattle.player1.state.bodyPoints;  // Guest's char
    const guestP2HP = guestBattle.player2.state.bodyPoints;  // Host's char from guest perspective

    // Host's player1 = char1, Guest's player2 = char1
    // Host's player2 = char2, Guest's player1 = char2
    const char1HPMatch = hostP1HP === guestP2HP;
    const char2HPMatch = hostP2HP === guestP1HP;
    const rangeMatch = hostBattle.player1.state.isExtendedRange === guestBattle.player1.state.isExtendedRange;

    const stateMatch = char1HPMatch && char2HPMatch && rangeMatch;

    if (!stateMatch) {
      issues.push(
        `Round ${round}: STATE MISMATCH! ` +
        `Host: ${char1Id}=${hostP1HP}hp, ${char2Id}=${hostP2HP}hp, ext=${hostBattle.player1.state.isExtendedRange}. ` +
        `Guest: ${char2Id}=${guestP1HP}hp, ${char1Id}=${guestP2HP}hp, ext=${guestBattle.player1.state.isExtendedRange}. ` +
        `Moves: ${hostMove.name} vs ${guestMove.name}`
      );
    }

    // Check restriction sync
    const hostP1RestStr = JSON.stringify(hostBattle.player1.state.activeRestrictions.map(r => r.restriction));
    const guestP2RestStr = JSON.stringify(guestBattle.player2.state.activeRestrictions.map(r => r.restriction));
    const hostP2RestStr = JSON.stringify(hostBattle.player2.state.activeRestrictions.map(r => r.restriction));
    const guestP1RestStr = JSON.stringify(guestBattle.player1.state.activeRestrictions.map(r => r.restriction));

    if (hostP1RestStr !== guestP2RestStr) {
      issues.push(
        `Round ${round}: RESTRICTION MISMATCH for ${char1Id}! ` +
        `Host P1: ${hostP1RestStr}, Guest P2: ${guestP2RestStr}`
      );
    }
    if (hostP2RestStr !== guestP1RestStr) {
      issues.push(
        `Round ${round}: RESTRICTION MISMATCH for ${char2Id}! ` +
        `Host P2: ${hostP2RestStr}, Guest P1: ${guestP1RestStr}`
      );
    }

    log.push({
      round,
      hostMove: hostMove.name,
      guestMove: guestMove.name,
      hostP1HP,
      hostP2HP,
      guestP1HP,
      guestP2HP,
      hostExtended: hostBattle.player1.state.isExtendedRange,
      guestExtended: guestBattle.player1.state.isExtendedRange,
      stateMatch,
      hostP1Restrictions: hostP1RestStr,
      guestP1Restrictions: guestP1RestStr,
      hostP2Restrictions: hostP2RestStr,
      guestP2Restrictions: guestP2RestStr,
    });

    // Check game-over sync
    if (hostBattle.status === 'GAME_OVER' && guestBattle.status !== 'GAME_OVER') {
      issues.push(`Round ${round}: Host says GAME_OVER but guest doesn't!`);
    }
    if (guestBattle.status === 'GAME_OVER' && hostBattle.status !== 'GAME_OVER') {
      issues.push(`Round ${round}: Guest says GAME_OVER but host doesn't!`);
    }
  }

  return {
    log,
    issues,
    winner: hostBattle.winner,
    rounds: round,
  };
}

describe('TEST B: Online Battle Simulation (State Sync)', () => {

  describe('Hill Troll vs Hill Troll (10 battles)', () => {
    it('should maintain state sync across all battles', () => {
      const allIssues: string[] = [];
      const results: { rounds: number; winner: string | null; issues: number }[] = [];

      for (let i = 0; i < 10; i++) {
        const result = simulateOnlineBattle('hill-troll', 'hill-troll');
        results.push({ rounds: result.rounds, winner: result.winner, issues: result.issues.length });
        if (result.issues.length > 0) {
          allIssues.push(`--- Battle ${i + 1} ---`);
          allIssues.push(...result.issues);
        }
      }

      console.log('\n  Hill Troll vs Hill Troll results:');
      for (let i = 0; i < results.length; i++) {
        console.log(`    Battle ${i + 1}: ${results[i].rounds} rounds, winner=${results[i].winner}, issues=${results[i].issues}`);
      }

      if (allIssues.length > 0) {
        console.log('\n  ALL ISSUES:');
        for (const issue of allIssues) {
          console.log(`    ${issue}`);
        }
      }

      // State mismatches are critical - they cause stuck games
      const stateMismatches = allIssues.filter(i => i.includes('STATE MISMATCH') || i.includes('RESTRICTION MISMATCH'));
      expect(stateMismatches.length).toBe(0);
    });
  });

  describe('Man in Chainmail vs Man in Chainmail (10 battles)', () => {
    it('should maintain state sync across all battles', () => {
      const allIssues: string[] = [];
      const results: { rounds: number; winner: string | null; issues: number }[] = [];

      for (let i = 0; i < 10; i++) {
        const result = simulateOnlineBattle('man-in-chainmail', 'man-in-chainmail');
        results.push({ rounds: result.rounds, winner: result.winner, issues: result.issues.length });
        if (result.issues.length > 0) {
          allIssues.push(`--- Battle ${i + 1} ---`);
          allIssues.push(...result.issues);
        }
      }

      console.log('\n  MC vs MC results:');
      for (let i = 0; i < results.length; i++) {
        console.log(`    Battle ${i + 1}: ${results[i].rounds} rounds, winner=${results[i].winner}, issues=${results[i].issues}`);
      }

      if (allIssues.length > 0) {
        console.log('\n  ALL ISSUES:');
        for (const issue of allIssues) {
          console.log(`    ${issue}`);
        }
      }

      const stateMismatches = allIssues.filter(i => i.includes('STATE MISMATCH') || i.includes('RESTRICTION MISMATCH'));
      expect(stateMismatches.length).toBe(0);
    });
  });

  describe('Cross-character online battles (10 each)', () => {
    it('MC host vs HT guest - 10 battles', () => {
      const allIssues: string[] = [];

      for (let i = 0; i < 10; i++) {
        const result = simulateOnlineBattle('man-in-chainmail', 'hill-troll');
        if (result.issues.length > 0) {
          allIssues.push(`--- Battle ${i + 1} ---`);
          allIssues.push(...result.issues);
        }
      }

      if (allIssues.length > 0) {
        console.log('\n  MC host vs HT guest ISSUES:');
        for (const issue of allIssues) {
          console.log(`    ${issue}`);
        }
      }

      const stateMismatches = allIssues.filter(i => i.includes('STATE MISMATCH') || i.includes('RESTRICTION MISMATCH'));
      expect(stateMismatches.length).toBe(0);
    });

    it('HT host vs MC guest - 10 battles', () => {
      const allIssues: string[] = [];

      for (let i = 0; i < 10; i++) {
        const result = simulateOnlineBattle('hill-troll', 'man-in-chainmail');
        if (result.issues.length > 0) {
          allIssues.push(`--- Battle ${i + 1} ---`);
          allIssues.push(...result.issues);
        }
      }

      if (allIssues.length > 0) {
        console.log('\n  HT host vs MC guest ISSUES:');
        for (const issue of allIssues) {
          console.log(`    ${issue}`);
        }
      }

      const stateMismatches = allIssues.filter(i => i.includes('STATE MISMATCH') || i.includes('RESTRICTION MISMATCH'));
      expect(stateMismatches.length).toBe(0);
    });
  });
});
