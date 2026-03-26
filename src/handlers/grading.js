// Handler: Async Grading (Submit, Status, Execute, Cleanup)
import { jsonResponse, truncate } from '../utils.js';
import { findAvailableTeacherCredits, deductTeacherCredit } from './teacher-credits.js';

/* ================= ASYNC GRADING: HANDLER ================= */

// Wird von index.js befüllt mit den konkreten Handler-Referenzen
export let GRADE_HANDLER_MAP = {};

export function setGradeHandlerMap(map) {
  GRADE_HANDLER_MAP = map;
}

export function isValidGradeEndpoint(endpoint) {
  // Gymnasium-Grade-Handler
  if (GRADE_HANDLER_MAP[endpoint]) return true;
  // FOS-Grade-Endpoints (werden über handleFOSRoute geroutet)
  if (/^fos-grade(-abitur|-abitur13)?-[a-z]+$/.test(endpoint)) return true;
  return false;
}

export async function handleGradeSubmit(request, env, ctx) {
  const body = await request.json();
  const { endpoint, student_name, ...inputData } = body;

  if (!endpoint || !isValidGradeEndpoint(endpoint)) {
    return jsonResponse({ error: "Ungültiger Endpoint: " + (endpoint || "(leer)") }, 400, env);
  }

  // Minimale Input-Validierung
  const hasText = inputData.student_text || inputData.student_texts || inputData.text_a ||
                  inputData.student_text_en || inputData.rubric_prompt;
  const hasImages = inputData.images && inputData.images.length;
  if (!hasText && !hasImages) {
    return jsonResponse({ error: "Kein Schülertext vorhanden." }, 400, env);
  }

  // Bilder aus inputData extrahieren (zu groß für D1)
  const images = inputData.images;
  delete inputData.images;

  const jobId = crypto.randomUUID();
  const now = new Date().toISOString();
  const sName = truncate(student_name || "Unbekannt", 100);

  // Job in D1 anlegen (ohne Bilder — passen nicht in SQLite)
  await env.DB.prepare(
    `INSERT INTO grading_jobs (id, student_name, endpoint, input_data, status, attempts, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'pending', 0, ?, ?)`
  ).bind(jobId, sName, endpoint, JSON.stringify(inputData), now, now).run();

  if (images && images.length) {
    // Bilder vorhanden → direkt verarbeiten (Queue kann keine großen Payloads)
    ctx.waitUntil(processGradeDirectly(jobId, endpoint, inputData, images, env));
  } else {
    // Ohne Bilder → Queue wie bisher
    await env.GRADING_QUEUE.send({ jobId, endpoint });
  }

  return jsonResponse({ job_id: jobId, status: "pending" }, 202, env);
}

export async function processGradeDirectly(jobId, endpoint, inputData, images, env) {
  try {
    await env.DB.prepare(
      "UPDATE grading_jobs SET status = 'processing', attempts = 1, updated_at = ? WHERE id = ?"
    ).bind(new Date().toISOString(), jobId).run();

    // Bilder für den Handler wieder anhängen
    const fullInput = { ...inputData, images };
    const result = await executeGradeHandler(endpoint, fullInput, env);

    await env.DB.prepare(
      "UPDATE grading_jobs SET status = 'completed', result_data = ?, updated_at = ? WHERE id = ?"
    ).bind(JSON.stringify(result), new Date().toISOString(), jobId).run();

    // Lehrer-Credit abbuchen (wenn Schüler kein eigenes Abo hat)
    await tryDeductTeacherCredit(jobId, endpoint, env);
  } catch (err) {
    console.error("Direct grading failed for job " + jobId + ":", err.message);
    const safeMsg = truncate(err.message || "Unbekannter Fehler", 500);
    const isUnsafe = /api[_-]?key|token|secret|stack|\.js:/i.test(safeMsg);
    await env.DB.prepare(
      "UPDATE grading_jobs SET status = 'failed', error_msg = ?, updated_at = ? WHERE id = ?"
    ).bind(isUnsafe ? "Interner Fehler." : safeMsg, new Date().toISOString(), jobId).run();
  }
}

export async function handleGradeStatus(jobId, env) {
  if (!jobId || jobId.length > 50) {
    return jsonResponse({ error: "Ungültige Job-ID." }, 400, env);
  }

  const job = await env.DB.prepare(
    "SELECT status, result_data, error_msg, created_at FROM grading_jobs WHERE id = ?"
  ).bind(jobId).first();

  if (!job) {
    return jsonResponse({ error: "Job nicht gefunden." }, 404, env);
  }

  if (job.status === "completed") {
    return jsonResponse({
      status: "completed",
      result: JSON.parse(job.result_data)
    }, 200, env);
  }

  if (job.status === "failed") {
    return jsonResponse({
      status: "failed",
      error: job.error_msg || "Korrektur fehlgeschlagen. Bitte erneut versuchen."
    }, 200, env);
  }

  // pending oder processing
  const elapsed = Math.round((Date.now() - new Date(job.created_at).getTime()) / 1000);
  return jsonResponse({
    status: job.status,
    elapsed_seconds: elapsed
  }, 200, env);
}

// handleFOSRoute wird von index.js übergeben, wenn executeGradeHandler aufgerufen wird
let _handleFOSRoute = null;

export function setFOSRouteHandler(handler) {
  _handleFOSRoute = handler;
}

export async function executeGradeHandler(endpoint, inputData, env) {
  // Fake-Request für bestehende Handler (rufen request.json() auf)
  const fakeRequest = { json: async () => inputData, headers: new Headers() };
  let response;

  if (endpoint.startsWith("fos-")) {
    // FOS-Endpoints über handleFOSRoute
    if (!_handleFOSRoute) throw new Error("FOS-Route-Handler nicht registriert.");
    response = await _handleFOSRoute("/api/" + endpoint, fakeRequest, env);
  } else {
    const handler = GRADE_HANDLER_MAP[endpoint];
    if (!handler) {
      throw new Error("Kein Handler für Endpoint: " + endpoint);
    }
    response = await handler(fakeRequest, env);
  }

  // Response-Body parsen
  const responseData = await response.json();

  if (response.status >= 400) {
    throw new Error(responseData.error || "Handler-Fehler (Status " + response.status + ")");
  }

  return responseData;
}

// Lehrer-Credit abbuchen, wenn Schüler kein eigenes Abo hat
export async function tryDeductTeacherCredit(jobId, endpoint, env) {
  try {
    // Job-Daten laden (student_name)
    const job = await env.DB.prepare(
      "SELECT student_name FROM grading_jobs WHERE id = ?"
    ).bind(jobId).first();
    if (!job || !job.student_name) return;

    const studentNameLower = job.student_name.trim().toLowerCase();

    // Prüfen ob Schüler ein eigenes aktives Abo hat
    const student = await env.DB.prepare(
      "SELECT id, subscription_status FROM students WHERE name_lower = ?"
    ).bind(studentNameLower).first();

    if (student) {
      // Aktives Abo → keine Credits abbuchen
      if (student.subscription_status === 'active' || student.subscription_status === 'trialing') {
        const sub = await env.DB.prepare(
          "SELECT status, current_period_end, school_license_code FROM subscriptions WHERE student_id = ? AND status IN ('active', 'trialing') LIMIT 1"
        ).bind(student.id).first();

        if (sub) {
          if (sub.school_license_code) return; // Schullizenz
          if (sub.current_period_end && new Date(sub.current_period_end) > new Date()) return; // Gültiges Abo
        }
      }
    }

    // Kein aktives Abo → Lehrer-Credits prüfen und abbuchen
    const credit = await findAvailableTeacherCredits(studentNameLower, env);
    if (credit) {
      // Fach aus dem Endpoint ableiten (z.B. "grade-deutsch" → "deutsch")
      const subject = endpoint.replace(/^(fos-)?grade(-abitur|-abitur13)?-/, '');
      await deductTeacherCredit(credit.teacher_id, null, studentNameLower, jobId, subject, env);
    }
  } catch (err) {
    console.error("Teacher-Credit-Abbuchung fehlgeschlagen:", err.message);
  }
}

export async function cleanupOldGradingJobs(env) {
  try {
    // Jobs älter als 24h löschen
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const result = await env.DB.prepare(
      "DELETE FROM grading_jobs WHERE created_at < ?"
    ).bind(cutoff).run();
    if (result.meta?.changes > 0) {
      console.log("Alte Grading-Jobs bereinigt:", result.meta.changes);
    }

    // Jobs die länger als 10 Min im Status "processing" hängen auf "failed" setzen
    const fiveMinAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    await env.DB.prepare(
      "UPDATE grading_jobs SET status = 'failed', error_msg = 'Zeitlimit überschritten', updated_at = ? WHERE status = 'processing' AND updated_at < ?"
    ).bind(new Date().toISOString(), fiveMinAgo).run();
  } catch (err) {
    console.error("Grading-Jobs Cleanup fehlgeschlagen:", err.message);
  }
}
