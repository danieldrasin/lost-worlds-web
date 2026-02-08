# E2E Testing Setup for Claude Sessions

## The Problem

The Claude Code sandbox (web sessions) runs behind a network proxy that **only allows** connections to:
- `github.com`
- `registry.npmjs.org`
- `archive.ubuntu.com`

Playwright, Puppeteer, and all other browser automation tools need to download browser binaries from CDNs (`cdn.playwright.dev`, `storage.googleapis.com`, etc.) which are **blocked** by the proxy. This is a known limitation: https://github.com/anthropics/claude-code/issues/15583

## The Solution: Run Playwright on the User's Mac

Claude has access to the user's Mac via the **Desktop Commander MCP** tool (`mcp__desktop-commander__*`). This tool can execute shell commands on the actual Mac, where there are no proxy restrictions.

### First-Time Setup (per Mac)

```bash
# 1. Clone the repo (if not already cloned)
cd /Users/DanDrasin/projects
git clone https://github.com/danieldrasin/lost-worlds-web.git
cd lost-worlds-web

# 2. Install dependencies
npm install

# 3. Install Playwright browsers (one-time — browsers persist across sessions)
npx playwright install chromium
npx playwright install webkit
# Optional: npx playwright install firefox
```

### Running Tests

```bash
# From the repo directory on Mac:
cd /Users/DanDrasin/projects/lost-worlds-web

# Always pull latest before running tests
git pull origin master

# Run against live Vercel deployment
TEST_URL=https://lost-worlds-web.vercel.app LIVE_TEST=true npx playwright test e2e/layout.spec.ts --project=chromium --reporter=line

# Run on Safari/WebKit
TEST_URL=https://lost-worlds-web.vercel.app LIVE_TEST=true npx playwright test e2e/layout.spec.ts --project=desktop-safari --reporter=line

# Run with iPhone 14 viewport
TEST_URL=https://lost-worlds-web.vercel.app LIVE_TEST=true npx playwright test e2e/layout.spec.ts --project=iphone-14 --reporter=line

# Run all projects at once
TEST_URL=https://lost-worlds-web.vercel.app LIVE_TEST=true npx playwright test e2e/layout.spec.ts --reporter=line
```

### How to Run from Claude's Session

Since the Desktop Commander MCP tool has a 30-second timeout, run tests in the background and poll for results:

```
# Step 1: Pull latest code
mcp__desktop-commander__start_process:
  command: cd /Users/DanDrasin/projects/lost-worlds-web && git pull origin master 2>&1

# Step 2: Start tests in background, writing to a results file
mcp__desktop-commander__start_process:
  command: cd /Users/DanDrasin/projects/lost-worlds-web && rm -rf test-results && TEST_URL=https://lost-worlds-web.vercel.app LIVE_TEST=true npx playwright test e2e/layout.spec.ts --project=chromium --reporter=line > /tmp/pw-results.txt 2>&1 & echo "Started PID: $!"

# Step 3: Wait for completion then read results (use the backgrounded PID)
mcp__desktop-commander__start_process:
  command: while ps -p <PID> > /dev/null 2>&1; do sleep 5; done; echo "DONE"; cat /tmp/pw-results.txt

# Step 4: If tests fail, read failure screenshots for visual debugging
mcp__desktop-commander__read_file:
  path: /Users/DanDrasin/projects/lost-worlds-web/test-results/<test-folder>/test-failed-1.png
```

### Test Configuration

Tests are in `e2e/layout.spec.ts`. The `playwright.config.ts` defines four device profiles:

| Project | Device | Viewport |
|---------|--------|----------|
| chromium | Desktop Chrome | 1280×720 |
| desktop-safari | Desktop Safari | 1280×720 |
| iphone-14 | iPhone 14 | 390×844 |
| ipad | iPad (gen 7) | 810×1080 |

Tests can run against a local dev server (`http://localhost:5173`) or the live Vercel deployment (via `TEST_URL` env var).

### Viewing Failure Screenshots

When a test fails, Playwright saves a screenshot to `test-results/<test-name>/test-failed-1.png`. Use `mcp__desktop-commander__read_file` to view these images — they render inline and are invaluable for debugging layout issues.

### Key Notes

- **Browsers persist** on the Mac between Claude sessions — no need to reinstall each time
- **The repo clone persists** at `/Users/DanDrasin/projects/lost-worlds-web` — just `git pull` to update
- **Test timeout is 60s** per test (configurable in `playwright.config.ts`)
- **Tests are deterministic** — they start a vs AI battle with default characters, which always loads the same way
- The `startLocalBattle()` helper clicks "vs AI" → "Start Battle!" → waits for "R1" (round indicator visible on all viewports)
