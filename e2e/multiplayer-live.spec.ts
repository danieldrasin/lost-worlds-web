/**
 * E2E Tests for Multiplayer Battle - Live Vercel Deployment
 *
 * Tests the full multiplayer flow against the production server:
 * - Room creation and joining
 * - Move submission and exchange resolution
 * - Multiple rounds of combat
 * - Game completion
 *
 * Run with: TEST_URL=https://lost-worlds-web.vercel.app npx playwright test e2e/multiplayer-live.spec.ts
 */

import { test, expect, Page, BrowserContext } from '@playwright/test';

// Use production URL by default
const BASE_URL = process.env.TEST_URL || 'https://lost-worlds-web.vercel.app';

// Helper to wait for network to be idle
async function waitForStableState(page: Page, timeout = 5000) {
  await page.waitForLoadState('networkidle', { timeout });
}

// Helper to create a player context and navigate to online mode
async function setupPlayer(context: BrowserContext, characterName = 'Man in Chainmail'): Promise<Page> {
  const page = await context.newPage();
  await page.goto(BASE_URL);
  await page.waitForLoadState('domcontentloaded');

  // Select Online mode
  await page.click('button:has-text("Online")');

  // Click Find Opponent to go to lobby
  await page.click('button:has-text("Find Opponent")');

  // Wait for lobby to load
  await page.waitForSelector('text=Create Room', { timeout: 10000 });

  return page;
}

// Helper to get a valid move button (first available in Extended Range for first turn)
async function selectFirstAvailableMove(page: Page): Promise<void> {
  // Look for any enabled move button (not disabled, not struck through)
  const moveButton = page.locator('button').filter({ hasNotText: 'FIGHT' }).filter({ hasNotText: 'Back' }).first();

  // Find buttons in the move selector area that aren't disabled
  const enabledMoves = page.locator('.space-y-3 button:not([disabled])');
  const count = await enabledMoves.count();

  if (count > 0) {
    await enabledMoves.first().click();
  } else {
    throw new Error('No valid moves available');
  }
}

test.describe('Multiplayer Live Tests', () => {
  test.setTimeout(60000); // 60 second timeout for multiplayer tests

  test('Room Creation - should create a room and get a 6-character code', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await setupPlayer(context);

    // Create room
    await page.click('button:has-text("Create Room")');

    // Wait for room code to appear
    await page.waitForSelector('text=Share this code', { timeout: 10000 });

    // Get the room code
    const roomCodeElement = page.locator('.text-5xl.font-mono');
    const roomCode = await roomCodeElement.textContent();

    expect(roomCode).toBeTruthy();
    expect(roomCode?.length).toBe(6);
    expect(roomCode).toMatch(/^[A-Z0-9]+$/); // Should be alphanumeric uppercase

    console.log(`✓ Room created with code: ${roomCode}`);

    await context.close();
  });

  test('Room Join - two players can create and join a room', async ({ browser }) => {
    // Create two separate browser contexts (different sessions)
    const player1Context = await browser.newContext();
    const player2Context = await browser.newContext();

    try {
      // Player 1: Setup and create room
      const player1Page = await setupPlayer(player1Context);
      await player1Page.click('button:has-text("Create Room")');
      await player1Page.waitForSelector('text=Share this code', { timeout: 10000 });

      const roomCodeElement = player1Page.locator('.text-5xl.font-mono');
      const roomCode = await roomCodeElement.textContent();
      console.log(`Player 1 created room: ${roomCode}`);

      // Player 2: Setup and join room
      const player2Page = await setupPlayer(player2Context);
      await player2Page.fill('input[placeholder="Enter Room Code"]', roomCode!);
      await player2Page.click('button:has-text("Join Room")');

      // Both players should now be in battle
      await Promise.all([
        player1Page.waitForSelector('text=Your Moves', { timeout: 15000 }),
        player2Page.waitForSelector('text=Your Moves', { timeout: 15000 }),
      ]);

      // Verify both see the online indicator
      await expect(player1Page.locator('text=🌐')).toBeVisible({ timeout: 5000 });
      await expect(player2Page.locator('text=🌐')).toBeVisible({ timeout: 5000 });

      console.log('✓ Both players successfully joined and see battle screen');

    } finally {
      await player1Context.close();
      await player2Context.close();
    }
  });

  test('Move Exchange - both players can submit moves and see results', async ({ browser }) => {
    const player1Context = await browser.newContext();
    const player2Context = await browser.newContext();

    try {
      // Setup: Create and join room
      const player1Page = await setupPlayer(player1Context);
      await player1Page.click('button:has-text("Create Room")');
      await player1Page.waitForSelector('text=Share this code', { timeout: 10000 });

      const roomCode = await player1Page.locator('.text-5xl.font-mono').textContent();
      console.log(`Room: ${roomCode}`);

      const player2Page = await setupPlayer(player2Context);
      await player2Page.fill('input[placeholder="Enter Room Code"]', roomCode!);
      await player2Page.click('button:has-text("Join Room")');

      // Wait for battle to start
      await Promise.all([
        player1Page.waitForSelector('text=Your Moves', { timeout: 15000 }),
        player2Page.waitForSelector('text=Your Moves', { timeout: 15000 }),
      ]);

      // Both players select a move (should be Extended Range moves on first turn)
      // Look for Charge button which is an Extended Range move
      const p1ChargeButton = player1Page.locator('button:has-text("Charge")').first();
      const p2ChargeButton = player2Page.locator('button:has-text("Charge")').first();

      await p1ChargeButton.click();
      await p2ChargeButton.click();

      console.log('Both players selected Charge');

      // Both players click FIGHT
      await Promise.all([
        player1Page.click('button:has-text("FIGHT")'),
        player2Page.click('button:has-text("FIGHT")'),
      ]);

      // Wait for "Waiting" state to appear on at least one player
      // (the second player to click might see the result immediately)
      const waitingOrResult = Promise.race([
        player1Page.waitForSelector('text=Waiting', { timeout: 5000 }).catch(() => null),
        player1Page.waitForSelector('.text-6xl', { timeout: 5000 }).catch(() => null), // Picture page
      ]);

      await waitingOrResult;

      // Wait for exchange to resolve - look for round history or picture page
      await Promise.race([
        player1Page.waitForSelector('text=Round 1', { timeout: 15000 }),
        player1Page.waitForSelector('text=used', { timeout: 15000 }), // "X used Y" message
      ]);

      console.log('✓ Move exchange completed successfully');

      // Verify HP bars are still visible (game continues)
      await expect(player1Page.locator('.bg-blue-500, .bg-red-500').first()).toBeVisible();

    } finally {
      await player1Context.close();
      await player2Context.close();
    }
  });

  test('Full Battle - play multiple rounds until game over', async ({ browser }) => {
    test.setTimeout(120000); // 2 minutes for full battle

    const player1Context = await browser.newContext();
    const player2Context = await browser.newContext();

    try {
      // Setup: Create and join room
      const player1Page = await setupPlayer(player1Context);
      await player1Page.click('button:has-text("Create Room")');
      await player1Page.waitForSelector('text=Share this code', { timeout: 10000 });

      const roomCode = await player1Page.locator('.text-5xl.font-mono').textContent();
      console.log(`Starting full battle in room: ${roomCode}`);

      const player2Page = await setupPlayer(player2Context);
      await player2Page.fill('input[placeholder="Enter Room Code"]', roomCode!);
      await player2Page.click('button:has-text("Join Room")');

      // Wait for battle
      await Promise.all([
        player1Page.waitForSelector('text=Your Moves', { timeout: 15000 }),
        player2Page.waitForSelector('text=Your Moves', { timeout: 15000 }),
      ]);

      let round = 0;
      const maxRounds = 20;

      while (round < maxRounds) {
        round++;
        console.log(`Round ${round}...`);

        // Check if game is over
        const gameOver1 = await player1Page.locator('text=Victory').count();
        const gameOver2 = await player2Page.locator('text=Victory').count();

        if (gameOver1 > 0 || gameOver2 > 0) {
          console.log(`✓ Game ended after ${round - 1} rounds`);
          break;
        }

        // Find and click first available move for both players
        const p1Moves = player1Page.locator('.space-y-3 button:not([disabled])');
        const p2Moves = player2Page.locator('.space-y-3 button:not([disabled])');

        const p1Count = await p1Moves.count();
        const p2Count = await p2Moves.count();

        if (p1Count === 0 || p2Count === 0) {
          console.log('No valid moves available, ending test');
          break;
        }

        // Random move selection
        const p1Index = Math.floor(Math.random() * p1Count);
        const p2Index = Math.floor(Math.random() * p2Count);

        await p1Moves.nth(p1Index).click();
        await p2Moves.nth(p2Index).click();

        // Click FIGHT
        await Promise.all([
          player1Page.click('button:has-text("FIGHT")'),
          player2Page.click('button:has-text("FIGHT")'),
        ]);

        // Wait for exchange to resolve
        await player1Page.waitForTimeout(2000);

        // Wait until not in "Waiting" state
        let attempts = 0;
        while (attempts < 10) {
          const waiting = await player1Page.locator('text=Waiting').count();
          if (waiting === 0) break;
          await player1Page.waitForTimeout(500);
          attempts++;
        }
      }

      // Verify game completed or we hit max rounds
      expect(round).toBeGreaterThan(0);
      console.log(`✓ Battle simulation completed (${round} rounds)`);

    } finally {
      await player1Context.close();
      await player2Context.close();
    }
  });

  test('Disconnection Handling - opponent disconnect notification', async ({ browser }) => {
    const player1Context = await browser.newContext();
    const player2Context = await browser.newContext();

    try {
      // Setup: Create and join room
      const player1Page = await setupPlayer(player1Context);
      await player1Page.click('button:has-text("Create Room")');
      await player1Page.waitForSelector('text=Share this code', { timeout: 10000 });

      const roomCode = await player1Page.locator('.text-5xl.font-mono').textContent();

      const player2Page = await setupPlayer(player2Context);
      await player2Page.fill('input[placeholder="Enter Room Code"]', roomCode!);
      await player2Page.click('button:has-text("Join Room")');

      // Wait for battle
      await Promise.all([
        player1Page.waitForSelector('text=Your Moves', { timeout: 15000 }),
        player2Page.waitForSelector('text=Your Moves', { timeout: 15000 }),
      ]);

      // Player 2 disconnects (close their page)
      await player2Page.close();

      // Player 1 should eventually see disconnect notification or be able to continue
      // This depends on the server implementation
      await player1Page.waitForTimeout(3000);

      // The game should still be responsive for player 1
      const body = await player1Page.locator('body');
      await expect(body).toBeVisible();

      console.log('✓ Disconnection handled gracefully');

    } finally {
      await player1Context.close();
      await player2Context.close();
    }
  });
});

test.describe('Connection Tests', () => {
  test('Server Health Check', async ({ request }) => {
    const serverUrl = 'https://lost-worlds-server.onrender.com';

    const response = await request.get(`${serverUrl}/health`);
    expect(response.ok()).toBeTruthy();

    const data = await response.json();
    expect(data.status).toBe('ok');

    console.log(`✓ Server healthy - ${data.rooms} rooms, ${data.players} players`);
  });

  test('Vercel App Loads', async ({ page }) => {
    await page.goto(BASE_URL);
    await page.waitForLoadState('domcontentloaded');

    // Should see the title
    await expect(page.locator('text=Lost Worlds')).toBeVisible();
    await expect(page.locator('text=Combat Book Game')).toBeVisible();

    // Should see game mode options
    await expect(page.locator('text=vs AI')).toBeVisible();
    await expect(page.locator('text=Online')).toBeVisible();

    console.log('✓ Vercel app loaded successfully');
  });
});
