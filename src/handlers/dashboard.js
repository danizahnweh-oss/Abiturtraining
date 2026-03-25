// Handler: Dashboard (Teacher Login, Results, Students, Class Passwords)
import { jsonResponse } from '../utils.js';
import { generateToken, verifyToken, safeCompare } from '../auth.js';

/* ================= DASHBOARD: TEACHER LOGIN ================= */
export async function handleTeacherLogin(request, env) {
  const { teacher_password } = await request.json();
  if (!env.TEACHER_PASSWORD) {
    return jsonResponse({ error: "Server nicht konfiguriert." }, 500, env);
  }
  if (!teacher_password || typeof teacher_password !== "string") {
    return jsonResponse({ error: "Passwort erforderlich." }, 400, env);
  }
  const valid = await safeCompare(teacher_password, env.TEACHER_PASSWORD);
  if (!valid) {
    return jsonResponse({ error: "Falsches Lehrer-Passwort." }, 401, env);
  }
  const token = await generateToken(env, env.TEACHER_PASSWORD);
  return jsonResponse({ success: true, token }, 200, env);
}

/* ================= D1 HELPER ================= */
async function d1GetAllResults(env) {
  const { results } = await env.DB.prepare(
    `SELECT r.id, r.student_name, r.course, r.type, r.topic, r.content, r.language, r.total, r.created_at AS date,
            d.strengths, d.weaknesses, d.error_types
     FROM results r
     LEFT JOIN result_details d ON d.result_id = r.id
     ORDER BY r.created_at ASC`
  ).all();
  return results || [];
}

/* ================= DASHBOARD: GET RESULTS ================= */
export async function handleGetResults(request, env) {
  const token = request.headers.get("X-Teacher-Token");
  if (!env.TEACHER_PASSWORD) {
    return jsonResponse({ error: "Server nicht konfiguriert." }, 500, env);
  }
  if (!token || !(await verifyToken(token, env, env.TEACHER_PASSWORD))) {
    return jsonResponse({ error: "Nicht autorisiert. Bitte erneut einloggen." }, 401, env);
  }

  const results = await d1GetAllResults(env);

  return jsonResponse({ results }, 200, env);
}

/* ================= DASHBOARD: DELETE RESULT ================= */
export async function handleDeleteResult(request, env) {
  const token = request.headers.get("X-Teacher-Token");
  if (!env.TEACHER_PASSWORD) {
    return jsonResponse({ error: "Server nicht konfiguriert." }, 500, env);
  }
  if (!token || !(await verifyToken(token, env, env.TEACHER_PASSWORD))) {
    return jsonResponse({ error: "Nicht autorisiert. Bitte erneut einloggen." }, 401, env);
  }

  const { result_id } = await request.json();
  if (!result_id || typeof result_id !== "string") {
    return jsonResponse({ error: "result_id required" }, 400, env);
  }

  await env.DB.prepare("DELETE FROM results WHERE id = ?").bind(result_id).run();
  return jsonResponse({ success: true }, 200, env);
}

/* ================= DASHBOARD: GET REGISTERED STUDENTS ================= */
export async function handleGetStudents(request, env) {
  const token = request.headers.get("X-Teacher-Token");
  if (!env.TEACHER_PASSWORD) {
    return jsonResponse({ error: "Server nicht konfiguriert." }, 500, env);
  }
  if (!token || !(await verifyToken(token, env, env.TEACHER_PASSWORD))) {
    return jsonResponse({ error: "Nicht autorisiert. Bitte erneut einloggen." }, 401, env);
  }

  const { results: students } = await env.DB.prepare(
    "SELECT name, level, hidden_subjects, class_group, created_at AS date FROM students ORDER BY name ASC"
  ).all();

  const safe = (students || []).map(s => ({
    name: s.name,
    level: s.level || "",
    date: s.date || "",
    hidden_subjects: JSON.parse(s.hidden_subjects || "[]"),
    class_group: s.class_group || null,
  }));

  return jsonResponse({ success: true, students: safe }, 200, env);
}

/* ================= DASHBOARD: DELETE STUDENT ================= */
export async function handleDeleteStudent(request, env) {
  const token = request.headers.get("X-Teacher-Token");
  if (!env.TEACHER_PASSWORD) {
    return jsonResponse({ error: "Server nicht konfiguriert." }, 500, env);
  }
  if (!token || !(await verifyToken(token, env, env.TEACHER_PASSWORD))) {
    return jsonResponse({ error: "Nicht autorisiert. Bitte erneut einloggen." }, 401, env);
  }

  const { student_name } = await request.json();
  if (!student_name || typeof student_name !== "string") {
    return jsonResponse({ error: "student_name required" }, 400, env);
  }

  const result = await env.DB.prepare("DELETE FROM students WHERE name = ?").bind(student_name).run();
  if (result.meta.changes === 0) {
    return jsonResponse({ error: "Schüler nicht gefunden." }, 404, env);
  }
  // CASCADE loescht automatisch zugehoerige Results

  const countResult = await env.DB.prepare("SELECT COUNT(*) as cnt FROM students").first();
  return jsonResponse({ success: true, remaining: countResult.cnt }, 200, env);
}

/* ================= DASHBOARD: KLASSENPASSWÖRTER ================= */
export async function handleClassPasswords(request, env) {
  const token = request.headers.get("X-Teacher-Token");
  if (!env.TEACHER_PASSWORD) {
    return jsonResponse({ error: "Server nicht konfiguriert." }, 500, env);
  }
  if (!token || !(await verifyToken(token, env, env.TEACHER_PASSWORD))) {
    return jsonResponse({ error: "Nicht autorisiert. Bitte erneut einloggen." }, 401, env);
  }

  const { action, id, label, password } = await request.json();

  if (action === "list") {
    const { results: passwords } = await env.DB.prepare(
      "SELECT id, label, password, active, free_access, created_at FROM class_passwords ORDER BY created_at DESC"
    ).all();
    const withCount = [];
    for (const p of (passwords || [])) {
      const count = await env.DB.prepare(
        "SELECT COUNT(*) as cnt FROM students WHERE class_group = ?"
      ).bind(p.label).first();
      withCount.push({ ...p, student_count: count?.cnt || 0 });
    }
    return jsonResponse({ success: true, class_passwords: withCount }, 200, env);
  }

  if (action === "create") {
    if (!label || typeof label !== "string" || !label.trim()) {
      return jsonResponse({ error: "Bezeichnung erforderlich." }, 400, env);
    }
    if (!password || typeof password !== "string" || !password.trim()) {
      return jsonResponse({ error: "Passwort erforderlich." }, 400, env);
    }
    const existing = await env.DB.prepare(
      "SELECT 1 FROM class_passwords WHERE label = ?"
    ).bind(label.trim()).first();
    if (existing) {
      return jsonResponse({ error: "Diese Bezeichnung existiert bereits." }, 409, env);
    }
    const existingPw = await env.DB.prepare(
      "SELECT 1 FROM class_passwords WHERE UPPER(password) = UPPER(?)"
    ).bind(password.trim()).first();
    if (existingPw) {
      return jsonResponse({ error: "Dieses Passwort wird bereits verwendet." }, 409, env);
    }
    const newId = Date.now().toString(36) + crypto.randomUUID().slice(0, 8);
    await env.DB.prepare(
      "INSERT INTO class_passwords (id, label, password, active, created_at) VALUES (?, ?, ?, 1, ?)"
    ).bind(newId, label.trim(), password.trim(), new Date().toISOString()).run();
    return jsonResponse({ success: true, id: newId, label: label.trim() }, 200, env);
  }

  if (action === "toggle") {
    if (!id) return jsonResponse({ error: "id erforderlich." }, 400, env);
    await env.DB.prepare(
      "UPDATE class_passwords SET active = CASE WHEN active = 1 THEN 0 ELSE 1 END WHERE id = ?"
    ).bind(id).run();
    return jsonResponse({ success: true }, 200, env);
  }

  if (action === "toggle-free-access") {
    if (!id) return jsonResponse({ error: "id erforderlich." }, 400, env);
    await env.DB.prepare(
      "UPDATE class_passwords SET free_access = CASE WHEN free_access = 1 THEN 0 ELSE 1 END WHERE id = ?"
    ).bind(id).run();
    return jsonResponse({ success: true }, 200, env);
  }

  if (action === "delete") {
    if (!id) return jsonResponse({ error: "id erforderlich." }, 400, env);
    await env.DB.prepare("DELETE FROM class_passwords WHERE id = ?").bind(id).run();
    return jsonResponse({ success: true }, 200, env);
  }

  return jsonResponse({ error: "Unbekannte Aktion." }, 400, env);
}

/* ================= DASHBOARD: FEEDBACK LESEN ================= */
export async function handleGetFeedback(request, env) {
  const token = request.headers.get("X-Teacher-Token");
  if (!env.TEACHER_PASSWORD) {
    return jsonResponse({ error: "Server nicht konfiguriert." }, 500, env);
  }
  if (!token || !(await verifyToken(token, env, env.TEACHER_PASSWORD))) {
    return jsonResponse({ error: "Nicht autorisiert." }, 401, env);
  }

  const rows = await env.DB.prepare(
    "SELECT id, rating, category, message, page, student_name, valuable, created_at FROM feedback ORDER BY created_at DESC LIMIT 200"
  ).bind().all();
  return jsonResponse({ feedback: rows.results || rows }, 200, env);
}

/* ================= DASHBOARD: FEEDBACK ALS WERTVOLL MARKIEREN ================= */
export async function handleToggleFeedbackValuable(request, env) {
  const token = request.headers.get("X-Teacher-Token");
  if (!env.TEACHER_PASSWORD) {
    return jsonResponse({ error: "Server nicht konfiguriert." }, 500, env);
  }
  if (!token || !(await verifyToken(token, env, env.TEACHER_PASSWORD))) {
    return jsonResponse({ error: "Nicht autorisiert." }, 401, env);
  }

  const { id, valuable } = await request.json();
  if (!id) return jsonResponse({ error: "id erforderlich." }, 400, env);

  await env.DB.prepare(
    "UPDATE feedback SET valuable = ? WHERE id = ?"
  ).bind(valuable ? 1 : 0, id).run();

  // Wertvolles Feedback des Schülers zählen
  const row = await env.DB.prepare("SELECT student_name FROM feedback WHERE id = ?").bind(id).first();
  let valuableCount = 0;
  if (row && row.student_name) {
    const countRow = await env.DB.prepare(
      "SELECT COUNT(*) as cnt FROM feedback WHERE student_name = ? AND valuable = 1"
    ).bind(row.student_name).first();
    valuableCount = countRow ? countRow.cnt : 0;
  }

  return jsonResponse({ success: true, valuableCount }, 200, env);
}
