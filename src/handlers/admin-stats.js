// Handler: Internes Admin-Dashboard – Break-even-Tracker
// Schutz: X-Admin-Token (env.ADMIN_TOKEN). KEINE Schüler-/Lehrer-Tokens akzeptieren.
import { jsonResponse } from '../utils.js';
import { safeCompare } from '../auth.js';

/* Break-even-Konstanten (synchron mit project_business.md halten) */
const BREAKEVEN_TARGET   = 140;   // Zahlende Nutzer für Break-even
const PRICE_B2C_MONTHLY  = 15;    // €/Monat
const PRICE_B2B_PER_SEAT = 40;    // €/Schüler/Jahr (Fachschaftslizenz)

/* Hilfsfunktion: ISO-String für (jetzt − N Tage) */
function daysAgo(n) {
  return new Date(Date.now() - n * 86400000).toISOString();
}

/* B2C-Pläne (Stripe). 'school' ist B2B, 'free' ist kein Abo. */
const B2C_PLANS = ['monthly', '6months', '12months', '24months', 'abitur'];

/* ================= GET ADMIN STATS ================= */
export async function handleAdminStats(request, env) {
  const adminToken = request.headers.get('X-Admin-Token');
  if (!env.ADMIN_TOKEN || !(await safeCompare(adminToken || '', env.ADMIN_TOKEN))) {
    return jsonResponse({ error: 'Nicht autorisiert.' }, 401, env);
  }

  const nowIso  = new Date().toISOString();
  const iso7d   = daysAgo(7);
  const iso30d  = daysAgo(30);
  const iso60d  = daysAgo(60);

  /* ---------- B2C: Aktive Stripe-Abos / Einmalkäufe ---------- */
  // Aktiv = status='active' UND nicht-Schullizenz UND nicht abgelaufen
  const b2cActiveRow = await env.DB.prepare(`
    SELECT COUNT(DISTINCT student_id) AS n
    FROM subscriptions
    WHERE status = 'active'
      AND school_license_code IS NULL
      AND plan != 'school'
      AND plan != 'free'
      AND (current_period_end IS NULL OR current_period_end > ?)
  `).bind(nowIso).first();
  const b2cActive = Number(b2cActiveRow?.n) || 0;

  // Aufschlüsselung nach Plan
  const b2cByPlanRes = await env.DB.prepare(`
    SELECT plan, COUNT(DISTINCT student_id) AS n
    FROM subscriptions
    WHERE status = 'active'
      AND school_license_code IS NULL
      AND plan != 'school'
      AND plan != 'free'
      AND (current_period_end IS NULL OR current_period_end > ?)
    GROUP BY plan
  `).bind(nowIso).all();
  const b2cByPlan = {};
  for (const row of (b2cByPlanRes.results || [])) {
    b2cByPlan[row.plan] = Number(row.n) || 0;
  }

  /* ---------- B2B: Fachschaftslizenzen (40 €/Schüler/Jahr) ---------- */
  const b2bSeatsRow = await env.DB.prepare(`
    SELECT COUNT(*) AS n
    FROM student_subject_licenses ssl
    JOIN subject_licenses sl ON sl.id = ssl.subject_license_id
    WHERE sl.active = 1
      AND (sl.expires_at IS NULL OR sl.expires_at > ?)
  `).bind(nowIso).first();
  const b2bSeats = Number(b2bSeatsRow?.n) || 0;

  // Anzahl aktiver Fachschaftslizenz-Codes (= Schulen × Fächer)
  const b2bCodesRow = await env.DB.prepare(`
    SELECT COUNT(*) AS n
    FROM subject_licenses
    WHERE active = 1
      AND (expires_at IS NULL OR expires_at > ?)
  `).bind(nowIso).first();
  const b2bLicenseCodes = Number(b2bCodesRow?.n) || 0;

  /* ---------- Pilotschulen (kostenloser Vollzugang) ---------- */
  const pilotSchoolsRow = await env.DB.prepare(`
    SELECT COUNT(*) AS n FROM class_passwords WHERE active = 1 AND free_access = 1
  `).first();
  const pilotSchools = Number(pilotSchoolsRow?.n) || 0;

  const pilotStudentsRow = await env.DB.prepare(`
    SELECT COUNT(*) AS n
    FROM students s
    WHERE s.class_group IN (
      SELECT label FROM class_passwords WHERE active = 1 AND free_access = 1
    )
  `).first();
  const pilotStudents = Number(pilotStudentsRow?.n) || 0;

  /* ---------- Aktive zahlende Nutzer (Summe) ---------- */
  const activePaying = b2cActive + b2bSeats;

  /* ---------- Neue zahlende diese Woche ---------- */
  const newB2C7dRow = await env.DB.prepare(`
    SELECT COUNT(DISTINCT student_id) AS n
    FROM subscriptions
    WHERE status = 'active'
      AND school_license_code IS NULL
      AND plan != 'school'
      AND plan != 'free'
      AND created_at > ?
  `).bind(iso7d).first();
  const newB2C7d = Number(newB2C7dRow?.n) || 0;

  const newB2B7dRow = await env.DB.prepare(`
    SELECT COUNT(*) AS n
    FROM student_subject_licenses
    WHERE redeemed_at > ?
  `).bind(iso7d).first();
  const newB2B7d = Number(newB2B7dRow?.n) || 0;

  const newPaying7d = newB2C7d + newB2B7d;

  /* ---------- Churn (30 Tage) ---------- */
  const canceled30dRow = await env.DB.prepare(`
    SELECT COUNT(*) AS n
    FROM subscriptions
    WHERE status = 'canceled'
      AND updated_at > ?
  `).bind(iso30d).first();
  const canceled30d = Number(canceled30dRow?.n) || 0;

  // Churn-Rate = Kündigungen / (Kündigungen + aktuell aktive B2C) – Näherung auf 30-Tage-Basis
  const churnBase = canceled30d + b2cActive;
  const churnRate = churnBase > 0 ? (canceled30d / churnBase) : 0;

  /* ---------- Trial-to-Paid-Conversion (letzte 30 Tage) ---------- */
  // Cohort: Studenten die in den letzten 30–60d gestartet sind (Trial reift in ~7d, dann muss bezahlt sein)
  const trialsStartedRow = await env.DB.prepare(`
    SELECT COUNT(*) AS n
    FROM students
    WHERE trial_end IS NOT NULL
      AND created_at > ?
      AND created_at <= ?
  `).bind(iso60d, iso7d).first();
  const trialsStartedCohort = Number(trialsStartedRow?.n) || 0;

  const trialsConvertedRow = await env.DB.prepare(`
    SELECT COUNT(*) AS n
    FROM students
    WHERE trial_end IS NOT NULL
      AND created_at > ?
      AND created_at <= ?
      AND subscription_status = 'active'
      AND subscription_plan IS NOT NULL
      AND subscription_plan NOT IN ('school', 'free')
  `).bind(iso60d, iso7d).first();
  const trialsConverted = Number(trialsConvertedRow?.n) || 0;

  const conversionRate = trialsStartedCohort > 0
    ? (trialsConverted / trialsStartedCohort)
    : 0;

  /* ---------- Trials aktiv gerade (für Kontext) ---------- */
  const trialsActiveRow = await env.DB.prepare(`
    SELECT COUNT(*) AS n
    FROM students
    WHERE trial_end IS NOT NULL
      AND trial_end > ?
      AND (subscription_status = 'trialing' OR subscription_status IS NULL OR subscription_status = 'none')
  `).bind(nowIso).first();
  const trialsActive = Number(trialsActiveRow?.n) || 0;

  /* ---------- Break-even-Berechnung ---------- */
  const distanceToBreakeven = Math.max(0, BREAKEVEN_TARGET - activePaying);

  // Variante A: nur weitere Fachschaftslizenzen
  // Annahme: durchschnittliche Fachschaft = aktuelle Ø Schüler pro Code
  const avgSeatsPerLicense = b2bLicenseCodes > 0
    ? (b2bSeats / b2bLicenseCodes)
    : 25; // Default-Annahme: 25 Schüler pro Fachschaft (Q12/Q13-Kurs)
  const additionalLicensesNeeded = distanceToBreakeven > 0
    ? Math.ceil(distanceToBreakeven / Math.max(1, avgSeatsPerLicense))
    : 0;

  // Variante B: nur weitere B2C-Abos (jeder Abo zählt als 1 Nutzer)
  const additionalB2CNeeded = distanceToBreakeven;

  /* ---------- Umsatz-Schätzung (monatlich, B2C-Anteil) ---------- */
  // Vereinfacht: Nur monatlich-Abos liefern monatlichen Umsatz. Einmalkäufe → annualisiert.
  const mrrMonthly = (b2cByPlan['monthly'] || 0) * 15;
  const mrr6m  = (b2cByPlan['6months']  || 0) * (70  / 6);
  const mrr12m = (b2cByPlan['12months'] || 0) * (120 / 12);
  const mrr24m = (b2cByPlan['24months'] || 0) * (180 / 24);
  const mrrAbi = (b2cByPlan['abitur']   || 0) * (120 / 12); // gleiche Range wie 12m
  const mrrB2C = mrrMonthly + mrr6m + mrr12m + mrr24m + mrrAbi;
  const mrrB2B = b2bSeats * (PRICE_B2B_PER_SEAT / 12);
  const mrrTotal = mrrB2C + mrrB2B;

  return jsonResponse({
    generated_at: nowIso,
    breakeven: {
      target: BREAKEVEN_TARGET,
      active_paying: activePaying,
      distance: distanceToBreakeven,
      additional_b2c_subs_needed: additionalB2CNeeded,
      additional_b2b_licenses_needed: additionalLicensesNeeded,
      avg_seats_per_license: Math.round(avgSeatsPerLicense * 10) / 10,
      price_b2c_monthly: PRICE_B2C_MONTHLY,
      price_b2b_per_seat_year: PRICE_B2B_PER_SEAT,
    },
    b2c: {
      active: b2cActive,
      by_plan: b2cByPlan,
      new_7d: newB2C7d,
    },
    b2b: {
      seats: b2bSeats,
      license_codes: b2bLicenseCodes,
      new_7d: newB2B7d,
    },
    pilot: {
      schools: pilotSchools,
      students: pilotStudents,
    },
    growth: {
      new_paying_7d: newPaying7d,
    },
    churn: {
      canceled_30d: canceled30d,
      rate_30d: Math.round(churnRate * 1000) / 1000, // 3 Nachkommastellen
    },
    conversion: {
      trials_started_cohort: trialsStartedCohort,
      trials_converted: trialsConverted,
      rate: Math.round(conversionRate * 1000) / 1000,
      trials_active_now: trialsActive,
    },
    revenue: {
      mrr_total_eur: Math.round(mrrTotal),
      mrr_b2c_eur:   Math.round(mrrB2C),
      mrr_b2b_eur:   Math.round(mrrB2B),
      arr_total_eur: Math.round(mrrTotal * 12),
    },
  }, 200, env);
}
