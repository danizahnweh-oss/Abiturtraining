// Handler: Stripe-Integration (Checkout, Webhooks, Abo-Status, Portal)
import { jsonResponse } from '../utils.js';
import { isSchoolLicenseActive, resolveStudentIdentity } from '../auth.js';

// Liefert die Schüler-ID des Aufrufers (aus Token gebunden, fallback per name_lower).
// Ein im Body übergebenes student_id wird ignoriert – dies schließt die IDOR-Lücke.
async function getAuthenticatedStudentId(request, env) {
  const ident = await resolveStudentIdentity(request, env);
  if (!ident || ident.isTeacher) return null;
  if (ident.studentId) return ident.studentId;
  const row = await env.DB.prepare(
    'SELECT id FROM students WHERE name_lower = ?'
  ).bind(ident.nameLower).first();
  return row?.id ? String(row.id) : null;
}

/* ---- Stripe API Basis ---- */
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

async function stripeGet(path, env) {
  const res = await fetch(`${STRIPE_API}${path}`, {
    headers: { 'Authorization': `Bearer ${env.STRIPE_SECRET_KEY}` },
  });
  return res.json();
}

/* ---- Preis-Mapping (Stripe Price IDs werden als Secrets gespeichert) ---- */
function getValidPlans(env) {
  return {
    'monthly': env.STRIPE_PRICE_MONTHLY,
    '6months': env.STRIPE_PRICE_6MONTHS,
    '12months': env.STRIPE_PRICE_12MONTHS,
    '24months': env.STRIPE_PRICE_24MONTHS,
    'abitur': env.STRIPE_PRICE_ABITUR,
  };
}

function getPriceId(plan, env) {
  const validPlans = getValidPlans(env);
  return Object.prototype.hasOwnProperty.call(validPlans, plan) ? validPlans[plan] : null;
}

/* Ist der Plan ein Einmalkauf oder ein Abo? */
function isRecurring(plan) {
  return plan === 'monthly';
}

/* Laufzeit berechnen: Enddatum zurückgeben */
function planEndDate(plan) {
  if (plan === 'abitur') {
    // Bis 30. Juni des aktuellen Jahres (oder nächsten, falls schon vorbei)
    const now = new Date();
    let end = new Date(now.getFullYear(), 5, 30, 23, 59, 59); // 30. Juni
    if (end <= now) end = new Date(now.getFullYear() + 1, 5, 30, 23, 59, 59);
    return end;
  }
  const map = { 'monthly': 30, '6months': 183, '12months': 365, '24months': 730 };
  const days = map[plan] || 30;
  return new Date(Date.now() + days * 86400000);
}

// Rückwärtskompatibel
function planDurationDays(plan) {
  const end = planEndDate(plan);
  return Math.ceil((end.getTime() - Date.now()) / 86400000);
}

/* ================= CHECKOUT SESSION ERSTELLEN ================= */
export async function handleCreateCheckout(request, env) {
  const { plan, student_name, utm } = await request.json();

  if (!plan || typeof plan !== 'string') {
    return jsonResponse({ error: 'Plan erforderlich.' }, 400, env);
  }
  const validPlans = getValidPlans(env);
  if (!Object.prototype.hasOwnProperty.call(validPlans, plan)) {
    return jsonResponse({ error: 'Ungültiger Plan.' }, 400, env);
  }

  // Schüler-ID kommt zwingend aus dem Token (Body-Wert wird ignoriert)
  const student_id = await getAuthenticatedStudentId(request, env);
  if (!student_id) {
    return jsonResponse({ error: 'Bitte erneut anmelden.' }, 401, env);
  }

  // Abitur-Plan nur bis 30. Juni verfügbar
  if (plan === 'abitur') {
    const now = new Date();
    const cutoff = new Date(now.getFullYear(), 5, 30, 23, 59, 59);
    if (now > cutoff) {
      return jsonResponse({ error: 'Der Abiturendspurt-Plan ist leider nicht mehr verfügbar.' }, 400, env);
    }
  }

  const priceId = getPriceId(plan, env);
  if (!priceId) {
    return jsonResponse({ error: 'Ungültiger Plan.' }, 400, env);
  }

  // Prüfen ob Student existiert
  const student = await env.DB.prepare(
    'SELECT id, name, stripe_customer_id, email FROM students WHERE id = ?'
  ).bind(student_id).first();

  if (!student) {
    return jsonResponse({ error: 'Schüler nicht gefunden.' }, 404, env);
  }

  // Stripe Customer erstellen oder bestehenden verwenden
  let customerId = student.stripe_customer_id;
  if (!customerId) {
    const customer = await stripeRequest('/customers', {
      'name': student.name || student_name || 'Unbekannt',
      'metadata[student_id]': student_id,
      'metadata[source]': 'myabiflow',
    }, env);

    if (customer.error) {
      console.error('Stripe Customer Error:', customer.error.message);
      return jsonResponse({ error: 'Fehler beim Erstellen des Zahlungsprofils.' }, 500, env);
    }

    customerId = customer.id;
    await env.DB.prepare(
      'UPDATE students SET stripe_customer_id = ? WHERE id = ?'
    ).bind(customerId, student_id).run();
  }

  // Checkout Session erstellen
  const allowedOrigin = env.ALLOWED_ORIGIN || 'https://myabiflow.de';
  const sessionParams = {
    'customer': customerId,
    'mode': isRecurring(plan) ? 'subscription' : 'payment',
    'line_items[0][price]': priceId,
    'line_items[0][quantity]': '1',
    'success_url': `${allowedOrigin}/abo.html?success=true&session_id={CHECKOUT_SESSION_ID}`,
    'cancel_url': `${allowedOrigin}/abo.html?canceled=true`,
    'metadata[student_id]': student_id,
    'metadata[plan]': plan,
    'metadata[utm_source]': (utm && utm.utm_source) || '',
    'metadata[utm_medium]': (utm && utm.utm_medium) || '',
    'metadata[utm_campaign]': (utm && utm.utm_campaign) || '',
    'locale': 'de',
    'allow_promotion_codes': 'true',
  };

  // Bei Einmalkauf: Rechnung erstellen für steuerliche Zwecke
  if (!isRecurring(plan)) {
    sessionParams['invoice_creation[enabled]'] = 'true';
  }

  const session = await stripeRequest('/checkout/sessions', sessionParams, env);

  if (session.error) {
    console.error('Stripe Session Error:', session.error.message);
    return jsonResponse({ error: 'Fehler beim Erstellen der Checkout-Session.' }, 500, env);
  }

  return jsonResponse({ url: session.url, session_id: session.id }, 200, env);
}

/* ================= WEBHOOK HANDLER ================= */
export async function handleStripeWebhook(request, env) {
  const body = await request.text();
  const signature = request.headers.get('stripe-signature');

  if (!signature || !env.STRIPE_WEBHOOK_SECRET) {
    return new Response('Webhook nicht konfiguriert.', { status: 400 });
  }

  // Stripe Webhook-Signatur verifizieren
  const verified = await verifyStripeSignature(body, signature, env.STRIPE_WEBHOOK_SECRET);
  if (!verified) {
    console.error('Stripe Webhook: Signatur ungültig');
    return new Response('Ungültige Signatur.', { status: 400 });
  }

  const event = JSON.parse(body);
  const now = new Date().toISOString();

  try {
    const processedEvent = await env.DB.prepare(
      'INSERT INTO stripe_processed_events (event_id, processed_at) VALUES (?, ?) ON CONFLICT (event_id) DO NOTHING'
    ).bind(event.id, now).run();
    if (!processedEvent.meta?.changes) {
      return new Response('OK', { status: 200 });
    }

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        const customerId = session.customer;

        // Lehrer-Korrekturguthaben (49 € / 75 Korrekturen)
        if (session.metadata?.type === 'teacher_credits') {
          const teacherId = session.metadata.teacher_id;
          const credits = parseInt(session.metadata.credits) || 75;
          const paymentIntent = session.payment_intent;

          if (teacherId) {
            // Idempotenz: Prüfen ob dieses Payment schon verarbeitet wurde
            const existing = await env.DB.prepare(
              'SELECT id FROM teacher_credits WHERE stripe_payment_intent = ?'
            ).bind(paymentIntent).first();

            if (!existing) {
              const expiresAt = new Date(Date.now() + 365 * 86400000).toISOString(); // 12 Monate
              await env.DB.prepare(`
                INSERT INTO teacher_credits (id, teacher_id, credits_total, credits_used, stripe_payment_intent, created_at, expires_at)
                VALUES (?, ?, ?, 0, ?, ?, ?)
              `).bind(crypto.randomUUID(), teacherId, credits, paymentIntent, now, expiresAt).run();

              // Stripe-Customer-ID auf Lehrer speichern
              if (customerId) {
                await env.DB.prepare(
                  'UPDATE teachers SET stripe_customer_id = ? WHERE id = ?'
                ).bind(customerId, teacherId).run();
              }
            }
          }
          break;
        }

        const studentId = session.metadata?.student_id;
        const plan = session.metadata?.plan || 'unknown';

        if (!studentId) break;

        if (isRecurring(plan)) {
          // Abo-Modus: subscription_id speichern.
          // UPSERT auf stripe_subscription_id verhindert Duplikate bei Webhook-Retries
          // oder mehrfachen Events für dieselbe Stripe-Subscription.
          const subId = session.subscription;
          const periodEnd = new Date(Date.now() + 30 * 86400000).toISOString();

          await env.DB.prepare(`
            INSERT INTO subscriptions (id, student_id, stripe_customer_id, stripe_subscription_id, plan, status, current_period_end, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, 'active', ?, ?, ?)
            ON CONFLICT(stripe_subscription_id) DO UPDATE SET
              status='active',
              plan=EXCLUDED.plan,
              stripe_customer_id=EXCLUDED.stripe_customer_id,
              current_period_end=EXCLUDED.current_period_end,
              updated_at=EXCLUDED.updated_at
          `).bind(
            crypto.randomUUID(), studentId, customerId, subId, plan, periodEnd, now, now
          ).run();

          await env.DB.prepare(
            'UPDATE students SET subscription_status = ?, subscription_plan = ?, stripe_customer_id = ? WHERE id = ?'
          ).bind('active', plan, customerId, studentId).run();

        } else {
          // Einmalkauf: Laufzeit berechnen
          const periodEnd = planEndDate(plan).toISOString();

          await env.DB.prepare(`
            INSERT INTO subscriptions (id, student_id, stripe_customer_id, plan, status, current_period_end, created_at, updated_at)
            VALUES (?, ?, ?, ?, 'active', ?, ?, ?)
          `).bind(crypto.randomUUID(), studentId, customerId, plan, periodEnd, now, now).run();

          await env.DB.prepare(
            'UPDATE students SET subscription_status = ?, subscription_plan = ?, stripe_customer_id = ? WHERE id = ?'
          ).bind('active', plan, customerId, studentId).run();
        }
        break;
      }

      case 'customer.subscription.updated': {
        const sub = event.data.object;
        const customerId = sub.customer;

        // Student über customer_id finden
        const student = await env.DB.prepare(
          'SELECT id FROM students WHERE stripe_customer_id = ?'
        ).bind(customerId).first();

        if (student) {
          const status = sub.status === 'active' ? 'active' :
                         sub.status === 'trialing' ? 'trialing' :
                         sub.status === 'past_due' ? 'past_due' : 'canceled';
          // current_period_end liegt je nach Stripe-API-Version entweder direkt auf
          // sub oder im ersten Item (API ≥ 2025-04 verlagert es zu items.data[])
          const rawPeriodEnd = sub.current_period_end
            || sub.items?.data?.[0]?.current_period_end
            || null;
          const periodEnd = rawPeriodEnd
            ? new Date(rawPeriodEnd * 1000).toISOString()
            : null;

          await env.DB.prepare(
            'UPDATE students SET subscription_status = ? WHERE id = ?'
          ).bind(status, student.id).run();

          // current_period_end NUR überschreiben wenn das Event einen Wert liefert –
          // sonst bestehenden Wert behalten (verhindert versehentlichen Lockout)
          if (periodEnd) {
            await env.DB.prepare(`
              UPDATE subscriptions SET status = ?, current_period_end = ?, cancel_at_period_end = ?, updated_at = ?
              WHERE student_id = ? AND stripe_subscription_id = ?
            `).bind(status, periodEnd, sub.cancel_at_period_end ? 1 : 0, now, student.id, sub.id).run();
          } else {
            await env.DB.prepare(`
              UPDATE subscriptions SET status = ?, cancel_at_period_end = ?, updated_at = ?
              WHERE student_id = ? AND stripe_subscription_id = ?
            `).bind(status, sub.cancel_at_period_end ? 1 : 0, now, student.id, sub.id).run();
          }
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const sub = event.data.object;
        const customerId = sub.customer;

        const student = await env.DB.prepare(
          'SELECT id FROM students WHERE stripe_customer_id = ?'
        ).bind(customerId).first();

        if (student) {
          await env.DB.prepare(
            'UPDATE students SET subscription_status = ? WHERE id = ?'
          ).bind('canceled', student.id).run();

          await env.DB.prepare(
            'UPDATE subscriptions SET status = ?, updated_at = ? WHERE student_id = ? AND stripe_subscription_id = ?'
          ).bind('canceled', now, student.id, sub.id).run();
        }
        break;
      }

      default:
        // Nicht behandelte Events ignorieren
        break;
    }
  } catch (err) {
    console.error('Webhook-Verarbeitung fehlgeschlagen:', err.message);
    return new Response('Webhook-Fehler.', { status: 500 });
  }

  return new Response('OK', { status: 200 });
}

/* ================= ABO-STATUS ABRUFEN ================= */
export async function handleSubscriptionStatus(request, env) {
  // Schüler-ID kommt zwingend aus dem Token
  const student_id = await getAuthenticatedStudentId(request, env);
  if (!student_id) {
    return jsonResponse({ error: 'Bitte erneut anmelden.' }, 401, env);
  }

  const student = await env.DB.prepare(
    'SELECT id, subscription_status, subscription_plan, trial_end, stripe_customer_id, class_group, free_access_until FROM students WHERE id = ?'
  ).bind(student_id).first();

  if (!student) {
    return jsonResponse({ error: 'Schüler nicht gefunden.' }, 404, env);
  }

  // Aktive Subscription-Details laden
  const sub = await env.DB.prepare(
    "SELECT plan, status, current_period_end, cancel_at_period_end, school_license_code FROM subscriptions WHERE student_id = ? AND status IN ('active', 'trialing') ORDER BY created_at DESC LIMIT 1"
  ).bind(student_id).first();

  // Prüfen ob Einmalkauf noch gültig ist
  let isActive = false;
  if (sub) {
    if (sub.school_license_code) {
      // Schullizenz: Prüfen ob noch aktiv in class_passwords
      isActive = await isSchoolLicenseActive(sub.school_license_code, env);
    } else if (sub.status === 'active' && sub.current_period_end) {
      isActive = new Date(sub.current_period_end) > new Date();
    } else if (sub.status === 'trialing' && student.trial_end) {
      isActive = new Date(student.trial_end) > new Date();
    }
  }

  // Manuell vom Lehrer gewährter Free Access (orthogonal zu Stripe und Schullizenz)
  let manualFreeAccess = false;
  if (!isActive && student.free_access_until && new Date(student.free_access_until) > new Date()) {
    isActive = true;
    manualFreeAccess = true;
  }

  // Fallback: class_group mit free_access prüfen (für frühe Schüler ohne subscriptions-Eintrag)
  let classGroupFreeAccess = false;
  if (!isActive && student.class_group) {
    const cp = await env.DB.prepare(
      "SELECT 1 FROM class_passwords WHERE label = ? AND active = 1 AND free_access = 1"
    ).bind(student.class_group).first();
    if (cp) {
      isActive = true;
      classGroupFreeAccess = true;
    }
  }

  // Trial-Tage berechnen
  let trialDaysLeft = 0;
  if (student.trial_end) {
    const diff = new Date(student.trial_end) - new Date();
    trialDaysLeft = Math.max(0, Math.ceil(diff / 86400000));
  }

  // Bei aktivem Trial: 'trialing' zurückgeben (nicht 'active'), damit der Banner angezeigt wird
  let statusLabel = student.subscription_status || 'none';
  if (isActive) {
    statusLabel = (sub?.plan === 'trial' && trialDaysLeft > 0) ? 'trialing' : 'active';
  } else if (sub?.school_license_code) {
    // Schullizenz deaktiviert → als "none" behandeln
    statusLabel = 'none';
  }

  // Manueller Free Access: Restdauer berechnen (für Banner-Anzeige im Frontend)
  let freeAccessDaysLeft = 0;
  if (manualFreeAccess && student.free_access_until) {
    const diff = new Date(student.free_access_until) - new Date();
    freeAccessDaysLeft = Math.max(0, Math.ceil(diff / 86400000));
  }

  // Lehrer-Credits prüfen (nur wenn kein eigenes Abo aktiv)
  // Jeder Lehrer hat 20 Gratis-Korrekturen pro Monat für seine Schüler
  let teacherCreditsAvailable = false;
  let teacherCreditsName = null;
  if (!isActive) {
    const studentName = await env.DB.prepare(
      'SELECT name_lower FROM students WHERE id = ?'
    ).bind(student_id).first();

    if (studentName) {
      const mStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
      const tcRow = await env.DB.prepare(`
        SELECT t.name AS teacher_name
        FROM student_teacher_links stl
        JOIN teachers t ON t.id = stl.teacher_id
        LEFT JOIN teacher_credit_usage_count tcc
          ON tcc.teacher_id = stl.teacher_id AND tcc.year_month = ?
        WHERE stl.student_name_lower = ?
          AND COALESCE(tcc.count, 0) < 20
        LIMIT 1
      `).bind(mStart.slice(0, 7), studentName.name_lower).first();

      if (tcRow) {
        teacherCreditsAvailable = true;
        teacherCreditsName = tcRow.teacher_name;
      }
    }
  }

  // Aktive Fachschafts-Lizenzen laden
  const slResult = await env.DB.prepare(`
    SELECT sl.subject, sl.label FROM student_subject_licenses ssl
    JOIN subject_licenses sl ON sl.id = ssl.subject_license_id
    WHERE ssl.student_id = $1 AND sl.active = 1
      AND (sl.expires_at IS NULL OR sl.expires_at > $2)
  `).bind(student_id, new Date().toISOString()).all();
  // D1-Format des Adapters: { results: [...], success: true } — NICHT .rows!
  const subjectLicenses = (slResult?.results || []).map(s => ({ subject: s.subject, school: s.label }));

  return jsonResponse({
    status: statusLabel,
    plan: sub?.plan || student.subscription_plan || 'free',
    current_period_end: sub?.current_period_end || null,
    cancel_at_period_end: sub?.cancel_at_period_end === 1,
    trial_days_left: trialDaysLeft,
    is_school_license: (!!sub?.school_license_code && isActive) || classGroupFreeAccess,
    is_free_access: manualFreeAccess,
    free_access_until: manualFreeAccess ? student.free_access_until : null,
    free_access_days_left: freeAccessDaysLeft,
    has_stripe_customer: !!student.stripe_customer_id,
    teacher_credits_available: teacherCreditsAvailable,
    teacher_credits_name: teacherCreditsName,
    subject_licenses: subjectLicenses,
  }, 200, env);
}

/* ================= STRIPE CUSTOMER PORTAL ================= */
export async function handleCustomerPortal(request, env) {
  // Schüler-ID kommt zwingend aus dem Token
  const student_id = await getAuthenticatedStudentId(request, env);
  if (!student_id) {
    return jsonResponse({ error: 'Bitte erneut anmelden.' }, 401, env);
  }

  const student = await env.DB.prepare(
    'SELECT stripe_customer_id FROM students WHERE id = ?'
  ).bind(student_id).first();

  if (!student?.stripe_customer_id) {
    return jsonResponse({ error: 'Kein Stripe-Konto gefunden.' }, 404, env);
  }

  const allowedOrigin = env.ALLOWED_ORIGIN || 'https://myabiflow.de';
  const session = await stripeRequest('/billing_portal/sessions', {
    'customer': student.stripe_customer_id,
    'return_url': `${allowedOrigin}/abo.html`,
  }, env);

  if (session.error) {
    console.error('Portal Error:', session.error.message);
    return jsonResponse({ error: 'Fehler beim Öffnen des Kundenportals.' }, 500, env);
  }

  return jsonResponse({ url: session.url }, 200, env);
}

/* ================= TRIAL STARTEN ================= */
export async function handleStartTrial(request, env) {
  // Schüler-ID kommt zwingend aus dem Token
  const student_id = await getAuthenticatedStudentId(request, env);
  if (!student_id) {
    return jsonResponse({ error: 'Bitte erneut anmelden.' }, 401, env);
  }

  const student = await env.DB.prepare(
    'SELECT id, subscription_status, trial_end FROM students WHERE id = ?'
  ).bind(student_id).first();

  if (!student) {
    return jsonResponse({ error: 'Schüler nicht gefunden.' }, 404, env);
  }

  // Trial nur einmal erlauben
  if (student.trial_end) {
    return jsonResponse({ error: 'Testphase wurde bereits genutzt.' }, 400, env);
  }

  const trialEnd = new Date(Date.now() + 3 * 86400000).toISOString(); // 3 Tage
  const now = new Date().toISOString();

  await env.DB.prepare(
    'UPDATE students SET subscription_status = ?, subscription_plan = ?, trial_end = ? WHERE id = ?'
  ).bind('trialing', 'trial', trialEnd, student_id).run();

  await env.DB.prepare(`
    INSERT INTO subscriptions (id, student_id, plan, status, trial_end, created_at, updated_at)
    VALUES (?, ?, 'trial', 'trialing', ?, ?, ?)
  `).bind(crypto.randomUUID(), student_id, trialEnd, now, now).run();

  return jsonResponse({
    status: 'trialing',
    trial_end: trialEnd,
    trial_days_left: 3,
  }, 200, env);
}

/* ================= SCHULCODE / SCHULLIZENZ EINLÖSEN ================= */
export async function handleRedeemLicense(request, env) {
  const { license_code } = await request.json();

  if (!license_code) {
    return jsonResponse({ error: 'Schulcode erforderlich.' }, 400, env);
  }

  // Schüler-ID kommt zwingend aus dem Token (Body-Wert wäre IDOR)
  const student_id = await getAuthenticatedStudentId(request, env);
  if (!student_id) {
    return jsonResponse({ error: 'Bitte erneut anmelden.' }, 401, env);
  }

  // Schulcode in class_passwords suchen
  const license = await env.DB.prepare(
    'SELECT id, label, free_access FROM class_passwords WHERE UPPER(password) = UPPER(?) AND active = 1'
  ).bind(license_code.trim()).first();

  if (!license) {
    // Fallback: In Fachschafts-Lizenzen suchen
    const now = new Date().toISOString();
    const subjectLicense = await env.DB.prepare(
      'SELECT id, label, subject FROM subject_licenses WHERE UPPER(code) = UPPER($1) AND active = 1 AND (expires_at IS NULL OR expires_at > $2)'
    ).bind(license_code.trim(), now).first();

    if (!subjectLicense) {
      return jsonResponse({ error: 'Ungültiger oder abgelaufener Code.' }, 404, env);
    }

    // Doppelt-Einlösen verhindern
    const existing = await env.DB.prepare(
      'SELECT 1 FROM student_subject_licenses WHERE student_id = $1 AND subject_license_id = $2'
    ).bind(student_id, subjectLicense.id).first();
    if (existing) {
      return jsonResponse({ error: 'Dieser Fachcode wurde bereits eingelöst.', subject: subjectLicense.subject }, 409, env);
    }

    // Fachcode einlösen
    await env.DB.prepare(
      'INSERT INTO student_subject_licenses (id, student_id, subject_license_id, redeemed_at) VALUES ($1, $2, $3, $4)'
    ).bind(crypto.randomUUID(), student_id, subjectLicense.id, now).run();

    return jsonResponse({
      status: 'subject_license_active',
      subject: subjectLicense.subject,
      school: subjectLicense.label,
      message: `Fachcode aktiviert! Du hast jetzt kostenlosen Zugang zu ${subjectLicense.subject}.`
    }, 200, env);
  }

  const now = new Date().toISOString();

  if (license.free_access === 1) {
    // Kostenloser Schulcode: Vollzugang + class_group setzen
    const periodEnd = new Date(Date.now() + 365 * 86400000).toISOString();

    await env.DB.prepare(
      'UPDATE students SET subscription_status = ?, subscription_plan = ?, class_group = ? WHERE id = ?'
    ).bind('active', 'school', license.label, student_id).run();

    await env.DB.prepare(`
      INSERT INTO subscriptions (id, student_id, plan, status, current_period_end, school_license_code, created_at, updated_at)
      VALUES (?, ?, 'school', 'active', ?, ?, ?, ?)
    `).bind(crypto.randomUUID(), student_id, periodEnd, license_code.trim(), now, now).run();

    return jsonResponse({
      status: 'active',
      plan: 'school',
      school: license.label,
      free_access: true,
      current_period_end: periodEnd,
    }, 200, env);
  } else {
    // Schulcode ohne free_access: Nur class_group setzen (Abo weiterhin noetig)
    await env.DB.prepare(
      'UPDATE students SET class_group = ? WHERE id = ?'
    ).bind(license.label, student_id).run();

    return jsonResponse({
      status: 'linked',
      school: license.label,
      free_access: false,
      message: 'Deine Schule wurde gespeichert. Bitte w\u00e4hle einen Plan, um myAbiFlow zu nutzen.',
    }, 200, env);
  }
}

/* ================= STRIPE WEBHOOK-SIGNATUR VERIFIZIEREN ================= */
async function verifyStripeSignature(payload, header, secret) {
  try {
    const parts = header.split(',').reduce((acc, part) => {
      const [key, value] = part.split('=');
      acc[key.trim()] = value;
      return acc;
    }, {});

    const timestamp = parts['t'];
    const signature = parts['v1'];

    if (!timestamp || !signature) return false;

    // Zeitfenster prüfen (5 Minuten Toleranz)
    const age = Math.abs(Date.now() / 1000 - parseInt(timestamp));
    if (age > 300) return false;

    // HMAC-SHA256 berechnen
    const signedPayload = `${timestamp}.${payload}`;
    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(signedPayload));
    const computed = [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, '0')).join('');

    // Timing-safe Vergleich
    if (computed.length !== signature.length) return false;
    let result = 0;
    for (let i = 0; i < computed.length; i++) {
      result |= computed.charCodeAt(i) ^ signature.charCodeAt(i);
    }
    return result === 0;
  } catch {
    return false;
  }
}
