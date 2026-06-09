// Handler: Email (Unsubscribe, Reminder Emails, Retention)
import { jsonResponse, safeJsonParse } from '../utils.js';
import { SUBJECT_TYPES_MAP, SUBJECT_NAMES, SUBJECT_ICONS } from './student.js';

// TEST-MODUS: Alle Retention-Emails gehen nur an diese Adresse
// Auf false setzen wenn alles passt, dann bekommen alle Schüler die Emails
const RETENTION_TEST_MODE = false;
const RETENTION_TEST_EMAIL = "info@myabiflow.de";

/* ================= UNSUBSCRIBE ================= */
export async function handleUnsubscribe(request, env) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token");
  if (!token) {
    return new Response(unsubscribePage("Ungültiger Link."), { status: 400, headers: { "Content-Type": "text/html; charset=utf-8" } });
  }

  try {
    // Token = base64(name_lower:timestamp:hmac)
    const decoded = atob(token);
    const parts = decoded.split(":");
    if (parts.length < 3) throw new Error("Ungültig");
    const hmac = parts.pop();
    const ts = parseInt(parts.pop(), 10);
    const nameLower = parts.join(":");

    // Token max 7 Tage gültig
    if (Date.now() - ts > 7 * 86400000) {
      return new Response(unsubscribePage("Dieser Link ist abgelaufen."), { status: 400, headers: { "Content-Type": "text/html; charset=utf-8" } });
    }

    // HMAC verifizieren
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(env.ACCESS_PASSWORD), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
    const payload = `${nameLower}:${ts}`;
    const sigBytes = new Uint8Array(hmac.match(/.{2}/g).map(b => parseInt(b, 16)));
    const valid = await crypto.subtle.verify("HMAC", key, sigBytes, new TextEncoder().encode(payload));
    if (!valid) throw new Error("Ungültig");

    await env.DB.prepare("UPDATE students SET reminder_interval = 0, retention_optout = 1 WHERE name_lower = ?").bind(nameLower).run();

    return new Response(unsubscribePage("Du erhältst ab sofort keine Emails mehr von myAbiFlow. Du kannst die Erinnerungen jederzeit in der App wieder aktivieren."), {
      status: 200, headers: { "Content-Type": "text/html; charset=utf-8" }
    });
  } catch {
    return new Response(unsubscribePage("Ungültiger oder abgelaufener Link."), { status: 400, headers: { "Content-Type": "text/html; charset=utf-8" } });
  }
}

export function unsubscribePage(message) {
  return `<!DOCTYPE html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>myAbiFlow – Abmeldung</title><style>body{font-family:system-ui,sans-serif;display:flex;justify-content:center;align-items:center;min-height:100vh;margin:0;background:#f0f0f5;color:#333}div{background:#fff;padding:2rem;border-radius:12px;max-width:400px;text-align:center;box-shadow:0 2px 12px rgba(0,0,0,.1)}h2{margin-top:0}a{color:#2563eb}</style></head><body><div><h2>myAbiFlow</h2><p>${message}</p><a href="https://myabiflow.de">Zurück zur App</a></div></body></html>`;
}

/* ================= EMAIL-ERINNERUNGEN (CRON) ================= */
export async function generateUnsubscribeToken(nameLower, env) {
  const ts = Date.now();
  const payload = `${nameLower}:${ts}`;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(env.ACCESS_PASSWORD), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  const hmac = [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, "0")).join("");
  return btoa(`${nameLower}:${ts}:${hmac}`);
}

// Prüfungstermine (synchron mit index.html)
export const ABITUR_DATES_Q13 = {
  chemie: "2026-04-24", german: "2026-04-28", english: "2026-04-30",
  mathe: "2026-05-06", french: "2026-05-08",
  history: { gA: "2026-05-11", eA: "2026-05-13" },
  pug: { gA: "2026-05-11", eA: "2026-05-13" },
  wr: { gA: "2026-05-11", eA: "2026-05-13" },
  italian: { gA: "2026-05-11", eA: "2026-05-13" },
  ethik: { gA: "2026-05-11", eA: "2026-05-13" },
  religion: { gA: "2026-05-11", eA: "2026-05-13" },
  katholisch: { gA: "2026-05-11", eA: "2026-05-13" },
  geographie: { gA: "2026-05-11", eA: "2026-05-13" },
  latein: { gA: "2026-05-11", eA: "2026-05-13" },
  physik: { gA: "2026-05-11", eA: "2026-05-13" },
  biologie: { gA: "2026-05-11", eA: "2026-05-13" }
};

// customDates: optional { fach: "YYYY-MM-DD" } — vom Schüler eingetragene Termine
// haben Vorrang vor den festen Standard-Terminen.
export function getExamDateStr(subject, isEa, customDates) {
  if (customDates && typeof customDates[subject] === "string" && customDates[subject]) {
    return customDates[subject];
  }
  const d = ABITUR_DATES_Q13[subject];
  if (!d) return null;
  if (typeof d === "string") return d;
  return isEa ? d.eA : d.gA;
}

export function daysUntilExam(subject, isEa, customDates) {
  const dateStr = getExamDateStr(subject, isEa, customDates);
  if (!dateStr) return null;
  const exam = new Date(dateStr + "T00:00:00");
  const now = new Date(); now.setHours(0, 0, 0, 0);
  return Math.ceil((exam - now) / 86400000);
}

// Stichtag: Sobald alle Prüfungen (inkl. Kolloquium) vorbei sind, werden keine
// automatischen Erinnerungs-/Retention-Mails mehr verschickt (ab 10.06.2026).
// Gilt nur für Fächer OHNE eingetragenen Termin (z.B. mündliche Prüfungen);
// wer einen späteren Termin einträgt, bekommt weiterhin Mails (siehe examUpcoming).
export const NO_EXAMS_AFTER = "2026-06-10";

export function examsOver() {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return today >= new Date(NO_EXAMS_AFTER + "T00:00:00");
}

// Steht die Prüfung für dieses Fach noch aus?
// - Bekanntes Datum (Standard ODER eingetragen): noch nicht vorbei → offen
// - Kein Datum (z.B. mündlich ohne eingetragenen Termin): offen bis zum Stichtag
export function examUpcoming(subject, isEa, customDates) {
  const dateStr = getExamDateStr(subject, isEa, customDates);
  if (dateStr) {
    return daysUntilExam(subject, isEa, customDates) >= 0;
  }
  return !examsOver();
}

// Hat der Schüler noch mindestens eine ausstehende Prüfung?
export function hasUpcomingExam(examSubjects, customDates) {
  const eaSubject = examSubjects?.ea || null;
  const all = [...(examSubjects?.written || []), ...(examSubjects?.oral || [])];
  return all.some(subj => examUpcoming(subj, subj === eaSubject, customDates));
}

export function buildReminderEmail(studentName, overdueSubjects, unsubscribeUrl, eaSubject, customDates) {
  const rows = overdueSubjects.map(s => {
    const icon = SUBJECT_ICONS[s.subject] || "📚";
    const name = SUBJECT_NAMES[s.subject] || s.subject;
    const days = s.daysSince === null ? "noch nie geübt" : `zuletzt vor ${s.daysSince} Tagen`;
    const isEa = s.subject === eaSubject;
    const level = isEa ? "eA" : "gA";
    const daysLeft = daysUntilExam(s.subject, isEa, customDates);
    const countdown = daysLeft !== null && daysLeft > 0
      ? `<span style="color:#dc2626;font-weight:600">noch ${daysLeft} Tage bis zur Prüfung</span>`
      : daysLeft === 0 ? `<span style="color:#dc2626;font-weight:600">Prüfung HEUTE!</span>` : "";
    return `<tr>
<td style="padding:8px 12px;font-size:16px">${icon} <strong>${name}</strong> <span style="color:#888;font-size:12px">(${level})</span></td>
<td style="padding:8px 12px;font-size:14px"><span style="color:#666">${days}</span>${countdown ? "<br>" + countdown : ""}</td>
</tr>`;
  }).join("");

  return `<!DOCTYPE html><html lang="de"><head><meta charset="utf-8"></head><body style="font-family:system-ui,sans-serif;background:#f0f0f5;padding:20px;margin:0">
<div style="max-width:500px;margin:0 auto;background:#fff;border-radius:12px;padding:24px;box-shadow:0 2px 12px rgba(0,0,0,.1)">
<a href="https://myabiflow.de" style="display:block;text-align:center;margin-bottom:20px;text-decoration:none"><img src="https://myabiflow.de/logo-v2.png" alt="myAbiFlow" width="140" style="width:140px;height:auto" /></a>
<h2 style="color:#2563eb;margin-top:0">myAbiFlow – Erinnerung</h2>
<p>Hallo ${studentName},</p>
<p>du hast folgende Abifächer seit einiger Zeit nicht mehr geübt:</p>
<table style="width:100%;border-collapse:collapse;margin:16px 0">${rows}</table>
<p style="text-align:center;margin:24px 0">
<a href="https://myabiflow.de" style="background:#2563eb;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block">Jetzt üben →</a>
</p>
<p style="font-size:12px;color:#999;margin-top:24px;border-top:1px solid #eee;padding-top:12px">
Du kannst die Erinnerungsfrequenz jederzeit in der App ändern.<br>
<a href="${unsubscribeUrl}" style="color:#999">Erinnerungen abbestellen</a>
</p>
</div></body></html>`;
}

/* ================= RETENTION-EMAILS (CRON) ================= */

// Resend-Throttle: max 5 Mails/Sekunde → 250 ms zwischen Aufrufen sicher unter Limit
// Bei 429 (Rate-Limit) bis zu 3x exponentiell warten und neu probieren.
let _lastResendSendAt = 0;
const RESEND_MIN_GAP_MS = 250;

async function sendEmail(env, to, subject, html) {
  const recipient = RETENTION_TEST_MODE ? RETENTION_TEST_EMAIL : to;
  const testPrefix = RETENTION_TEST_MODE ? `[TEST an ${to}] ` : "";

  // Throttle: warte mindestens RESEND_MIN_GAP_MS seit letztem Aufruf
  const elapsed = Date.now() - _lastResendSendAt;
  if (elapsed < RESEND_MIN_GAP_MS) {
    await new Promise(r => setTimeout(r, RESEND_MIN_GAP_MS - elapsed));
  }

  const body = JSON.stringify({
    from: "myAbiFlow <erinnerung@myabiflow.de>",
    reply_to: "info@myabiflow.de",
    to: [recipient],
    subject: testPrefix + subject,
    html
  });

  let lastErr = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    _lastResendSendAt = Date.now();
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json"
      },
      body
    });
    if (res.ok) return true;

    if (res.status === 429) {
      // Retry-Backoff: 600 ms, 1500 ms, 3000 ms
      const backoff = 600 * Math.pow(2.5, attempt);
      await new Promise(r => setTimeout(r, backoff));
      continue;
    }

    const errBody = await res.text();
    throw new Error(`Resend ${res.status}: ${errBody}`);
  }
  throw new Error(`Resend 429 nach Retries: ${lastErr || "Rate-Limit"}`);
}

// Gemeinsamer Email-Wrapper (Logo + Header + Footer mit Unsubscribe)
function emailWrapper(content, unsubscribeUrl) {
  return `<!DOCTYPE html><html lang="de"><head><meta charset="utf-8"></head>
<body style="font-family:system-ui,sans-serif;background:#f0f0f5;padding:20px;margin:0">
<div style="max-width:500px;margin:0 auto;background:#fff;border-radius:12px;padding:24px;box-shadow:0 2px 12px rgba(0,0,0,.1)">
<a href="https://myabiflow.de" style="display:block;text-align:center;margin-bottom:20px;text-decoration:none">
<img src="https://myabiflow.de/logo-v2.png" alt="myAbiFlow" width="140" style="width:140px;height:auto" />
</a>
${content}
<p style="font-size:12px;color:#999;margin-top:24px;border-top:1px solid #eee;padding-top:12px">
Du kannst die Emails jederzeit in der App unter Einstellungen deaktivieren.<br>
<a href="${unsubscribeUrl}" style="color:#999">Emails abbestellen</a>
</p>
</div></body></html>`;
}

// ── Onboarding-Mail 1: Willkommen (1 Tag nach Registrierung) ──
function buildWelcomeEmail(studentName, unsubscribeUrl) {
  return emailWrapper(`
<h2 style="color:#2563eb;margin-top:0">Willkommen bei myAbiFlow!</h2>
<p>Hallo ${studentName},</p>
<p>schön, dass du dabei bist! myAbiFlow hilft dir, dich gezielt aufs Abitur <strong>und auf anstehende Klausuren</strong> vorzubereiten – mit KI-gestütztem Feedback zu deinen Übungen.</p>
<h3 style="color:#333;font-size:16px">So startest du am besten:</h3>
<ol style="color:#555;line-height:1.8">
<li><strong>Abifächer einstellen</strong> – Geh in die Einstellungen und wähle deine Prüfungsfächer aus</li>
<li><strong>Erste Übung machen</strong> – Probier eine Klausurübung in deinem stärksten Fach aus</li>
<li><strong>Feedback lesen</strong> – Die KI zeigt dir genau, wo du stehst und was du verbessern kannst</li>
</ol>
<p style="text-align:center;margin:24px 0">
<a href="https://myabiflow.de" style="background:#2563eb;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block">Jetzt loslegen →</a>
</p>
<p style="color:#666;font-size:14px">Tipp: Regelmäßiges Üben bringt mehr als lange Lern-Sessions vor der Prüfung. Schon 20 Minuten pro Tag machen einen großen Unterschied!</p>
`, unsubscribeUrl);
}

// ── Onboarding-Mail 2: Noch nicht geübt (3 Tage nach Registrierung) ──
function buildNudgeEmail(studentName, unsubscribeUrl) {
  return emailWrapper(`
<h2 style="color:#2563eb;margin-top:0">Noch keine Übung gemacht?</h2>
<p>Hallo ${studentName},</p>
<p>du hast dich vor ein paar Tagen bei myAbiFlow angemeldet, aber noch keine Übung ausprobiert.</p>
<p>Egal ob du dich aufs Abitur oder auf eine <strong>anstehende Klausur</strong> vorbereitest – der Einstieg ist ganz einfach:</p>
<ul style="color:#555;line-height:1.8">
<li>Wähle ein Fach aus (z.B. Mathe, Deutsch oder Englisch)</li>
<li>Bearbeite eine Aufgabe – das dauert nur 10-15 Minuten</li>
<li>Du bekommst sofort detailliertes Feedback</li>
</ul>
<p style="text-align:center;margin:24px 0">
<a href="https://myabiflow.de" style="background:#2563eb;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block">Erste Übung starten →</a>
</p>
`, unsubscribeUrl);
}

// ── Inaktivitäts-Mail (7+ Tage keine Übung) ──
function buildInactivityEmail(studentName, daysSince, unsubscribeUrl) {
  return emailWrapper(`
<h2 style="color:#2563eb;margin-top:0">Wir vermissen dich!</h2>
<p>Hallo ${studentName},</p>
<p>deine letzte Übung ist <strong>${daysSince} Tage</strong> her. Regelmäßiges Üben ist der Schlüssel zum Erfolg – im Abitur <strong>und in jeder Klausur</strong>.</p>
<p>Schon eine kurze Übung pro Woche hilft, das Gelernte nicht zu vergessen und sicherer zu werden. Perfekt auch, um dich gezielt auf die nächste Schulaufgabe vorzubereiten.</p>
<p style="text-align:center;margin:24px 0">
<a href="https://myabiflow.de" style="background:#2563eb;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block">Weitermachen →</a>
</p>
`, unsubscribeUrl);
}

// ── Wöchentlicher Lernimpuls ──
const WEEKLY_TIPS = [
  { subject: "Deutsch", tip: "Übe heute eine Gedichtanalyse – achte besonders auf die sprachlichen Mittel und ihre Wirkung.", fach: "german" },
  { subject: "Mathe", tip: "Wiederhole Ableitungsregeln: Ketten-, Produkt- und Quotientenregel. Rechne 3 Aufgaben durch.", fach: "mathe" },
  { subject: "Englisch", tip: "Schreibe eine Mediation – übersetze einen deutschen Artikel sinngemäß ins Englische. Das wird oft unterschätzt!", fach: "english" },
  { subject: "Geschichte", tip: "Erstelle eine Zeitleiste zu einem Schwerpunktthema. Zusammenhänge erkennen ist wichtiger als Jahreszahlen auswendig lernen.", fach: "history" },
  { subject: "Deutsch", tip: "Übe eine Erörterung: These aufstellen, Pro-/Contra-Argumente sammeln, Schluss formulieren. 45 Minuten reichen.", fach: "german" },
  { subject: "Mathe", tip: "Stochastik: Übe Binomialverteilung und Hypothesentests. Diese Aufgaben kommen fast immer dran.", fach: "mathe" },
  { subject: "Englisch", tip: "Lies einen englischen Zeitungsartikel und fasse ihn in 5 Sätzen zusammen. Das trainiert dein Textverständnis.", fach: "english" },
];

function buildWeeklyEmail(studentName, tip, unsubscribeUrl) {
  return emailWrapper(`
<h2 style="color:#2563eb;margin-top:0">Dein Lernimpuls der Woche</h2>
<p>Hallo ${studentName},</p>
<p style="color:#666;font-size:14px;margin:0 0 12px">Ideal fürs Abitur – aber auch, um dich auf die nächste Klausur vorzubereiten.</p>
<div style="background:#f8fafc;border-left:4px solid #2563eb;padding:16px;border-radius:0 8px 8px 0;margin:16px 0">
<p style="margin:0;font-size:15px"><strong>${tip.subject}:</strong> ${tip.tip}</p>
</div>
<p style="text-align:center;margin:24px 0">
<a href="https://myabiflow.de" style="background:#2563eb;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block">Jetzt üben →</a>
</p>
`, unsubscribeUrl);
}

// ── Abitur-Start: Viel-Erfolg-Mail ──
function buildExamGoodLuckEmail(studentName, examSubject, examDate, unsubscribeUrl) {
  const subjectName = SUBJECT_NAMES[examSubject] || examSubject;
  const icon = SUBJECT_ICONS[examSubject] || "📚";
  return emailWrapper(`
<h2 style="color:#2563eb;margin-top:0">${icon} Viel Erfolg bei der Prüfung!</h2>
<p>Hallo ${studentName},</p>
<p>morgen ist es soweit – deine <strong>${subjectName}-Abiturprüfung</strong> steht an!</p>
<div style="background:#f0fdf4;border-left:4px solid #22c55e;padding:16px;border-radius:0 8px 8px 0;margin:16px 0">
<p style="margin:0;font-size:15px;color:#166534">Du hast dich vorbereitet und kannst das schaffen. Vertrau auf das, was du gelernt hast!</p>
</div>
<h3 style="color:#333;font-size:15px">Tipps für morgen:</h3>
<ul style="color:#555;line-height:1.8;font-size:14px">
<li>Lies die Aufgaben <strong>ganz durch</strong>, bevor du anfängst</li>
<li>Teile dir die Zeit gut ein – markiere dir Zwischenzeiten</li>
<li>Starte mit der Aufgabe, die dir am leichtesten fällt</li>
<li>Schreibe bei Textaufgaben immer etwas – leere Seiten geben null Punkte</li>
</ul>
<p style="text-align:center;font-size:24px;margin:20px 0">💪 Du packst das! 💪</p>
<p style="color:#666;font-size:13px;text-align:center">Das gesamte myAbiFlow-Team drückt dir die Daumen!</p>
`, unsubscribeUrl);
}

// ── Haupt-Funktion: Alle Retention-Emails senden ──
export async function sendRetentionEmails(env) {
  console.log("Cron: sendRetentionEmails gestartet");

  if (!env.RESEND_API_KEY) {
    console.error("Cron: RESEND_API_KEY nicht gesetzt — Abbruch!");
    return;
  }

  const now = Date.now();
  const BASE_URL = "https://myabiflow.de/api";

  // Alle Schüler laden die Retention-Mails bekommen können
  const { results: students } = await env.DB.prepare(
    `SELECT name, name_lower, email, created_at, onboarding_stage, retention_optout, exam_subjects, exam_dates
     FROM students
     WHERE email IS NOT NULL AND email != '' AND email != 'fehlt@unbekannt.de'
       AND retention_optout = 0`
  ).all();

  if (!students || students.length === 0) {
    console.log("Cron: Keine Schüler für Retention-Emails");
    return;
  }

  let sentCount = 0;

  for (const student of students) {
    try {
      const unsubToken = await generateUnsubscribeToken(student.name_lower, env);
      const unsubUrl = `${BASE_URL}/unsubscribe?token=${encodeURIComponent(unsubToken)}`;
      const createdAt = new Date(student.created_at).getTime();
      const daysSinceRegister = Math.floor((now - createdAt) / 86400000);
      const stage = student.onboarding_stage || 0;

      // ── Onboarding-Mail 1: Willkommen (nach 1 Tag) ──
      if (stage === 0 && daysSinceRegister >= 1) {
        console.log(`Sende Willkommens-Mail an ${student.name_lower}`);
        await sendEmail(env, student.email, "Willkommen bei myAbiFlow – so startest du am besten", buildWelcomeEmail(student.name, unsubUrl));
        await env.DB.prepare("UPDATE students SET onboarding_stage = 1 WHERE name_lower = ?").bind(student.name_lower).run();
        sentCount++;
        continue; // Max 1 Mail pro Schüler pro Cron-Run
      }

      // ── Onboarding-Mail 2: Nudge (nach 3 Tagen, nur wenn keine Übung) ──
      if (stage === 1 && daysSinceRegister >= 3) {
        const { results: activityRows } = await env.DB.prepare(
          "SELECT COUNT(*) as cnt FROM results WHERE LOWER(TRIM(student_name)) = ?"
        ).bind(student.name_lower).all();
        const hasResults = activityRows?.[0]?.cnt > 0;

        if (!hasResults) {
          console.log(`Sende Nudge-Mail an ${student.name_lower}`);
          await sendEmail(env, student.email, "myAbiFlow – Starte deine erste Übung", buildNudgeEmail(student.name, unsubUrl));
        }
        await env.DB.prepare("UPDATE students SET onboarding_stage = 2 WHERE name_lower = ?").bind(student.name_lower).run();
        sentCount++;
        continue;
      }

      // Ab hier: Nur für Schüler die Onboarding abgeschlossen haben (stage >= 2)
      if (stage < 2) continue;

      // Nach Ende der Prüfungsphase (Stichtag) keine Engagement-Mails mehr —
      // außer der Schüler hat noch eine Prüfung vor sich (z.B. eigener späterer Termin).
      if (examsOver()) {
        const examSubjects = safeJsonParse(student.exam_subjects, {});
        const customDates = safeJsonParse(student.exam_dates, {});
        if (!hasUpcomingExam(examSubjects, customDates)) continue;
      }

      // ── Inaktivitäts-Mail (7+ Tage keine Übung, max 1x pro 14 Tage) ──
      const { results: lastActivity } = await env.DB.prepare(
        "SELECT MAX(created_at) as last_date FROM results WHERE LOWER(TRIM(student_name)) = ?"
      ).bind(student.name_lower).all();

      const lastDate = lastActivity?.[0]?.last_date;
      if (lastDate) {
        const daysSinceActivity = Math.floor((now - new Date(lastDate).getTime()) / 86400000);

        if (daysSinceActivity >= 7) {
          // Prüfen ob letzte Erinnerung min. 14 Tage her
          const { results: lastReminder } = await env.DB.prepare(
            "SELECT last_reminder_sent FROM students WHERE name_lower = ?"
          ).bind(student.name_lower).all();
          const lastSent = lastReminder?.[0]?.last_reminder_sent;
          const daysSinceLastMail = lastSent ? Math.floor((now - new Date(lastSent).getTime()) / 86400000) : 999;

          if (daysSinceLastMail >= 14) {
            console.log(`Sende Inaktivitäts-Mail an ${student.name_lower} (${daysSinceActivity} Tage inaktiv)`);
            await sendEmail(env, student.email, "myAbiFlow – Wir vermissen dich!", buildInactivityEmail(student.name, daysSinceActivity, unsubUrl));
            await env.DB.prepare("UPDATE students SET last_reminder_sent = ? WHERE name_lower = ?").bind(new Date().toISOString(), student.name_lower).run();
            sentCount++;
            continue;
          }
        }
      }

      // ── Wöchentlicher Lernimpuls (nur Montags) ──
      const today = new Date();
      if (today.getUTCDay() === 1) { // Montag
        const lastSentRow = await env.DB.prepare(
          "SELECT last_reminder_sent FROM students WHERE name_lower = ?"
        ).bind(student.name_lower).first();
        const lastSent = lastSentRow?.last_reminder_sent;
        const daysSinceLastMail = lastSent ? Math.floor((now - new Date(lastSent).getTime()) / 86400000) : 999;

        if (daysSinceLastMail >= 6) { // Max 1 pro Woche
          const weekNum = Math.floor(now / (7 * 86400000));
          const tip = WEEKLY_TIPS[weekNum % WEEKLY_TIPS.length];
          console.log(`Sende Lernimpuls an ${student.name_lower}: ${tip.subject}`);
          await sendEmail(env, student.email, `myAbiFlow – Lernimpuls: ${tip.subject}`, buildWeeklyEmail(student.name, tip, unsubUrl));
          await env.DB.prepare("UPDATE students SET last_reminder_sent = ? WHERE name_lower = ?").bind(new Date().toISOString(), student.name_lower).run();
          sentCount++;
        }
      }

    } catch (err) {
      console.error(`Retention-Email-Fehler für ${student.name_lower}:`, err.message);
    }
  }

  // ── Abitur-Viel-Erfolg-Mails (Tag vor der Prüfung) ──
  // Separat, weil hier exam_subjects gebraucht werden
  const { results: examStudents } = await env.DB.prepare(
    `SELECT name, name_lower, email, exam_subjects, exam_dates
     FROM students
     WHERE email IS NOT NULL AND email != '' AND email != 'fehlt@unbekannt.de'
       AND retention_optout = 0 AND exam_subjects IS NOT NULL AND exam_subjects != '{}'`
  ).all();

  if (examStudents && examStudents.length > 0) {
    const tomorrow = new Date(now + 86400000);
    const tomorrowStr = tomorrow.toISOString().slice(0, 10); // YYYY-MM-DD

    for (const student of examStudents) {
      try {
        const examSubjects = safeJsonParse(student.exam_subjects, {});
        const customDates = safeJsonParse(student.exam_dates, {});
        const eaSubject = examSubjects.ea || null;
        const allExam = [...(examSubjects.written || []), ...(examSubjects.oral || [])];

        for (const subj of allExam) {
          const isEa = subj === eaSubject;
          const examDateStr = getExamDateStr(subj, isEa, customDates);
          if (examDateStr === tomorrowStr) {
            const unsubToken = await generateUnsubscribeToken(student.name_lower, env);
            const unsubUrl = `${BASE_URL}/unsubscribe?token=${encodeURIComponent(unsubToken)}`;
            const subjectName = SUBJECT_NAMES[subj] || subj;
            console.log(`Sende Viel-Erfolg-Mail an ${student.name_lower} für ${subjectName} (Prüfung: ${examDateStr})`);
            await sendEmail(env, student.email, `Morgen ist ${subjectName}-Abitur – Viel Erfolg! 💪`, buildExamGoodLuckEmail(student.name, subj, examDateStr, unsubUrl));
            sentCount++;
            break; // Max 1 Viel-Erfolg-Mail pro Schüler pro Tag
          }
        }
      } catch (err) {
        console.error(`Viel-Erfolg-Mail-Fehler für ${student.name_lower}:`, err.message);
      }
    }
  }

  console.log(`Cron: sendRetentionEmails fertig — ${sentCount} Emails gesendet`);
}

/* ================= BESTEHENDE ERINNERUNGS-EMAILS (CRON) ================= */
export async function sendReminderEmails(env) {
  console.log("Cron: sendReminderEmails gestartet");

  if (!env.RESEND_API_KEY) {
    console.error("Cron: RESEND_API_KEY nicht gesetzt — Abbruch!");
    return;
  }

  // Alle Schüler mit Email + aktiver Erinnerung laden
  const { results: students } = await env.DB.prepare(
    "SELECT name, name_lower, email, exam_subjects, exam_dates, reminder_interval, last_reminder_sent FROM students WHERE email IS NOT NULL AND email != '' AND reminder_interval > 0"
  ).all();

  console.log(`Cron: ${students?.length || 0} Schüler mit aktiver Erinnerung gefunden`);
  if (!students || students.length === 0) return;

  const now = Date.now();

  for (const student of students) {
    // Nicht öfter als reminder_interval senden
    if (student.last_reminder_sent) {
      const lastSent = new Date(student.last_reminder_sent).getTime();
      const daysSinceSent = Math.floor((now - lastSent) / 86400000);
      if (daysSinceSent < student.reminder_interval) continue;
    }

    const examSubjects = safeJsonParse(student.exam_subjects, {});
    const customDates = safeJsonParse(student.exam_dates, {});
    const eaSubject = examSubjects.ea || null;
    const allExam = [...(examSubjects.written || []), ...(examSubjects.oral || [])];
    if (allExam.length === 0) continue;

    // Letzte Aktivität pro Typ
    const { results: activityRows } = await env.DB.prepare(
      "SELECT type, MAX(created_at) as last_date FROM results WHERE LOWER(TRIM(student_name)) = ? GROUP BY type"
    ).bind(student.name_lower).all();

    const lastByType = {};
    for (const r of (activityRows || [])) {
      lastByType[r.type] = r.last_date;
    }

    // Überfällige Fächer ermitteln
    const overdue = [];
    for (const subj of allExam) {
      // Nur an Prüfungen erinnern, die noch nicht stattgefunden haben.
      // - Schriftliche Prüfungen haben einen Termin → vergangene fallen raus.
      // - Mündliche ohne eingetragenen Termin gelten bis zum Stichtag als offen.
      // - Eigener (späterer) Termin hat Vorrang → Mails laufen bis dahin weiter.
      if (!examUpcoming(subj, subj === eaSubject, customDates)) continue;

      const types = SUBJECT_TYPES_MAP[subj] || [];
      let lastDate = null;
      for (const t of types) {
        if (lastByType[t]) {
          const d = new Date(lastByType[t]).getTime();
          if (!lastDate || d > lastDate) lastDate = d;
        }
      }
      const daysSince = lastDate ? Math.floor((now - lastDate) / 86400000) : null;
      if (daysSince === null || daysSince >= student.reminder_interval) {
        overdue.push({ subject: subj, daysSince });
      }
    }

    if (overdue.length === 0) continue;

    // Unsubscribe-Token + Email bauen
    const unsubToken = await generateUnsubscribeToken(student.name_lower, env);
    const unsubUrl = `https://myabiflow.de/api/unsubscribe?token=${encodeURIComponent(unsubToken)}`;
    const html = buildReminderEmail(student.name, overdue, unsubUrl, eaSubject, customDates);

    const count = overdue.length;
    const subject = count === 1
      ? `myAbiFlow – ${SUBJECT_NAMES[overdue[0].subject] || overdue[0].subject} wartet auf dich`
      : `myAbiFlow – ${count} Abifächer warten auf dich`;

    // Via gemeinsame sendEmail-Funktion (mit Throttling + Retry bei 429)
    try {
      console.log(`Sende Erinnerungsmail an ${student.name_lower} (${student.email}), ${overdue.length} Fächer überfällig`);
      await sendEmail(env, student.email, subject, html);
      console.log(`Email erfolgreich gesendet an ${student.name_lower}`);
      await env.DB.prepare(
        "UPDATE students SET last_reminder_sent = ? WHERE name_lower = ?"
      ).bind(new Date().toISOString(), student.name_lower).run();
    } catch (err) {
      console.error(`Email-Fehler für ${student.name_lower}:`, err.message);
      // last_reminder_sent bleibt unverändert → nächster Versuch morgen
    }
  }
}
