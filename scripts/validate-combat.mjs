/**
 * Combat Validation Script
 *
 * Exhaustively tests all move combinations for all character pairs.
 * Checks invariants that should always hold true in Lost Worlds combat.
 *
 * Run: node scripts/validate-combat.mjs
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadCharacter(id) {
  const filePath = path.join(__dirname, '..', 'public', 'characters', `${id}.json`);
  const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

  // Flatten nested maneuver categories into a flat array of moves
  // JSON structure: maneuvers: [{ category, moves: [{ name, color, normalPage, ... }] }]
  const flatManeuvers = [];
  for (const cat of raw.maneuvers) {
    for (const move of cat.moves) {
      flatManeuvers.push({
        ...move,
        category: cat.category,
        id: `${cat.category}_${move.name}`,
      });
    }
  }
  raw.maneuvers = flatManeuvers;
  return raw;
}

const issues = [];
let testsRun = 0;
let testsOK = 0;

function report(severity, category, message) {
  issues.push({ severity, category, message });
}

/** Test 1: Internal data integrity for a single character */
function validateCharacterInternal(char) {
  const picturePageNums = new Set(char.picturePages.map(p => p.number));
  const lookupPageNums = new Set(char.lookupPages.map(p => p.number));
  const maneuverNormalPages = new Set(char.maneuvers.map(m => m.normalPage));
  const maneuverExtendedPages = new Set(
    char.maneuvers.filter(m => m.extendedPage).map(m => m.extendedPage)
  );

  for (const m of char.maneuvers) {
    if (!lookupPageNums.has(m.normalPage)) {
      report('ERROR', 'missing-lookup', `${char.name}: maneuver "${m.name}" normalPage ${m.normalPage} has no lookup page`);
    }
    if (m.extendedPage && !lookupPageNums.has(m.extendedPage)) {
      report('ERROR', 'missing-lookup', `${char.name}: maneuver "${m.name}" extendedPage ${m.extendedPage} has no lookup page`);
    }
  }

  for (const lp of char.lookupPages) {
    for (const [oppPageStr, resultPage] of Object.entries(lp.mapping)) {
      if (resultPage === 0) {
        report('WARN', 'zero-mapping', `${char.name}: lookup page ${lp.number}, opponent page ${oppPageStr} maps to 0 (will fallback)`);
      } else if (!picturePageNums.has(resultPage)) {
        report('ERROR', 'bad-picture-ref', `${char.name}: lookup page ${lp.number}, opponent page ${oppPageStr} maps to picture page ${resultPage} which doesn't exist`);
      }
    }
  }

  for (const pp of char.picturePages) {
    if (pp.damage !== null && pp.damage < 0) {
      report('WARN', 'negative-damage', `${char.name}: picture page ${pp.number} ("${pp.title}") has negative damage: ${pp.damage}`);
    }
  }

  const allManeuverPages = new Set([...maneuverNormalPages, ...maneuverExtendedPages]);
  report('INFO', 'stats', `${char.name}: ${char.maneuvers.length} maneuvers, ${char.picturePages.length} picture pages, ${char.lookupPages.length} lookup pages, ${allManeuverPages.size} unique maneuver pages`);
}

/** Test 2: Cross-character lookup completeness */
function validateLookupCoverage(me, opp, extendedRange) {
  const rangeLabel = extendedRange ? 'extended' : 'normal';

  // At normal range: EXTENDED_RANGE category moves are restricted (not available)
  // At extended range: only EXTENDED_RANGE category moves are available
  const filterByRange = (maneuvers) => extendedRange
    ? maneuvers.filter(m => m.category === 'EXTENDED_RANGE')
    : maneuvers.filter(m => m.category !== 'EXTENDED_RANGE');

  const myPages = filterByRange(me.maneuvers).map(m =>
    extendedRange ? (m.extendedPage || m.normalPage) : m.normalPage
  );
  const oppPages = filterByRange(opp.maneuvers).map(m =>
    extendedRange ? (m.extendedPage || m.normalPage) : m.normalPage
  );

  const lookupMap = new Map(me.lookupPages.map(lp => [lp.number, lp]));

  for (const myPage of myPages) {
    const lp = lookupMap.get(myPage);
    if (!lp) continue;

    for (const oppPage of oppPages) {
      testsRun++;
      const result = lp.mapping[String(oppPage)];
      if (result === undefined) {
        report('ERROR', 'missing-mapping',
          `${me.name} (${rangeLabel}): lookup page ${myPage} has no mapping for ${opp.name}'s page ${oppPage}`);
      } else if (result === 0) {
        report('ERROR', 'zero-mapping-combo',
          `${me.name} (${rangeLabel}): lookup page ${myPage} maps ${opp.name}'s page ${oppPage} to 0`);
      } else {
        testsOK++;
      }
    }
  }
}

/** Test 3: Exhaustive exchange resolution with invariant checks */
function validateAllExchanges(char1, char2) {
  const picturePages1 = new Map(char1.picturePages.map(p => [p.number, p]));
  const picturePages2 = new Map(char2.picturePages.map(p => [p.number, p]));
  const lookupPages1 = new Map(char1.lookupPages.map(lp => {
    const mapping = {};
    for (const [k, v] of Object.entries(lp.mapping)) mapping[parseInt(k, 10)] = v;
    return [lp.number, { ...lp, mapping }];
  }));
  const lookupPages2 = new Map(char2.lookupPages.map(lp => {
    const mapping = {};
    for (const [k, v] of Object.entries(lp.mapping)) mapping[parseInt(k, 10)] = v;
    return [lp.number, { ...lp, mapping }];
  }));

  let rangeDisagreements = 0;
  let combosChecked = 0;

  for (const extendedRange of [false, true]) {
    const rangeLabel = extendedRange ? 'extended' : 'normal';
    const moves1 = extendedRange
      ? char1.maneuvers.filter(m => m.category === 'EXTENDED_RANGE')
      : char1.maneuvers.filter(m => m.category !== 'EXTENDED_RANGE');
    const moves2 = extendedRange
      ? char2.maneuvers.filter(m => m.category === 'EXTENDED_RANGE')
      : char2.maneuvers.filter(m => m.category !== 'EXTENDED_RANGE');

    for (const m1 of moves1) {
      for (const m2 of moves2) {
        combosChecked++;
        const page1 = extendedRange ? m1.extendedPage : m1.normalPage;
        const page2 = extendedRange ? m2.extendedPage : m2.normalPage;

        const lp1 = lookupPages1.get(page1);
        const lp2 = lookupPages2.get(page2);
        if (!lp1 || !lp2) continue;

        const resultPage1 = lp1.mapping[page2];
        const resultPage2 = lp2.mapping[page1];
        if (!resultPage1 || !resultPage2) continue;

        const pp1 = picturePages1.get(resultPage1);
        const pp2 = picturePages2.get(resultPage2);
        if (!pp1 || !pp2) continue;

        // INVARIANT: Range agreement
        if (pp1.isExtendedRange !== pp2.isExtendedRange) {
          rangeDisagreements++;
          report('WARN', 'range-disagreement',
            `${rangeLabel}: ${char1.name} "${m1.name}" (pg${page1}) vs ${char2.name} "${m2.name}" (pg${page2}): ` +
            `result1 pg${resultPage1} ("${pp1.title}") range=${pp1.isExtendedRange}, ` +
            `result2 pg${resultPage2} ("${pp2.title}") range=${pp2.isExtendedRange}`);
        }
      }
    }
  }

  report('INFO', 'exchange-check',
    `Checked ${combosChecked} move combinations. Range disagreements: ${rangeDisagreements}`);
}

/** Get effective restriction from a picture page, handling weapon-conditional restrictions.
 *  In the original Smalltalk, certain restrictions (from pages like "Weapon Dislodged")
 *  were wrapped in conditional logic that only applied when the weapon was lost.
 *  The JSON data has these restrictions baked in without the conditional wrapper,
 *  so we detect weapon-loss pages by checking for LOSE_WEAPON effects. */
function getEffectiveRestriction(pp, hasWeapon) {
  if (!pp.restriction || pp.restriction.type === 'NONE') return null;

  // If this page has a LOSE_WEAPON effect and the character has their weapon,
  // the restriction is conditional and shouldn't apply yet
  const hasLoseWeaponEffect = (pp.effects || []).some(e => e.type === 'LOSE_WEAPON');
  if (hasLoseWeaponEffect && hasWeapon) {
    return null;
  }

  return pp.restriction;
}

/** Apply a restriction filter to a list of moves */
function applyRestriction(moves, restriction) {
  if (!restriction || restriction.type === 'NONE') return moves;
  switch (restriction.type) {
    case 'ONLY_CATEGORY':
      return moves.filter(m => restriction.categories.includes(m.category));
    case 'NO_CATEGORY':
      return moves.filter(m => !restriction.categories.includes(m.category));
    case 'ONLY_COLOR':
      return moves.filter(m => restriction.colors.includes(m.color));
    case 'NO_COLOR':
      return moves.filter(m => !restriction.colors.includes(m.color));
    case 'AND':
      return restriction.children.reduce((ms, child) => applyRestriction(ms, child), moves);
    case 'OR':
      // OR means ANY child restriction allows the move
      return moves.filter(m =>
        restriction.children.some(child => applyRestriction([m], child).length > 0)
      );
    default:
      return moves;
  }
}

/** Test 4: Simulate full battles */
function simulateBattles(char1, char2, numBattles) {
  const picturePages1 = new Map(char1.picturePages.map(p => [p.number, p]));
  const picturePages2 = new Map(char2.picturePages.map(p => [p.number, p]));
  const lookupPages1 = new Map(char1.lookupPages.map(lp => {
    const mapping = {};
    for (const [k, v] of Object.entries(lp.mapping)) mapping[parseInt(k, 10)] = v;
    return [lp.number, { ...lp, mapping }];
  }));
  const lookupPages2 = new Map(char2.lookupPages.map(lp => {
    const mapping = {};
    for (const [k, v] of Object.entries(lp.mapping)) mapping[parseInt(k, 10)] = v;
    return [lp.number, { ...lp, mapping }];
  }));

  let totalRounds = 0;
  let rangeDisagreements = 0;
  let fallbacks = 0;
  let p1Wins = 0;
  let p2Wins = 0;
  let draws = 0;

  for (let b = 0; b < numBattles; b++) {
    let hp1 = char1.bodyPoints;
    let hp2 = char2.bodyPoints;
    let isExtendedRange = true;
    let round = 0;
    let restrictions1 = null;
    let restrictions2 = null;
    let hasWeapon1 = true;
    let hasWeapon2 = true;

    while (hp1 > 0 && hp2 > 0 && round < 100) {
      round++;
      totalRounds++;

      // Get valid moves: at extended range, only EXTENDED_RANGE category moves;
      // at normal range, everything EXCEPT EXTENDED_RANGE category moves
      let moves1 = isExtendedRange
        ? char1.maneuvers.filter(m => m.category === 'EXTENDED_RANGE')
        : char1.maneuvers.filter(m => m.category !== 'EXTENDED_RANGE');
      let moves2 = isExtendedRange
        ? char2.maneuvers.filter(m => m.category === 'EXTENDED_RANGE')
        : char2.maneuvers.filter(m => m.category !== 'EXTENDED_RANGE');

      // Apply additional restrictions from picture page results
      if (restrictions1) {
        moves1 = applyRestriction(moves1, restrictions1);
      }
      if (restrictions2) {
        moves2 = applyRestriction(moves2, restrictions2);
      }

      if (moves1.length === 0 || moves2.length === 0) {
        report('ERROR', 'sim-no-moves',
          `Battle ${b+1} round ${round}: no valid moves (range=${isExtendedRange ? 'ext' : 'norm'}, ` +
          `${char1.name} has ${moves1.length} moves, ${char2.name} has ${moves2.length} moves, ` +
          `r1=${JSON.stringify(restrictions1)}, r2=${JSON.stringify(restrictions2)})`);
        break;
      }

      const m1 = moves1[Math.floor(Math.random() * moves1.length)];
      const m2 = moves2[Math.floor(Math.random() * moves2.length)];

      const page1 = isExtendedRange ? (m1.extendedPage ?? m1.normalPage) : m1.normalPage;
      const page2 = isExtendedRange ? (m2.extendedPage ?? m2.normalPage) : m2.normalPage;

      const lp1 = lookupPages1.get(page1);
      const lp2 = lookupPages2.get(page2);
      if (!lp1 || !lp2) { fallbacks++; continue; }

      const rp1 = lp1.mapping[page2];
      const rp2 = lp2.mapping[page1];
      if (!rp1 || !rp2) { fallbacks++; continue; }

      const pp1 = picturePages1.get(rp1);
      const pp2 = picturePages2.get(rp2);
      if (!pp1 || !pp2) { fallbacks++; continue; }

      if (pp1.isExtendedRange !== pp2.isExtendedRange) {
        rangeDisagreements++;
      }

      // Apply damage
      const dmg1 = Math.max(0, (pp2.damage ?? 0) + m2.modifier);
      const dmg2 = Math.max(0, (pp1.damage ?? 0) + m1.modifier);
      hp1 -= dmg1;
      hp2 -= dmg2;

      // Process weapon effects
      for (const eff of pp1.effects || []) {
        if (eff.type === 'LOSE_WEAPON') hasWeapon1 = false;
        if (eff.type === 'RETRIEVE_WEAPON') hasWeapon1 = true;
      }
      for (const eff of pp2.effects || []) {
        if (eff.type === 'LOSE_WEAPON') hasWeapon2 = false;
        if (eff.type === 'RETRIEVE_WEAPON') hasWeapon2 = true;
      }

      // Update range (shared state: OR-logic, matching engine behavior)
      isExtendedRange = pp1.isExtendedRange || pp2.isExtendedRange;

      // When range is forced to extended by OR-sync, restrictions are overridden
      // to ONLY_CATEGORY: EXTENDED_RANGE (matching engine's ensureExtendedRangeRestriction)
      if (isExtendedRange) {
        restrictions1 = null; // Extended range filtering is handled by the range-based move filter above
        restrictions2 = null;
      } else {
        // Get restriction from picture page, but skip weapon-conditional restrictions
        // when the character still has their weapon (matching Smalltalk conditional logic)
        restrictions1 = getEffectiveRestriction(pp1, hasWeapon1);
        restrictions2 = getEffectiveRestriction(pp2, hasWeapon2);
      }
    }

    if (hp1 <= 0 && hp2 <= 0) draws++;
    else if (hp1 <= 0) p2Wins++;
    else if (hp2 <= 0) p1Wins++;
  }

  report('INFO', 'sim-summary',
    `Simulated ${numBattles} battles (${totalRounds} rounds). ` +
    `${char1.name} wins: ${p1Wins}, ${char2.name} wins: ${p2Wins}, draws: ${draws}. ` +
    `Avg rounds: ${(totalRounds / numBattles).toFixed(1)}. ` +
    `Range disagreements: ${rangeDisagreements}. Fallbacks: ${fallbacks}.`);

  if (rangeDisagreements > 0) {
    report('WARN', 'sim-range-issues',
      `${rangeDisagreements} range disagreements in ${totalRounds} rounds (${(rangeDisagreements / totalRounds * 100).toFixed(1)}%)`);
  }
  if (fallbacks > 0) {
    report('ERROR', 'sim-fallbacks', `${fallbacks} lookup fallbacks (missing data)`);
  }
}


// ============================================================
// Main
// ============================================================

console.log('=== Lost Worlds Combat Validation ===\n');

const indexPath = path.join(__dirname, '..', 'public', 'characters', 'index.json');
const characterIds = JSON.parse(fs.readFileSync(indexPath, 'utf-8')); // string array

console.log(`Characters: ${characterIds.join(', ')}\n`);

const characters = characterIds.map(loadCharacter);

// Test 1: Internal integrity
console.log('--- Test 1: Internal Data Integrity ---');
for (const char of characters) {
  validateCharacterInternal(char);
}

// Test 2 + 3 + 4: Cross-character checks
for (let i = 0; i < characters.length; i++) {
  for (let j = i; j < characters.length; j++) {
    const c1 = characters[i];
    const c2 = characters[j];
    console.log(`\n--- ${c1.name} vs ${c2.name} ---`);

    console.log('  Lookup completeness...');
    validateLookupCoverage(c1, c2, false);
    validateLookupCoverage(c1, c2, true);
    if (i !== j) {
      validateLookupCoverage(c2, c1, false);
      validateLookupCoverage(c2, c1, true);
    }

    console.log('  Exchange invariants...');
    validateAllExchanges(c1, c2);

    console.log('  Simulating 1000 battles...');
    simulateBattles(c1, c2, 1000);
  }
}

// Print results
console.log('\n========================================');
console.log('           RESULTS SUMMARY');
console.log('========================================\n');

const errors = issues.filter(i => i.severity === 'ERROR');
const warnings = issues.filter(i => i.severity === 'WARN');
const infos = issues.filter(i => i.severity === 'INFO');

console.log(`Tests run: ${testsRun}`);
console.log(`Tests OK:  ${testsOK}`);
console.log(`Errors:    ${errors.length}`);
console.log(`Warnings:  ${warnings.length}`);
console.log(`Info:      ${infos.length}`);

if (errors.length > 0) {
  console.log('\n--- ERRORS ---');
  const grouped = new Map();
  for (const e of errors) {
    const list = grouped.get(e.category) || [];
    list.push(e);
    grouped.set(e.category, list);
  }
  for (const [cat, items] of grouped) {
    console.log(`\n  [${cat}] (${items.length} errors)`);
    for (const item of items.slice(0, 15)) {
      console.log(`    ${item.message}`);
    }
    if (items.length > 15) {
      console.log(`    ... and ${items.length - 15} more`);
    }
  }
}

if (warnings.length > 0) {
  console.log('\n--- WARNINGS ---');
  const grouped = new Map();
  for (const w of warnings) {
    const list = grouped.get(w.category) || [];
    list.push(w);
    grouped.set(w.category, list);
  }
  for (const [cat, items] of grouped) {
    console.log(`\n  [${cat}] (${items.length} warnings)`);
    for (const item of items.slice(0, 20)) {
      console.log(`    ${item.message}`);
    }
    if (items.length > 20) {
      console.log(`    ... and ${items.length - 20} more`);
    }
  }
}

if (infos.length > 0) {
  console.log('\n--- INFO ---');
  for (const item of infos) {
    console.log(`  [${item.category}] ${item.message}`);
  }
}

console.log('\n========================================');
if (errors.length === 0 && warnings.length === 0) {
  console.log('  ALL CHECKS PASSED');
} else if (errors.length === 0) {
  console.log(`  PASSED with ${warnings.length} warnings`);
} else {
  console.log(`  FAILED: ${errors.length} errors found`);
}
console.log('========================================');
