// Handler: Lehrer-Korrekturguthaben (Checkout, Balance, History)
import { jsonResponse } from '../utils.js';

/* ---- Stripe API Basis (gleiche Helfer wie in stripe.js) ---- */
const STRIPE_API = 'https://api.stripe.com/v1';

async function stripeRequest(path, params, env) {
  const body = new URLSearchParams(params).toString();
  const res = await fetch(`${STRIPE_API}${path}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.STRIPE_SECRET_KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });
  return res.json();
}

/* ================= CHECKOUT: 49 € / 75 Korrekturen ================= */
export async function handleTeacherCreditCheckout(request, env) {
  const { teacher_id } = await request.json();

  if (!teacher_id) {
    return jsonResponse({ error: 'Teacher-ID erforderlich.' }, 400, env);
  }

  if (!env.STRIPE_PRICE_TEACHER_CREDITS) {
    return jsonResponse({ error: 'Lehrer-Guthaben-Preis nicht konfiguriert.' }, 500, env);
  }

  // Lehrer laden
  const teacher = await env.DB.prepare(
    'SELECT id, name, email, stripe_customer_id FROM teachers WHERE id = ?'
  ).bind(teacher_id).first();

  if (!teacher) {
    return jsonResponse({ error: 'Lehrkraft nicht gefunden.' }, 404, env);
  }

  // Stripe Customer erstellen oder bestehenden verwenden
  let customerId = teacher.stripe_customer_id;
  if (!customerId) {
    const customer = await stripeRequest('/customers', {
      'name': teacher.name,
      'email': teacher.email || '',
      'metadata[teacher_id]': teacher_id,
      'metadata[source]': 'myabiflow_teacher',
    }, env);

    if (customer.error) {
      console.error('Stripe Customer Error (Teacher):', customer.error.message);
      return jsonResponse({ error: 'Fehler beim Erstellen des Zahlungsprofils.' }, 500, env);
    }

    customerId = customer.id;
    await env.DB.prepare(
      'UPDATE teachers SET stripe_customer_id = ? WHERE id = ?'
    ).bind(customerId, teacher_id).run();
  }

  // Checkout Session erstellen
  const allowedOrigin = env.ALLOWED_ORIGIN || 'https://myabiflow.de';
  const session = await stripeRequest('/checkout/sessions', {
    'customer': customerId,
    'mode': 'payment',
    'line_items[0][price]': env.STRIPE_PRICE_TEACHER_CREDITS,
    'line_items[0][quantity]': '1',
    'success_url': `${allowedOrigin}/lehrer.html?credits_success=true`,
    'cancel_url': `${allowedOrigin}/lehrer.html?credits_canceled=true`,
    'metadata[type]': 'teacher_credits',
    'metadata[teacher_id]': teacher_id,
    'metadata[credits]': '75',
    'locale': 'de',
    'invoice_creation[enabled]': 'true',
  }, env);

  if (session.error) {
    console.error('Stripe Session Error (Teacher):', session.error.message);
    return jsonResponse({ error: 'Fehler beim Erstellen der Checkout-Session.' }, 500, env);
  }

  return jsonResponse({ url: session.url, session_id: session.id }, 200, env);
}

/* ================= GUTHABEN ABFRAGEN ================= */
export async function handleTeacherCreditBalance(request, env) {
  const { teacher_id } = await request.json();

  if (!teacher_id) {
    return jsonResponse({ error: 'Teacher-ID erforderlich.' }, 400, env);
  }

  const now = new Date().toISOString();

  // Alle nicht-abgelaufenen Pakete laden
  const { results: packages } = await env.DB.prepare(`
    SELECT id, credits_total, credits_used, created_at, expires_at
    FROM teacher_credits
    WHERE teacher_id = ? AND (expires_at IS NULL OR expires_at > ?)
    ORDER BY created_at ASC
  `).bind(teacher_id, now).all();

  let creditsRemaining = 0;
  let creditsTotal = 0;
  for (const pkg of packages) {
    creditsRemaining += (pkg.credits_total - pkg.credits_used);
    creditsTotal += pkg.credits_total;
  }

  return jsonResponse({
    credits_remaining: creditsRemaining,
    credits_total: creditsTotal,
    packages: packages.map(p => ({
      id: p.id,
      total: p.credits_total,
      used: p.credits_used,
      remaining: p.credits_total - p.credits_used,
      created_at: p.created_at,
      expires_at: p.expires_at,
    })),
  }, 200, env);
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
// Wird von grading.js und stripe.js importiert
export async function findAvailableTeacherCredits(studentNameLower, env) {
  const now = new Date().toISOString();

  // Verlinkten Lehrer mit verfügbaren Credits finden (FIFO nach linked_at)
  const row = await env.DB.prepare(`
    SELECT stl.teacher_id, t.name AS teacher_name, tc.id AS credit_id,
           (tc.credits_total - tc.credits_used) AS remaining
    FROM student_teacher_links stl
    JOIN teachers t ON t.id = stl.teacher_id
    JOIN teacher_credits tc ON tc.teacher_id = stl.teacher_id
      AND tc.credits_used < tc.credits_total
      AND (tc.expires_at IS NULL OR tc.expires_at > ?)
    WHERE stl.student_name_lower = ?
    ORDER BY stl.linked_at ASC, tc.created_at ASC
    LIMIT 1
  `).bind(now, studentNameLower).first();

  return row || null;
}

/* ================= HELFER: 1 Credit abbuchen ================= */
export async function deductTeacherCredit(teacherId, creditId, studentNameLower, gradingJobId, subject, env) {
  const now = new Date().toISOString();

  // Atomare Abbuchung
  const result = await env.DB.prepare(
    'UPDATE teacher_credits SET credits_used = credits_used + 1 WHERE id = ? AND credits_used < credits_total'
  ).bind(creditId).run();

  if (!result.meta?.changes) {
    return false; // Credit war bereits aufgebraucht (Race Condition)
  }

  // Nutzungsprotokoll
  await env.DB.prepare(`
    INSERT INTO teacher_credit_usage (teacher_id, credit_id, student_name_lower, grading_job_id, subject, used_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).bind(teacherId, creditId, studentNameLower, gradingJobId || null, subject || null, now).run();

  return true;
}
