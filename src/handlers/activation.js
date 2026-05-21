// Handler: Aktivierungs-Kette (Analytics Events) + Admin-Funnel
//
// Konzept: Pro Schueler wird jede Aktivierungs-Stufe genau einmal in
// `analytics_events` festgehalten. Ein Unique-Index auf (event_name, student_id)
// macht den INSERT idempotent — Mehrfach-Aufrufe sind also unbedenklich.
//
// Aufrufe NIE blockierend: Wenn das Loggen scheitert, soll das den eigentlichen
// Request nicht abbrechen (deshalb try/catch + console.error).
import { jsonResponse } from '../utils.js';
import { verifyToken } from '../auth.js';

/**
 * Loggt ein Aktivierungs-Event (idempotent pro Schueler).
 * @param {object} env
 * @param {string} eventName z.B. "first_task_generated"
 * @param {object} ref { studentId?, studentName?, nameLower? }
 * @param {object} [meta] zusaetzliche Kontext-Daten (werden als JSON gespeichert)
 */
export async function logActivationEvent(env, eventName, ref, meta) {
  try {
    if (!env?.DB || !eventName || !ref) return;

    let studentId = ref.studentId != null ? Number(ref.studentId) : null;
    let studentName = ref.studentName || null;
    const nameLower = (ref.nameLower || (studentName ? String(studentName).trim().toLowerCase() : "")) || null;

    // student_id ist Pflicht fuer den Unique-Index → ggf. ueber name_lower nachladen
    if (!studentId && nameLower) {
      const row = await env.DB.prepare(
        "SELECT id, name FROM students WHERE name_lower = ?"
      ).bind(nameLower).first();
      if (row?.id) {
        studentId = Number(row.id);
        if (!studentName) studentName = row.name || null;
      }
    }
    if (!studentId) return; // Ohne Schueler-Referenz kein Aktivierungs-Event

    const metaJson = meta && typeof meta === "object" ? JSON.stringify(meta).slice(0, 2000) : null;
    await env.DB.prepare(`
      INSERT INTO analytics_events (event_name, student_id, student_name, meta, created_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT DO NOTHING
    `).bind(eventName, studentId, studentName, metaJson, new Date().toISOString()).run();
  } catch (e) {
    console.error("logActivationEvent failed:", e?.message || e);
  }
}

/* ================= ADMIN-ENDPOINT: Aktivierungs-Funnel ================= */

// ISO-Wochenschluessel (Mo-So) im Format "YYYY-Www" — sortierbar, lokalisierungsfrei.
function isoWeekKey(date) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  // ISO: Donnerstag der Kalenderwoche bestimmt das Jahr
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return d.getUTCFullYear() + "-W" + String(week).padStart(2, "0");
}

// Mo 00:00 UTC der ISO-Woche zu einem Datum (fuer Label-Anzeige im UI)
function isoWeekStart(date) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() - (day - 1));
  return d;
}

export async function handleActivationFunnel(request, env) {
  const token = request.headers.get("X-Teacher-Token");
  if (!env.TEACHER_PASSWORD) {
    return jsonResponse({ error: "Server nicht konfiguriert." }, 500, env);
  }
  if (!token || !(await verifyToken(token, env, env.TEACHER_PASSWORD))) {
    return jsonResponse({ error: "Nicht autorisiert. Bitte erneut einloggen." }, 401, env);
  }

  // Zeitfenster: letzte 12 Wochen (parametrisierbar via Body)
  let weeksWindow = 12;
  try {
    const body = await request.json();
    if (body && Number.isFinite(body.weeks) && body.weeks > 0 && body.weeks <= 52) {
      weeksWindow = Math.floor(body.weeks);
    }
  } catch (_) { /* leerer Body ist ok */ }

  const now = new Date();
  const cutoff = new Date(now.getTime() - weeksWindow * 7 * 86400000).toISOString();

  // 1) Alle Schueler im Zeitfenster (fuer Registrierungen + 7-Tage-Wiederkehr)
  const studentsRes = await env.DB.prepare(
    "SELECT id, name, created_at FROM students WHERE created_at >= ? ORDER BY created_at ASC"
  ).bind(cutoff).all();
  const students = studentsRes?.results || [];

  // 2) Alle Aktivierungs-Events im Zeitfenster
  const eventsRes = await env.DB.prepare(
    "SELECT event_name, student_id, created_at FROM analytics_events WHERE created_at >= ? ORDER BY created_at ASC"
  ).bind(cutoff).all();
  const events = eventsRes?.results || [];

  // 3) Pro Woche aggregieren (Mo-So per ISO)
  /** @type {Record<string, {week_key:string, week_start:string, registrations:number, first_task_generated:number, first_solution_submitted:number, first_feedback_received:number, first_colloquium_started:number, first_colloquium_completed:number, first_login:number, returning_7d:number, returning_7d_eligible:number}>} */
  const buckets = {};

  function ensureBucket(d) {
    const key = isoWeekKey(d);
    if (!buckets[key]) {
      buckets[key] = {
        week_key: key,
        week_start: isoWeekStart(d).toISOString().slice(0, 10),
        registrations: 0,
        first_login: 0,
        first_task_generated: 0,
        first_solution_submitted: 0,
        first_feedback_received: 0,
        first_colloquium_started: 0,
        first_colloquium_completed: 0,
        returning_7d: 0,
        returning_7d_eligible: 0,
      };
    }
    return buckets[key];
  }

  // Letzte Aktivitaet je Schueler bestimmen (fuer 7-Tage-Wiederkehr)
  /** @type {Map<number, number>} student_id → letzter Aktivitaets-Timestamp (ms) */
  const lastActivity = new Map();
  for (const ev of events) {
    const sid = Number(ev.student_id);
    if (!sid) continue;
    const ts = new Date(ev.created_at).getTime();
    const prev = lastActivity.get(sid) || 0;
    if (ts > prev) lastActivity.set(sid, ts);
  }

  // Registrierungen + Wiederkehr-Eligibility
  const SEVEN_DAYS = 7 * 86400000;
  for (const s of students) {
    const created = new Date(s.created_at);
    if (Number.isNaN(created.getTime())) continue;
    const bucket = ensureBucket(created);
    bucket.registrations += 1;

    // 7-Tage-Wiederkehr: Schueler ist "eligible", wenn seine Registrierung min. 7 Tage zurueckliegt.
    // Sonst wuerde die Quote der letzten Woche kuenstlich auf 0 fallen.
    if (now.getTime() - created.getTime() >= SEVEN_DAYS) {
      bucket.returning_7d_eligible += 1;
      const last = lastActivity.get(Number(s.id));
      if (last && last - created.getTime() >= SEVEN_DAYS) {
        bucket.returning_7d += 1;
      }
    }
  }

  // Aktivierungs-Events (jedes Event ist per Definition einmalig pro Schueler)
  const COUNTED = new Set([
    "first_login",
    "first_task_generated",
    "first_solution_submitted",
    "first_feedback_received",
    "first_colloquium_started",
    "first_colloquium_completed",
  ]);
  for (const ev of events) {
    if (!COUNTED.has(ev.event_name)) continue;
    const d = new Date(ev.created_at);
    if (Number.isNaN(d.getTime())) continue;
    const bucket = ensureBucket(d);
    bucket[ev.event_name] += 1;
  }

  // 4) Lueckenlose Wochenleiste (auch leere Wochen anzeigen)
  const series = [];
  const todayWeekStart = isoWeekStart(now);
  for (let i = weeksWindow - 1; i >= 0; i--) {
    const monday = new Date(todayWeekStart.getTime() - i * 7 * 86400000);
    ensureBucket(monday);
  }
  for (const key of Object.keys(buckets).sort()) {
    const b = buckets[key];
    const eligible = b.returning_7d_eligible;
    series.push({
      ...b,
      returning_7d_rate: eligible > 0 ? Math.round((b.returning_7d / eligible) * 100) : null,
    });
  }

  // 5) Gesamtwerte (fuer Kachel-Summen)
  const totals = series.reduce((acc, b) => {
    acc.registrations += b.registrations;
    acc.first_login += b.first_login;
    acc.first_task_generated += b.first_task_generated;
    acc.first_solution_submitted += b.first_solution_submitted;
    acc.first_feedback_received += b.first_feedback_received;
    acc.first_colloquium_started += b.first_colloquium_started;
    acc.first_colloquium_completed += b.first_colloquium_completed;
    acc.returning_7d += b.returning_7d;
    acc.returning_7d_eligible += b.returning_7d_eligible;
    return acc;
  }, {
    registrations: 0, first_login: 0, first_task_generated: 0,
    first_solution_submitted: 0, first_feedback_received: 0,
    first_colloquium_started: 0, first_colloquium_completed: 0,
    returning_7d: 0, returning_7d_eligible: 0,
  });
  totals.returning_7d_rate = totals.returning_7d_eligible > 0
    ? Math.round((totals.returning_7d / totals.returning_7d_eligible) * 100)
    : null;

  return jsonResponse({
    weeks: weeksWindow,
    generated_at: now.toISOString(),
    totals,
    series,
  }, 200, env);
}
