// Handler: Email (Unsubscribe, Reminder Emails)
import { jsonResponse } from '../utils.js';
import { SUBJECT_TYPES_MAP, SUBJECT_NAMES, SUBJECT_ICONS } from './student.js';

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

    await env.DB.prepare("UPDATE students SET reminder_interval = 0 WHERE name_lower = ?").bind(nameLower).run();

    return new Response(unsubscribePage("Du erhältst ab sofort keine Erinnerungs-Emails mehr. Du kannst die Erinnerungen jederzeit in der App wieder aktivieren."), {
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

export function getExamDateStr(subject, isEa) {
  const d = ABITUR_DATES_Q13[subject];
  if (!d) return null;
  if (typeof d === "string") return d;
  return isEa ? d.eA : d.gA;
}

export function daysUntilExam(subject, isEa) {
  const dateStr = getExamDateStr(subject, isEa);
  if (!dateStr) return null;
  const exam = new Date(dateStr + "T00:00:00");
  const now = new Date(); now.setHours(0, 0, 0, 0);
  return Math.ceil((exam - now) / 86400000);
}

export function buildReminderEmail(studentName, overdueSubjects, unsubscribeUrl, eaSubject) {
  const rows = overdueSubjects.map(s => {
    const icon = SUBJECT_ICONS[s.subject] || "📚";
    const name = SUBJECT_NAMES[s.subject] || s.subject;
    const days = s.daysSince === null ? "noch nie geübt" : `zuletzt vor ${s.daysSince} Tagen`;
    const isEa = s.subject === eaSubject;
    const level = isEa ? "eA" : "gA";
    const daysLeft = daysUntilExam(s.subject, isEa);
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

export async function sendReminderEmails(env) {
  console.log("Cron: sendReminderEmails gestartet");

  if (!env.RESEND_API_KEY) {
    console.error("Cron: RESEND_API_KEY nicht gesetzt — Abbruch!");
    return;
  }

  // Alle Schüler mit Email + aktiver Erinnerung laden
  const { results: students } = await env.DB.prepare(
    "SELECT name, name_lower, email, exam_subjects, reminder_interval, last_reminder_sent FROM students WHERE email IS NOT NULL AND email != '' AND reminder_interval > 0"
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

    const examSubjects = JSON.parse(student.exam_subjects || "{}");
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
    const unsubUrl = `https://sag-abi-mediation-api.sanktannagymnasium.workers.dev/api/unsubscribe?token=${encodeURIComponent(unsubToken)}`;
    const eaSubject = examSubjects.ea || null;
    const html = buildReminderEmail(student.name, overdue, unsubUrl, eaSubject);

    const count = overdue.length;
    const subject = count === 1
      ? `myAbiFlow – ${SUBJECT_NAMES[overdue[0].subject] || overdue[0].subject} wartet auf dich`
      : `myAbiFlow – ${count} Abifächer warten auf dich`;

    // Via Resend senden
    try {
      console.log(`Sende Erinnerungsmail an ${student.name_lower} (${student.email}), ${overdue.length} Fächer überfällig`);
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${env.RESEND_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          from: "myAbiFlow <erinnerung@myabiflow.de>",
          to: [student.email],
          subject,
          html
        })
      });

      if (!res.ok) {
        const errBody = await res.text();
        console.error(`Resend-Fehler für ${student.name_lower} (${res.status}):`, errBody);
        continue; // last_reminder_sent NICHT updaten → nächster Versuch morgen
      }

      console.log(`Email erfolgreich gesendet an ${student.name_lower}`);
      await env.DB.prepare(
        "UPDATE students SET last_reminder_sent = ? WHERE name_lower = ?"
      ).bind(new Date().toISOString(), student.name_lower).run();
    } catch (err) {
      console.error(`Email-Fehler für ${student.name_lower}:`, err.message);
    }
  }
}
