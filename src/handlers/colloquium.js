// Handler: Kolloquium-Übungsstart – Trial-Limit (3 Stück) + Bypass für bezahlte Zugänge
import { jsonResponse } from '../utils.js';
import { isSchoolLicenseActive, resolveStudentIdentity } from '../auth.js';

// Maximale Anzahl Kolloquium-Übungen im Probezeitraum
const TRIAL_COLLOQUIUM_LIMIT = 3;

async function getAuthenticatedStudentId(request, env) {
  const ident = await resolveStudentIdentity(request, env);
  if (!ident || ident.isTeacher) return null;
  if (ident.studentId) return ident.studentId;
  const row = await env.DB.prepare(
    'SELECT id FROM students WHERE name_lower = ?'
  ).bind(ident.nameLower).first();
  return row?.id ? String(row.id) : null;
}

// Prüft die Bypass-Pfade (bezahltes Abo, Schullizenz, Free-Access, Fachschafts-Lizenz).
// Gibt true zurück, wenn der User uneingeschränkt starten darf.
async function hasUnlimitedAccess(student, env) {
  const now = new Date();

  // Manuell vom Lehrer gewährter Free Access
  if (student.free_access_until && new Date(student.free_access_until) > now) {
    return true;
  }

  // Aktives Stripe-Abo (alle aktiven Subs prüfen – ein Schüler kann gleichzeitig
  // Schullizenz + Stripe-Abo haben; sobald EINE Sub gültig ist, durchlassen)
  if (student.subscription_status === 'active') {
    const subsResult = await env.DB.prepare(
      "SELECT current_period_end, school_license_code FROM subscriptions WHERE student_id = $1 AND status = 'active'"
    ).bind(String(student.id)).all();
    for (const sub of subsResult?.rows || []) {
      if (sub.school_license_code) {
        if (await isSchoolLicenseActive(sub.school_license_code, env)) return true;
      } else if (sub.current_period_end && new Date(sub.current_period_end) > now) {
        return true;
      }
    }
  }

  // Schullizenz über class_group
  if (student.class_group) {
    const cp = await env.DB.prepare(
      "SELECT 1 FROM class_passwords WHERE label = ? AND active = 1 AND free_access = 1"
    ).bind(student.class_group).first();
    if (cp) return true;
  }

  // Kolloquium ist fachübergreifend → jede aktive Fachschafts-Lizenz akzeptieren
  const subjectLicense = await env.DB.prepare(`
    SELECT 1 FROM student_subject_licenses ssl
    JOIN subject_licenses sl ON sl.id = ssl.subject_license_id
    WHERE ssl.student_id = $1 AND sl.active = 1
      AND (sl.expires_at IS NULL OR sl.expires_at > $2)
    LIMIT 1
  `).bind(String(student.id), now.toISOString()).first();
  if (subjectLicense) return true;

  return false;
}

export async function handleColloquiumStart(request, env) {
  const studentId = await getAuthenticatedStudentId(request, env);
  if (!studentId) {
    return jsonResponse({ error: 'Bitte erneut anmelden.' }, 401, env);
  }

  const student = await env.DB.prepare(
    'SELECT id, subscription_status, trial_end, trial_colloquium_count, class_group, free_access_until FROM students WHERE id = ?'
  ).bind(studentId).first();

  if (!student) {
    return jsonResponse({ error: 'Schüler nicht gefunden.' }, 404, env);
  }

  // Bezahlt / Schullizenz / Free-Access → unbegrenzt, kein Hochzählen
  if (await hasUnlimitedAccess(student, env)) {
    return jsonResponse({ allowed: true, unlimited: true }, 200, env);
  }

  // Trial-Pfad
  const trialActive = student.subscription_status === 'trialing'
    && student.trial_end
    && new Date(student.trial_end) > new Date();

  if (trialActive) {
    // Atomares Hochzählen: nur erfolgreich, wenn count < Limit (race-condition-safe)
    const updateResult = await env.DB.prepare(
      `UPDATE students
         SET trial_colloquium_count = COALESCE(trial_colloquium_count, 0) + 1
       WHERE id = ?
         AND subscription_status = 'trialing'
         AND COALESCE(trial_colloquium_count, 0) < ?`
    ).bind(studentId, TRIAL_COLLOQUIUM_LIMIT).run();

    if (!updateResult.meta?.changes) {
      // Limit bereits erreicht
      return jsonResponse({
        error: `Im Probezeitraum sind maximal ${TRIAL_COLLOQUIUM_LIMIT} Kolloquium-Übungen möglich.`,
        trial_limit_reached: true,
        used: TRIAL_COLLOQUIUM_LIMIT,
        max: TRIAL_COLLOQUIUM_LIMIT,
        remaining: 0,
      }, 403, env);
    }

    const used = (student.trial_colloquium_count || 0) + 1;
    return jsonResponse({
      allowed: true,
      trial: true,
      used,
      max: TRIAL_COLLOQUIUM_LIMIT,
      remaining: TRIAL_COLLOQUIUM_LIMIT - used,
    }, 200, env);
  }

  // Weder Bypass noch aktiver Trial → kein Zugang
  return jsonResponse({
    error: 'Kein aktives Abo. Bitte schließe ein Abo ab.',
    requires_subscription: true,
  }, 403, env);
}

// Liefert den aktuellen Stand (Trial-Counter, unbegrenzt/Trial/abgelaufen) OHNE hochzuzählen.
// Wird beim Laden der SPA aufgerufen, damit der Counter sofort angezeigt werden kann.
export async function handleColloquiumStatus(request, env) {
  const studentId = await getAuthenticatedStudentId(request, env);
  if (!studentId) {
    return jsonResponse({ error: 'Bitte erneut anmelden.' }, 401, env);
  }

  const student = await env.DB.prepare(
    'SELECT id, subscription_status, trial_end, trial_colloquium_count, class_group, free_access_until FROM students WHERE id = ?'
  ).bind(studentId).first();

  if (!student) {
    return jsonResponse({ error: 'Schüler nicht gefunden.' }, 404, env);
  }

  if (await hasUnlimitedAccess(student, env)) {
    return jsonResponse({ unlimited: true }, 200, env);
  }

  const trialActive = student.subscription_status === 'trialing'
    && student.trial_end
    && new Date(student.trial_end) > new Date();

  if (trialActive) {
    const used = student.trial_colloquium_count || 0;
    return jsonResponse({
      trial: true,
      used,
      max: TRIAL_COLLOQUIUM_LIMIT,
      remaining: Math.max(0, TRIAL_COLLOQUIUM_LIMIT - used),
    }, 200, env);
  }

  return jsonResponse({ requires_subscription: true }, 200, env);
}
