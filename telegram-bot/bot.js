require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const { spawn } = require('child_process');
const path = require('path');

// Konfiguration
const BOT_TOKEN = process.env.BOT_TOKEN;
const ALLOWED_USER_ID = parseInt(process.env.ALLOWED_USER_ID, 10);
const PROJECT_DIR = process.env.PROJECT_DIR || path.resolve(__dirname, '..');
const CLAUDE_TIMEOUT = 10 * 60 * 1000; // 10 Minuten
const TELEGRAM_MAX_LENGTH = 4096;

if (!BOT_TOKEN) {
  console.error('❌ BOT_TOKEN fehlt in .env');
  process.exit(1);
}

if (!ALLOWED_USER_ID) {
  console.error('❌ ALLOWED_USER_ID fehlt in .env');
  process.exit(1);
}

// Bot initialisieren (Long-Polling)
const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// Session-ID für Konversations-Kontext
let currentSessionId = null;

console.log(`🤖 Bot gestartet!`);
console.log(`📁 Projektverzeichnis: ${PROJECT_DIR}`);
console.log(`🔒 Erlaubte User-ID: ${ALLOWED_USER_ID}`);

// Sicherheits-Check: Nur erlaubte User-ID
function isAuthorized(msg) {
  return msg.from.id === ALLOWED_USER_ID;
}

function sendUnauthorized(chatId) {
  bot.sendMessage(chatId, '⛔ Zugriff verweigert.');
}

// Lange Nachrichten in Teile aufsplitten
function splitMessage(text) {
  if (text.length <= TELEGRAM_MAX_LENGTH) return [text];

  const parts = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= TELEGRAM_MAX_LENGTH) {
      parts.push(remaining);
      break;
    }

    // Am letzten Zeilenumbruch vor dem Limit trennen
    let splitIndex = remaining.lastIndexOf('\n', TELEGRAM_MAX_LENGTH);
    if (splitIndex === -1 || splitIndex < TELEGRAM_MAX_LENGTH / 2) {
      // Kein guter Umbruch gefunden – am Leerzeichen trennen
      splitIndex = remaining.lastIndexOf(' ', TELEGRAM_MAX_LENGTH);
    }
    if (splitIndex === -1 || splitIndex < TELEGRAM_MAX_LENGTH / 2) {
      // Notfall: hart abschneiden
      splitIndex = TELEGRAM_MAX_LENGTH;
    }

    parts.push(remaining.substring(0, splitIndex));
    remaining = remaining.substring(splitIndex).trimStart();
  }

  return parts;
}

// Claude Code aufrufen
function callClaude(prompt) {
  return new Promise((resolve, reject) => {
    const args = ['-p', prompt, '--output-format', 'json', '--dangerously-skip-permissions'];

    // Session fortsetzen wenn vorhanden
    if (currentSessionId) {
      args.push('--resume', currentSessionId);
    }

    const claude = spawn('claude', args, {
      cwd: PROJECT_DIR,
      env: { ...process.env, PATH: process.env.PATH },
      timeout: CLAUDE_TIMEOUT,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    // stdin sofort schließen damit Claude nicht auf Input wartet
    claude.stdin.end();

    let stdout = '';
    let stderr = '';

    claude.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    claude.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    claude.on('close', (code) => {
      if (code !== 0) {
        const msg = code === 143 ? 'Timeout — Claude hat zu lange gebraucht. Versuch einen kürzeren/einfacheren Prompt.'
          : stderr || 'Unbekannter Fehler';
        reject(new Error(msg));
        return;
      }

      try {
        const result = JSON.parse(stdout);
        // Session-ID speichern für Kontext
        if (result.session_id) {
          currentSessionId = result.session_id;
        }
        resolve(result);
      } catch {
        // Falls JSON-Parsing fehlschlägt, Rohtext zurückgeben
        resolve({ result: stdout.trim() });
      }
    });

    claude.on('error', (err) => {
      reject(new Error(`Claude konnte nicht gestartet werden: ${err.message}`));
    });
  });
}

// Antworttext aus Claude-Ergebnis extrahieren
function extractResponse(result) {
  if (typeof result === 'string') return result;
  if (result.result) return result.result;
  if (result.content) {
    // content kann ein Array von Blöcken sein
    if (Array.isArray(result.content)) {
      return result.content
        .filter((block) => block.type === 'text')
        .map((block) => block.text)
        .join('\n');
    }
    return result.content;
  }
  return JSON.stringify(result, null, 2);
}

// /start Befehl
bot.onText(/\/start/, (msg) => {
  if (!isAuthorized(msg)) return sendUnauthorized(msg.chat.id);

  bot.sendMessage(
    msg.chat.id,
    `🤖 *myAbiFlow Claude Bot*\n\n` +
      `Schick mir eine Nachricht und ich leite sie an Claude Code weiter.\n\n` +
      `*Befehle:*\n` +
      `/new — Neue Session starten\n` +
      `/status — Session-Info anzeigen\n\n` +
      `📁 Projekt: \`${PROJECT_DIR}\``,
    { parse_mode: 'Markdown' }
  );
});

// /new Befehl – Neue Session
bot.onText(/\/new/, (msg) => {
  if (!isAuthorized(msg)) return sendUnauthorized(msg.chat.id);

  currentSessionId = null;
  bot.sendMessage(msg.chat.id, '🔄 Neue Session gestartet. Kontext zurückgesetzt.');
});

// /status Befehl
bot.onText(/\/status/, (msg) => {
  if (!isAuthorized(msg)) return sendUnauthorized(msg.chat.id);

  const status = currentSessionId
    ? `✅ Aktive Session: \`${currentSessionId}\``
    : '⚪ Keine aktive Session';

  bot.sendMessage(msg.chat.id, `${status}\n📁 Projekt: \`${PROJECT_DIR}\``, {
    parse_mode: 'Markdown',
  });
});

// Alle normalen Nachrichten → an Claude weiterleiten
bot.on('message', async (msg) => {
  // Befehle ignorieren (werden oben behandelt)
  if (msg.text && msg.text.startsWith('/')) return;
  if (!msg.text) return;
  if (!isAuthorized(msg)) return sendUnauthorized(msg.chat.id);

  const chatId = msg.chat.id;

  // Typing-Indikator senden
  bot.sendChatAction(chatId, 'typing');

  // Typing alle 4 Sekunden erneuern (Telegram bricht nach 5s ab)
  const typingInterval = setInterval(() => {
    bot.sendChatAction(chatId, 'typing');
  }, 4000);

  try {
    const result = await callClaude(msg.text);
    clearInterval(typingInterval);

    const responseText = extractResponse(result);

    if (!responseText || responseText.trim() === '') {
      await bot.sendMessage(chatId, '⚠️ Claude hat eine leere Antwort zurückgegeben.');
      return;
    }

    // Nachricht aufteilen falls nötig
    const parts = splitMessage(responseText);
    for (const part of parts) {
      await bot.sendMessage(chatId, part);
    }
  } catch (error) {
    clearInterval(typingInterval);
    console.error('Fehler:', error.message);
    await bot.sendMessage(chatId, `❌ Fehler: ${error.message}`);
  }
});

// Fehlerbehandlung
bot.on('polling_error', (error) => {
  console.error('Polling-Fehler:', error.message);
});

process.on('SIGINT', () => {
  console.log('\n👋 Bot wird beendet...');
  bot.stopPolling();
  process.exit(0);
});
