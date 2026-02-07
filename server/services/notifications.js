/**
 * Notification Service
 *
 * Sends notifications via Email (Resend) and Telegram (Bot API).
 * Used for:
 *   Step 1: Sending game invites to the challenged player (email only for now)
 *   Step 3: Notifying the challenger that their challenge was accepted (email or Telegram)
 *
 * Telegram requires a one-time bot connect: user clicks t.me/BotName, taps /start,
 * and their chat_id is returned to the client via webhook. After that, their chat_id
 * is saved in localStorage and reused for all future notifications.
 */

import crypto from 'crypto';

const TELEGRAM_API = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}`;
const FRONTEND_URL = process.env.FRONTEND_URL || 'https://lost-worlds-web.vercel.app';

// ============================================
// Email via Resend
// ============================================

/**
 * Send an email via Resend API
 */
async function sendEmail(to, subject, html) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn('RESEND_API_KEY not set, skipping email');
    return { success: false, error: 'Email not configured' };
  }

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Lost Worlds <onboarding@resend.dev>',
        to: [to],
        subject,
        html,
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      console.error('Resend error:', data);
      return { success: false, error: data.message || 'Email send failed' };
    }

    console.log(`Email sent to ${to}: ${subject}`);
    return { success: true, id: data.id };
  } catch (err) {
    console.error('Email send error:', err);
    return { success: false, error: err.message };
  }
}

// ============================================
// Telegram via Bot API
// ============================================

/**
 * Send a Telegram message to a numeric chat ID.
 * The user must have previously /started the bot for this to work.
 */
async function sendTelegram(chatId, text, parseMode = 'HTML') {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    console.warn('TELEGRAM_BOT_TOKEN not set, skipping Telegram');
    return { success: false, error: 'Telegram not configured' };
  }

  try {
    const response = await fetch(`${TELEGRAM_API}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: parseMode,
        disable_web_page_preview: false,
      }),
    });

    const data = await response.json();
    if (!data.ok) {
      console.error('Telegram error:', data);
      return { success: false, error: data.description || 'Telegram send failed' };
    }

    console.log(`Telegram sent to ${chatId}`);
    return { success: true };
  } catch (err) {
    console.error('Telegram send error:', err);
    return { success: false, error: err.message };
  }
}

// ============================================
// Email Templates
// ============================================

function inviteEmailHtml(joinUrl, roomCode) {
  return `
<!DOCTYPE html>
<html>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #1a1a2e; padding: 20px; margin: 0;">
  <div style="max-width: 500px; margin: 0 auto; background-color: #16213e; padding: 40px; border-radius: 12px; border: 1px solid #0f3460;">
    <h1 style="color: #e94560; text-align: center; margin-bottom: 8px; font-size: 28px;">Lost Worlds</h1>
    <p style="color: #a0a0b0; text-align: center; margin-top: 0; margin-bottom: 30px; font-size: 14px;">Combat Book Game</p>

    <p style="color: #e0e0e0; font-size: 18px; text-align: center; line-height: 1.6;">
      You've been challenged to battle!
    </p>

    <div style="text-align: center; margin: 30px 0;">
      <a href="${joinUrl}" style="display: inline-block; background-color: #22c55e; color: white; padding: 16px 40px; border-radius: 8px; text-decoration: none; font-weight: bold; font-size: 18px;">
        Join the Battle
      </a>
    </div>

    <p style="color: #808090; text-align: center; font-size: 13px;">
      Room Code: <code style="background-color: #0f3460; padding: 3px 8px; border-radius: 4px; color: #e0e0e0;">${roomCode}</code>
    </p>
    <p style="color: #606070; text-align: center; font-size: 12px; margin-top: 20px;">
      This invite expires in 24 hours.
    </p>
  </div>
</body>
</html>`;
}

function readyNotificationEmailHtml(playUrl, roomCode) {
  return `
<!DOCTYPE html>
<html>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #1a1a2e; padding: 20px; margin: 0;">
  <div style="max-width: 500px; margin: 0 auto; background-color: #16213e; padding: 40px; border-radius: 12px; border: 1px solid #0f3460;">
    <h1 style="color: #e94560; text-align: center; margin-bottom: 8px; font-size: 28px;">Lost Worlds</h1>
    <p style="color: #a0a0b0; text-align: center; margin-top: 0; margin-bottom: 30px; font-size: 14px;">Combat Book Game</p>

    <p style="color: #e0e0e0; font-size: 18px; text-align: center; line-height: 1.6;">
      Your opponent is ready! Time to fight.
    </p>

    <div style="text-align: center; margin: 30px 0;">
      <a href="${playUrl}" style="display: inline-block; background-color: #3b82f6; color: white; padding: 16px 40px; border-radius: 8px; text-decoration: none; font-weight: bold; font-size: 18px;">
        Enter the Arena
      </a>
    </div>

    <p style="color: #808090; text-align: center; font-size: 13px;">
      Room: <code style="background-color: #0f3460; padding: 3px 8px; border-radius: 4px; color: #e0e0e0;">${roomCode}</code>
    </p>
  </div>
</body>
</html>`;
}

// ============================================
// High-Level Notification Functions
// ============================================

/**
 * Send game invite to the challenged player (Step 1).
 * Currently email-only. WhatsApp uses click-to-send on the client side.
 */
export async function sendInvite(room) {
  const joinUrl = `${FRONTEND_URL}?room=${room.id}&invite=true`;
  const results = { email: null, telegram: null };

  if (room.guestEmail) {
    results.email = await sendEmail(
      room.guestEmail,
      "You've been challenged to a Lost Worlds battle!",
      inviteEmailHtml(joinUrl, room.id)
    );
  }

  return results;
}

/**
 * Notify a player that their opponent is ready (Step 3).
 * Supports email and Telegram (if they've connected to the bot).
 *
 * @param {object} contactInfo - { email?, telegramChatId? }
 * @param {string} playUrl - URL for the player to return to the game
 * @param {string} roomCode - The room code
 */
export async function sendReadyNotification(contactInfo, playUrl, roomCode) {
  const results = { email: null, telegram: null };

  if (contactInfo.email) {
    results.email = await sendEmail(
      contactInfo.email,
      'Your Lost Worlds opponent is ready!',
      readyNotificationEmailHtml(playUrl, roomCode)
    );
  }

  if (contactInfo.telegramChatId) {
    results.telegram = await sendTelegram(
      contactInfo.telegramChatId,
      `<b>Your opponent is ready!</b>\n\n` +
      `<a href="${playUrl}">Enter the Arena</a>\n\n` +
      `Room: <code>${roomCode}</code>`
    );
  }

  return results;
}

// ============================================
// Telegram One-Time Bot Connect
// ============================================

// Map of connect tokens -> { chatId, createdAt }
// Used for the one-time "Connect Telegram" flow.
// Client generates a token, user clicks t.me/BotName?start=TOKEN,
// bot receives /start TOKEN via webhook, stores chatId here,
// client polls to retrieve it.
const connectTokens = new Map();

/**
 * Generate a one-time connect token for Telegram bot linking.
 * Returns the token and the t.me URL for the user to click.
 */
export function createConnectToken() {
  const token = crypto.randomBytes(16).toString('hex');
  connectTokens.set(token, { chatId: null, createdAt: Date.now() });

  const botUsername = process.env.TELEGRAM_BOT_USERNAME || 'LostWorldsCombatBot';
  return {
    token,
    url: `https://t.me/${botUsername}?start=${token}`,
  };
}

/**
 * Check if a connect token has been claimed (user tapped /start in Telegram)
 */
export function getConnectTokenStatus(token) {
  const data = connectTokens.get(token);
  if (!data) return { found: false };
  return {
    found: true,
    connected: !!data.chatId,
    chatId: data.chatId,
  };
}

/**
 * Handle incoming Telegram webhook update.
 * Processes /start TOKEN commands for one-time bot connect.
 */
export function handleTelegramUpdate(update) {
  if (!update.message || !update.message.text) return null;

  const text = update.message.text;
  const chatId = update.message.chat.id;
  const firstName = update.message.from?.first_name || 'Player';

  if (text.startsWith('/start ')) {
    const token = text.split(' ')[1];
    const tokenData = connectTokens.get(token);

    if (tokenData) {
      tokenData.chatId = chatId;
      console.log(`Telegram connected: token=${token}, chatId=${chatId}, name=${firstName}`);

      sendTelegram(chatId,
        `Connected! You'll receive Lost Worlds battle notifications here.\n\n` +
        `You can close this chat and return to the game.`
      );

      return { token, chatId };
    }
  }

  // Generic /start (no token or invalid token) — bot intro
  if (text === '/start') {
    sendTelegram(chatId,
      `<b>Lost Worlds Combat Bot</b>\n\n` +
      `I'll send you notifications when your opponent is ready to battle!\n\n` +
      `To connect, use the "Telegram" option in the game's invite screen.`
    );
  }

  return null;
}

/**
 * Register the Telegram webhook URL with Telegram's API.
 * Called once at server startup.
 */
export async function registerTelegramWebhook(webhookUrl) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    console.warn('No TELEGRAM_BOT_TOKEN, skipping webhook registration');
    return;
  }

  try {
    const response = await fetch(`${TELEGRAM_API}/setWebhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: webhookUrl }),
    });
    const data = await response.json();
    console.log('Telegram webhook registration:', data);

    // Get bot info to confirm username
    const meResponse = await fetch(`${TELEGRAM_API}/getMe`);
    const meData = await meResponse.json();
    if (meData.ok) {
      console.log(`Telegram bot: @${meData.result.username}`);
      process.env.TELEGRAM_BOT_USERNAME = meData.result.username;
    }
  } catch (err) {
    console.error('Failed to register Telegram webhook:', err);
  }
}

// Clean up expired connect tokens periodically (1 hour TTL)
setInterval(() => {
  const now = Date.now();
  for (const [token, data] of connectTokens) {
    if (now - data.createdAt > 60 * 60 * 1000) {
      connectTokens.delete(token);
    }
  }
}, 10 * 60 * 1000);
