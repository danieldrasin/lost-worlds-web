# Known Issues - Lost Worlds Web

## Data Quality Issues

### 1. "No Valid Moves" Edge Cases
**Status:** Open
**Severity:** Medium
**Found:** During automated battle simulation testing

**Description:**
Some battle states result in characters having no valid moves available. This happens when restrictions from picture page results are too restrictive or don't properly account for all game states.

**Symptoms:**
- Battle simulation logs: `No valid moves at round X, ending simulation`
- Happens after certain move combinations
- More likely to occur after several rounds of combat

**Root Cause:**
The restriction system from the original Smalltalk implementation may have incomplete data. Some picture page results apply restrictions that, combined with other game state (like extended range), leave no valid moves.

**Affected Files:**
- `public/characters/man-in-chainmail.json` - Picture page restrictions
- `public/characters/hill-troll.json` - Picture page restrictions
- `src/domain/models/BattleEngine.ts` - Restriction checking

**Workaround:**
The battle simulator handles this gracefully by ending the battle early and determining winner by HP percentage.

**To Fix:**
1. Audit all picture page restrictions in character JSON files
2. Ensure every restriction combination leaves at least one valid move
3. Consider adding a "fallback" move that's always available
4. Add validation during character loading to detect problematic restrictions

---

### 2. Missing Page Mappings
**Status:** Open
**Severity:** Low
**Found:** During automated battle simulation testing

**Description:**
Some lookup page combinations don't have mappings, causing `No mapping for opponent page X on lookup page Y` errors.

**Workaround:**
Battle simulator retries with different move combinations.

**To Fix:**
1. Audit lookup tables in character JSON files
2. Ensure all valid page combinations have mappings
3. Add validation during character loading

---

## Game Balance Issues

### 3. Hill Troll vs Man in Chainmail Balance
**Status:** Noted
**Severity:** Low (by design)

**Description:**
In automated testing, Hill Troll wins 10/10 battles against Man in Chainmail.

**Analysis:**
This is expected - Hill Troll has 35 HP vs Man in Chainmail's 12 HP. The original game was designed for asymmetric matchups where player skill matters more than raw stats.

---

## Multiplayer Issues

### 4. Socket Reconnection
**Status:** Open
**Severity:** Medium

**Description:**
If a player's connection drops mid-battle, the game state may become inconsistent.

**To Fix:**
1. Add reconnection logic in socket.ts
2. Store battle state on server
3. Allow rejoining a battle in progress

---

## Last Updated
2026-02-04
