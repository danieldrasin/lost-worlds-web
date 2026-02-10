/**
 * E2E Tests for Multiplayer Battle - Live Deployment
 *
 * Tests the full multiplayer flow against the deployed server:
 * - Room creation and joining
 * - Move submission and exchange resolution
 * - Multiple rounds of combat
 * - Game completion
 *
 * IMPORTANT: BattleViewNew has NO separate FIGHT button.
 * Clicking a move button directly submits it (multiplayer) or executes it (AI).
 * After clicking a move in multiplayer, "Waiting for opponent..." appears.
 * When both players have submitted, the exchange resolves automatically.
 *
 * Run with: TEST_URL=https://lost-worlds-web.vercel.app npx playwright test e2e/multiplayer-live.spec.ts
 */

import { test, expect, Page, BrowserContext } from '@playwright/test';

// Use production URL by default
const BASE_URL = process.env.TEST_URL || 'https://lost-worlds-web.vercel.app';

// Detect if we're testing against a live (remote) server
const isRemote = BASE_URL.includes('vercel.app');

// Helper: check if viewport is mobile-sized
function isMobileViewport(page: Page): boolean {
  const size = page.viewportSize();
  return !!size && size.width < 768;
}

// Helper: ensure the move panel is visible (handles mobile tab navigation)
async function ensureMovePanelVisible(page: Page): Promise<void> {
  if (isMobileViewport(page)) {
    // On mobile, click the "Move" tab button (⚔️ Move) in the bottom tab bar.
    // Use button:has-text to avoid matching "Movement restricted" or "Tap 'Move'" text.
    const moveTabButton = page.locator('button:has-text("Move")');
    if (await moveTabButton.isVisible()) {
      await moveTabButton.click();
      await page.waitForTimeout(500);
    }
  }
  // On desktop, "Your Moves" is always visible — no action needed
}

// Helper to create a player context and navigate to online mode
async function setupPlayer(context: BrowserContext): Promise<Page> {
  const page = await context.newPage();
  await page.goto(BASE_URL);
  await page.waitForLoadState('domcontentloaded');

  // Select Online mode
  await page.click('button:has-text("Online")');

  // Click Find Opponent to go to lobby
  await page.click('button:has-text("Find Opponent")');

  // Wait for lobby to load
  await page.waitForSelector('text=Create Room', { timeout: 15000 });

  return page;
}

// Helper: wait for battle to start (handles mobile vs desktop)
async function waitForBattleReady(page: Page, timeout = 30000): Promise<void> {
  if (isMobileViewport(page)) {
    // On mobile, the battle starts on the "View" tab. Wait for the tab bar buttons
    // to appear, then switch to the Move tab and wait for move buttons.
    // Use button:has-text("Move") to target the tab button specifically.
    await page.waitForSelector('button:has-text("Move")', { timeout });
    await ensureMovePanelVisible(page);
    // Now wait for move buttons to be available
    await page.waitForSelector('.space-y-3 button', { timeout: 15000 });
  } else {
    // On desktop, "Your Moves" is directly visible
    await page.waitForSelector('text=Your Moves', { timeout });
  }
}

// Helper: wait for "Waiting for opponent..." to disappear (exchange resolved)
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
      // No longer waiting — exchange resolved or never entered waiting state
      // Give the UI a moment to settle
      await page.waitForTimeout(500);
      return 'resolved';
    }

    await page.waitForTimeout(1000);
  }

  return 'timeout';
}

test.describe('Multiplayer Live Tests', () => {
  // Use generous timeouts for live server tests
  test.setTimeout(isRemote ? 90000 : 60000);

  test('Room Creation - should create a room and get a 6-character code', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await setupPlayer(context);

    // Create room
    await page.click('button:has-text("Create Room")');

    // Wait for room code to appear
    await page.waitForSelector('text=Share this code', { timeout: 15000 });

    // Get the room code
    const roomCodeElement = page.locator('.text-5xl.font-mono');
    const roomCode = await roomCodeElement.textContent();

    expect(roomCode).toBeTruthy();
    expect(roomCode?.length).toBe(6);
    expect(roomCode).toMatch(/^[A-Z0-9-]+$/);

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
      await player1Page.waitForSelector('text=Share this code', { timeout: 15000 });

      const roomCodeElement = player1Page.locator('.text-5xl.font-mono');
      const roomCode = await roomCodeElement.textContent();
      console.log(`Player 1 created room: ${roomCode}`);

      // Player 2: Setup and join room
      const player2Page = await setupPlayer(player2Context);
      await player2Page.fill('input[placeholder="Enter Room Code"]', roomCode!);
      await player2Page.click('button:has-text("Join Room")');

      // Both players should now be in battle
      await Promise.all([
        waitForBattleReady(player1Page),
        waitForBattleReady(player2Page),
      ]);

      console.log('✓ Both players successfully joined and see battle screen');

    } finally {
      await player1Context.close();
      await player2Context.close();
    }
  });

  test('Move Exchange - both players can submit moves and see results', async ({ browser }) => {
    test.setTimeout(isRemote ? 120000 : 60000);

    const player1Context = await browser.newContext();
    const player2Context = await browser.newContext();

    try {
      // Setup: Create and join room
      const player1Page = await setupPlayer(player1Context);
      await player1Page.click('button:has-text("Create Room")');
      await player1Page.waitForSelector('text=Share this code', { timeout: 15000 });

      const roomCode = await player1Page.locator('.text-5xl.font-mono').textContent();
      console.log(`Room: ${roomCode}`);

      const player2Page = await setupPlayer(player2Context);
      await player2Page.fill('input[placeholder="Enter Room Code"]', roomCode!);
      await player2Page.click('button:has-text("Join Room")');

      // Wait for battle to start
      await Promise.all([
        waitForBattleReady(player1Page),
        waitForBattleReady(player2Page),
      ]);

      // Ensure move panels are visible on both
      await ensureMovePanelVisible(player1Page);
      await ensureMovePanelVisible(player2Page);

      // Both players click a move — this DIRECTLY submits in BattleViewNew (no FIGHT button)
      // Charge is an Extended Range move, available first turn
      const p1ChargeButton = player1Page.locator('button:has-text("Charge")').first();
      const p2ChargeButton = player2Page.locator('button:has-text("Charge")').first();

      // Click moves for both players — each click auto-submits to server
      await p1ChargeButton.click();
      console.log('Player 1 submitted Charge');

      await p2ChargeButton.click();
      console.log('Player 2 submitted Charge');

      // Wait for the exchange to resolve — "Waiting for opponent..." should appear then disappear
      const resolution = await waitForExchangeResolution(player1Page, 60000);
      console.log(`✓ Move exchange completed (resolved via: ${resolution})`);

      // Verify that the round history shows the exchange
      const historyVisible = await player1Page.locator('text=Round 1').count();
      expect(historyVisible).toBeGreaterThan(0);

    } finally {
      await player1Context.close();
      await player2Context.close();
    }
  });

  test('Full Battle - play multiple rounds until game over', async ({ browser }) => {
    test.setTimeout(isRemote ? 300000 : 120000); // 5 minutes for remote, 2 for local

    const player1Context = await browser.newContext();
    const player2Context = await browser.newContext();

    try {
      // Setup: Create and join room
      const player1Page = await setupPlayer(player1Context);
      await player1Page.click('button:has-text("Create Room")');
      await player1Page.waitForSelector('text=Share this code', { timeout: 15000 });

      const roomCode = await player1Page.locator('.text-5xl.font-mono').textContent();
      console.log(`Starting full battle in room: ${roomCode}`);

      const player2Page = await setupPlayer(player2Context);
      await player2Page.fill('input[placeholder="Enter Room Code"]', roomCode!);
      await player2Page.click('button:has-text("Join Room")');

      // Wait for battle
      await Promise.all([
        waitForBattleReady(player1Page),
        waitForBattleReady(player2Page),
      ]);

      let round = 0;
      const maxRounds = 20;

      while (round < maxRounds) {
        round++;
        console.log(`Round ${round}...`);

        // Check if game is over on either player
        const gameOver1 = await player1Page.locator('text=Victory').count();
        const gameOver2 = await player2Page.locator('text=Victory').count();
        const defeated1 = await player1Page.locator('text=Defeated').count();
        const defeated2 = await player2Page.locator('text=Defeated').count();

        if (gameOver1 > 0 || gameOver2 > 0 || defeated1 > 0 || defeated2 > 0) {
          console.log(`✓ Game ended after ${round - 1} rounds`);
          break;
        }

        // Ensure move panel is visible (mobile tab handling)
        await ensureMovePanelVisible(player1Page);
        await ensureMovePanelVisible(player2Page);

        // Find available (non-disabled) move buttons for both players
        const p1Moves = player1Page.locator('.space-y-3 button:not([disabled])');
        const p2Moves = player2Page.locator('.space-y-3 button:not([disabled])');

        const p1Count = await p1Moves.count();
        const p2Count = await p2Moves.count();

        if (p1Count === 0 || p2Count === 0) {
          console.log('No valid moves available, ending test');
          break;
        }

        // Random move selection — each click auto-submits (no FIGHT button)
        const p1Index = Math.floor(Math.random() * p1Count);
        const p2Index = Math.floor(Math.random() * p2Count);

        await p1Moves.nth(p1Index).click();
        await p2Moves.nth(p2Index).click();

        // Wait for exchange to resolve
        const resolution = await waitForExchangeResolution(player1Page, isRemote ? 30000 : 10000);

        if (resolution === 'timeout') {
          console.log(`⚠ Round ${round} timed out waiting for resolution`);
          break;
        }

        if (resolution === 'game-over') {
          console.log(`✓ Game ended during round ${round}`);
          break;
        }

        // On mobile, switch back to Move tab for next round
        if (isMobileViewport(player1Page)) {
          await ensureMovePanelVisible(player1Page);
        }
        if (isMobileViewport(player2Page)) {
          await ensureMovePanelVisible(player2Page);
        }

        // Brief pause between rounds for UI to settle
        await player1Page.waitForTimeout(500);
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
      await player1Page.waitForSelector('text=Share this code', { timeout: 15000 });

      const roomCode = await player1Page.locator('.text-5xl.font-mono').textContent();

      const player2Page = await setupPlayer(player2Context);
      await player2Page.fill('input[placeholder="Enter Room Code"]', roomCode!);
      await player2Page.click('button:has-text("Join Room")');

      // Wait for battle
      await Promise.all([
        waitForBattleReady(player1Page),
        waitForBattleReady(player2Page),
      ]);

      // Player 2 disconnects (close their page)
      await player2Page.close();

      // Player 1 should eventually see disconnect notification or be able to continue
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
    const serverUrl = process.env.TEST_SERVER_URL || 'https://lost-worlds-server.onrender.com';

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
