// Handler: Lehrer-Korrekturguthaben (20 Gratis-Korrekturen pro Monat)
import { jsonResponse } from '../utils.js';

const MONTHLY_FREE_CREDITS = 20;

// Monatsanfang als ISO-String (z.B. "2026-03-01T00:00:00.000Z")
function monthStart() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString();
}

/* ================= GUTHABEN ABFRAGEN ================= */
export async function handleTeacherCreditBalance(request, env) {
  const { teacher_id } = await request.json();

  if (!teacher_id) {
    return jsonResponse({ error: 'Teacher-ID erforderlich.' }, 400, env);
  }

  const start = monthStart();

  // Nutzung dieses Monats zählen
  const row = await env.DB.prepare(
    'SELECT COUNT(*) AS used FROM teacher_credit_usage WHERE teacher_id = ? AND used_at >= ?'
  ).bind(teacher_id, start).first();

  const used = row?.used || 0;
  const remaining = Math.max(0, MONTHLY_FREE_CREDITS - used);

  return jsonResponse({
    credits_remaining: remaining,
    credits_total: MONTHLY_FREE_CREDITS,
    credits_used: used,
    resets_at: nextMonthStart(),
  }, 200, env);
}

function nextMonthStart() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth() + 1, 1).toISOString();
}

/* ================= NUTZUNGS-HISTORIE ================= */
export async function handleTeacherCreditHistory(request, env) {
  const { teacher_id, limit } = await request.json();

  if (!teacher_id) {
    return jsonResponse({ error: 'Teacher-ID erforderlich.' }, 400, env);
  }

  const maxEntries = Math.min(limit || 50, 200);

  const { results: usage } = await env.DB.prepare(`
    SELECT student_name_lower, subject, used_at
    FROM teacher_credit_usage
    WHERE teacher_id = ?
    ORDER BY used_at DESC
    LIMIT ?
  `).bind(teacher_id, maxEntries).all();

  return jsonResponse({ usage }, 200, env);
}

/* ================= HELFER: Credits für Schüler prüfen ================= */
export async function findAvailableTeacherCredits(studentNameLower, env) {
  const start = monthStart();

  // Alle verlinkten Lehrer finden, die diesen Monat noch Credits haben
  // Subquery zählt Nutzung pro Lehrer diesen Monat
  const row = await env.DB.prepare(`
    SELECT stl.teacher_id, t.name AS teacher_name
    FROM student_teacher_links stl
    JOIN teachers t ON t.id = stl.teacher_id
    WHERE stl.student_name_lower = ?
      AND (
        SELECT COUNT(*) FROM teacher_credit_usage tcu
        WHERE tcu.teacher_id = stl.teacher_id AND tcu.used_at >= ?
      ) < ?
    ORDER BY stl.linked_at ASC
    LIMIT 1
  `).bind(studentNameLower, start, MONTHLY_FREE_CREDITS).first();

  return row || null;
}

/* ================= HELFER: 1 Credit abbuchen ================= */
export async function deductTeacherCredit(teacherId, creditId, studentNameLower, gradingJobId, subject, env) {
  const now = new Date().toISOString();
  const start = monthStart();

  // Prüfen ob monatliches Limit noch nicht erreicht
  const row = await env.DB.prepare(
    'SELECT COUNT(*) AS used FROM teacher_credit_usage WHERE teacher_id = ? AND used_at >= ?'
  ).bind(teacherId, start).first();

  if ((row?.used || 0) >= MONTHLY_FREE_CREDITS) {
    return false; // Monatliches Limit erreicht
  }

  // Nutzungsprotokoll (credit_id wird nicht mehr gebraucht, bleibt 'monthly' für Kompatibilität)
  await env.DB.prepare(`
    INSERT INTO teacher_credit_usage (teacher_id, credit_id, student_name_lower, grading_job_id, subject, used_at)
    VALUES (?, 'monthly', ?, ?, ?, ?)
  `).bind(teacherId, studentNameLower, gradingJobId || null, subject || null, now).run();

  return true;
}
