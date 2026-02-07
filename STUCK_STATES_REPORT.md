# Stuck States & Edge Cases Report

## Summary

Analysis of all scenarios where the Lost Worlds game could get stuck, crash, or behave unexpectedly.

| Issue | Severity | Frequency | Fix Needed |
|-------|----------|-----------|------------|
| Zero mappings crash | **CRITICAL** | Common (6 MiC moves affected) | Data fix + error handling |
| Extended range not used | MEDIUM | Always (design gap) | Code fix in getManeuverPage() |
| Restriction stuck states | LOW | Impossible in normal play | No fix needed |
| Weapon loss stuck | NONE | Cannot happen | No fix needed |
| AI no-move hang | LOW | Extremely rare | Add fallback |

---

## 1. Zero Mappings in Hill Troll Lookup Tables (CRITICAL)

Hill Troll's lookup tables have entries mapping to `0` for opponent pages **4, 12, 22, 26, 38, 42**. This pattern appears in ALL 32 of its lookup pages (~192 broken entries).

These correspond to **Man in Chainmail** moves:

| Page | Move | Category | Color |
|------|------|----------|-------|
| 4 | Low | SHIELD_BLOCK | green |
| 12 | Low | FAKE | blue |
| 22 | Side Swing | FAKE | blue |
| 26 | High | SHIELD_BLOCK | green |
| 38 | Thrust | FAKE | red |
| 42 | High | FAKE | red |

When Man in Chainmail uses any of these 6 moves, `BattleEngine.ts` throws:
```
Error: No mapping for opponent page X on lookup page Y
```

The game crashes. These are common defensive moves (Shield Block, Fake) that players will use regularly.

**Man in Chainmail has NO zero mappings** — all entries map to valid pages.

### Fix Options
- **A)** Fill in missing mappings with correct picture page numbers (requires original game data)
- **B)** Add error handling: use a default result page (e.g., page 1 "Jumping Away") instead of crashing
- **C)** Both: fix the data AND add error handling as a safety net

---

## 2. Extended Range Not Implemented (MEDIUM)

In `BattleEngine.ts`, `getManeuverPage()` always returns `normalPage`, ignoring extended range:

```typescript
function getManeuverPage(maneuver: Maneuver, _isExtendedRange: boolean): number {
  return maneuver.normalPage;  // Extended page never used
}
```

The game starts at extended range (`characterLoader.ts` line 135) with `ONLY_CATEGORY: EXTENDED_RANGE`, but the `extendedPage` numbers on maneuvers are never used for lookups.

**Impact:** Extended range combat mechanics are partially broken. Lookup results CAN point to extended range picture pages, but the page cross-referencing always uses normal page numbers. The game is playable but doesn't fully implement the extended range mechanic.

---

## 3. Restriction-Based Stuck States (LOW RISK)

Restrictions clear after each exchange (`BattleEngine.ts` line 214), making restriction stacking impossible. The highest-risk scenario is **Page 41 "Knocked Down"** (`ONLY_CATEGORY: JUMP`) which limits to 4 moves — but all 4 are always available since restrictions don't stack.

**Verdict:** Cannot happen in normal gameplay.

---

## 4. Weapon Loss (SAFE)

When `LOSE_WEAPON` fires, valid moves remain:
- Man in Chainmail: 6 moves (4 JUMP + Kick + Retrieve Weapon)
- Hill Troll: 9 moves (4 JUMP + 3 RAGE + Kick + Retrieve)

Always has Retrieve Weapon available to recover. **Cannot get stuck.**

---

## 5. AI No Valid Moves (LOW RISK)

If `getAIMove()` returns `null`, `executeExchange()` silently returns. The game would hang with no error message. Extremely unlikely but should have a fallback.

---

*Report generated: 2026-02-07*
*Files analyzed: BattleEngine.ts, gameStore.ts, character.ts, man-in-chainmail.json, hill-troll.json*
