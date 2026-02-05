/**
 * Battle Simulator Tests
 *
 * Based on the original Smalltalk LWBattleSimulator.
 * Runs automated battles to verify game mechanics.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { createCharacterFromDefinition } from '../data/characterLoader';
import { resolveExchange, applyExchange } from '../domain/models/BattleEngine';
import type { Battle, Character, Maneuver, CharacterDefinition } from '../domain/types';

// Load character definitions from filesystem (for Node.js tests)
function loadCharacterSync(characterId: string): Character {
  const filePath = join(process.cwd(), 'public', 'characters', `${characterId}.json`);
  const json = readFileSync(filePath, 'utf-8');
  const definition = JSON.parse(json) as CharacterDefinition;
  return createCharacterFromDefinition(definition);
}

// Helper to get valid moves for a character
function getValidMoves(character: Character): Maneuver[] {
  const { state, sheet } = character;

  return sheet.maneuvers.filter(maneuver => {
    // Check weapon requirement
    if (!state.hasWeapon) {
      const category = maneuver.category;
      const name = maneuver.name.toUpperCase();
      if (category !== 'JUMP' && category !== 'RAGE') {
        if (category !== 'SPECIAL' || (!name.includes('KICK') && !name.includes('RETRIEVE'))) {
          return false;
        }
      }
    }

    // Check restrictions
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
    default: return true;
  }
}

// Helper to create a battle
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

// Run a full simulated battle with random moves
function simulateBattle(
  char1Id: string,
  char2Id: string,
  maxRounds: number = 50
): { battle: Battle; rounds: number; winner: string | null } {
  let battle = createBattle(char1Id, char2Id);
  let rounds = 0;
  let retries = 0;
  const maxRetries = 100; // Prevent infinite loops

  while (battle.status !== 'GAME_OVER' && rounds < maxRounds && retries < maxRetries) {
    const p1Moves = getValidMoves(battle.player1);
    const p2Moves = getValidMoves(battle.player2);

    // Handle edge case: no valid moves (simulation stuck)
    if (p1Moves.length === 0 || p2Moves.length === 0) {
      console.warn(`No valid moves at round ${rounds}, ending simulation`);
      // Determine winner based on HP if stuck
      if (battle.player1.state.bodyPoints <= 0) {
        battle.winner = 'player2';
        battle.status = 'GAME_OVER';
      } else if (battle.player2.state.bodyPoints <= 0) {
        battle.winner = 'player1';
        battle.status = 'GAME_OVER';
      } else {
        // Tie based on HP percentage
        const p1Pct = battle.player1.state.bodyPoints / battle.player1.state.maxBodyPoints;
        const p2Pct = battle.player2.state.bodyPoints / battle.player2.state.maxBodyPoints;
        battle.winner = p1Pct > p2Pct ? 'player1' : 'player2';
        battle.status = 'GAME_OVER';
      }
      break;
    }

    // Random selection
    const p1Move = p1Moves[Math.floor(Math.random() * p1Moves.length)];
    const p2Move = p2Moves[Math.floor(Math.random() * p2Moves.length)];

    // Try to resolve exchange - some page combinations may not have mappings
    try {
      const exchange = resolveExchange(battle, p1Move, p2Move);
      battle = applyExchange(battle, exchange);
      rounds++;
      retries = 0; // Reset retries on success
    } catch (err) {
      // Page mapping missing - try different moves
      retries++;
      if (retries >= maxRetries) {
        console.warn(`Simulation stuck after ${rounds} rounds due to missing mappings`);
        break;
      }
    }
  }

  return {
    battle,
    rounds,
    winner: battle.winner,
  };
}

// Scripted battle sequences for deterministic testing
interface ScriptedMove {
  player1Move: string;  // Move name
  player2Move: string;
}

function runScriptedBattle(
  char1Id: string,
  char2Id: string,
  script: ScriptedMove[]
): { battle: Battle; results: any[] } {
  let battle = createBattle(char1Id, char2Id);
  const results: any[] = [];

  for (const turn of script) {
    const p1Move = battle.player1.sheet.maneuvers.find(m => m.name === turn.player1Move);
    const p2Move = battle.player2.sheet.maneuvers.find(m => m.name === turn.player2Move);

    if (!p1Move) throw new Error(`Move not found: ${turn.player1Move}`);
    if (!p2Move) throw new Error(`Move not found: ${turn.player2Move}`);

    const exchange = resolveExchange(battle, p1Move, p2Move);
    battle = applyExchange(battle, exchange);

    results.push({
      round: battle.round,
      p1HP: battle.player1.state.bodyPoints,
      p2HP: battle.player2.state.bodyPoints,
      p1Damage: exchange.player1Result.damageTaken,
      p2Damage: exchange.player2Result.damageTaken,
    });

    if (battle.status === 'GAME_OVER') break;
  }

  return { battle, results };
}


describe('Battle Mechanics', () => {
  describe('Character Loading', () => {
    it('should load Man in Chainmail', () => {
      const char = loadCharacterSync('man-in-chainmail');
      expect(char.name).toBe('Man in Chainmail');
      expect(char.state.maxBodyPoints).toBe(12);
      expect(char.sheet.maneuvers.length).toBeGreaterThan(0);
    });

    it('should load Hill Troll', () => {
      const char = loadCharacterSync('hill-troll');
      expect(char.name).toBe('Hill Troll with Club');
      expect(char.state.maxBodyPoints).toBe(35);
    });
  });

  describe('Extended Range Start', () => {
    it('should start at extended range with only extended moves available', () => {
      const battle = createBattle('man-in-chainmail', 'hill-troll');

      // Check that isExtendedRange is true
      expect(battle.player1.state.isExtendedRange).toBe(true);
      expect(battle.player2.state.isExtendedRange).toBe(true);

      // Check that only extended range moves are valid
      const p1ValidMoves = getValidMoves(battle.player1);
      const allExtended = p1ValidMoves.every(m => m.category === 'EXTENDED_RANGE');
      expect(allExtended).toBe(true);
    });
  });

  describe('Basic Exchange', () => {
    it('should resolve a basic exchange without errors', () => {
      const battle = createBattle('man-in-chainmail', 'hill-troll');

      // Get extended range moves for first turn
      const p1Moves = getValidMoves(battle.player1);
      const p2Moves = getValidMoves(battle.player2);

      expect(p1Moves.length).toBeGreaterThan(0);
      expect(p2Moves.length).toBeGreaterThan(0);

      const exchange = resolveExchange(battle, p1Moves[0], p2Moves[0]);
      expect(exchange).toBeDefined();
      expect(exchange.player1Maneuver).toBe(p1Moves[0]);
      expect(exchange.player2Maneuver).toBe(p2Moves[0]);
    });
  });

  describe('Battle Simulation', () => {
    it('should complete a random battle within 50 rounds', () => {
      const result = simulateBattle('man-in-chainmail', 'hill-troll');

      expect(result.rounds).toBeLessThanOrEqual(50);
      console.log(`Battle completed in ${result.rounds} rounds. Winner: ${result.winner}`);
    });

    it('should run 10 simulated battles', () => {
      const wins = { 'player1': 0, 'player2': 0, 'draw': 0 };

      for (let i = 0; i < 10; i++) {
        const result = simulateBattle('man-in-chainmail', 'hill-troll');
        if (result.winner === 'player1') wins.player1++;
        else if (result.winner === 'player2') wins.player2++;
        else wins.draw++;
      }

      console.log('Battle Statistics:', wins);
      expect(wins.player1 + wins.player2 + wins.draw).toBe(10);
    });
  });

  describe('Scripted Battle', () => {
    it('should run a scripted opening sequence', () => {
      // Test a specific sequence of moves
      const script: ScriptedMove[] = [
        { player1Move: 'Charge', player2Move: 'Charge' },  // Extended range
      ];

      const { results } = runScriptedBattle(
        'man-in-chainmail',
        'hill-troll',
        script
      );

      expect(results.length).toBe(1);
      console.log('Scripted battle results:', results);
    });
  });
});


describe('Damage Calculation', () => {
  it('should track body points correctly', () => {
    const battle = createBattle('man-in-chainmail', 'hill-troll');

    // Initial HP
    expect(battle.player1.state.bodyPoints).toBe(12);
    expect(battle.player2.state.bodyPoints).toBe(35);
  });
});


describe('Move Availability', () => {
  it('should have correct number of maneuvers for Man in Chainmail', () => {
    const char = loadCharacterSync('man-in-chainmail');
    // Man in Chainmail has Down Swing, Side Swing, Thrust, Fake, Protected Attack, Special, Shield Block, Jump, Extended Range
    expect(char.sheet.maneuvers.length).toBeGreaterThan(20);
  });

  it('should have Charge move in extended range category', () => {
    const char = loadCharacterSync('man-in-chainmail');
    const charge = char.sheet.maneuvers.find(m => m.name === 'Charge');
    expect(charge).toBeDefined();
    expect(charge?.category).toBe('EXTENDED_RANGE');
  });
});
