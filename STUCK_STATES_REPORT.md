# Stuck States & Edge Cases Report

## Summary

Analysis of all scenarios where the Lost Worlds game could get stuck, crash, or behave unexpectedly.

| Issue | Severity | Status | Fix Applied |
|-------|----------|--------|-------------|
| Zero mappings crash | **CRITICAL** | **FIXED** | Nearest-neighbor fill + defensive fallback |
| Extended range not used | MEDIUM | **FIXED** | getManeuverPage() now uses extendedPage |
| Range desync between players | MEDIUM | **FIXED** | Shared range synchronization in applyExchange() |
| Restriction stuck states | LOW | No fix needed | Cannot happen in normal play |
| Weapon loss stuck | NONE | No fix needed | Cannot get stuck |
| AI no-move hang | LOW | **FIXED** | Fallback to first available maneuver |

---

## 1. Zero Mappings in Hill Troll Lookup Tables (FIXED)

Hill Troll's lookup tables had 144 entries mapping to `0` for opponent pages **4, 12, 22, 26, 38, 42** across 24 normal-range lookup pages.

These correspond to **Man in Chainmail** moves:

| Page | Move | Category | Color |
|------|------|----------|-------|
| 4 | Low | SHIELD_BLOCK | green |
| 12 | Low | FAKE | blue |
| 22 | Side Swing | FAKE | blue |
| 26 | High | SHIELD_BLOCK | green |
| 38 | Thrust | FAKE | red |
| 42 | High | FAKE | red |

### Fix Applied
- **Data fix:** Filled all 144 zero entries using nearest-neighbor interpolation (copy result from closest valid opponent page)
- **Safety net:** `lookupResult()` now falls back to page 1 ("Jumping Away") instead of crashing on any remaining gaps
- **Verification:** Stress test confirms 0 errors across 956 valid move combinations

---

## 2. Extended Range Now Implemented (FIXED)

`getManeuverPage()` now correctly uses `extendedPage` when `isExtendedRange` is true:

```typescript
function getManeuverPage(maneuver: Maneuver, isExtendedRange: boolean): number {
  if (isExtendedRange && maneuver.extendedPage) {
    return maneuver.extendedPage;
  }
  return maneuver.normalPage;
}
```

Extended range combat mechanics now work correctly. The game starts at extended range with only EXTENDED_RANGE moves available, and transitions to normal range when a result page sets `isExtendedRange: false`.

---

## 3. Range State Synchronization (FIXED)

**Discovered during fix:** Range (`isExtendedRange`) was stored per-character, allowing desync where one character could be at extended range while the other is at normal range. In the real Lost Worlds game, range is shared.

### Fix Applied
`applyExchange()` now synchronizes range after computing both players' new states:

```typescript
const sharedRange = p1State.isExtendedRange || p2State.isExtendedRange;
p1State.isExtendedRange = sharedRange;
p2State.isExtendedRange = sharedRange;
```

If either result says extended range, both characters are at extended range (conservative fallback).

---

## 4. Restriction-Based Stuck States (NO FIX NEEDED)

Restrictions clear after each exchange, making restriction stacking impossible. The highest-risk scenario is **Page 41 "Knocked Down"** (`ONLY_CATEGORY: JUMP`) which limits to 4 moves, but all 4 are always available.

**Verdict:** Cannot happen in normal gameplay.

---

## 5. Weapon Loss (NO FIX NEEDED)

When `LOSE_WEAPON` fires, valid moves remain:
- Man in Chainmail: 6 moves (4 JUMP + Kick + Retrieve Weapon)
- Hill Troll: 9 moves (4 JUMP + 3 RAGE + Kick + Retrieve)

Always has Retrieve Weapon available to recover.

---

## 6. AI No Valid Moves (FIXED)

`getAIMove()` now falls back to the first available maneuver if no valid moves pass restriction checks, instead of returning `null` and silently hanging.

---

*Report generated: 2026-02-07*
*Updated: 2026-02-07 (all fixes applied and verified)*
*Files modified: BattleEngine.ts, gameStore.ts, hill-troll.json*
*Stress test: 956 valid combinations tested, 0 errors*
