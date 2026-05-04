// Handler: Teacher Auth (Register, Login, Codes, Links, Results)
import { jsonResponse } from '../utils.js';
import { safeCompare, hashPassword, verifyPassword, generateTeacherToken, verifyTeacherAuthToken, generateClassCode } from '../auth.js';

export async function handleTeacherRegister(request, env) {
  const { name, password, email, subjects } = await request.json();
  if (!env.TEACHER_AUTH_SECRET) {
    return jsonResponse({ error: "Server nicht konfiguriert." }, 500, env);
  }
  if (!name || typeof name !== "string" || !name.trim()) {
    return jsonResponse({ error: "Name erforderlich." }, 400, env);
  }
  if (!email || typeof email !== "string" || !email.includes("@")) {
    return jsonResponse({ error: "Gültige E-Mail-Adresse erforderlich." }, 400, env);
  }
  if (!password || typeof password !== "string" || password.length < 8) {
    return jsonResponse({ error: "Passwort muss mindestens 8 Zeichen haben." }, 400, env);
  }
  const nameLower = name.trim().toLowerCase();
  const existing = await env.DB.prepare("SELECT id FROM teachers WHERE name_lower = ?").bind(nameLower).first();
  if (existing) {
    return jsonResponse({ error: "Dieser Name ist bereits vergeben." }, 409, env);
  }
  const id = Date.now().toString(36) + crypto.randomUUID().slice(0, 8);
  const salt = crypto.randomUUID();
  const hash = await hashPassword(password, salt);
  const subjectsJson = Array.isArray(subjects) ? JSON.stringify(subjects) : "[]";
  await env.DB.prepare(
    "INSERT INTO teachers (id, name, name_lower, email, salt, hash, subjects, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?)"
  ).bind(id, name.trim(), nameLower, email, salt, hash, subjectsJson, new Date().toISOString()).run();

  // Telegram-Benachrichtigung an Admin
  sendTeacherApprovalNotification(env, id, name.trim(), email, JSON.parse(subjectsJson));

  return jsonResponse({ success: true, pending: true, message: "Registrierung erfolgreich! Dein Konto wird in Kürze freigeschaltet." }, 200, env);
}

// Telegram-Benachrichtigung bei neuer Lehrer-Registrierung
async function sendTeacherApprovalNotification(env, teacherId, name, email, subjects) {
  try {
    const botToken = env.TELEGRAM_BOT_TOKEN;
    const chatId = env.TELEGRAM_CHAT_ID;
    if (!botToken || !chatId) return;

    const allowedOrigin = env.ALLOWED_ORIGIN || 'https://myabiflow.de';
    const approveUrl = `${allowedOrigin}/api/teacher-approve?id=${teacherId}&secret=${env.TEACHER_AUTH_SECRET}`;
    const subjectList = subjects.length ? subjects.join(', ') : 'keine';

    const text = `📋 *Neue Lehrer-Registrierung*\n\n` +
      `👤 *Name:* ${name}\n` +
      `📧 *E-Mail:* ${email}\n` +
      `📚 *Fächer:* ${subjectList}\n\n` +
      `[✅ Freischalten](${approveUrl})`;

    await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown' }),
    });
  } catch (e) {
    console.error('Telegram-Benachrichtigung fehlgeschlagen:', e.message);
  }
}

// Lehrer-Konto freischalten (GET — klickbar aus Telegram)
export async function handleTeacherApprove(request, env) {
  const url = new URL(request.url);
  const teacherId = url.searchParams.get('id');
  const secret = url.searchParams.get('secret');

  if (!secret || secret !== env.TEACHER_AUTH_SECRET) {
    return new Response('Nicht autorisiert.', { status: 403 });
  }
  if (!teacherId) {
    return new Response('Keine Teacher-ID.', { status: 400 });
  }

  const teacher = await env.DB.prepare("SELECT name, email FROM teachers WHERE id = ?").bind(teacherId).first();
  if (!teacher) {
    return new Response('Lehrkraft nicht gefunden.', { status: 404 });
  }

  await env.DB.prepare("UPDATE teachers SET status = 'approved' WHERE id = ?").bind(teacherId).run();

  // Bestätigungs-E-Mail an Lehrkraft
  sendTeacherApprovedEmail(env, teacher.name, teacher.email);

  return new Response(
    `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Freischaltung</title></head><body style="font-family:system-ui;padding:2rem;text-align:center;">` +
    `<h2>✅ Freigeschaltet!</h2><p><strong>${teacher.name}</strong> (${teacher.email}) kann sich jetzt anmelden.</p></body></html>`,
    { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
  );
}

// Lehrer-Login
export async function handleTeacherAuthLogin(request, env) {
  const { name, password } = await request.json();
  if (!env.TEACHER_AUTH_SECRET) {
    return jsonResponse({ error: "Server nicht konfiguriert." }, 500, env);
  }
  if (!name || typeof name !== "string" || !name.trim()) {
    return jsonResponse({ error: "Name oder E-Mail erforderlich." }, 400, env);
  }
  if (!password || typeof password !== "string") {
    return jsonResponse({ error: "Passwort erforderlich." }, 400, env);
  }
  const identifier = name.trim().toLowerCase();
  // Login per Name ODER E-Mail erlauben
  const teacher = await env.DB.prepare(
    "SELECT id, name, salt, hash, subjects, status FROM teachers WHERE name_lower = ? OR LOWER(email) = ?"
  ).bind(identifier, identifier).first();
  if (!teacher) {
    return jsonResponse({ error: "Konto nicht gefunden. Bitte zuerst registrieren." }, 404, env);
  }
  if (teacher.status === 'pending') {
    return jsonResponse({ error: "Dein Konto wird noch geprüft. Du wirst benachrichtigt, sobald es freigeschaltet ist.", pending: true }, 403, env);
  }
  const match = await verifyPassword(password, teacher.salt, teacher.hash);
  if (!match) {
    return jsonResponse({ error: "Falsches Passwort." }, 401, env);
  }
  const token = await generateTeacherToken(env, teacher.id);
  return jsonResponse({ success: true, token, teacher_id: teacher.id, teacher_name: teacher.name, subjects: JSON.parse(teacher.subjects || "[]") }, 200, env);
}

// Lehrer-Codes verwalten
export async function handleTeacherCodes(request, env) {
  const token = request.headers.get("X-Teacher-Auth-Token");
  const teacherId = await verifyTeacherAuthToken(token, env);
  if (!teacherId) {
    return jsonResponse({ error: "Nicht autorisiert. Bitte erneut einloggen." }, 401, env);
  }
  const { action, code_id, label } = await request.json();

  if (action === "list") {
    const { results: codes } = await env.DB.prepare(
      "SELECT id, code, label, active, created_at FROM teacher_codes WHERE teacher_id = ? ORDER BY created_at DESC"
    ).bind(teacherId).all();
    // Schueler-Anzahl pro Code zaehlen
    const codesWithCount = [];
    for (const c of (codes || [])) {
      const count = await env.DB.prepare(
        "SELECT COUNT(DISTINCT student_name_lower) as cnt FROM student_teacher_links WHERE code = ?"
      ).bind(c.code).first();
      codesWithCount.push({ ...c, student_count: count?.cnt || 0 });
    }
    return jsonResponse({ success: true, codes: codesWithCount }, 200, env);
  }

  if (action === "create") {
    if (!label || typeof label !== "string" || !label.trim()) {
      return jsonResponse({ error: "Bezeichnung erforderlich." }, 400, env);
    }
    // Einzigartigen Code generieren
    let code = null;
    for (let i = 0; i < 5; i++) {
      const candidate = generateClassCode();
      const exists = await env.DB.prepare("SELECT 1 FROM teacher_codes WHERE code = ?").bind(candidate).first();
      if (!exists) { code = candidate; break; }
    }
    if (!code) {
      return jsonResponse({ error: "Code-Generierung fehlgeschlagen. Bitte erneut versuchen." }, 500, env);
    }
    const id = Date.now().toString(36) + crypto.randomUUID().slice(0, 8);
    await env.DB.prepare(
      "INSERT INTO teacher_codes (id, teacher_id, code, label, created_at) VALUES (?, ?, ?, ?, ?)"
    ).bind(id, teacherId, code, label.trim(), new Date().toISOString()).run();
    return jsonResponse({ success: true, code, id, label: label.trim() }, 200, env);
  }

  if (action === "toggle") {
    if (!code_id) return jsonResponse({ error: "code_id erforderlich." }, 400, env);
    await env.DB.prepare(
      "UPDATE teacher_codes SET active = CASE WHEN active = 1 THEN 0 ELSE 1 END WHERE id = ? AND teacher_id = ?"
    ).bind(code_id, teacherId).run();
    return jsonResponse({ success: true }, 200, env);
  }

  if (action === "delete") {
    if (!code_id) return jsonResponse({ error: "code_id erforderlich." }, 400, env);
    // Erst den Code-Text holen fuer Cascade-Loesch der Links
    const codeRow = await env.DB.prepare("SELECT code FROM teacher_codes WHERE id = ? AND teacher_id = ?").bind(code_id, teacherId).first();
    if (codeRow) {
      await env.DB.prepare("DELETE FROM student_teacher_links WHERE code = ?").bind(codeRow.code).run();
    }
    await env.DB.prepare("DELETE FROM teacher_codes WHERE id = ? AND teacher_id = ?").bind(code_id, teacherId).run();
    return jsonResponse({ success: true }, 200, env);
  }

  return jsonResponse({ error: "Unbekannte Aktion." }, 400, env);
}

// Schueler verlinkt sich mit Lehrer-Code (fachspezifisch)
export async function handleLinkStudentCode(request, env) {
  const { student_name, code, subject } = await request.json();
  if (!student_name || typeof student_name !== "string") {
    return jsonResponse({ error: "student_name erforderlich." }, 400, env);
  }
  if (!code || typeof code !== "string") {
    return jsonResponse({ error: "Code erforderlich." }, 400, env);
  }
  if (!subject || typeof subject !== "string") {
    return jsonResponse({ error: "Fach erforderlich." }, 400, env);
  }
  const codeUpper = code.toUpperCase().trim();
  const codeRow = await env.DB.prepare(
    "SELECT tc.teacher_id, tc.label, t.name AS teacher_name FROM teacher_codes tc JOIN teachers t ON t.id = tc.teacher_id WHERE tc.code = ? AND tc.active = 1"
  ).bind(codeUpper).first();
  if (!codeRow) {
    return jsonResponse({ error: "Ungueltiger oder deaktivierter Code." }, 404, env);
  }
  const nameLower = student_name.trim().toLowerCase();
  await env.DB.prepare(
    "INSERT OR IGNORE INTO student_teacher_links (student_name_lower, code, teacher_id, subject, linked_at) VALUES (?, ?, ?, ?, ?)"
  ).bind(nameLower, codeUpper, codeRow.teacher_id, subject.trim(), new Date().toISOString()).run();
  return jsonResponse({ success: true, teacher_name: codeRow.teacher_name, label: codeRow.label }, 200, env);
}

// Lehrer-Ergebnisse (nur verlinkte Schueler + Faecher)
export async function handleTeacherResults(request, env) {
  const token = request.headers.get("X-Teacher-Auth-Token");
  const teacherId = await verifyTeacherAuthToken(token, env);
  if (!teacherId) {
    return jsonResponse({ error: "Nicht autorisiert. Bitte erneut einloggen." }, 401, env);
  }

  // Ergebnisse nur fuer verlinkte Schueler + Faecher
  const { results } = await env.DB.prepare(
    `SELECT r.id, r.student_name, r.course, r.type, r.topic, r.content, r.language, r.total, r.created_at AS date,
            d.strengths, d.weaknesses, d.error_types
     FROM results r
     LEFT JOIN result_details d ON d.result_id = r.id
     WHERE EXISTS (
       SELECT 1 FROM student_teacher_links stl
       WHERE stl.teacher_id = ?
         AND stl.student_name_lower = LOWER(TRIM(r.student_name))
         AND stl.subject = r.type
     )
     ORDER BY r.created_at ASC`
  ).bind(teacherId).all();

  // Verlinkte Schueler-Liste
  const { results: linkedStudents } = await env.DB.prepare(
    `SELECT DISTINCT s.name, s.level, s.hidden_subjects, s.created_at AS date
     FROM students s
     WHERE s.name_lower IN (SELECT DISTINCT student_name_lower FROM student_teacher_links WHERE teacher_id = ?)
     ORDER BY s.name ASC`
  ).bind(teacherId).all();

  const safeStudents = (linkedStudents || []).map(s => ({
    name: s.name,
    level: s.level || "",
    date: s.date || "",
    hidden_subjects: JSON.parse(s.hidden_subjects || "[]"),
  }));

  return jsonResponse({ results: results || [], students: safeStudents }, 200, env);
}

// Schueler: Eigene Code-Verlinkungen anzeigen
export async function handleStudentCodes(request, env) {
  const { student_name } = await request.json();
  if (!student_name || typeof student_name !== "string") {
    return jsonResponse({ error: "student_name erforderlich." }, 400, env);
  }
  const nameLower = student_name.trim().toLowerCase();
  const { results: codes } = await env.DB.prepare(
    `SELECT stl.code, stl.subject, tc.label, t.name AS teacher_name
     FROM student_teacher_links stl
     JOIN teacher_codes tc ON tc.code = stl.code
     JOIN teachers t ON t.id = stl.teacher_id
     WHERE stl.student_name_lower = ?`
  ).bind(nameLower).all();
  return jsonResponse({ success: true, codes: codes || [] }, 200, env);
}

// E-Mail an Lehrkraft nach Freischaltung
export async function sendTeacherApprovedEmail(env, name, email) {
  try {
    if (!env.RESEND_API_KEY || !email) return;

    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "myAbiFlow <noreply@myabiflow.de>",
        reply_to: "info@myabiflow.de",
        to: [email],
        subject: "Dein myAbiFlow-Konto ist freigeschaltet!",
        html: `<div style="font-family:system-ui,sans-serif;max-width:500px;margin:0 auto;padding:20px">
<h2 style="color:#2563eb;margin-top:0">Willkommen bei myAbiFlow!</h2>
<p>Hallo ${name},</p>
<p>dein Lehrkraft-Konto wurde soeben freigeschaltet. Du kannst dich ab jetzt mit deinem gewählten Benutzernamen und Passwort anmelden.</p>
<p style="text-align:center;margin:24px 0">
  <a href="https://myabiflow.de/lehrer.html" style="background:#2563eb;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block">Jetzt anmelden</a>
</p>
<p>Bei Fragen erreichst du uns jederzeit unter <a href="mailto:info@myabiflow.de">info@myabiflow.de</a>.</p>
<p style="color:#888;font-size:13px;margin-top:24px">— Das myAbiFlow-Team</p>
</div>`,
      }),
    });
  } catch (e) {
    console.error("Lehrer-Freischaltungs-E-Mail fehlgeschlagen:", e.message);
  }
}
