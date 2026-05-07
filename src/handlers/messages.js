// Handler: Nachrichten (Admin → Schüler)
import { jsonResponse } from '../utils.js';
import { verifyToken, resolveStudentIdentity } from '../auth.js';

/* ================= EMAIL-BENACHRICHTIGUNG ================= */
async function notifyByEmail(nameLower, msgSubject, env) {
  if (!env.RESEND_API_KEY) return;
  try {
    const student = await env.DB.prepare(
      "SELECT name, email FROM students WHERE name_lower = ? AND email IS NOT NULL AND email != ''"
    ).bind(nameLower).first();
    if (!student || !student.email) return;

    const html = `<!DOCTYPE html><html lang="de"><head><meta charset="utf-8"></head><body style="font-family:system-ui,sans-serif;background:#f0f0f5;padding:20px;margin:0">
<div style="max-width:500px;margin:0 auto;background:#fff;border-radius:12px;padding:24px;box-shadow:0 2px 12px rgba(0,0,0,.1)">
<h2 style="color:#2563eb;margin-top:0">myAbiFlow – Neue Nachricht</h2>
<p>Hallo ${student.name},</p>
<p>du hast eine neue Nachricht erhalten: <strong>${msgSubject}</strong></p>
<p style="text-align:center;margin:24px 0">
<a href="https://myabiflow.de" style="background:#2563eb;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block">Nachricht lesen →</a>
</p>
<p style="font-size:12px;color:#999;margin-top:24px;border-top:1px solid #eee;padding-top:12px">
Diese Nachricht wurde über myAbiFlow gesendet.
</p>
</div></body></html>`;

    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": "Bearer " + env.RESEND_API_KEY,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from: "myAbiFlow <noreply@myabiflow.de>",
        to: [student.email],
        subject: "Du hast eine Nachricht von myAbiFlow",
        html
      })
    });
  } catch (e) {
    console.error("Nachricht-Email Fehler:", e.message);
  }
}

/* ================= DASHBOARD: NACHRICHT SENDEN ================= */
export async function handleSendMessage(request, env) {
  const token = request.headers.get("X-Teacher-Token");
  if (!env.TEACHER_PASSWORD) return jsonResponse({ error: "Server nicht konfiguriert." }, 500, env);
  if (!token || !(await verifyToken(token, env, env.TEACHER_PASSWORD))) {
    return jsonResponse({ error: "Nicht autorisiert." }, 401, env);
  }

  const { student_name, subject, body } = await request.json();
  if (!student_name || typeof student_name !== "string") {
    return jsonResponse({ error: "Schülername erforderlich." }, 400, env);
  }
  if (!body || typeof body !== "string" || body.trim().length === 0) {
    return jsonResponse({ error: "Nachricht darf nicht leer sein." }, 400, env);
  }

  const nameLower = student_name.trim().toLowerCase();
  const msgSubject = (subject && typeof subject === "string") ? subject.trim().slice(0, 200) : "Nachricht";
  const msgBody = body.trim().slice(0, 5000);
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  await env.DB.prepare(
    "INSERT INTO messages (id, recipient_name_lower, subject, body, is_read, created_at) VALUES (?, ?, ?, ?, 0, ?)"
  ).bind(id, nameLower, msgSubject, msgBody, now).run();

  // Email-Benachrichtigung (async, blockiert nicht die Response)
  notifyByEmail(nameLower, msgSubject, env);

  return jsonResponse({ success: true, id }, 200, env);
}

/* ================= DASHBOARD: GRUPPENNACHRICHT SENDEN ================= */
export async function handleSendGroupMessage(request, env) {
  const token = request.headers.get("X-Teacher-Token");
  if (!env.TEACHER_PASSWORD) return jsonResponse({ error: "Server nicht konfiguriert." }, 500, env);
  if (!token || !(await verifyToken(token, env, env.TEACHER_PASSWORD))) {
    return jsonResponse({ error: "Nicht autorisiert." }, 401, env);
  }

  const { class_group, subject, body } = await request.json();
  if (!class_group || typeof class_group !== "string") {
    return jsonResponse({ error: "Schulcode (class_group) erforderlich." }, 400, env);
  }
  if (!body || typeof body !== "string" || body.trim().length === 0) {
    return jsonResponse({ error: "Nachricht darf nicht leer sein." }, 400, env);
  }

  const msgSubject = (subject && typeof subject === "string") ? subject.trim().slice(0, 200) : "Nachricht";
  const msgBody = body.trim().slice(0, 5000);
  const now = new Date().toISOString();

  // Alle Schüler mit diesem Schulcode finden
  const { results: students } = await env.DB.prepare(
    "SELECT name_lower FROM students WHERE class_group = ?"
  ).bind(class_group.trim()).all();

  if (!students || students.length === 0) {
    return jsonResponse({ error: "Keine Schüler mit diesem Schulcode gefunden." }, 404, env);
  }

  let sent = 0;
  for (const s of students) {
    const id = crypto.randomUUID();
    await env.DB.prepare(
      "INSERT INTO messages (id, recipient_name_lower, subject, body, is_read, created_at) VALUES (?, ?, ?, ?, 0, ?)"
    ).bind(id, s.name_lower, msgSubject, msgBody, now).run();
    // Email-Benachrichtigung (async)
    notifyByEmail(s.name_lower, msgSubject, env);
    sent++;
  }

  return jsonResponse({ success: true, sent }, 200, env);
}

/* ================= DASHBOARD: ALLE NACHRICHTEN LADEN ================= */
export async function handleListMessages(request, env) {
  const token = request.headers.get("X-Teacher-Token");
  if (!env.TEACHER_PASSWORD) return jsonResponse({ error: "Server nicht konfiguriert." }, 500, env);
  if (!token || !(await verifyToken(token, env, env.TEACHER_PASSWORD))) {
    return jsonResponse({ error: "Nicht autorisiert." }, 401, env);
  }

  const { results } = await env.DB.prepare(
    "SELECT id, recipient_name_lower, subject, body, is_read, created_at, read_at, reply, reply_at FROM messages ORDER BY created_at DESC LIMIT 500"
  ).all();

  return jsonResponse({ messages: results || [] }, 200, env);
}

/* ================= DASHBOARD: NACHRICHT LÖSCHEN ================= */
export async function handleDeleteMessage(request, env) {
  const token = request.headers.get("X-Teacher-Token");
  if (!env.TEACHER_PASSWORD) return jsonResponse({ error: "Server nicht konfiguriert." }, 500, env);
  if (!token || !(await verifyToken(token, env, env.TEACHER_PASSWORD))) {
    return jsonResponse({ error: "Nicht autorisiert." }, 401, env);
  }

  const { id } = await request.json();
  if (!id) return jsonResponse({ error: "id erforderlich." }, 400, env);

  await env.DB.prepare("DELETE FROM messages WHERE id = ?").bind(id).run();
  return jsonResponse({ success: true }, 200, env);
}

/* ================= SCHÜLER: EIGENE NACHRICHTEN LADEN ================= */
export async function handleStudentMessages(request, env) {
  const body = await request.json().catch(() => ({}));
  const ident = await resolveStudentIdentity(request, env, body.student_name?.trim()?.toLowerCase());
  if (!ident) return jsonResponse({ error: "Bitte erneut anmelden." }, 401, env);
  const nameLower = ident.nameLower;

  const rows = (await env.DB.prepare(
    "SELECT id, subject, body, is_read, created_at, read_at, reply, reply_at FROM messages WHERE recipient_name_lower = ? ORDER BY created_at DESC LIMIT 50"
  ).bind(nameLower).all()).results || [];

  return jsonResponse({ messages: rows }, 200, env);
}

/* ================= SCHÜLER: NACHRICHT ALS GELESEN MARKIEREN ================= */
export async function handleMarkMessageRead(request, env) {
  const body = await request.json().catch(() => ({}));
  const { id } = body;
  if (!id) return jsonResponse({ error: "id erforderlich." }, 400, env);

  // Schreiboperation: nur Schüler selbst, kein Lehrer-Bypass
  const ident = await resolveStudentIdentity(request, env);
  if (!ident || ident.isTeacher) return jsonResponse({ error: "Bitte erneut anmelden." }, 401, env);
  const nameLower = ident.nameLower;

  const now = new Date().toISOString();
  await env.DB.prepare(
    "UPDATE messages SET is_read = 1, read_at = ? WHERE id = ? AND recipient_name_lower = ?"
  ).bind(now, id, nameLower).run();

  return jsonResponse({ success: true }, 200, env);
}

/* ================= SCHÜLER: AUF NACHRICHT ANTWORTEN ================= */
export async function handleReplyMessage(request, env) {
  const body = await request.json().catch(() => ({}));
  const { id, reply } = body;
  if (!id) return jsonResponse({ error: "id erforderlich." }, 400, env);
  if (!reply || typeof reply !== "string" || reply.trim().length === 0) {
    return jsonResponse({ error: "Antwort darf nicht leer sein." }, 400, env);
  }

  // Schreiboperation: nur Schüler selbst, kein Lehrer-Bypass
  const ident = await resolveStudentIdentity(request, env);
  if (!ident || ident.isTeacher) return jsonResponse({ error: "Bitte erneut anmelden." }, 401, env);
  const nameLower = ident.nameLower;

  const replyText = reply.trim().slice(0, 5000);
  const now = new Date().toISOString();

  // Nur eigene Nachrichten beantworten
  const msg = await env.DB.prepare(
    "SELECT id FROM messages WHERE id = ? AND recipient_name_lower = ?"
  ).bind(id, nameLower).first();
  if (!msg) return jsonResponse({ error: "Nachricht nicht gefunden." }, 404, env);

  await env.DB.prepare(
    "UPDATE messages SET reply = ?, reply_at = ?, is_read = 1, read_at = COALESCE(read_at, ?) WHERE id = ? AND recipient_name_lower = ?"
  ).bind(replyText, now, now, id, nameLower).run();

  return jsonResponse({ success: true }, 200, env);
}
