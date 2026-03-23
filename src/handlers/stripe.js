// Handler: Stripe-Integration (Checkout, Webhooks, Abo-Status, Portal)
import { jsonResponse } from '../utils.js';

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
function getPriceId(plan, env) {
  const map = {
    'monthly':   env.STRIPE_PRICE_MONTHLY,     // 15€/Monat, recurring
    '6months':   env.STRIPE_PRICE_6MONTHS,      // 70€ einmalig
    '12months':  env.STRIPE_PRICE_12MONTHS,     // 120€ einmalig
    '24months':  env.STRIPE_PRICE_24MONTHS,     // 180€ einmalig
    'abitur':    env.STRIPE_PRICE_ABITUR,        // 25€ einmalig, bis 30.06.
  };
  return map[plan] || null;
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
  const { plan, student_id, student_name } = await request.json();

  if (!plan || !student_id) {
    return jsonResponse({ error: 'Plan und Student-ID erforderlich.' }, 400, env);
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
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        const studentId = session.metadata?.student_id;
        const plan = session.metadata?.plan || 'unknown';
        const customerId = session.customer;

        if (!studentId) break;

        if (isRecurring(plan)) {
          // Abo-Modus: subscription_id speichern
          const subId = session.subscription;
          const periodEnd = new Date(Date.now() + 30 * 86400000).toISOString();

          await env.DB.prepare(`
            INSERT INTO subscriptions (id, student_id, stripe_customer_id, stripe_subscription_id, plan, status, current_period_end, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, 'active', ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET status='active', plan=?, stripe_subscription_id=?, current_period_end=?, updated_at=?
          `).bind(
            crypto.randomUUID(), studentId, customerId, subId, plan, periodEnd, now, now,
            plan, subId, periodEnd, now
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
          const periodEnd = sub.current_period_end
            ? new Date(sub.current_period_end * 1000).toISOString()
            : null;

          await env.DB.prepare(
            'UPDATE students SET subscription_status = ? WHERE id = ?'
          ).bind(status, student.id).run();

          await env.DB.prepare(`
            UPDATE subscriptions SET status = ?, current_period_end = ?, cancel_at_period_end = ?, updated_at = ?
            WHERE student_id = ? AND stripe_subscription_id = ?
          `).bind(status, periodEnd, sub.cancel_at_period_end ? 1 : 0, now, student.id, sub.id).run();
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
  const { student_id } = await request.json();

  if (!student_id) {
    return jsonResponse({ error: 'Student-ID erforderlich.' }, 400, env);
  }

  const student = await env.DB.prepare(
    'SELECT id, subscription_status, subscription_plan, trial_end, stripe_customer_id FROM students WHERE id = ?'
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
    if (sub.status === 'active' && sub.current_period_end) {
      isActive = new Date(sub.current_period_end) > new Date();
    } else if (sub.status === 'trialing' && student.trial_end) {
      isActive = new Date(student.trial_end) > new Date();
    } else if (sub.school_license_code) {
      isActive = true; // Schullizenzen sind immer aktiv
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
  }

  return jsonResponse({
    status: statusLabel,
    plan: sub?.plan || student.subscription_plan || 'free',
    current_period_end: sub?.current_period_end || null,
    cancel_at_period_end: sub?.cancel_at_period_end === 1,
    trial_days_left: trialDaysLeft,
    is_school_license: !!sub?.school_license_code,
    has_stripe_customer: !!student.stripe_customer_id,
  }, 200, env);
}

/* ================= STRIPE CUSTOMER PORTAL ================= */
export async function handleCustomerPortal(request, env) {
  const { student_id } = await request.json();

  if (!student_id) {
    return jsonResponse({ error: 'Student-ID erforderlich.' }, 400, env);
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
  const { student_id } = await request.json();

  if (!student_id) {
    return jsonResponse({ error: 'Student-ID erforderlich.' }, 400, env);
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

/* ================= SCHULLIZENZ EINLÖSEN ================= */
export async function handleRedeemLicense(request, env) {
  const { student_id, license_code } = await request.json();

  if (!student_id || !license_code) {
    return jsonResponse({ error: 'Student-ID und Lizenzcode erforderlich.' }, 400, env);
  }

  // Lizenzcode in class_passwords suchen (Format: SAG-2026-XXXX-XXXX)
  const license = await env.DB.prepare(
    'SELECT id, label FROM class_passwords WHERE password = ? AND active = 1'
  ).bind(license_code.trim().toUpperCase()).first();

  if (!license) {
    return jsonResponse({ error: 'Ungültiger oder abgelaufener Lizenzcode.' }, 404, env);
  }

  const now = new Date().toISOString();
  // Schullizenz = 1 Jahr ab jetzt
  const periodEnd = new Date(Date.now() + 365 * 86400000).toISOString();

  await env.DB.prepare(
    'UPDATE students SET subscription_status = ?, subscription_plan = ?, class_group = ? WHERE id = ?'
  ).bind('active', 'school', license.label, student_id).run();

  await env.DB.prepare(`
    INSERT INTO subscriptions (id, student_id, plan, status, current_period_end, school_license_code, created_at, updated_at)
    VALUES (?, ?, 'school', 'active', ?, ?, ?, ?)
  `).bind(crypto.randomUUID(), student_id, periodEnd, license_code.trim().toUpperCase(), now, now).run();

  return jsonResponse({
    status: 'active',
    plan: 'school',
    school: license.label,
    current_period_end: periodEnd,
  }, 200, env);
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
