# Deployment & Testing Guide — Lost Worlds

## Architecture Overview

Lost Worlds uses a split-stack deployment: a Vite/React **client** on Vercel and a Node/Express/Socket.io **server** on Render. Two environments are maintained:

```
Git master branch  ──auto-deploy──►  Staging (Vercel + Render)
                                        │
               promote script           │
                                       ▼
Git production branch ──auto-deploy──► Production (Vercel + Render)
```

Both environments are externally accessible. Only Production should be linked from public-facing sites.

## URLs

| Environment | Client (Vercel) | Server (Render) |
|-------------|-----------------|-----------------|
| Local Dev | `http://localhost:5173` | `http://localhost:3001` |
| Staging | `https://lost-worlds-web.vercel.app` | `https://lost-worlds-server.onrender.com` |
| Production | `https://lost-worlds-prod.vercel.app` | `https://lost-worlds-server-prod.onrender.com` |

## Environment Variables

### Client (Vercel dashboard → Project → Settings → Environment Variables)

| Variable | Staging | Production |
|----------|---------|------------|
| `VITE_SERVER_URL` | `https://lost-worlds-server.onrender.com` | `https://lost-worlds-server-prod.onrender.com` |

For local dev, the fallback in `socket.ts` defaults to `http://localhost:3001`.

### Server (Render dashboard → Service → Environment)

| Variable | Staging | Production |
|----------|---------|------------|
| `FRONTEND_URL` | `https://lost-worlds-web.vercel.app` | `https://lost-worlds-prod.vercel.app` |
| `CLIENT_URL` | `https://lost-worlds-web.vercel.app` | `https://lost-worlds-prod.vercel.app` |
| `RESEND_API_KEY` | (same key for both — from `server/.env`) | (same key for both — from `server/.env`) |
| `TELEGRAM_BOT_TOKEN` | (staging bot token) | (production bot token — separate bot) |
| `TELEGRAM_BOT_USERNAME` | `LostWorldsCombatBot` | (production bot username) |
| `INVITE_ROOM_TTL` | `86400` | `86400` |
| `PORT` | (Render sets automatically) | (Render sets automatically) |

`FRONTEND_URL` and `CLIENT_URL` control CORS origins and invite link URLs. They must match the Vercel URL for that environment.

Each environment needs its **own Telegram bot** (created via @BotFather) because only one server can register a webhook per bot token. The `TELEGRAM_BOT_USERNAME` env var tells the server which bot link to generate for `t.me/` URLs.

---

## Initial Setup — What Was Done

### Vercel Production Project (done via API, Feb 9 2026)

The production Vercel project was created programmatically using the Vercel REST API. Here's what was done:

1. **Created project** `lost-worlds-prod` via `POST /v10/projects` — connected to the same GitHub repo (`danieldrasin/lost-worlds-web`), framework: Vite.

2. **Set production branch** to `production` via `PATCH /v9/projects/lost-worlds-prod/branch` — this is an undocumented endpoint that the Vercel dashboard uses internally. The standard API docs don't expose it, but it works with: `{"branch": "production"}`.

3. **Set environment variable** `VITE_SERVER_URL=https://lost-worlds-server-prod.onrender.com` via `POST /v10/projects/lost-worlds-prod/env`.

4. **Triggered first deployment** via `POST /v13/deployments` with `gitSource.ref: "production"` and `target: "production"`.

5. **Result:** Production client live at `https://lost-worlds-prod.vercel.app`.

Vercel API token is stored at: `~/Library/Application Support/com.vercel.cli/auth.json` (managed by `vercel` CLI, authenticated as `danieldrasin`).

### Render Production Service (manual setup required)

The Render production service needs to be created manually in the Render dashboard. Follow these steps:

1. Go to https://dashboard.render.com
2. Click **"New +"** → **"Web Service"**
3. Connect your GitHub repo: **`danieldrasin/lost-worlds-web`**
4. Configure the service:
   - **Name:** `lost-worlds-server-prod`
   - **Region:** Oregon (US West) — same as staging
   - **Branch:** `production`
   - **Root Directory:** `server`
   - **Runtime:** Node
   - **Build Command:** `npm install`
   - **Start Command:** `node index.js`
   - **Instance Type:** Free (or whatever staging uses)
5. Under **Environment Variables**, add:
   - `FRONTEND_URL` = `https://lost-worlds-prod.vercel.app`
   - `CLIENT_URL` = `https://lost-worlds-prod.vercel.app`
   - `RESEND_API_KEY` = (copy from staging service — same key for both)
   - `TELEGRAM_BOT_TOKEN` = (production bot token — create a separate bot via @BotFather)
   - `TELEGRAM_BOT_USERNAME` = (production bot username, e.g. `LostWorldsProdBot`)
   - `INVITE_ROOM_TTL` = `86400`
6. Click **"Create Web Service"**
7. Wait for the first deploy to complete (takes 2-5 minutes)
8. Verify the service is running: visit `https://lost-worlds-server-prod.onrender.com` — you should see the server respond

**Important:** Each environment needs its own Telegram bot. The existing bot (`LostWorldsCombatBot`) stays on staging. Create a new bot via @BotFather for production (e.g. `LostWorldsProdBot`). Only one server can register a webhook per bot token.

### Code Changes Made (commit 2a8f468)

These changes parameterized all hardcoded URLs so each environment uses its own env vars:

- **`server/index.js`** — Removed hardcoded `https://lost-worlds-web.vercel.app` from CORS allowedOrigins. Changed `FRONTEND_URL` from fallback to env-var-only with a console warning if unset.
- **`server/services/notifications.js`** — Same: removed hardcoded FRONTEND_URL fallback.
- **`e2e/multiplayer-live.spec.ts`** — Server URL now reads from `TEST_SERVER_URL` env var (defaults to staging).
- **`package.json`** — Added `test:e2e:staging` and `test:e2e:prod` convenience scripts.
- **`scripts/promote-to-production.sh`** — Promotion script (see below).

---

## Day-to-Day Workflow

### Developing and Deploying to Staging

Push to `master` → Vercel and Render auto-deploy staging:

```bash
git add -A && git commit -m "your change"
git push origin master
```

### Promoting Staging to Production

**STRICT RULE: Promotion is always a separate step after staging verification. Never promote in one straight shot — always verify staging e2e tests first, then explicitly confirm promotion.**

The workflow is:

1. **Push to master** → staging auto-deploys (wait 2-5 min)
2. **Run staging e2e tests** including version verification:
   ```bash
   npm run test:e2e:staging
   ```
3. **Confirm all tests pass** — if any fail, fix and repeat from step 1
4. **Explicitly confirm promotion** — operator (or Claude) must consciously decide to promote
5. **Run the promote script:**
   ```bash
   bash scripts/promote-to-production.sh          # interactive (asks for confirmation)
   bash scripts/promote-to-production.sh --yes    # non-interactive (for Claude sessions)
   ```
6. **Wait for production to deploy** (2-5 min)
7. **Run production e2e tests** including version verification:
   ```bash
   npm run test:e2e:prod
   ```

The promote script:
1. Checks for a clean working tree
2. Shows you the commits being promoted (diff between production and master)
3. Asks for confirmation (unless `--yes` flag is passed)
4. Merges master → production and pushes
5. Updates `deployment-versions.json` production entry to match the promoted version
6. Commits the tracking file update and pushes to both branches
7. Returns to master branch

After pushing, both Vercel and Render auto-deploy the production environment.

---

## Version Tracking

### How It Works

Each build embeds the `version` field from `package.json` (e.g., `"0.1.0"`):

- **Client:** Vite injects `__APP_VERSION__` at build time (defined in `vite.config.ts`). The `BuildInfo` component in `App.tsx` displays it as `build <date> v0.1.0` in the bottom corner.
- **Server:** `server/index.js` reads `../package.json` at startup. The `/health` endpoint returns `{ version: "0.1.0", ... }`.

### Tracking File: `deployment-versions.json`

This file records the expected version for each environment:

```json
{
  "staging": { "version": "0.1.0", "description": "Initial version tracking" },
  "production": { "version": "0.1.0", "description": "Initial version tracking" }
}
```

The e2e tests read this file and verify that the deployed client and server versions match the expected value for the target environment.

### Bumping the Version

When starting new work, bump the version first:

```bash
bash scripts/bump-version.sh           # patch bump: 0.1.0 → 0.1.1
bash scripts/bump-version.sh minor     # minor bump: 0.1.0 → 0.2.0
bash scripts/bump-version.sh major     # major bump: 0.1.0 → 1.0.0
```

This script:
1. Bumps `package.json` version via `npm version`
2. Updates `deployment-versions.json` staging entry to the new version
3. Stages both files for commit
4. Shows next steps (does **not** commit or push — lets operator review first)

### Version Verification E2E Tests

The `e2e/deployment-version.spec.ts` test suite verifies:

1. **Client displays version** — looks for `v0.1.0` pattern in the build info text
2. **Server returns version** — calls `/health` and checks the `version` field
3. **Client and server match** — both must report the same version
4. **Deployed version matches tracking file** — for staging or production, the deployed version must equal the expected version in `deployment-versions.json`

The tracking-file test is skipped for local dev (where versions aren't meaningful).

### Why package.json Version (Not Git SHAs)

Using git SHAs for version tracking creates a circular dependency: updating a tracking file with a SHA creates a new commit with a different SHA, making exact matching impossible. A package.json version is set once and stays stable across the commit that includes it.

---

### Rolling Back Production

If production has a problem, you can roll back:

```bash
# Revert the production branch to a known-good commit
git checkout production
git reset --hard <good-commit-sha>
git push --force origin production
git checkout master
```

---

## E2E Testing

### Prerequisites

Tests run on the Mac via Desktop Commander MCP (not in the Claude sandbox, which has network restrictions).

```bash
# First-time setup
cd "/Users/DanDrasin/projects/smalltalk stuff/lostworlds/lost-worlds-web"
npm install
npx playwright install chromium webkit
```

### Running Tests

```bash
# Against staging
npm run test:e2e:staging

# Against production
npm run test:e2e:prod

# Against local dev
npm run test:e2e

# Specific test file against staging
TEST_URL=https://lost-worlds-web.vercel.app LIVE_TEST=true npx playwright test e2e/layout.spec.ts --project=chromium --reporter=line
```

### Test Configuration

Tests are in `e2e/`. The `playwright.config.ts` defines four device profiles:

| Project | Device | Viewport |
|---------|--------|----------|
| chromium | Desktop Chrome | 1280×720 |
| desktop-safari | Desktop Safari | 1280×720 |
| iphone-14 | iPhone 14 | 390×844 |
| ipad | iPad (gen 7) | 810×1080 |

### Running from Claude Sessions

Desktop Commander has a 30-second timeout, so run tests in the background:

```bash
# Start tests, writing results to a file
cd "/Users/DanDrasin/projects/smalltalk stuff/lostworlds/lost-worlds-web" && \
  TEST_URL=https://lost-worlds-web.vercel.app LIVE_TEST=true \
  npx playwright test e2e/layout.spec.ts --project=chromium --reporter=line \
  > /tmp/pw-results.txt 2>&1 & echo "PID: $!"

# Poll for completion, then read results
while ps -p <PID> > /dev/null 2>&1; do sleep 5; done; cat /tmp/pw-results.txt
```

### Viewing Failure Screenshots

When tests fail, Playwright saves screenshots to `test-results/<test-name>/test-failed-1.png`. Use `mcp__desktop-commander__read_file` to view them inline.

---

## Telegram Bots

Each environment has its own Telegram bot (because only one server can register a webhook per bot token):

| Environment | Bot Username | Purpose |
|-------------|-------------|---------|
| Staging | `LostWorldsCombatBot` | Testing invites and notifications |
| Production | *(create via @BotFather)* | Public-facing notifications |

To create the production bot:
1. Open Telegram → message [@BotFather](https://t.me/BotFather)
2. Send `/newbot`
3. Name: `Lost Worlds Combat` (or similar)
4. Username: `LostWorldsProdBot` (must end in `Bot`, must be unique)
5. Copy the token BotFather gives you
6. Set `TELEGRAM_BOT_TOKEN` and `TELEGRAM_BOT_USERNAME` on the production Render service

---

## Useful Commands

```bash
# Check Vercel project status
vercel project inspect lost-worlds-prod

# List Vercel deployments
vercel ls lost-worlds-prod

# Check Vercel env vars (need to link first)
# Or use API: curl -H "Authorization: Bearer $TOKEN" https://api.vercel.com/v9/projects/lost-worlds-prod/env

# Trigger a manual Vercel deployment from production branch
# (normally auto-deploys on push, but useful for debugging)
vercel deploy --prod --yes
```
