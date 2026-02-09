# Environment Setup — Lost Worlds

Lost Worlds uses two deployment environments: **Staging** and **Production**.

## Architecture

```
Git master branch  ──auto-deploy──►  Staging (Vercel + Render)
                                        │
                  promote script         │
                                        ▼
Git production branch ──auto-deploy──► Production (Vercel + Render)
```

## URLs

| Environment | Client (Vercel) | Server (Render) |
|-------------|-----------------|-----------------|
| Local Dev | `http://localhost:5173` | `http://localhost:3001` |
| Staging | `https://lost-worlds-web.vercel.app` | `https://lost-worlds-server.onrender.com` |
| Production | `https://lost-worlds-prod.vercel.app` | `https://lost-worlds-server-prod.onrender.com` |

## Environment Variables

### Client (set in Vercel dashboard per project)

| Variable | Local | Staging | Production |
|----------|-------|---------|------------|
| `VITE_SERVER_URL` | `http://localhost:3001` (fallback) | `https://lost-worlds-server.onrender.com` | `https://lost-worlds-server-prod.onrender.com` |

For local dev, the fallback in `socket.ts` handles this automatically. For staging, `.env.production` in the repo provides the default. For production, override in Vercel project settings.

### Server (set in Render dashboard per service)

| Variable | Local | Staging | Production |
|----------|-------|---------|------------|
| `FRONTEND_URL` | `http://localhost:5173` | `https://lost-worlds-web.vercel.app` | `https://lost-worlds-prod.vercel.app` |
| `CLIENT_URL` | `http://localhost:5173` | `https://lost-worlds-web.vercel.app` | `https://lost-worlds-prod.vercel.app` |
| `RESEND_API_KEY` | (from server/.env) | (set in Render) | (set in Render) |
| `TELEGRAM_BOT_TOKEN` | (from server/.env) | *omit* (no Telegram on staging) | (set in Render) |
| `INVITE_ROOM_TTL` | `86400` | `86400` | `86400` |
| `PORT` | `3001` (default) | (Render sets this) | (Render sets this) |

**Important:** `FRONTEND_URL` and `CLIENT_URL` must match the Vercel URL for that environment. They control CORS origins and invite link URLs.

## Promotion

To promote staging to production:

```bash
bash scripts/promote-to-production.sh
```

This merges `master` into `production` and pushes, triggering auto-deploy on both Vercel and Render for the production environment.

## Testing

```bash
# Test against staging
npm run test:e2e:staging

# Test against production
npm run test:e2e:prod

# Test against local dev
npm run test:e2e
```

## Telegram Bot

Only production runs the Telegram bot. Staging uses email notifications only. If you need Telegram on staging, create a separate bot via @BotFather and set its token on the staging Render service.
