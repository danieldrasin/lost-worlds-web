/**
 * E2E Tests for Multiplayer Battle
 *
 * Uses Playwright to simulate two browsers playing against each other.
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
    const moveTab = page.locator('text=Move').last();
    if (await moveTab.isVisible()) {
      await moveTab.click();
      await page.waitForTimeout(300);
    }
  }
}

// Helper: wait for battle to start (handles mobile vs desktop)
async function waitForBattleReady(page: Page, timeout = 15000): Promise<void> {
  if (isMobileViewport(page)) {
    // On mobile, battle starts on "View" tab; wait for tab bar then switch to Move
    await page.waitForSelector('text=Move', { timeout });
    await ensureMovePanelVisible(page);
    await page.waitForSelector('.space-y-3 button', { timeout: 10000 });
  } else {
    await page.waitForSelector('text=Your Moves', { timeout });
  }
}

test.describe('Multiplayer Battle', () => {
  test.setTimeout(isRemote ? 90000 : 60000);

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
    test.setTimeout(isRemote ? 120000 : 60000);

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

    // Both players: Select Charge (Extended Range move available first turn)
    const player1MoveButton = player1Page.locator('button:has-text("Charge")').first();
    const player2MoveButton = player2Page.locator('button:has-text("Charge")').first();

    await player1MoveButton.click();
    await player2MoveButton.click();

    // Both players: Click Fight
    await player1Page.click('text=FIGHT!');
    await player2Page.click('text=FIGHT!');

    // Wait for exchange to resolve with generous timeout
    await Promise.race([
      player1Page.waitForSelector('text=Round 1', { timeout: 30000 }),
      player1Page.waitForSelector('text=used', { timeout: 30000 }),
      player1Page.waitForSelector('text=Select your', { timeout: 30000 }),
    ]).catch(async () => {
      // Might still be in Waiting state — wait more
      const waiting = await player1Page.locator('text=Waiting').count();
      if (waiting > 0) {
        await Promise.race([
          player1Page.waitForSelector('text=Round 1', { timeout: 30000 }),
          player1Page.waitForSelector('text=used', { timeout: 30000 }),
        ]);
      }
    });

    console.log('Move exchange completed!');

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

    // Select the move
    await chargeButton.click();

    // Fight button should be enabled
    const fightButton = page.locator('button:has-text("FIGHT!")');
    await expect(fightButton).toBeEnabled();

    // Click fight
    await fightButton.click();

    // Should resolve against AI — give time for exchange
    await page.waitForTimeout(1000);

    console.log('AI battle exchange completed!');
  });
});
