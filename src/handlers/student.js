// Handler: Student (Login, Check, Preferences, Reminders)
import { jsonResponse } from '../utils.js';
import { generateToken, safeCompare, hashPassword, verifyPassword } from '../auth.js';

/* ================= LOGIN HANDLER ================= */
export async function handleLogin(request, env) {
  const { password } = await request.json();

  if (!env.ACCESS_PASSWORD) {
    return jsonResponse({ error: "Server nicht konfiguriert." }, 500, env);
  }

  if (!password || typeof password !== "string") {
    return jsonResponse({ success: false, error: "Passwort erforderlich." }, 400, env);
  }

  const valid = await safeCompare(password, env.ACCESS_PASSWORD);
  if (valid) {
    const token = await generateToken(env);
    return jsonResponse({ success: true, token }, 200, env);
  } else {
    return jsonResponse({ success: false, error: "Falsches Passwort." }, 401, env);
  }
}

/* ================= CHECK STUDENT (Register / Login) ================= */
export async function handleCheckStudent(request, env) {
  const { password, personal_password, student_name, mode, level, email, trial_used } = await request.json();

  if (!env.ACCESS_PASSWORD) {
    return jsonResponse({ error: "Server nicht konfiguriert." }, 500, env);
  }
  if (!student_name || typeof student_name !== "string" || !student_name.trim()) {
    return jsonResponse({ success: false, error: "Name erforderlich." }, 400, env);
  }
  if (mode !== "register" && mode !== "login") {
    return jsonResponse({ success: false, error: "Ung\u00fcltiger Modus." }, 400, env);
  }
  if (!personal_password || typeof personal_password !== "string") {
    return jsonResponse({ success: false, error: "Passwort erforderlich." }, 400, env);
  }
  if (mode === "register" && personal_password.length < 6) {
    return jsonResponse({ success: false, error: "Passwort muss mindestens 6 Zeichen haben." }, 400, env);
  }
  if (mode === "register") {
    if (!email || typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return jsonResponse({ success: false, error: "Bitte gib eine g\u00fcltige E-Mail-Adresse ein." }, 400, env);
    }
    // Wegwerf-Mail-Domains blockieren
    const emailDomain = email.split("@")[1]?.toLowerCase();
    const disposableDomains = [
      "tempmail.com","temp-mail.org","tempmailo.com","temp-mail.io","tempmail.de",
      "guerrillamail.com","guerrillamail.de","guerrillamail.net","guerrillamailblock.com","grr.la",
      "sharklasers.com","guerrillamail.info","guerrillamail.biz","guerrillamail.org",
      "mailinator.com","trashmail.com","trashmail.de","trashmail.net","trashmail.me",
      "throwaway.email","throwaway.com","yopmail.com","yopmail.fr","yopmail.net",
      "10minutemail.com","10minute.email","10minmail.com",
      "minutemail.com","tempail.com","tempr.email","dispostable.com",
      "maildrop.cc","mailnesia.com","mailcatch.com","fakeinbox.com",
      "mailnull.com","spamgourmet.com","mytrashmail.com","getairmail.com",
      "mohmal.com","emailondeck.com","getnada.com","burnermail.io",
      "inboxbear.com","anonbox.net","discard.email","discardmail.com",
      "harakirimail.com","mailexpire.com","meltmail.com","nospam.ze.tc",
      "trash-mail.com","wegwerfmail.de","wegwerfmail.net","wegwerf-email.de",
      "spoofmail.de","muellmail.com","einrot.com","spamfree24.org",
      "trashmail.org","byom.de","emailfake.com","crazymailing.com",
      "tmail.ws","tempinbox.com","mailtemp.net"
    ];
    if (disposableDomains.includes(emailDomain)) {
      return jsonResponse({ success: false, error: "Bitte verwende eine richtige E-Mail-Adresse (keine Wegwerf-Mail)." }, 400, env);
    }
  }

  const nameLower = student_name.trim().toLowerCase();
  const existing = await env.DB.prepare(
    "SELECT id, name, level, salt, hash FROM students WHERE name_lower = ?"
  ).bind(nameLower).first();

  if (mode === "register") {
    if (existing) {
      return jsonResponse({ success: false, error: "Dieser Name ist bereits vergeben. Bitte f\u00fcge eine Zahl an (z.B. Max M. 2)." }, 409, env);
    }

    // Pruefen ob mit dieser E-Mail schon ein Trial gestartet wurde
    const emailLower = email.trim().toLowerCase();
    const existingEmail = await env.DB.prepare(
      "SELECT id, trial_end FROM students WHERE LOWER(email) = ?"
    ).bind(emailLower).first();

    let trialAllowed = true;
    if (existingEmail && existingEmail.trial_end) {
      trialAllowed = false; // Diese E-Mail hatte schon einen Trial
    }
    if (trial_used) {
      trialAllowed = false; // Geraete-Flag: Trial wurde auf diesem Geraet schon genutzt
    }

    const salt = crypto.randomUUID();
    const hash = await hashPassword(personal_password, salt);
    await env.DB.prepare(
      "INSERT INTO students (name, name_lower, level, salt, hash, hidden_subjects, email, created_at) VALUES (?, ?, ?, ?, ?, '[]', ?, ?)"
    ).bind(student_name.trim(), nameLower, level || "", salt, hash, emailLower, new Date().toISOString()).run();

    const newStudent = await env.DB.prepare(
      "SELECT id FROM students WHERE name_lower = ?"
    ).bind(nameLower).first();

    if (newStudent && trialAllowed) {
      // Trial starten (3 Tage)
      const trialEnd = new Date(Date.now() + 3 * 86400000).toISOString();
      const now = new Date().toISOString();
      await env.DB.prepare(
        "UPDATE students SET subscription_status = 'trialing', subscription_plan = 'trial', trial_end = ? WHERE id = ?"
      ).bind(trialEnd, newStudent.id).run();
      await env.DB.prepare(`
        INSERT INTO subscriptions (id, student_id, plan, status, trial_end, created_at, updated_at)
        VALUES (?, ?, 'trial', 'trialing', ?, ?, ?)
      `).bind(crypto.randomUUID(), newStudent.id, trialEnd, now, now).run();
    }
    // Kein Trial erlaubt → Schueler wird ohne Trial erstellt (muss direkt zahlen)
  } else {
    if (!existing) {
      return jsonResponse({ success: false, error: "Name nicht gefunden. Bitte zuerst registrieren." }, 404, env);
    }
    if (!existing.hash || !existing.salt) {
      const salt = crypto.randomUUID();
      const hash = await hashPassword(personal_password, salt);
      await env.DB.prepare(
        "UPDATE students SET salt = ?, hash = ? WHERE id = ?"
      ).bind(salt, hash, existing.id).run();
    } else {
      const match = await verifyPassword(personal_password, existing.salt, existing.hash);
      if (!match) {
        return jsonResponse({ success: false, error: "Falsches Passwort." }, 401, env);
      }
    }
  }

  // Student-ID laden (für Stripe und Paywall)
  const student = await env.DB.prepare(
    "SELECT id, subscription_status, subscription_plan, class_group FROM students WHERE name_lower = ?"
  ).bind(nameLower).first();

  // Prüfen ob der Schulcode free_access hat (auch beim Login)
  let freeAccess = false;
  if (student?.class_group) {
    const cp = await env.DB.prepare(
      "SELECT free_access FROM class_passwords WHERE label = ? AND active = 1"
    ).bind(student.class_group).first();
    freeAccess = cp?.free_access === 1;
  }

  const token = await generateToken(env);
  return jsonResponse({
    success: true,
    token,
    student_id: student?.id || null,
    subscription_status: student?.subscription_status || "none",
    free_access: freeAccess
  }, 200, env);
}

/* ================= STUDENT PREFERENCES ================= */
export async function handleGetPreferences(request, env) {
  const { student_name } = await request.json();
  if (!student_name) return jsonResponse({ error: "Name erforderlich." }, 400, env);

  const nameLower = student_name.trim().toLowerCase();
  const student = await env.DB.prepare(
    "SELECT name, level, class_group, school, created_at, hidden_subjects, exam_subjects, reminder_interval, email FROM students WHERE name_lower = ?"
  ).bind(nameLower).first();
  if (!student) return jsonResponse({ error: "Schüler nicht gefunden." }, 404, env);

  return jsonResponse({
    success: true,
    profile: {
      name: student.name,
      level: student.level || "eA",
      class_group: student.class_group || "",
      school: student.school || "",
      created_at: student.created_at || ""
    },
    preferences: {
      hidden_subjects: JSON.parse(student.hidden_subjects || "[]"),
      exam_subjects: JSON.parse(student.exam_subjects || "{}"),
      reminder_interval: student.reminder_interval ?? 3,
      email: student.email || ""
    }
  }, 200, env);
}

export async function handleSavePreferences(request, env) {
  const { student_name, hidden_subjects, exam_subjects, reminder_interval, email } = await request.json();
  if (!student_name) return jsonResponse({ error: "Name erforderlich." }, 400, env);

  const nameLower = student_name.trim().toLowerCase();

  // Dynamisch nur die übergebenen Felder updaten
  const updates = [];
  const binds = [];

  if (Array.isArray(hidden_subjects)) {
    updates.push("hidden_subjects = ?");
    binds.push(JSON.stringify(hidden_subjects));
  }
  if (exam_subjects && typeof exam_subjects === "object") {
    const es = exam_subjects;
    if (!Array.isArray(es.written) || !Array.isArray(es.oral)) {
      return jsonResponse({ error: "exam_subjects braucht written[] und oral[]." }, 400, env);
    }
    if (es.written.length > 3 || es.oral.length > 3) {
      return jsonResponse({ error: "Maximal 3 schriftliche und 3 mündliche Fächer." }, 400, env);
    }
    updates.push("exam_subjects = ?");
    binds.push(JSON.stringify(es));
  }
  if (reminder_interval !== undefined) {
    const ri = parseInt(reminder_interval, 10);
    if (isNaN(ri) || ri < 0 || ri > 30) {
      return jsonResponse({ error: "reminder_interval muss zwischen 0 und 30 liegen." }, 400, env);
    }
    updates.push("reminder_interval = ?");
    binds.push(ri);
  }
  if (email !== undefined) {
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return jsonResponse({ error: "Ungültige Email-Adresse." }, 400, env);
    }
    updates.push("email = ?");
    binds.push(email || null);
  }

  if (updates.length === 0) {
    return jsonResponse({ error: "Keine Felder zum Speichern." }, 400, env);
  }

  binds.push(nameLower);
  const result = await env.DB.prepare(
    `UPDATE students SET ${updates.join(", ")} WHERE name_lower = ?`
  ).bind(...binds).run();

  if (result.meta.changes === 0) return jsonResponse({ error: "Schüler nicht gefunden." }, 404, env);
  return jsonResponse({ success: true }, 200, env);
}

/* ================= PASSWORT ÄNDERN ================= */
export async function handleChangePassword(request, env) {
  const { student_name, old_password, new_password } = await request.json();

  if (!student_name || typeof student_name !== "string") {
    return jsonResponse({ error: "Name erforderlich." }, 400, env);
  }
  if (!old_password || typeof old_password !== "string") {
    return jsonResponse({ error: "Aktuelles Passwort erforderlich." }, 400, env);
  }
  if (!new_password || typeof new_password !== "string" || new_password.length < 6) {
    return jsonResponse({ error: "Neues Passwort muss mindestens 6 Zeichen haben." }, 400, env);
  }

  const nameLower = student_name.trim().toLowerCase();
  const student = await env.DB.prepare(
    "SELECT id, salt, hash FROM students WHERE name_lower = ?"
  ).bind(nameLower).first();
  if (!student) return jsonResponse({ error: "Schüler nicht gefunden." }, 404, env);

  const match = await verifyPassword(old_password, student.salt, student.hash);
  if (!match) {
    return jsonResponse({ error: "Aktuelles Passwort ist falsch." }, 401, env);
  }

  const newSalt = crypto.randomUUID();
  const newHash = await hashPassword(new_password, newSalt);
  await env.DB.prepare(
    "UPDATE students SET salt = ?, hash = ? WHERE id = ?"
  ).bind(newSalt, newHash, student.id).run();

  const token = await generateToken(env);
  return jsonResponse({ success: true, token }, 200, env);
}

/* ================= PROFIL AKTUALISIEREN ================= */
export async function handleUpdateProfile(request, env) {
  const { student_name, email, level, school } = await request.json();

  if (!student_name || typeof student_name !== "string") {
    return jsonResponse({ error: "Name erforderlich." }, 400, env);
  }

  const nameLower = student_name.trim().toLowerCase();
  const updates = [];
  const binds = [];

  if (level !== undefined) {
    if (level !== "gA" && level !== "eA") {
      return jsonResponse({ error: "Level muss 'gA' oder 'eA' sein." }, 400, env);
    }
    updates.push("level = ?");
    binds.push(level);
  }
  if (email !== undefined) {
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return jsonResponse({ error: "Ungültige Email-Adresse." }, 400, env);
    }
    updates.push("email = ?");
    binds.push(email || null);
  }
  if (school !== undefined) {
    updates.push("school = ?");
    binds.push(school.trim() || null);
  }

  if (updates.length === 0) {
    return jsonResponse({ error: "Keine Felder zum Aktualisieren." }, 400, env);
  }

  binds.push(nameLower);
  const result = await env.DB.prepare(
    `UPDATE students SET ${updates.join(", ")} WHERE name_lower = ?`
  ).bind(...binds).run();

  if (result.meta.changes === 0) return jsonResponse({ error: "Schüler nicht gefunden." }, 404, env);
  return jsonResponse({ success: true }, 200, env);
}

/* ================= SUBJECT MAPPINGS ================= */
export const SUBJECT_TYPES_MAP = {
  english: ["mediation", "writing"],
  german: ["deutsch-interpretation", "deutsch-analyse", "deutsch-eroerterung", "deutsch-materialgestuetzt-informierend", "deutsch-materialgestuetzt-argumentierend"],
  history: ["geschichte", "geschichte-abitur"],
  pug: ["pug-klausur", "pug-abitur"],
  wr: ["wr", "wr-abitur"],
  french: ["french-mediation", "french-writing"],
  italian: ["italian-mediation", "italian-writing"],
  ethik: ["ethik", "ethik-abitur"],
  religion: ["religion", "religion-abitur"],
  katholisch: ["katholisch", "katholisch-abitur"],
  geographie: ["geographie", "geographie-abitur"],
  latein: ["latein", "latein-abitur"],
  mathe: ["mathe", "mathe-abitur"],
  chemie: ["chemie", "chemie-abitur"],
  physik: ["physik", "physik-abitur"],
  biologie: ["biologie", "biologie-abitur"],
  sport: ["sport", "sport-abitur"],
  informatik: ["informatik", "informatik-abitur"]
};

// Anzeige-Namen für Emails
export const SUBJECT_NAMES = {
  english: "Englisch", german: "Deutsch", history: "Geschichte",
  pug: "Politik und Gesellschaft", wr: "Wirtschaft & Recht",
  french: "Französisch", italian: "Italienisch", ethik: "Ethik",
  religion: "Ev. Religion", katholisch: "Kath. Religion",
  geographie: "Geographie", latein: "Latein", mathe: "Mathematik",
  chemie: "Chemie", physik: "Physik", biologie: "Biologie",
  sport: "Sport", informatik: "Informatik"
};

export const SUBJECT_ICONS = {
  english: "🇬🇧", german: "📖", history: "📜", pug: "🏛️", wr: "⚖️",
  french: "🇫🇷", italian: "🇮🇹", ethik: "🧠", religion: "✝️",
  katholisch: "⛪", geographie: "🌍", latein: "🏺", mathe: "📐",
  chemie: "🧪", physik: "⚛️", biologie: "🧬", sport: "⚽", informatik: "💻"
};

/* ================= CHECK REMINDERS ================= */
export async function handleCheckReminders(request, env) {
  const { student_name } = await request.json();
  if (!student_name) return jsonResponse({ error: "Name erforderlich." }, 400, env);

  const nameLower = student_name.trim().toLowerCase();
  const student = await env.DB.prepare(
    "SELECT exam_subjects, reminder_interval FROM students WHERE name_lower = ?"
  ).bind(nameLower).first();
  if (!student) return jsonResponse({ error: "Schüler nicht gefunden." }, 404, env);

  const examSubjects = JSON.parse(student.exam_subjects || "{}");
  const allExam = [...(examSubjects.written || []), ...(examSubjects.oral || [])];
  if (allExam.length === 0) {
    return jsonResponse({ success: true, reminders: [] }, 200, env);
  }

  const interval = student.reminder_interval ?? 3;
  if (interval === 0) {
    return jsonResponse({ success: true, reminders: [] }, 200, env);
  }

  // Letzte Aktivität pro Fach ermitteln
  const results = await env.DB.prepare(
    "SELECT type, MAX(created_at) as last_date FROM results WHERE LOWER(TRIM(student_name)) = ? GROUP BY type"
  ).bind(nameLower).all();

  const lastByType = {};
  for (const r of (results.results || [])) {
    lastByType[r.type] = r.last_date;
  }

  const now = Date.now();
  const reminders = [];

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
    if (daysSince === null || daysSince >= interval) {
      reminders.push({
        subject: subj,
        daysSince: daysSince,
        isWritten: (examSubjects.written || []).includes(subj)
      });
    }
  }

  return jsonResponse({ success: true, reminders }, 200, env);
}
