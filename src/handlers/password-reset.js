// Handler: Passwort-Reset (Passwort vergessen)
import { jsonResponse } from '../utils.js';
import { hashPassword } from '../auth.js';

/* ================= RESET-TOKEN GENERIEREN (HMAC-basiert) ================= */
async function generateResetToken(nameLower, env) {
  const ts = Date.now();
  const payload = `reset:${nameLower}:${ts}`;
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(env.ACCESS_PASSWORD),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  const hmac = [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, "0")).join("");
  return btoa(`${nameLower}:${ts}:${hmac}`);
}

async function verifyResetToken(token, env) {
  try {
    const decoded = atob(token);
    const parts = decoded.split(":");
    if (parts.length < 3) return null;
    const hmac = parts.pop();
    const ts = parseInt(parts.pop(), 10);
    const nameLower = parts.join(":");

    // Token max 1 Stunde gültig
    if (Date.now() - ts > 60 * 60 * 1000) return null;

    const key = await crypto.subtle.importKey(
      "raw", new TextEncoder().encode(env.ACCESS_PASSWORD),
      { name: "HMAC", hash: "SHA-256" }, false, ["verify"]
    );
    const payload = `reset:${nameLower}:${ts}`;
    const sigBytes = new Uint8Array(hmac.match(/.{2}/g).map(b => parseInt(b, 16)));
    const valid = await crypto.subtle.verify("HMAC", key, sigBytes, new TextEncoder().encode(payload));
    if (!valid) return null;

    return { nameLower, ts };
  } catch {
    return null;
  }
}

/* ================= PASSWORT VERGESSEN (E-Mail senden) ================= */
export async function handleForgotPassword(request, env) {
  const { email } = await request.json();

  if (!email || typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return jsonResponse({ error: "Bitte gib eine gültige E-Mail-Adresse ein." }, 400, env);
  }

  const emailLower = email.trim().toLowerCase();

  // Schüler mit dieser E-Mail suchen
  const student = await env.DB.prepare(
    "SELECT name, name_lower FROM students WHERE LOWER(email) = ?"
  ).bind(emailLower).first();

  // Immer Erfolg melden (verhindert E-Mail-Enumeration)
  if (!student) {
    return jsonResponse({ success: true }, 200, env);
  }

  if (!env.RESEND_API_KEY) {
    console.error("RESEND_API_KEY nicht gesetzt – Passwort-Reset-E-Mail kann nicht gesendet werden");
    return jsonResponse({ success: true }, 200, env);
  }

  // Reset-Token generieren
  const token = await generateResetToken(student.name_lower, env);
  const resetUrl = `https://myabiflow.de/reset-password.html?token=${encodeURIComponent(token)}`;

  const html = `<!DOCTYPE html><html lang="de"><head><meta charset="utf-8"></head><body style="font-family:system-ui,sans-serif;background:#f0f0f5;padding:20px;margin:0">
<div style="max-width:500px;margin:0 auto;background:#fff;border-radius:12px;padding:24px;box-shadow:0 2px 12px rgba(0,0,0,.1)">
<h2 style="color:#2563eb;margin-top:0">myAbiFlow – Passwort zurücksetzen</h2>
<p>Hallo ${student.name},</p>
<p>du hast angefordert, dein Passwort zurückzusetzen. Klicke auf den Button, um ein neues Passwort zu wählen:</p>
<p style="text-align:center;margin:24px 0">
<a href="${resetUrl}" style="background:#2563eb;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block">Neues Passwort wählen</a>
</p>
<p style="font-size:13px;color:#666">Dieser Link ist <strong>1 Stunde</strong> gültig. Falls du kein neues Passwort angefordert hast, kannst du diese E-Mail ignorieren.</p>
<p style="font-size:12px;color:#999;margin-top:24px;border-top:1px solid #eee;padding-top:12px">
Diese E-Mail wurde automatisch von myAbiFlow gesendet.
</p>
</div></body></html>`;

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from: "myAbiFlow <noreply@myabiflow.de>",
        to: [emailLower],
        subject: "myAbiFlow – Passwort zurücksetzen",
        html
      })
    });

    if (!res.ok) {
      const errBody = await res.text();
      console.error(`Resend-Fehler bei Passwort-Reset (${res.status}):`, errBody);
    }
  } catch (err) {
    console.error("Passwort-Reset-E-Mail Fehler:", err.message);
  }

  return jsonResponse({ success: true }, 200, env);
}

/* ================= PASSWORT ZURÜCKSETZEN (mit Token) ================= */
export async function handleResetPassword(request, env) {
  const { token, new_password } = await request.json();

  if (!token || typeof token !== "string") {
    return jsonResponse({ error: "Ungültiger Reset-Link." }, 400, env);
  }
  if (!new_password || typeof new_password !== "string" || new_password.length < 6) {
    return jsonResponse({ error: "Neues Passwort muss mindestens 6 Zeichen haben." }, 400, env);
  }

  const data = await verifyResetToken(token, env);
  if (!data) {
    return jsonResponse({ error: "Der Link ist ungültig oder abgelaufen. Bitte fordere einen neuen an." }, 400, env);
  }

  const student = await env.DB.prepare(
    "SELECT id FROM students WHERE name_lower = ?"
  ).bind(data.nameLower).first();

  if (!student) {
    return jsonResponse({ error: "Konto nicht gefunden." }, 404, env);
  }

  // Neues Passwort setzen
  const newSalt = crypto.randomUUID();
  const newHash = await hashPassword(new_password, newSalt);
  await env.DB.prepare(
    "UPDATE students SET salt = ?, hash = ? WHERE id = ?"
  ).bind(newSalt, newHash, student.id).run();

  return jsonResponse({ success: true }, 200, env);
}

/* ================= RESET-TOKEN VERIFIZIEREN (für Frontend-Check) ================= */
export async function handleVerifyResetToken(request, env) {
  const { token } = await request.json();

  if (!token) {
    return jsonResponse({ valid: false }, 200, env);
  }

  const data = await verifyResetToken(token, env);
  return jsonResponse({ valid: !!data }, 200, env);
}
