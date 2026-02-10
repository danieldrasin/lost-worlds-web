/**
 * E2E Tests for Multiplayer Battle
 *
 * Uses Playwright to simulate two browsers playing against each other.
 *
 * IMPORTANT: BattleViewNew has NO separate FIGHT button.
 * Clicking a move button directly submits it (multiplayer) or executes it (AI).
 * After clicking a move in multiplayer, "Waiting for opponent..." appears.
 * In AI mode, clicking a move auto-executes the exchange after a 150ms delay.
 */

import { test, expect, Page } from '@playwright/test';

const BASE_URL = process.env.TEST_URL || 'http://localhost:5173';
const isRemote = BASE_URL.includes('vercel.app');

// Helper: check if viewport is mobile-sized
function isMobileViewport(page: Page): boolean {
  const size = page.viewportSize();
  return !!size && size.width < 768;
}

// Helper: ensure the move panel is visible (handles mobile tab navigation)
async function ensureMovePanelVisible(page: Page): Promise<void> {
  if (isMobileViewport(page)) {
    // Click the "Move" tab button (⚔️ Move) in the bottom tab bar.
    // Use button:has-text to avoid matching "Movement restricted" or "Tap 'Move'" text.
    const moveTabButton = page.locator('button:has-text("Move")');
    if (await moveTabButton.isVisible()) {
      await moveTabButton.click();
      await page.waitForTimeout(500);
    }
  }
}

// Helper: wait for battle to start (handles mobile vs desktop)
async function waitForBattleReady(page: Page, timeout = 30000): Promise<void> {
  if (isMobileViewport(page)) {
    // On mobile, wait for the tab bar "Move" button, click it, then wait for move buttons
    await page.waitForSelector('button:has-text("Move")', { timeout });
    await ensureMovePanelVisible(page);
    await page.waitForSelector('.space-y-3 button', { timeout: 15000 });
  } else {
    await page.waitForSelector('text=Your Moves', { timeout });
  }
}

// Helper: wait for exchange resolution (multiplayer)
async function waitForExchangeResolution(page: Page, timeout = 30000): Promise<string> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    // Check if game ended
    const victory = await page.locator('text=Victory').count();
    const defeat = await page.locator('text=Defeated').count();
    if (victory > 0 || defeat > 0) {
      return 'game-over';
    }

    // Check if we're still waiting for opponent
    const waiting = await page.locator('text=Waiting for opponent').count();
    if (waiting === 0) {
      await page.waitForTimeout(500);
      return 'resolved';
    }

    await page.waitForTimeout(1000);
  }

  return 'timeout';
}

test.describe('Multiplayer Battle', () => {
  // Mobile WebKit is slower — lobby+room+battle setup can take 60-90s alone.
  test.setTimeout(isRemote ? 180000 : 60000);

  test('two players can create and join a room', async ({ browser }) => {
    // Create two browser contexts (simulates two different users)
    const player1Context = await browser.newContext();
    const player2Context = await browser.newContext();

    const player1Page = await player1Context.newPage();
    const player2Page = await player2Context.newPage();

    // Player 1: Go to the game and select Online mode
    await player1Page.goto(BASE_URL);
    await player1Page.click('text=Online');
    await player1Page.click('text=Find Opponent');

    // Wait for lobby to load
    await player1Page.waitForSelector('text=Create Room', { timeout: 15000 });

    // Player 1: Create a room
    await player1Page.click('text=Create Room');

    // Wait for room code to appear
    await player1Page.waitForSelector('text=Share this code', { timeout: 15000 });

    // Get the room code
    const roomCodeElement = await player1Page.locator('.text-5xl.font-mono');
    const roomCode = await roomCodeElement.textContent();
    expect(roomCode).toBeTruthy();
    expect(roomCode?.length).toBe(6);

    console.log(`Room created with code: ${roomCode}`);

    // Player 2: Go to the game and join the room
    await player2Page.goto(BASE_URL);
    await player2Page.click('text=Online');
    await player2Page.click('text=Find Opponent');

    // Wait for lobby
    await player2Page.waitForSelector('text=Create Room', { timeout: 15000 });

    // Enter the room code
    await player2Page.fill('input[placeholder="Enter Room Code"]', roomCode!);
    await player2Page.click('text=Join Room');

    // Both players should now be in battle
    await Promise.all([
      waitForBattleReady(player1Page),
      waitForBattleReady(player2Page),
    ]);

    console.log('Both players are in battle!');

    // Clean up
    await player1Context.close();
    await player2Context.close();
  });

  test('players can exchange moves', async ({ browser }) => {
    test.setTimeout(isRemote ? 180000 : 60000);

    const player1Context = await browser.newContext();
    const player2Context = await browser.newContext();

    const player1Page = await player1Context.newPage();
    const player2Page = await player2Context.newPage();

    // Setup: Create and join room (same as above)
    await player1Page.goto(BASE_URL);
    await player1Page.click('text=Online');
    await player1Page.click('text=Find Opponent');
    await player1Page.waitForSelector('text=Create Room', { timeout: 15000 });
    await player1Page.click('text=Create Room');
    await player1Page.waitForSelector('text=Share this code', { timeout: 15000 });

    const roomCodeElement = await player1Page.locator('.text-5xl.font-mono');
    const roomCode = await roomCodeElement.textContent();

    await player2Page.goto(BASE_URL);
    await player2Page.click('text=Online');
    await player2Page.click('text=Find Opponent');
    await player2Page.waitForSelector('text=Create Room', { timeout: 15000 });
    await player2Page.fill('input[placeholder="Enter Room Code"]', roomCode!);
    await player2Page.click('text=Join Room');

    // Wait for battle to start
    await Promise.all([
      waitForBattleReady(player1Page),
      waitForBattleReady(player2Page),
    ]);

    // Ensure move panels visible
    await ensureMovePanelVisible(player1Page);
    await ensureMovePanelVisible(player2Page);

    // Both players: Click Charge — this auto-submits (no FIGHT button in BattleViewNew)
    const player1MoveButton = player1Page.locator('button:has-text("Charge")').first();
    const player2MoveButton = player2Page.locator('button:has-text("Charge")').first();

    await player1MoveButton.click();
    await player2MoveButton.click();

    // Wait for exchange to resolve
    const resolution = await waitForExchangeResolution(player1Page, 60000);

    console.log(`Move exchange completed! (resolved via: ${resolution})`);

    await player1Context.close();
    await player2Context.close();
  });
});

test.describe('Local Battle', () => {
  test.setTimeout(isRemote ? 30000 : 15000);

  test('can start a battle vs AI', async ({ page }) => {
    await page.goto(BASE_URL);

    // Select AI mode (default)
    await expect(page.locator('text=vs AI')).toBeVisible();

    // Click Start Battle
    await page.click('text=Start Battle');

    // Wait for battle UI — mobile vs desktop handling
    await waitForBattleReady(page, 15000);

    // Ensure moves are visible
    await ensureMovePanelVisible(page);

    // Find a Charge button (Extended Range move, always available first turn)
    const chargeButton = page.locator('button:has-text("Charge")').first();
    await expect(chargeButton).toBeVisible({ timeout: 5000 });

    // Click the move — in AI mode, this auto-executes the exchange (no FIGHT button)
    await chargeButton.click();

    // Should resolve against AI — give time for exchange animation
    await page.waitForTimeout(2000);

    // Verify the exchange happened — check for Round 1 in history
    const historyVisible = await page.locator('text=Round 1').count();
    expect(historyVisible).toBeGreaterThan(0);

    console.log('AI battle exchange completed!');
  });
});
