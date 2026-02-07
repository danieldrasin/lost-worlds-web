# Invite System Implementation Plan

## Overview

Fully asynchronous game invite system. Neither player needs to stay on the page — both get notified when the other joins, with a link to return.

**Notification channels:** Email (Resend) + Telegram Bot API
**Future:** WhatsApp Business API, SMS via Twilio

---

## User Flow

### Host Creates Invite
1. Host clicks "Invite a Friend" from the main menu
2. Selects their character
3. Enters their own notification preference (email and/or Telegram)
4. Enters guest's email address (required) and optional Telegram
5. Clicks "Send Invite"
6. System creates a room, sends invite email/Telegram message to guest
7. Host sees confirmation: "Invite sent! We'll notify you when they join."
8. Host can close the page

### Guest Joins
1. Guest receives email/Telegram with "Join the Battle" link
2. Clicks link → app loads with room code pre-filled
3. Guest enters their own notification preference (for when host returns)
4. Selects their character
5. Joins room → system notifies host: "Your opponent joined! Click to play"
6. Guest can wait on page OR leave (they'll be notified when host arrives)

### Host Returns
1. Host gets email/Telegram: "Your opponent is ready! Click to start"
2. Clicks link → app loads, auto-joins room as host
3. If guest is still on the page → battle starts immediately
4. If guest left → system notifies guest: "Host is ready! Click to play"

### Guest Returns (if they left)
1. Guest gets notification with link
2. Clicks link → rejoins room → battle starts

---

## Services Required

### 1. Resend (Email)
- **Free tier:** 100 emails/day, 3,000/month
- **Setup time:** ~1 minute
- **User action required:** Sign up at resend.com, create API key
- **Sender:** `onboarding@resend.dev` (testing domain, no DNS needed)

### 2. Telegram Bot
- **Free tier:** Unlimited messages, forever
- **Setup time:** ~2 minutes
- **User action required:** Message @BotFather in Telegram, create bot, copy token
- **How users connect:** Click a link (t.me/BotName?start=TOKEN) → bot registers their chat ID
- **No phone number entry needed** — just click the link in the app

---

## Technical Design

### Server Changes (server/index.js + new files)

#### New REST Endpoints:
- `POST /api/invites/create` — Host creates invite, sends notification to guest
- `POST /api/invites/join` — Guest joins, enters their contact info, triggers host notification
- `POST /api/invites/reclaim` — Player returns via notification link (works for both host and guest)
- `POST /api/invites/status/:roomCode` — Check room status (who's in, who's waiting)
- `POST /api/telegram/webhook` — Telegram bot webhook (receives /start commands)

#### Modified Room Model:
```
Room {
  // Existing fields...

  // New invite fields:
  isInviteRoom: boolean
  hostToken: string          // Secret for host to reclaim room
  guestToken: string         // Secret for guest to reclaim room (set when guest joins)
  hostCharacter: string
  guestCharacter: string

  // Contact info (for notifications)
  hostEmail: string | null
  hostTelegramChatId: string | null
  guestEmail: string | null
  guestTelegramChatId: string | null

  inviteStatus: 'pending' | 'guest-joined' | 'host-returned' | 'both-ready'
  createdAt: number          // For TTL (24 hours for invite rooms)
}
```

#### New Files:
- `server/services/notifications.js` — Send emails via Resend + Telegram messages
- `server/services/telegramBot.js` — Handle Telegram webhook (/start commands)

#### Telegram Bot Integration:
- Bot receives `/start LINK_TOKEN` when user clicks the t.me link
- Server maps LINK_TOKEN → room + player role → stores chat_id
- Server can then send that user Telegram messages anytime
- Chat IDs saved client-side in localStorage for reuse

#### Room Cleanup:
- Invite rooms: 24-hour TTL (vs 30 min for regular rooms)
- Active battle rooms: no auto-cleanup while players connected

### Client Changes

#### New Component: InviteView.tsx
- Form with: character selector, notification method picker, contact fields
- "Your info" section (remembered via localStorage)
- "Opponent's info" section (email field, optional Telegram note)
- Send button → calls POST /api/invites/create
- Success screen with room code and status

#### Modified: MenuView.tsx
- New "Invite a Friend" button in main menu
- URL parameter handling for: ?room=CODE&token=TOKEN&role=host|guest
- Auto-join flow when returning via notification link

#### Modified: MultiplayerLobby.tsx
- New sub-state for invite-based joining (guest enters their contact info before joining)
- Waiting screen that shows "We'll notify you — feel free to close this page"

#### Modified: socket.ts
- New REST client functions (createInvite, joinInvite, reclaimRoom, checkStatus)
- No new socket events needed — invites use REST, battle still uses WebSocket

#### localStorage Preferences:
```
lostworlds_notification_prefs: {
  email: "user@example.com",
  telegramChatId: "123456789",
  preferredMethod: "email" | "telegram" | "both"
}
```
Remembered between sessions so users don't re-enter their info.

### Environment Variables (Render)
```
RESEND_API_KEY=re_xxxxx
TELEGRAM_BOT_TOKEN=123456:ABC-DEF...
FRONTEND_URL=https://lost-worlds-web.vercel.app
INVITE_ROOM_TTL=86400
```

### Dependencies
- `resend` (npm) — Email sending
- No new dependency for Telegram — it's just HTTP fetch calls to api.telegram.org

---

## Edge Cases
- **Expired invite (>24h):** Show "This invite has expired" message
- **Invalid token:** Show "Invalid link" message
- **Double-join attempt:** "Room is full"
- **Server restart:** Rooms lost (existing limitation, acceptable for MVP)
- **Email delivery failure:** Show error, offer to copy link manually
- **Telegram not connected:** Graceful — email is always available as fallback

---

## Implementation Order

### Step 1: Notification Services (server)
Create server/services/notifications.js and server/services/telegramBot.js

### Step 2: Server Endpoints
Add REST endpoints to server/index.js, modify room model

### Step 3: Client Invite UI
Create InviteView.tsx, update MenuView.tsx

### Step 4: Client Join Flow
Update MultiplayerLobby.tsx for invite-based joining

### Step 5: Telegram Bot Setup
User creates bot via @BotFather, we configure webhook

### Step 6: Test End-to-End
Full flow: create invite → guest joins → host returns → battle

### Step 7: Deploy
Push to GitHub → Vercel auto-deploys frontend → push server to Render

---

## Future TODOs
- [ ] WhatsApp Business API integration (requires Meta business verification)
- [ ] Custom email domain (DNS verification with Resend)
- [ ] Persistent room storage (Redis or database) to survive server restarts
- [ ] SMS via Twilio (paid, ~$0.0075/message)
- [ ] Email templates with proper branding/logo
- [ ] Rate limiting on invite creation endpoint
