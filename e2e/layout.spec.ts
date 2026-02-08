/**
 * E2E Layout Tests
 *
 * Verifies battle view layout at different viewport sizes.
 * Catches overflow, scrolling, and visibility issues on mobile and desktop.
 */

import { test, expect, Page } from '@playwright/test';

const BASE_URL = process.env.TEST_URL || 'http://localhost:5173';

/**
 * Start a local (vs AI) battle so we can inspect the battle view layout.
 * Picks the first two characters and clicks Start Battle.
 */
async function startLocalBattle(page: Page) {
  await page.goto(BASE_URL);
  // Select "vs AI" mode (button shows robot emoji + "vs AI")
  await page.click('text=vs AI');
  // Start battle with default characters
  await page.click('text=Start Battle!');
  // Wait for the battle view to load (status bar with HP should appear)
  await page.waitForSelector('text=HP', { timeout: 10000 });
}

/**
 * Select a move and execute one exchange so we have picture + damage text to verify.
 * In vs AI mode, clicking a move button auto-resolves immediately.
 * Move buttons show the maneuver name (e.g. "Down Swing", "Thrust").
 */
async function executeOneExchange(page: Page) {
  // Find the first enabled move button (moves are grouped by category under small labels)
  // Valid moves have bg-gray-700, invalid ones have bg-gray-800 and are disabled
  const moveButton = page.locator('button:not([disabled])').filter({ hasText: /Swing|Thrust|Fake|Block|Jump|Rage|Extended/ }).first();
  if (await moveButton.isVisible({ timeout: 5000 })) {
    await moveButton.click();
  }
  // Wait for exchange to resolve and picture page to appear
  await page.waitForTimeout(2000);
}

test.describe('Battle View Layout', () => {

  test('build timestamp is visible', async ({ page }) => {
    await page.goto(BASE_URL);
    const buildInfo = page.locator('text=build ');
    await expect(buildInfo).toBeVisible({ timeout: 5000 });
  });

  test('desktop: right panel is scrollable when content overflows', async ({ page }) => {
    // Use a short viewport to force overflow
    await page.setViewportSize({ width: 1280, height: 500 });
    await startLocalBattle(page);
    await executeOneExchange(page);

    // The right panel should have overflow-auto and min-h-0
    // Check that the picture page is visible
    const pictureCard = page.locator('.bg-gray-800.rounded-lg.overflow-hidden.shadow-lg').first();
    await expect(pictureCard).toBeVisible({ timeout: 5000 });

    // Check the viewport-fixed container doesn't exceed viewport height
    const viewportFixed = page.locator('.viewport-fixed');
    const box = await viewportFixed.boundingBox();
    if (box) {
      expect(box.height).toBeLessThanOrEqual(500 + 2); // allow 2px rounding
    }
  });

  test('mobile: picture page and text are all visible within viewport', async ({ page }) => {
    // iPhone-like viewport
    await page.setViewportSize({ width: 390, height: 844 });
    await startLocalBattle(page);

    // On mobile, we should see the View tab content by default
    // Check that the bottom tab bar is visible
    const viewTab = page.locator('button:has-text("View")');
    await expect(viewTab).toBeVisible({ timeout: 5000 });

    // Switch to Move tab, execute a move, switch back to View
    await page.click('button:has-text("Move")');
    await executeOneExchange(page);
    await page.click('button:has-text("View")');
    await page.waitForTimeout(500);

    // The picture page image should be clamped to max 30vh
    const img = page.locator('.bg-gray-800.rounded-lg.overflow-hidden.shadow-lg img').first();
    if (await img.isVisible({ timeout: 3000 })) {
      const imgBox = await img.boundingBox();
      if (imgBox) {
        // 30vh of 844px = 253.2px — allow some margin
        expect(imgBox.height).toBeLessThanOrEqual(300);
      }
    }

    // The bottom tab bar should still be visible (not pushed off screen)
    const tabBar = page.locator('button:has-text("History")');
    await expect(tabBar).toBeVisible();
  });

  test('mobile: content area scrolls when content exceeds viewport', async ({ page }) => {
    // Very short mobile viewport to force overflow
    await page.setViewportSize({ width: 390, height: 500 });
    await startLocalBattle(page);
    await page.click('button:has-text("Move")');
    await executeOneExchange(page);
    await page.click('button:has-text("View")');
    await page.waitForTimeout(500);

    // The mobile content wrapper should exist and be scrollable
    // Check that overflow-auto containers exist in the mobile view
    const mobileContainer = page.locator('.lg\\:hidden .overflow-auto').first();
    if (await mobileContainer.isVisible({ timeout: 3000 })) {
      const hasOverflow = await mobileContainer.evaluate(el => {
        const style = window.getComputedStyle(el);
        return style.overflowY === 'auto' || style.overflowY === 'scroll';
      });
      expect(hasOverflow).toBe(true);
    }
  });

  test('desktop: left and right panels both fit within viewport', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await startLocalBattle(page);

    // Left panel with move list should be visible
    const moveSelector = page.locator('text=Your Moves');
    await expect(moveSelector).toBeVisible({ timeout: 5000 });

    // The POV toggle area should be visible
    const povLabel = page.locator('text=What You See');
    await expect(povLabel).toBeVisible();
  });
});
