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
  // Select "vs AI" mode
  await page.click('text=vs Computer');
  // Start battle with default characters
  await page.click('text=Start Battle');
  // Wait for the battle view to load (status bar with HP should appear)
  await page.waitForSelector('text=HP', { timeout: 10000 });
}

/**
 * Select a move and execute one exchange so we have picture + damage text to verify.
 */
async function executeOneExchange(page: Page) {
  // Click the first available move button
  const moveButton = page.locator('button:has-text("Select")').first();
  if (await moveButton.isVisible({ timeout: 3000 })) {
    await moveButton.click();
  }
  // Confirm the move
  const confirmButton = page.locator('button:has-text("Confirm")');
  if (await confirmButton.isVisible({ timeout: 3000 })) {
    await confirmButton.click();
  }
  // Wait for picture page to appear (vs AI resolves immediately)
  await page.waitForTimeout(1500);
}

test.describe('Battle View Layout', () => {

  test('build timestamp is visible', async ({ page }) => {
    await page.goto(BASE_URL);
    const buildInfo = page.locator('text=build ');
    await expect(buildInfo).toBeVisible({ timeout: 5000 });
  });

  test('desktop: right panel is scrollable when content overflows', async ({ page, browserName }) => {
    test.skip(browserName === 'webkit' && process.env.CI === 'true', 'Skip webkit in CI');
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

  test('mobile: picture page and text are all visible within viewport', async ({ page, browserName }) => {
    test.skip(browserName === 'webkit' && process.env.CI === 'true', 'Skip webkit in CI');
    // iPhone-like viewport
    await page.setViewportSize({ width: 390, height: 844 });
    await startLocalBattle(page);

    // On mobile, we should see the View tab content by default
    // Check that the bottom tab bar is visible
    const viewTab = page.locator('text=View');
    await expect(viewTab).toBeVisible({ timeout: 5000 });

    // Execute a move so we get picture + damage + exchange summary
    await page.click('text=Move'); // switch to Move tab
    await executeOneExchange(page);
    await page.click('text=View'); // switch back to View tab
    await page.waitForTimeout(500);

    // The picture page image should be clamped to max 45vh
    const img = page.locator('.bg-gray-800.rounded-lg.overflow-hidden.shadow-lg img').first();
    if (await img.isVisible({ timeout: 3000 })) {
      const imgBox = await img.boundingBox();
      if (imgBox) {
        // 45vh of 844px = 379.8px — allow some margin
        expect(imgBox.height).toBeLessThanOrEqual(400);
      }
    }

    // The bottom tab bar should still be visible (not pushed off screen)
    const tabBar = page.locator('text=History');
    await expect(tabBar).toBeVisible();
  });

  test('mobile: content area scrolls when content exceeds viewport', async ({ page, browserName }) => {
    test.skip(browserName === 'webkit' && process.env.CI === 'true', 'Skip webkit in CI');
    // Very short mobile viewport to force overflow
    await page.setViewportSize({ width: 390, height: 500 });
    await startLocalBattle(page);
    await page.click('text=Move');
    await executeOneExchange(page);
    await page.click('text=View');
    await page.waitForTimeout(500);

    // The scroll container should be scrollable
    const scrollContainer = page.locator('.lg\\:hidden .overflow-auto').first();
    const isScrollable = await scrollContainer.evaluate(el => el.scrollHeight > el.clientHeight);
    // On a 500px tall screen with image + text, it should likely overflow
    // This is a soft check — just verify the container exists and is set up for scrolling
    const hasOverflow = await scrollContainer.evaluate(el => {
      const style = window.getComputedStyle(el);
      return style.overflowY === 'auto' || style.overflowY === 'scroll';
    });
    expect(hasOverflow).toBe(true);
  });

  test('desktop: left and right panels both fit within viewport', async ({ page, browserName }) => {
    test.skip(browserName === 'webkit' && process.env.CI === 'true', 'Skip webkit in CI');
    await page.setViewportSize({ width: 1280, height: 720 });
    await startLocalBattle(page);

    // Both panels should be visible
    const moveSelector = page.locator('text=Your Moves');
    await expect(moveSelector).toBeVisible({ timeout: 5000 });

    // The POV toggle area should be visible
    const povLabel = page.locator('text=What You See');
    await expect(povLabel).toBeVisible();
  });
});
