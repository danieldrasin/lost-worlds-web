/**
 * Deployment Version Verification Tests
 *
 * Verifies that deployed client and server versions match
 * the expected versions in deployment-versions.json.
 *
 * Run with:
 *   npm run test:e2e:staging   (verify staging)
 *   npm run test:e2e:prod      (verify production)
 *   npm run test:e2e           (local — version match skipped)
 */

import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const BASE_URL = process.env.TEST_URL || 'http://localhost:5173';
const SERVER_URL = process.env.TEST_SERVER_URL || 'http://localhost:3001';

function getEnvironment(): 'local' | 'staging' | 'production' {
  if (BASE_URL.includes('lost-worlds-prod')) return 'production';
  if (BASE_URL.includes('vercel.app')) return 'staging';
  return 'local';
}

function readTrackingFile() {
  const filePath = path.resolve(process.cwd(), 'deployment-versions.json');
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

test.describe('Deployment Version Verification', () => {

  test('client displays app version', async ({ page }) => {
    await page.goto(BASE_URL);
    // Build info shows something like "build Feb 10 3:16 PM v0.1.0"
    const buildInfo = page.locator('text=/v\\d+\\.\\d+\\.\\d+/');
    await expect(buildInfo).toBeVisible({ timeout: 10000 });
    const text = await buildInfo.textContent();
    console.log(`  Client build info: ${text}`);
  });

  test('server /health returns version', async () => {
    const response = await fetch(`${SERVER_URL}/health`);
    expect(response.ok).toBeTruthy();
    const data = await response.json();
    expect(data.version).toBeTruthy();
    expect(data.version).toMatch(/^\d+\.\d+\.\d+$/);
    console.log(`  Server health: version=${data.version}, rooms=${data.rooms}, players=${data.players}`);
  });

  test('client and server versions match each other', async ({ page }) => {
    // Get server version
    const healthRes = await fetch(`${SERVER_URL}/health`);
    const healthData = await healthRes.json();
    const serverVersion = healthData.version;

    // Get client version from page
    await page.goto(BASE_URL);
    const buildInfo = page.locator('text=/v\\d+\\.\\d+\\.\\d+/');
    await expect(buildInfo).toBeVisible({ timeout: 10000 });
    const text = await buildInfo.textContent() || '';
    const match = text.match(/v(\d+\.\d+\.\d+)/);
    const clientVersion = match ? match[1] : null;

    expect(clientVersion).toBeTruthy();
    expect(clientVersion).toBe(serverVersion);
    console.log(`  Client=${clientVersion}, Server=${serverVersion} — match ✓`);
  });

  test('deployed versions match tracking file', async ({ page }) => {
    const env = getEnvironment();
    if (env === 'local') {
      test.skip(true, 'Version tracking not checked for local dev');
      return;
    }

    const versions = readTrackingFile();
    if (!versions) {
      test.skip(true, 'deployment-versions.json not found');
      return;
    }

    const expected = versions[env];
    if (!expected) {
      test.skip(true, `No ${env} entry in deployment-versions.json`);
      return;
    }

    // Get server version
    const healthRes = await fetch(`${SERVER_URL}/health`);
    const healthData = await healthRes.json();
    const serverVersion = healthData.version;

    // Get client version
    await page.goto(BASE_URL);
    const buildInfo = page.locator('text=/v\\d+\\.\\d+\\.\\d+/');
    await expect(buildInfo).toBeVisible({ timeout: 10000 });
    const text = await buildInfo.textContent() || '';
    const match = text.match(/v(\d+\.\d+\.\d+)/);
    const clientVersion = match ? match[1] : null;

    // All three must match
    expect(clientVersion).toBe(expected.version);
    expect(serverVersion).toBe(expected.version);

    console.log(`  ${env} version verification:`);
    console.log(`    Expected:  ${expected.version} (${expected.description})`);
    console.log(`    Client:    ${clientVersion} ✓`);
    console.log(`    Server:    ${serverVersion} ✓`);
  });
});
