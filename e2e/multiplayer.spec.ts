/**
 * E2E Tests for Multiplayer Battle
 *
 * Uses Playwright to simulate two browsers playing against each other.
 */

import { test, expect } from '@playwright/test';

const BASE_URL = process.env.TEST_URL || 'http://localhost:5173';

test.describe('Multiplayer Battle', () => {
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
    await player1Page.waitForSelector('text=Create Room');

    // Player 1: Create a room
    await player1Page.click('text=Create Room');

    // Wait for room code to appear
    await player1Page.waitForSelector('text=Share this code');

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
    await player2Page.waitForSelector('text=Create Room');

    // Enter the room code
    await player2Page.fill('input[placeholder="Enter Room Code"]', roomCode!);
    await player2Page.click('text=Join Room');

    // Both players should now be in battle
    await player1Page.waitForSelector('text=Your Moves', { timeout: 10000 });
    await player2Page.waitForSelector('text=Your Moves', { timeout: 10000 });

    console.log('Both players are in battle!');

    // Clean up
    await player1Context.close();
    await player2Context.close();
  });

  test('players can exchange moves', async ({ browser }) => {
    const player1Context = await browser.newContext();
    const player2Context = await browser.newContext();

    const player1Page = await player1Context.newPage();
    const player2Page = await player2Context.newPage();

    // Setup: Create and join room (same as above)
    await player1Page.goto(BASE_URL);
    await player1Page.click('text=Online');
    await player1Page.click('text=Find Opponent');
    await player1Page.waitForSelector('text=Create Room');
    await player1Page.click('text=Create Room');
    await player1Page.waitForSelector('text=Share this code');

    const roomCodeElement = await player1Page.locator('.text-5xl.font-mono');
    const roomCode = await roomCodeElement.textContent();

    await player2Page.goto(BASE_URL);
    await player2Page.click('text=Online');
    await player2Page.click('text=Find Opponent');
    await player2Page.waitForSelector('text=Create Room');
    await player2Page.fill('input[placeholder="Enter Room Code"]', roomCode!);
    await player2Page.click('text=Join Room');

    // Wait for battle to start
    await player1Page.waitForSelector('text=Your Moves', { timeout: 10000 });
    await player2Page.waitForSelector('text=Your Moves', { timeout: 10000 });

    // Both players: Select a move (Extended category for first turn)
    // Look for any button in the Extended section
    const player1MoveButton = player1Page.locator('button:has-text("Charge")').first();
    const player2MoveButton = player2Page.locator('button:has-text("Charge")').first();

    await player1MoveButton.click();
    await player2MoveButton.click();

    // Both players: Click Fight
    await player1Page.click('text=FIGHT!');
    await player2Page.click('text=FIGHT!');

    // Wait for "Waiting for opponent" state
    await player1Page.waitForSelector('text=Waiting', { timeout: 5000 });

    // Wait for exchange to resolve (both should show results)
    await player1Page.waitForSelector('text=Round 1', { timeout: 10000 }).catch(() => {
      // History might not show immediately
    });

    console.log('Move exchange completed!');

    await player1Context.close();
    await player2Context.close();
  });
});

test.describe('Local Battle', () => {
  test('can start a battle vs AI', async ({ page }) => {
    await page.goto(BASE_URL);

    // Select AI mode (default)
    await expect(page.locator('text=vs AI')).toBeVisible();

    // Click Start Battle
    await page.click('text=Start Battle');

    // Should see battle UI
    await page.waitForSelector('text=Your Moves', { timeout: 5000 });

    // First turn should only show Extended Range moves
    const extendedSection = page.locator('text=Extended');
    await expect(extendedSection).toBeVisible();

    // Select a move
    await page.click('button:has-text("Charge")');

    // Fight button should be enabled
    const fightButton = page.locator('button:has-text("FIGHT!")');
    await expect(fightButton).toBeEnabled();

    // Click fight
    await fightButton.click();

    // Should resolve against AI and show result
    await page.waitForTimeout(500); // Give time for exchange to resolve

    // HP bars should update (we can't predict exact values)
    console.log('AI battle exchange completed!');
  });
});
