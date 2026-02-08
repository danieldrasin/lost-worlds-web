#!/usr/bin/env node
/**
 * Layout Verification Script
 *
 * Statically analyzes component source files to verify CSS class chains
 * are correct for both mobile and desktop layouts. Catches:
 * - Missing min-h-0 on flex column chains (breaks overflow scrolling)
 * - Nested scroll containers (conflicting overflow-auto)
 * - Missing max-height on images (causes viewport overflow on mobile)
 * - Missing overflow-auto on panels that should scroll
 * - Flex-1 on content areas that should size to content
 *
 * No browser needed — works by parsing JSX source and tracing the
 * class name chains.
 */

import fs from 'fs';
import path from 'path';

const SRC_DIR = path.join(process.cwd(), 'src');
let errors = 0;
let warnings = 0;
let checks = 0;

function check(condition, message, severity = 'error') {
  checks++;
  if (!condition) {
    if (severity === 'error') {
      console.error(`  ❌ ${message}`);
      errors++;
    } else {
      console.warn(`  ⚠️  ${message}`);
      warnings++;
    }
  } else {
    console.log(`  ✅ ${message}`);
  }
}

function readComponent(relativePath) {
  const fullPath = path.join(SRC_DIR, relativePath);
  return fs.readFileSync(fullPath, 'utf8');
}

// ─── BattleViewNew.tsx checks ───────────────────────────────────────

console.log('\n📐 BattleViewNew.tsx — Desktop Layout');
const battleView = readComponent('ui/components/BattleViewNew.tsx');

// Check: viewport-fixed root has overflow: hidden
check(
  battleView.includes('viewport-fixed'),
  'Root container uses viewport-fixed class'
);

// Check: Desktop layout flex container has min-h-0
const desktopLayoutMatch = battleView.match(/hidden lg:flex[^"]*"/);
check(
  desktopLayoutMatch && desktopLayoutMatch[0].includes('min-h-0'),
  'Desktop layout flex container has min-h-0 (allows children to shrink)'
);

// Check: Left panel column has min-h-0
const leftPanelMatch = battleView.match(/w-1\/3 flex flex-col[^"]*"/);
check(
  leftPanelMatch && leftPanelMatch[0].includes('min-h-0'),
  'Left panel (w-1/3) flex-col has min-h-0'
);

// Check: Left panel inner has overflow-auto AND min-h-0
const leftInnerMatch = battleView.match(/bg-gray-800 rounded-lg p-4 flex-1[^"]*"(?=[\s\S]*?Your Moves)/);
check(
  leftInnerMatch && leftInnerMatch[0].includes('overflow-auto') && leftInnerMatch[0].includes('min-h-0'),
  'Left panel inner has overflow-auto + min-h-0'
);

// Check: Right panel column has min-h-0
const rightPanelMatch = battleView.match(/w-2\/3 flex flex-col[^"]*"/);
check(
  rightPanelMatch && rightPanelMatch[0].includes('min-h-0'),
  'Right panel (w-2/3) flex-col has min-h-0'
);

// Check: Right panel inner has overflow-auto AND min-h-0
const rightInnerMatch = battleView.match(/bg-gray-800 rounded-lg p-4 flex-1 flex flex-col[^"]*"/);
check(
  rightInnerMatch && rightInnerMatch[0].includes('overflow-auto') && rightInnerMatch[0].includes('min-h-0'),
  'Right panel inner has overflow-auto + min-h-0'
);

// Check: Picture content area does NOT have flex-1 (should size to content)
const pictureAreaMatch = battleView.match(/className="flex items-center justify-center"[\s\S]*?{displayPicture/);
check(
  pictureAreaMatch !== null,
  'Picture content area does NOT use flex-1 (sizes to content, enables overflow)'
);

// Check: No flex-1 before displayPicture in the right panel
const hasFlexOneBeforeDisplay = battleView.match(/flex-1 flex items-center justify-center[\s\S]{0,50}displayPicture/);
check(
  !hasFlexOneBeforeDisplay,
  'Picture area does not have flex-1 (would prevent scrolling)'
);

console.log('\n📱 BattleViewNew.tsx — Mobile Layout');

// Check: Mobile layout container has min-h-0
const mobileLayoutMatch = battleView.match(/lg:hidden flex-1 flex flex-col[^"]*"/);
check(
  mobileLayoutMatch && mobileLayoutMatch[0].includes('min-h-0'),
  'Mobile layout container has min-h-0'
);

// Check: Mobile content area has overflow-auto and min-h-0
const mobileContentMatch = battleView.match(/flex-1 overflow-auto p-4[^"]*"/);
check(
  mobileContentMatch && mobileContentMatch[0].includes('min-h-0'),
  'Mobile content area has overflow-auto + min-h-0'
);

// Check: MobileViewTab does NOT have h-full (would prevent parent scrolling)
const mobileViewTabRoot = battleView.match(/MobileViewTab[\s\S]*?<div className="([^"]+)"[\s\S]*?<div className="([^"]+)"/);
// Find the actual MobileViewTab component definition
const mobileViewTabDef = battleView.match(/const MobileViewTab[\s\S]*?^\)/m);
const mobileVTContent = battleView.substring(battleView.indexOf('const MobileViewTab'));
const firstDivMatch = mobileVTContent.match(/<div className="([^"]+)"/);
check(
  firstDivMatch && !firstDivMatch[1].includes('h-full'),
  'MobileViewTab root does NOT have h-full (lets parent handle scrolling)'
);

// Check: MobileViewTab inner does NOT have its own overflow-auto
const secondDivMatch = mobileVTContent.match(/<div className="([^"]+)"[\s\S]*?<div className="([^"]+)"/);
check(
  secondDivMatch && !secondDivMatch[2].includes('overflow-auto'),
  'MobileViewTab inner does NOT have nested overflow-auto'
);

// ─── PicturePage.tsx checks ─────────────────────────────────────────

console.log('\n🖼️  PicturePage.tsx — Image Sizing');
const picturePage = readComponent('ui/components/PicturePage.tsx');

// Check: Image has max-height constraint for mobile
const imgMatch = picturePage.match(/<img[\s\S]*?className="([^"]+)"/);
check(
  imgMatch && imgMatch[1].includes('max-h-['),
  'Image has max-h constraint (prevents viewport overflow on mobile)'
);

// Check: Mobile max-height is reasonable (30vh or less)
const mobileMaxH = imgMatch && imgMatch[1].match(/max-h-\[(\d+)vh\]/);
check(
  mobileMaxH && parseInt(mobileMaxH[1]) <= 35,
  `Mobile image max-height is ≤35vh (found: ${mobileMaxH ? mobileMaxH[1] + 'vh' : 'none'})`
);

// Check: Desktop max-height exists and is larger
const desktopMaxH = imgMatch && imgMatch[1].match(/lg:max-h-\[(\d+)vh\]/);
check(
  desktopMaxH && parseInt(desktopMaxH[1]) >= 50,
  `Desktop image max-height is ≥50vh (found: ${desktopMaxH ? desktopMaxH[1] + 'vh' : 'none'})`
);

// Check: Image uses object-cover and object-top
check(
  imgMatch && imgMatch[1].includes('object-cover') && imgMatch[1].includes('object-top'),
  'Image uses object-cover + object-top (clips from bottom)'
);

// Check: No clipPath inline style (causes white gap with object-cover)
const hasClipPath = picturePage.match(/clipPath.*inset/);
check(
  !hasClipPath,
  'No clipPath inline style on image (was causing white gap)'
);

// ─── index.css checks ───────────────────────────────────────────────

console.log('\n🎨 index.css — Scrollbar & Viewport Styles');
const css = fs.readFileSync(path.join(SRC_DIR, 'index.css'), 'utf8');

// Check: viewport-fixed has overflow: hidden
check(
  css.includes('viewport-fixed') && css.includes('overflow: hidden'),
  'viewport-fixed has overflow: hidden'
);

// Check: viewport-fixed uses dvh
check(
  css.includes('100dvh'),
  'viewport-fixed uses dynamic viewport height (dvh)'
);

// Check: WebKit scrollbar styles exist
check(
  css.includes('::-webkit-scrollbar'),
  'Custom WebKit scrollbar styles defined (forces visibility on Safari)'
);

check(
  css.includes('::-webkit-scrollbar-thumb'),
  'Scrollbar thumb styles defined'
);

// ─── App.tsx checks ─────────────────────────────────────────────────

console.log('\n🏗️  App.tsx — Build Info');
const app = readComponent('App.tsx');

// Check: Build timestamp exists
check(
  app.includes('__BUILD_TIME__'),
  'Build timestamp (__BUILD_TIME__) is referenced'
);

// Check: BuildInfo component exists
check(
  app.includes('BuildInfo'),
  'BuildInfo component exists'
);

// Check: BuildInfo is positioned above mobile tab bar
const buildInfoMatch = app.match(/bottom-(\d+)/);
check(
  buildInfoMatch && parseInt(buildInfoMatch[1]) >= 12,
  `BuildInfo positioned above mobile tab bar (bottom-${buildInfoMatch ? buildInfoMatch[1] : '?'})`
);

// ─── vite.config.ts checks ─────────────────────────────────────────

console.log('\n⚡ vite.config.ts');
const viteConfig = fs.readFileSync(path.join(process.cwd(), 'vite.config.ts'), 'utf8');

check(
  viteConfig.includes('__BUILD_TIME__'),
  'Vite config defines __BUILD_TIME__'
);

// ─── Summary ────────────────────────────────────────────────────────

console.log('\n' + '═'.repeat(60));
console.log(`  Layout verification: ${checks} checks, ${errors} errors, ${warnings} warnings`);
if (errors > 0) {
  console.log('  ❌ FAILED — layout issues detected');
  process.exit(1);
} else if (warnings > 0) {
  console.log('  ⚠️  PASSED with warnings');
} else {
  console.log('  ✅ ALL PASSED');
}
console.log('═'.repeat(60) + '\n');
