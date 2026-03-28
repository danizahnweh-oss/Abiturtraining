// Handler: Nachrichten (Admin → Schüler)
import { jsonResponse } from '../utils.js';
import { verifyToken } from '../auth.js';

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

  await env.DB.prepare(
    "INSERT INTO messages (id, recipient_name_lower, subject, body, read, created_at) VALUES (?, ?, ?, ?, 0, datetime('now'))"
  ).bind(id, nameLower, msgSubject, msgBody).run();

  return jsonResponse({ success: true, id }, 200, env);
}

/* ================= DASHBOARD: ALLE NACHRICHTEN LADEN ================= */
export async function handleListMessages(request, env) {
  const token = request.headers.get("X-Teacher-Token");
  if (!env.TEACHER_PASSWORD) return jsonResponse({ error: "Server nicht konfiguriert." }, 500, env);
  if (!token || !(await verifyToken(token, env, env.TEACHER_PASSWORD))) {
    return jsonResponse({ error: "Nicht autorisiert." }, 401, env);
  }

  const { results } = await env.DB.prepare(
    "SELECT id, recipient_name_lower, subject, body, read, created_at, read_at FROM messages ORDER BY created_at DESC LIMIT 500"
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
  const { student_name } = await request.json();
  if (!student_name || typeof student_name !== "string") {
    return jsonResponse({ error: "Schülername erforderlich." }, 400, env);
  }

  const nameLower = student_name.trim().toLowerCase();
  const rows = (await env.DB.prepare(
    "SELECT id, subject, body, read, created_at, read_at FROM messages WHERE recipient_name_lower = ? ORDER BY created_at DESC LIMIT 50"
  ).bind(nameLower).all()).results || [];

  return jsonResponse({ messages: rows }, 200, env);
}

/* ================= SCHÜLER: NACHRICHT ALS GELESEN MARKIEREN ================= */
export async function handleMarkMessageRead(request, env) {
  const { id, student_name } = await request.json();
  if (!id || !student_name) return jsonResponse({ error: "id und student_name erforderlich." }, 400, env);

  const nameLower = student_name.trim().toLowerCase();
  await env.DB.prepare(
    "UPDATE messages SET read = 1, read_at = datetime('now') WHERE id = ? AND recipient_name_lower = ?"
  ).bind(id, nameLower).run();

  return jsonResponse({ success: true }, 200, env);
}
