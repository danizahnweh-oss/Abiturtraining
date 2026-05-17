// Handler: Dashboard (Teacher Login, Results, Students, Class Passwords)
import { jsonResponse } from '../utils.js';
import { generateToken, verifyToken, safeCompare } from '../auth.js';
import { sendTeacherApprovedEmail } from './teacher.js';

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
    "SELECT name, level, hidden_subjects, class_group, email, created_at AS date, subscription_status, subscription_plan, trial_end, free_access_until FROM students ORDER BY name ASC"
  ).all();

  // Aktive Schullizenzen laden (free_access Labels)
  const { results: freeAccessLabels } = await env.DB.prepare(
    "SELECT label FROM class_passwords WHERE active = 1 AND free_access = 1"
  ).all();
  const freeAccessSet = new Set((freeAccessLabels || []).map(r => r.label));

  const now = new Date();
  const safe = (students || []).map(s => {
    let status = s.subscription_status || "none";
    let plan = s.subscription_plan || null;
    // Schüler mit class_group einer aktiven Schullizenz → als "active"/"school" anzeigen
    if (s.class_group && freeAccessSet.has(s.class_group) && status !== 'active') {
      status = 'active';
      plan = 'school';
    }
    // Abgelaufene Testphase → eigener Status, damit Dashboard das anders färbt
    if (status === 'trialing' && s.trial_end && new Date(s.trial_end) <= now) {
      status = 'trial_expired';
    }
    const freeAccessActive = !!(s.free_access_until && new Date(s.free_access_until) > now);
    return {
      name: s.name,
      level: s.level || "",
      date: s.date || "",
      hidden_subjects: JSON.parse(s.hidden_subjects || "[]"),
      class_group: s.class_group || null,
      email: s.email || "",
      subscription_status: status,
      subscription_plan: plan,
      trial_end: s.trial_end || null,
      free_access_until: s.free_access_until || null,
      free_access_active: freeAccessActive,
    };
  });

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

/* ================= DASHBOARD: FREIER ZUGANG (manuell) ================= */
// Gewährt einem einzelnen Schüler kostenlosen Vollzugang bis zu einem Datum.
// Schreibt ausschließlich in die separate Spalte students.free_access_until und ist damit
// orthogonal zu Stripe-Abos und zur normalen Trial-Logik. Mit until=null wird der Zugang entfernt.
export async function handleGrantFreeAccess(request, env) {
  const token = request.headers.get("X-Teacher-Token");
  if (!env.TEACHER_PASSWORD) {
    return jsonResponse({ error: "Server nicht konfiguriert." }, 500, env);
  }
  if (!token || !(await verifyToken(token, env, env.TEACHER_PASSWORD))) {
    return jsonResponse({ error: "Nicht autorisiert. Bitte erneut einloggen." }, 401, env);
  }

  let body;
  try { body = await request.json(); } catch (_) {
    return jsonResponse({ error: "Ungültiger JSON-Body." }, 400, env);
  }
  const { student_name, until } = body || {};
  if (!student_name || typeof student_name !== "string") {
    return jsonResponse({ error: "student_name erforderlich." }, 400, env);
  }
  // Strikte Validierung: until muss explizit null ODER ein nicht-leerer String sein
  if (until !== null && (typeof until !== "string" || !until.trim())) {
    return jsonResponse({ error: "until muss ein ISO-Datum oder null sein." }, 400, env);
  }

  const student = await env.DB.prepare(
    "SELECT id FROM students WHERE name = ?"
  ).bind(student_name).first();
  if (!student) {
    return jsonResponse({ error: "Schüler nicht gefunden." }, 404, env);
  }

  // Zugang entfernen
  if (until === null) {
    await env.DB.prepare(
      "UPDATE students SET free_access_until = NULL WHERE id = ?"
    ).bind(student.id).run();
    return jsonResponse({ success: true, action: "revoked" }, 200, env);
  }

  // Datum validieren (ISO-String, in der Zukunft)
  const untilDate = new Date(until);
  if (isNaN(untilDate.getTime())) {
    return jsonResponse({ error: "Ungültiges Datum." }, 400, env);
  }
  if (untilDate.getTime() <= Date.now()) {
    return jsonResponse({ error: "Datum muss in der Zukunft liegen." }, 400, env);
  }

  await env.DB.prepare(
    "UPDATE students SET free_access_until = ? WHERE id = ?"
  ).bind(untilDate.toISOString(), student.id).run();

  return jsonResponse({ success: true, action: "granted", free_access_until: untilDate.toISOString() }, 200, env);
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

/* ================= DASHBOARD: FACHSCHAFTS-LIZENZEN ================= */
export async function handleSubjectLicenses(request, env) {
  const token = request.headers.get("X-Teacher-Token");
  if (!env.TEACHER_PASSWORD) {
    return jsonResponse({ error: "Server nicht konfiguriert." }, 500, env);
  }
  if (!token || !(await verifyToken(token, env, env.TEACHER_PASSWORD))) {
    return jsonResponse({ error: "Nicht autorisiert. Bitte erneut einloggen." }, 401, env);
  }

  const { action, id, label, code, subject } = await request.json();

  if (action === "list") {
    const { rows } = await env.DB.prepare(
      "SELECT id, label, code, subject, active, created_at, expires_at FROM subject_licenses ORDER BY created_at DESC"
    ).all();
    const withCount = [];
    for (const sl of (rows || [])) {
      const count = await env.DB.prepare(
        "SELECT COUNT(*) as cnt FROM student_subject_licenses WHERE subject_license_id = $1"
      ).bind(sl.id).first();
      withCount.push({ ...sl, redemption_count: count?.cnt || 0 });
    }
    return jsonResponse({ success: true, subject_licenses: withCount }, 200, env);
  }

  if (action === "create") {
    if (!label || !label.trim()) {
      return jsonResponse({ error: "Bezeichnung erforderlich." }, 400, env);
    }
    if (!code || !code.trim()) {
      return jsonResponse({ error: "Fachcode erforderlich." }, 400, env);
    }
    if (!subject || !subject.trim()) {
      return jsonResponse({ error: "Fach erforderlich." }, 400, env);
    }
    // Prüfen ob Code schon existiert (in class_passwords ODER subject_licenses)
    const existingCP = await env.DB.prepare(
      "SELECT 1 FROM class_passwords WHERE UPPER(password) = UPPER($1)"
    ).bind(code.trim()).first();
    if (existingCP) {
      return jsonResponse({ error: "Dieser Code wird bereits als Schulcode verwendet." }, 409, env);
    }
    const existingSL = await env.DB.prepare(
      "SELECT 1 FROM subject_licenses WHERE UPPER(code) = UPPER($1)"
    ).bind(code.trim()).first();
    if (existingSL) {
      return jsonResponse({ error: "Dieser Fachcode existiert bereits." }, 409, env);
    }
    const newId = Date.now().toString(36) + crypto.randomUUID().slice(0, 8);
    await env.DB.prepare(
      "INSERT INTO subject_licenses (id, label, code, subject, active, created_at) VALUES ($1, $2, $3, $4, 1, $5)"
    ).bind(newId, label.trim(), code.trim(), subject.trim(), new Date().toISOString()).run();
    return jsonResponse({ success: true, id: newId }, 200, env);
  }

  if (action === "toggle") {
    if (!id) return jsonResponse({ error: "id erforderlich." }, 400, env);
    await env.DB.prepare(
      "UPDATE subject_licenses SET active = CASE WHEN active = 1 THEN 0 ELSE 1 END WHERE id = $1"
    ).bind(id).run();
    return jsonResponse({ success: true }, 200, env);
  }

  if (action === "delete") {
    if (!id) return jsonResponse({ error: "id erforderlich." }, 400, env);
    await env.DB.prepare("DELETE FROM student_subject_licenses WHERE subject_license_id = $1").bind(id).run();
    await env.DB.prepare("DELETE FROM subject_licenses WHERE id = $1").bind(id).run();
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

/* ================= DASHBOARD: REGISTRIERTE LEHRER ================= */
export async function handleGetTeachers(request, env) {
  const token = request.headers.get("X-Teacher-Token");
  if (!env.TEACHER_PASSWORD) {
    return jsonResponse({ error: "Server nicht konfiguriert." }, 500, env);
  }
  if (!token || !(await verifyToken(token, env, env.TEACHER_PASSWORD))) {
    return jsonResponse({ error: "Nicht autorisiert." }, 401, env);
  }

  const { results: teachers } = await env.DB.prepare(
    "SELECT id, name, email, subjects, status, created_at FROM teachers ORDER BY created_at DESC"
  ).all();

  const safe = (teachers || []).map(t => ({
    id: t.id,
    name: t.name,
    email: t.email || "",
    subjects: JSON.parse(t.subjects || "[]"),
    status: t.status || "approved",
    created_at: t.created_at,
  }));

  return jsonResponse({ success: true, teachers: safe }, 200, env);
}

/* ================= DASHBOARD: LEHRER FREISCHALTEN ================= */
export async function handleApproveTeacher(request, env) {
  const token = request.headers.get("X-Teacher-Token");
  if (!env.TEACHER_PASSWORD) {
    return jsonResponse({ error: "Server nicht konfiguriert." }, 500, env);
  }
  if (!token || !(await verifyToken(token, env, env.TEACHER_PASSWORD))) {
    return jsonResponse({ error: "Nicht autorisiert." }, 401, env);
  }

  const { teacher_id } = await request.json();
  if (!teacher_id || typeof teacher_id !== "string") {
    return jsonResponse({ error: "teacher_id erforderlich." }, 400, env);
  }

  const teacher = await env.DB.prepare("SELECT name, email, status FROM teachers WHERE id = ?").bind(teacher_id).first();
  if (!teacher) {
    return jsonResponse({ error: "Lehrkraft nicht gefunden." }, 404, env);
  }
  if (teacher.status === "approved") {
    return jsonResponse({ error: "Bereits freigeschaltet." }, 409, env);
  }

  await env.DB.prepare("UPDATE teachers SET status = 'approved' WHERE id = ?").bind(teacher_id).run();

  // Bestätigungs-E-Mail an Lehrkraft
  sendTeacherApprovedEmail(env, teacher.name, teacher.email);

  return jsonResponse({ success: true, name: teacher.name }, 200, env);
}

/* ================= DASHBOARD: LEHRER ENTFERNEN ================= */
export async function handleDeleteTeacher(request, env) {
  const token = request.headers.get("X-Teacher-Token");
  if (!env.TEACHER_PASSWORD) {
    return jsonResponse({ error: "Server nicht konfiguriert." }, 500, env);
  }
  if (!token || !(await verifyToken(token, env, env.TEACHER_PASSWORD))) {
    return jsonResponse({ error: "Nicht autorisiert." }, 401, env);
  }

  const { teacher_id } = await request.json();
  if (!teacher_id || typeof teacher_id !== "string") {
    return jsonResponse({ error: "teacher_id erforderlich." }, 400, env);
  }

  const teacher = await env.DB.prepare("SELECT name FROM teachers WHERE id = ?").bind(teacher_id).first();
  if (!teacher) {
    return jsonResponse({ error: "Lehrkraft nicht gefunden." }, 404, env);
  }

  await env.DB.prepare("DELETE FROM teachers WHERE id = ?").bind(teacher_id).run();
  return jsonResponse({ success: true, name: teacher.name }, 200, env);
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
  if (id == null) return jsonResponse({ error: "id erforderlich." }, 400, env);

  const boolVal = valuable ? true : false;
  await env.DB.prepare(
    "UPDATE feedback SET valuable = ? WHERE id = ?"
  ).bind(boolVal, id).run();

  // Wertvolles Feedback des Schülers zählen
  const row = await env.DB.prepare("SELECT student_name FROM feedback WHERE id = ?").bind(id).first();
  let valuableCount = 0;
  if (row && row.student_name) {
    const countRow = await env.DB.prepare(
      "SELECT COUNT(*) as cnt FROM feedback WHERE student_name = ? AND valuable = true"
    ).bind(row.student_name).first();
    valuableCount = countRow ? countRow.cnt : 0;
  }

  // Bei "wertvoll" → Dankes-Nachricht an den Schüler senden
  if (boolVal && row && row.student_name) {
    const nameLower = row.student_name.trim().toLowerCase();
    try {
      const msgId = crypto.randomUUID();
      const now = new Date().toISOString();
      await env.DB.prepare(
        "INSERT INTO messages (id, recipient_name_lower, subject, body, is_read, created_at) VALUES (?, ?, ?, ?, 0, ?)"
      ).bind(msgId, nameLower, "Dein Feedback wurde als hilfreich markiert", "Dein Feedback wurde als hilfreich markiert. Vielen Dank! Wir schätzen deine Rückmeldung sehr – sie hilft uns, myAbiFlow für alle besser zu machen.", now).run();
    } catch (e) {
      console.error("Feedback-Danke Nachricht Fehler:", e.message);
    }
  }

  return jsonResponse({ success: true, valuableCount }, 200, env);
}

/* ================= DASHBOARD: ACTIVITY FEED ================= */
export async function handleActivityFeed(request, env) {
  const token = request.headers.get("X-Teacher-Token");
  if (!env.TEACHER_PASSWORD) {
    return jsonResponse({ error: "Server nicht konfiguriert." }, 500, env);
  }
  if (!token || !(await verifyToken(token, env, env.TEACHER_PASSWORD))) {
    return jsonResponse({ error: "Nicht autorisiert." }, 401, env);
  }

  const { results: events } = await env.DB.prepare(`
    SELECT * FROM (
      SELECT 'task_created' AS type, tt.title AS label, t.name AS actor, tt.subject AS detail, tt.created_at AS ts
      FROM teacher_tasks tt
      JOIN teachers t ON t.id = tt.teacher_id
      WHERE tt.created_at IS NOT NULL
      ORDER BY tt.created_at DESC LIMIT 15
    )
    UNION ALL
    SELECT * FROM (
      SELECT 'code_created' AS type, tc.label AS label, t.name AS actor, tc.code AS detail, tc.created_at AS ts
      FROM teacher_codes tc
      JOIN teachers t ON t.id = tc.teacher_id
      WHERE tc.created_at IS NOT NULL
      ORDER BY tc.created_at DESC LIMIT 10
    )
    UNION ALL
    SELECT * FROM (
      SELECT 'submission' AS type, r.topic AS label, r.student_name AS actor, r.course AS detail, r.created_at AS ts
      FROM results r
      WHERE r.total IS NULL AND r.created_at IS NOT NULL
      ORDER BY r.created_at DESC LIMIT 15
    )
    UNION ALL
    SELECT * FROM (
      SELECT 'graded' AS type, r.topic AS label, r.student_name AS actor, CAST(r.total AS TEXT) AS detail, r.created_at AS ts
      FROM results r
      WHERE r.total IS NOT NULL AND r.created_at IS NOT NULL
      ORDER BY r.created_at DESC LIMIT 15
    )
    UNION ALL
    SELECT * FROM (
      SELECT 'student_registered' AS type, s.name AS label, s.name AS actor, '' AS detail, s.created_at AS ts
      FROM students s
      WHERE s.created_at IS NOT NULL
      ORDER BY s.created_at DESC LIMIT 10
    )
    UNION ALL
    SELECT * FROM (
      SELECT 'teacher_registered' AS type, t.name AS label, t.name AS actor, t.status AS detail, t.created_at AS ts
      FROM teachers t
      WHERE t.created_at IS NOT NULL
      ORDER BY t.created_at DESC LIMIT 5
    )
    UNION ALL
    SELECT * FROM (
      SELECT 'colloquium_started' AS type,
             COALESCE(cs.subject, '–') AS label,
             COALESCE(cs.student_name, '–') AS actor,
             '' AS detail,
             cs.started_at AS ts
      FROM colloquium_sessions cs
      WHERE cs.started_at IS NOT NULL
      ORDER BY cs.started_at DESC LIMIT 15
    )
    UNION ALL
    SELECT * FROM (
      SELECT 'colloquium_ended' AS type,
             COALESCE(cs.subject, '–') AS label,
             COALESCE(cs.student_name, '–') AS actor,
             CAST(cs.duration_s AS TEXT) AS detail,
             cs.ended_at AS ts
      FROM colloquium_sessions cs
      WHERE cs.ended_at IS NOT NULL
      ORDER BY cs.ended_at DESC LIMIT 15
    )
    ORDER BY ts DESC
    LIMIT 50
  `).all();

  return jsonResponse({ success: true, events: events || [] }, 200, env);
}
