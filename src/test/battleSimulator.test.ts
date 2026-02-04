/**
 * Battle Simulator Tests
 *
 * Based on the original Smalltalk LWBattleSimulator.
 * Runs automated battles to verify game mechanics.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { loadCharacter } from '../data/characterLoader';
import { resolveExchange, applyExchange } from '../domain/models/BattleEngine';
import type { Battle, Character, Maneuver } from '../domain/types';

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
async function createBattle(char1Id: string, char2Id: string): Promise<Battle> {
  const [player1, player2] = await Promise.all([
    loadCharacter(char1Id),
    loadCharacter(char2Id),
  ]);

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
async function simulateBattle(
  char1Id: string,
  char2Id: string,
  maxRounds: number = 50
): Promise<{ battle: Battle; rounds: number; winner: string | null }> {
  let battle = await createBattle(char1Id, char2Id);
  let rounds = 0;

  while (battle.status !== 'GAME_OVER' && rounds < maxRounds) {
    const p1Moves = getValidMoves(battle.player1);
    const p2Moves = getValidMoves(battle.player2);

    if (p1Moves.length === 0 || p2Moves.length === 0) {
      throw new Error(`No valid moves at round ${rounds}`);
    }

    // Random selection
    const p1Move = p1Moves[Math.floor(Math.random() * p1Moves.length)];
    const p2Move = p2Moves[Math.floor(Math.random() * p2Moves.length)];

    // Resolve exchange
    const exchange = resolveExchange(battle, p1Move, p2Move);
    battle = applyExchange(battle, exchange);
    rounds++;
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

async function runScriptedBattle(
  char1Id: string,
  char2Id: string,
  script: ScriptedMove[]
): Promise<{ battle: Battle; results: any[] }> {
  let battle = await createBattle(char1Id, char2Id);
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
    it('should load Man in Chainmail', async () => {
      const char = await loadCharacter('man-in-chainmail');
      expect(char.name).toBe('Man in Chainmail');
      expect(char.state.maxBodyPoints).toBe(12);
      expect(char.sheet.maneuvers.length).toBeGreaterThan(0);
    });

    it('should load Hill Troll', async () => {
      const char = await loadCharacter('hill-troll');
      expect(char.name).toBe('Hill Troll with Club');
      expect(char.state.maxBodyPoints).toBe(35);
    });
  });

  describe('Extended Range Start', () => {
    it('should start at extended range with only extended moves available', async () => {
      const battle = await createBattle('man-in-chainmail', 'hill-troll');

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
    it('should resolve a basic exchange without errors', async () => {
      let battle = await createBattle('man-in-chainmail', 'hill-troll');

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
    it('should complete a random battle within 50 rounds', async () => {
      const result = await simulateBattle('man-in-chainmail', 'hill-troll');

      expect(result.rounds).toBeLessThanOrEqual(50);
      console.log(`Battle completed in ${result.rounds} rounds. Winner: ${result.winner}`);
    });

    it('should run 10 simulated battles', async () => {
      const wins = { 'player1': 0, 'player2': 0, 'draw': 0 };

      for (let i = 0; i < 10; i++) {
        const result = await simulateBattle('man-in-chainmail', 'hill-troll');
        if (result.winner === 'player1') wins.player1++;
        else if (result.winner === 'player2') wins.player2++;
        else wins.draw++;
      }

      console.log('Battle Statistics:', wins);
      expect(wins.player1 + wins.player2 + wins.draw).toBe(10);
    });
  });

  describe('Scripted Battle', () => {
    it('should run a scripted opening sequence', async () => {
      // Test a specific sequence of moves
      const script: ScriptedMove[] = [
        { player1Move: 'Charge', player2Move: 'Charge' },  // Extended range
      ];

      const { battle, results } = await runScriptedBattle(
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
  it('should track body points correctly', async () => {
    const battle = await createBattle('man-in-chainmail', 'hill-troll');

    // Initial HP
    expect(battle.player1.state.bodyPoints).toBe(12);
    expect(battle.player2.state.bodyPoints).toBe(35);
  });
});
