// Handler: Lehrer-Aufgaben-Sharing (Erstellen, Teilen, Ergebnisse)
import { jsonResponse } from '../utils.js';
import { verifyTeacherAuthToken, generateClassCode } from '../auth.js';

// 8-stelliger Share-Code fuer Aufgaben (laenger als 6-stellige Lehrer-Codes)
function generateShareCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const arr = new Uint8Array(8);
  crypto.getRandomValues(arr);
  let code = "";
  for (let i = 0; i < 8; i++) code += chars[arr[i] % chars.length];
  return code;
}

// ===== Lehrer-Profil (Faecher) =====
export async function handleTeacherProfile(request, env) {
  const token = request.headers.get("X-Teacher-Auth-Token");
  const teacherId = await verifyTeacherAuthToken(token, env);
  if (!teacherId) {
    return jsonResponse({ error: "Nicht autorisiert." }, 401, env);
  }
  const { action, subjects } = await request.json();

  if (action === "get") {
    const row = await env.DB.prepare("SELECT subjects FROM teachers WHERE id = ?").bind(teacherId).first();
    return jsonResponse({ success: true, subjects: JSON.parse(row?.subjects || "[]") }, 200, env);
  }

  if (action === "update") {
    if (!Array.isArray(subjects)) {
      return jsonResponse({ error: "subjects muss ein Array sein." }, 400, env);
    }
    await env.DB.prepare("UPDATE teachers SET subjects = ? WHERE id = ?")
      .bind(JSON.stringify(subjects), teacherId).run();
    return jsonResponse({ success: true }, 200, env);
  }

  return jsonResponse({ error: "Unbekannte Aktion." }, 400, env);
}

// ===== Lehrer-Aufgaben CRUD =====
export async function handleTeacherTasks(request, env) {
  const token = request.headers.get("X-Teacher-Auth-Token");
  const teacherId = await verifyTeacherAuthToken(token, env);
  if (!teacherId) {
    return jsonResponse({ error: "Nicht autorisiert." }, 401, env);
  }
  const body = await request.json();
  const { action } = body;

  // Aufgabe speichern
  if (action === "save") {
    const { task_data, subject, subject_group, title } = body;
    if (!task_data || !subject || !subject_group || !title) {
      return jsonResponse({ error: "task_data, subject, subject_group und title erforderlich." }, 400, env);
    }

    // Einzigartigen Share-Code generieren
    let shareCode = null;
    for (let i = 0; i < 10; i++) {
      const candidate = generateShareCode();
      const exists = await env.DB.prepare("SELECT 1 FROM teacher_tasks WHERE share_code = ?").bind(candidate).first();
      if (!exists) { shareCode = candidate; break; }
    }
    if (!shareCode) {
      return jsonResponse({ error: "Code-Generierung fehlgeschlagen." }, 500, env);
    }

    const id = Date.now().toString(36) + crypto.randomUUID().slice(0, 8);
    const kvKey = `task:${id}`;

    // Komplette Aufgabendaten (inkl. Bilder) in KV speichern
    await env.RESULTS_KV.put(kvKey, JSON.stringify(task_data));

    // Abgespeckte Metadaten (ohne Bilder) fuer D1
    const meta = { ...task_data };
    // Bilder entfernen (koennen sehr gross sein)
    delete meta._uploadImages;
    delete meta.images;
    if (meta.materials) {
      meta.materials = meta.materials.map(m => {
        if (m.type === "image" || m.type === "foto") return { ...m, image_url: "[KV]" };
        return m;
      });
    }

    await env.DB.prepare(
      `INSERT INTO teacher_tasks (id, teacher_id, share_code, subject, subject_group, title, task_meta, kv_key, active, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`
    ).bind(id, teacherId, shareCode, subject, subject_group, title.trim(), JSON.stringify(meta), kvKey, new Date().toISOString()).run();

    return jsonResponse({ success: true, task_id: id, share_code: shareCode }, 200, env);
  }

  // Alle Aufgaben des Lehrers
  if (action === "list") {
    const { results: tasks } = await env.DB.prepare(
      `SELECT t.id, t.share_code, t.subject, t.subject_group, t.title, t.active, t.created_at,
              (SELECT COUNT(*) FROM task_submissions ts WHERE ts.task_id = t.id) as submission_count
       FROM teacher_tasks t
       WHERE t.teacher_id = ?
       ORDER BY t.created_at DESC`
    ).bind(teacherId).all();
    return jsonResponse({ success: true, tasks: tasks || [] }, 200, env);
  }

  // Einzelne Aufgabe laden (fuer Vorschau)
  if (action === "get") {
    const { task_id } = body;
    if (!task_id) return jsonResponse({ error: "task_id erforderlich." }, 400, env);
    const task = await env.DB.prepare(
      "SELECT * FROM teacher_tasks WHERE id = ? AND teacher_id = ?"
    ).bind(task_id, teacherId).first();
    if (!task) return jsonResponse({ error: "Aufgabe nicht gefunden." }, 404, env);

    // Komplette Daten aus KV laden
    let taskData = null;
    if (task.kv_key) {
      const kvData = await env.RESULTS_KV.get(task.kv_key);
      if (kvData) taskData = JSON.parse(kvData);
    }
    return jsonResponse({ success: true, task, task_data: taskData }, 200, env);
  }

  // Aufgabe aktivieren/deaktivieren
  if (action === "toggle") {
    const { task_id } = body;
    if (!task_id) return jsonResponse({ error: "task_id erforderlich." }, 400, env);
    await env.DB.prepare(
      "UPDATE teacher_tasks SET active = CASE WHEN active = 1 THEN 0 ELSE 1 END WHERE id = ? AND teacher_id = ?"
    ).bind(task_id, teacherId).run();
    return jsonResponse({ success: true }, 200, env);
  }

  // Aufgabe loeschen
  if (action === "delete") {
    const { task_id } = body;
    if (!task_id) return jsonResponse({ error: "task_id erforderlich." }, 400, env);
    const task = await env.DB.prepare(
      "SELECT kv_key FROM teacher_tasks WHERE id = ? AND teacher_id = ?"
    ).bind(task_id, teacherId).first();
    if (task?.kv_key) {
      await env.RESULTS_KV.delete(task.kv_key);
    }
    await env.DB.prepare("DELETE FROM task_submissions WHERE task_id = ?").bind(task_id).run();
    await env.DB.prepare("DELETE FROM teacher_tasks WHERE id = ? AND teacher_id = ?").bind(task_id, teacherId).run();
    return jsonResponse({ success: true }, 200, env);
  }

  return jsonResponse({ error: "Unbekannte Aktion." }, 400, env);
}

// ===== Lehrer: Ergebnisse pro Aufgabe =====
export async function handleTeacherTaskResults(request, env) {
  const token = request.headers.get("X-Teacher-Auth-Token");
  const teacherId = await verifyTeacherAuthToken(token, env);
  if (!teacherId) {
    return jsonResponse({ error: "Nicht autorisiert." }, 401, env);
  }
  const { task_id } = await request.json();
  if (!task_id) return jsonResponse({ error: "task_id erforderlich." }, 400, env);

  // Pruefen ob Aufgabe dem Lehrer gehoert
  const task = await env.DB.prepare(
    "SELECT id FROM teacher_tasks WHERE id = ? AND teacher_id = ?"
  ).bind(task_id, teacherId).first();
  if (!task) return jsonResponse({ error: "Aufgabe nicht gefunden." }, 404, env);

  const { results: submissions } = await env.DB.prepare(
    `SELECT ts.student_name_lower, ts.submitted_at, ts.result_id,
            r.total, r.content, r.language, r.student_name,
            d.strengths, d.weaknesses, d.error_types
     FROM task_submissions ts
     LEFT JOIN results r ON r.id = ts.result_id
     LEFT JOIN result_details d ON d.result_id = ts.result_id
     WHERE ts.task_id = ?
     ORDER BY ts.submitted_at DESC`
  ).bind(task_id).all();

  return jsonResponse({ success: true, submissions: submissions || [] }, 200, env);
}

// ===== Schueler: Geteilte Aufgabe laden =====
export async function handleGetSharedTask(request, env) {
  const { share_code, task_id } = await request.json();

  let task;
  if (task_id) {
    // Direkter Abruf per task_id (fuer Weiterleitung von aufgabe.html)
    task = await env.DB.prepare(
      "SELECT * FROM teacher_tasks WHERE id = ? AND active = 1"
    ).bind(task_id).first();
  } else if (share_code) {
    const codeUpper = share_code.toUpperCase().trim();
    task = await env.DB.prepare(
      "SELECT * FROM teacher_tasks WHERE share_code = ? AND active = 1"
    ).bind(codeUpper).first();
  } else {
    return jsonResponse({ error: "share_code oder task_id erforderlich." }, 400, env);
  }

  if (!task) {
    return jsonResponse({ error: "Aufgabe nicht gefunden oder deaktiviert." }, 404, env);
  }

  // Komplette Daten aus KV laden
  let taskData = null;
  if (task.kv_key) {
    const kvData = await env.RESULTS_KV.get(task.kv_key);
    if (kvData) taskData = JSON.parse(kvData);
  }
  if (!taskData) {
    // Fallback auf D1-Metadaten
    taskData = JSON.parse(task.task_meta);
  }

  // Lehrer-Name laden
  const teacher = await env.DB.prepare("SELECT name FROM teachers WHERE id = ?").bind(task.teacher_id).first();

  return jsonResponse({
    success: true,
    task_id: task.id,
    subject: task.subject,
    subject_group: task.subject_group,
    title: task.title,
    teacher_name: teacher?.name || "Lehrkraft",
    task_data: taskData
  }, 200, env);
}

// ===== Schueler: Ergebnis einer geteilten Aufgabe zuordnen =====
export async function handleSubmitSharedTask(request, env) {
  const { task_id, result_id, student_name } = await request.json();
  if (!task_id || !result_id || !student_name) {
    return jsonResponse({ error: "task_id, result_id und student_name erforderlich." }, 400, env);
  }

  const nameLower = student_name.trim().toLowerCase();
  const id = Date.now().toString(36) + crypto.randomUUID().slice(0, 8);

  // Upsert: Neuen Eintrag oder result_id aktualisieren
  const existing = await env.DB.prepare(
    "SELECT id FROM task_submissions WHERE task_id = ? AND student_name_lower = ?"
  ).bind(task_id, nameLower).first();

  if (existing) {
    await env.DB.prepare(
      "UPDATE task_submissions SET result_id = ?, submitted_at = ? WHERE id = ?"
    ).bind(result_id, new Date().toISOString(), existing.id).run();
  } else {
    await env.DB.prepare(
      "INSERT INTO task_submissions (id, task_id, student_name_lower, result_id, submitted_at) VALUES (?, ?, ?, ?, ?)"
    ).bind(id, task_id, nameLower, result_id, new Date().toISOString()).run();
  }

  // Automatisch Schueler mit Lehrer verlinken (fuer alle Faecher des Codes)
  const task = await env.DB.prepare("SELECT teacher_id, subject FROM teacher_tasks WHERE id = ?").bind(task_id).first();
  if (task) {
    await env.DB.prepare(
      "INSERT OR IGNORE INTO student_teacher_links (student_name_lower, code, teacher_id, subject, linked_at) VALUES (?, ?, ?, ?, ?)"
    ).bind(nameLower, "TASK:" + task_id.slice(0, 10), task.teacher_id, task.subject, new Date().toISOString()).run();
  }

  return jsonResponse({ success: true }, 200, env);
}
