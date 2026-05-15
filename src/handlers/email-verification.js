// Handler: Email-Verifizierung (Double-Opt-In für neue Accounts)
import { jsonResponse } from '../utils.js';

const VERIFY_RATE_LIMIT_WINDOW = 15 * 60 * 1000;
const VERIFY_RATE_LIMIT_MAX = 5;
const verifyRateLimitMap = new Map();

async function sha256Hex(value) {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, "0")).join("");
}

// HTML-Sonderzeichen escapen — verhindert Markup-Injection in der Bestätigungs-Mail.
function escapeHtml(str) {
  if (str == null) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Eigener HMAC-Schlüssel für Verify-Token (Fallback auf ACCESS_PASSWORD, falls Server-Env noch nicht aktualisiert).
function getVerifySecret(env) {
  return env.EMAIL_VERIFY_SECRET || env.ACCESS_PASSWORD;
}

function checkVerifyRateLimit(request, env) {
  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  const now = Date.now();
  const entry = verifyRateLimitMap.get(ip);
  if (!entry || now - entry.windowStart > VERIFY_RATE_LIMIT_WINDOW) {
    verifyRateLimitMap.set(ip, { count: 1, windowStart: now });
    return null;
  }
  entry.count++;
  if (entry.count > VERIFY_RATE_LIMIT_MAX) {
    return jsonResponse({ error: "Zu viele Anfragen. Bitte warte 15 Minuten." }, 429, env);
  }
  if (verifyRateLimitMap.size > 1000) {
    for (const [key, value] of verifyRateLimitMap) {
      if (now - value.windowStart > VERIFY_RATE_LIMIT_WINDOW * 2) {
        verifyRateLimitMap.delete(key);
      }
    }
  }
  return null;
}

/* ================= Token generieren / verifizieren ================= */
async function generateVerifyToken(nameLower, env) {
  const ts = Date.now();
  const payload = `verify:${nameLower}:${ts}`;
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(getVerifySecret(env)),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  const hmac = [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, "0")).join("");
  return btoa(`${nameLower}:${ts}:${hmac}`);
}

async function verifyToken(token, env) {
  try {
    const decoded = atob(token);
    const parts = decoded.split(":");
    if (parts.length < 3) return null;
    const hmac = parts.pop();
    const ts = parseInt(parts.pop(), 10);
    const nameLower = parts.join(":");

    // Token max 24 Stunden gültig
    if (Date.now() - ts > 24 * 60 * 60 * 1000) return null;

    const key = await crypto.subtle.importKey(
      "raw", new TextEncoder().encode(getVerifySecret(env)),
      { name: "HMAC", hash: "SHA-256" }, false, ["verify"]
    );
    const payload = `verify:${nameLower}:${ts}`;
    const sigBytes = new Uint8Array(hmac.match(/.{2}/g).map(b => parseInt(b, 16)));
    const valid = await crypto.subtle.verify("HMAC", key, sigBytes, new TextEncoder().encode(payload));
    if (!valid) return null;

    return { nameLower, ts };
  } catch {
    return null;
  }
}

/* ================= Bestätigungs-Mail bauen + senden ================= */
function buildVerifyEmail(studentName, verifyUrl) {
  const safeName = escapeHtml(studentName);
  const safeUrl = escapeHtml(verifyUrl);
  return `<!DOCTYPE html><html lang="de"><head><meta charset="utf-8"></head><body style="font-family:system-ui,sans-serif;background:#f0f0f5;padding:20px;margin:0">
<div style="max-width:500px;margin:0 auto;background:#fff;border-radius:12px;padding:24px;box-shadow:0 2px 12px rgba(0,0,0,.1)">
<a href="https://myabiflow.de" style="display:block;text-align:center;margin-bottom:20px;text-decoration:none"><img src="https://myabiflow.de/logo-v2.png" alt="myAbiFlow" width="140" style="width:140px;height:auto" /></a>
<h2 style="color:#2563eb;margin-top:0">Willkommen bei myAbiFlow!</h2>
<p>Hallo ${safeName},</p>
<p>schön, dass du dabei bist! Bitte bestätige deine E-Mail-Adresse, damit dein Account aktiviert wird:</p>
<p style="text-align:center;margin:24px 0">
<a href="${safeUrl}" style="background:#2563eb;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block">E-Mail bestätigen</a>
</p>
<p style="font-size:13px;color:#666">Dieser Link ist <strong>24 Stunden</strong> gültig. Falls du dich nicht bei myAbiFlow registriert hast, kannst du diese E-Mail einfach ignorieren.</p>
<p style="font-size:12px;color:#999;margin-top:24px;border-top:1px solid #eee;padding-top:12px">Diese E-Mail wurde automatisch von myAbiFlow gesendet.</p>
</div></body></html>`;
}

// Sendet die Verifizierungs-Mail UND legt Token-Hash in DB ab.
// Wird aus dem Register-Handler (student.js) UND aus dem Resend-Endpunkt aufgerufen.
export async function sendVerificationEmail(env, nameLower, studentName, email) {
  if (!env.RESEND_API_KEY) {
    console.error("RESEND_API_KEY nicht gesetzt – Verifizierungs-Mail wird nicht gesendet");
    return false;
  }

  const token = await generateVerifyToken(nameLower, env);
  const tokenHash = await sha256Hex(token);

  // Alte unbenutzte Tokens für diesen User invalidieren
  await env.DB.prepare(
    "UPDATE email_verification_tokens SET used_at = ? WHERE name_lower = ? AND used_at IS NULL"
  ).bind(new Date().toISOString(), nameLower).run();

  await env.DB.prepare(
    "INSERT INTO email_verification_tokens (id, name_lower, token_hash, created_at) VALUES (?, ?, ?, ?)"
  ).bind(crypto.randomUUID(), nameLower, tokenHash, new Date().toISOString()).run();

  const verifyUrl = `https://myabiflow.de/verify-email.html?token=${encodeURIComponent(token)}`;
  const html = buildVerifyEmail(studentName, verifyUrl);

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from: "myAbiFlow <noreply@myabiflow.de>",
        to: [email],
        subject: "myAbiFlow – Bitte bestätige deine E-Mail",
        html
      })
    });
    if (!res.ok) {
      const errBody = await res.text();
      console.error(`Resend-Fehler bei Email-Verifizierung (${res.status}):`, errBody);
      return false;
    }
    return true;
  } catch (err) {
    console.error("Verifizierungs-Mail Fehler:", err.message);
    return false;
  }
}

/* ================= Endpunkt: Token einlösen ================= */
export async function handleVerifyEmail(request, env) {
  const rateLimitError = checkVerifyRateLimit(request, env);
  if (rateLimitError) return rateLimitError;

  const { token } = await request.json();
  if (!token || typeof token !== "string") {
    return jsonResponse({ success: false, error: "Ungültiger Bestätigungslink." }, 400, env);
  }

  const data = await verifyToken(token, env);
  if (!data) {
    return jsonResponse({ success: false, error: "Der Bestätigungslink ist ungültig oder abgelaufen. Bitte fordere einen neuen an." }, 400, env);
  }

  const tokenHash = await sha256Hex(token);
  const stored = await env.DB.prepare(
    "SELECT token_hash FROM email_verification_tokens WHERE token_hash = ? AND name_lower = ? AND used_at IS NULL"
  ).bind(tokenHash, data.nameLower).first();
  if (!stored) {
    // Idempotenter Sonderfall: Account ist bereits verifiziert → Erfolg statt Fehler
    const student = await env.DB.prepare(
      "SELECT email_verified FROM students WHERE name_lower = ?"
    ).bind(data.nameLower).first();
    if (student?.email_verified === 1) {
      return jsonResponse({ success: true, alreadyVerified: true }, 200, env);
    }
    return jsonResponse({ success: false, error: "Bestätigungslink bereits verwendet oder ungültig." }, 400, env);
  }

  const usedAt = new Date().toISOString();
  const updateResult = await env.DB.prepare(
    "UPDATE email_verification_tokens SET used_at = ? WHERE token_hash = ? AND used_at IS NULL"
  ).bind(usedAt, tokenHash).run();
  if (!updateResult.meta?.changes) {
    return jsonResponse({ success: false, error: "Bestätigungslink bereits verwendet." }, 400, env);
  }

  await env.DB.prepare(
    "UPDATE students SET email_verified = 1 WHERE name_lower = ?"
  ).bind(data.nameLower).run();

  return jsonResponse({ success: true }, 200, env);
}

/* ================= Endpunkt: Neue Bestätigungs-Mail anfordern ================= */
export async function handleResendVerification(request, env) {
  const rateLimitError = checkVerifyRateLimit(request, env);
  if (rateLimitError) return rateLimitError;

  const { student_name, personal_password } = await request.json();
  if (!student_name || typeof student_name !== "string" || !student_name.trim()) {
    return jsonResponse({ success: false, error: "Name erforderlich." }, 400, env);
  }
  if (!personal_password || typeof personal_password !== "string") {
    return jsonResponse({ success: false, error: "Passwort erforderlich." }, 400, env);
  }

  const nameLower = student_name.trim().toLowerCase();
  const student = await env.DB.prepare(
    "SELECT name, name_lower, email, email_verified, salt, hash FROM students WHERE name_lower = ?"
  ).bind(nameLower).first();

  // Generische Erfolgsantwort, unabhängig davon ob Account existiert / Passwort stimmt /
  // E-Mail hinterlegt ist. Verhindert Account-Enumeration über differenzierte Fehlerpfade.
  const genericSuccess = () => jsonResponse({ success: true }, 200, env);

  if (!student) return genericSuccess();
  if (!student.salt || !student.hash) return genericSuccess();

  const { verifyPassword } = await import('../auth.js');
  const match = await verifyPassword(personal_password, student.salt, student.hash);
  if (!match) return genericSuccess();

  // Ab hier: User existiert und Passwort stimmt → UI darf "bereits bestätigt" sehen,
  // weil ein Angreifer mit korrektem Passwort sich ohnehin einloggen könnte.
  if (student.email_verified === 1) {
    return jsonResponse({ success: true, alreadyVerified: true }, 200, env);
  }
  if (!student.email || !student.email.trim()) return genericSuccess();

  await sendVerificationEmail(env, student.name_lower, student.name, student.email);
  return genericSuccess();
}
