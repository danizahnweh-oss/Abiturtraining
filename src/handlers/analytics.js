// Handler: Analytics (Student Results, Competency Profile, Learning Plan)
import { jsonResponse, extractJSON } from '../utils.js';
import { callOpenAI } from '../openai.js';
import { resolveStudentIdentity } from '../auth.js';
import { SUBJECT_TYPES_MAP, SUBJECT_NAMES } from './student.js';

/* ================= STUDENT RESULTS ================= */
export async function handleStudentResults(request, env) {
  const body = await request.json().catch(() => ({}));
  const ident = await resolveStudentIdentity(request, env, body.student_name?.trim()?.toLowerCase());
  if (!ident) return jsonResponse({ error: "Bitte erneut anmelden." }, 401, env);
  const nameLower = ident.nameLower;
  const { results } = await env.DB.prepare(
    "SELECT id, student_name, course, type, topic, content, language, total, " +
    "CASE WHEN feedback_html IS NOT NULL AND feedback_html != '' THEN 1 ELSE 0 END AS has_feedback, " +
    "created_at AS date FROM results WHERE LOWER(TRIM(student_name)) = ? ORDER BY created_at ASC"
  ).bind(nameLower).all();

  return jsonResponse({ results: results || [] }, 200, env);
}

/* ================= EINZELNE KORREKTUR (DETAIL) ================= */
// Liefert die gespeicherte vollstaendige Korrektur (HTML-Snapshot) zu EINEM
// Ergebnis – nur fuer die Schuelerin, der das Ergebnis gehoert.
export async function handleStudentResultDetail(request, env) {
  const body = await request.json().catch(() => ({}));
  const ident = await resolveStudentIdentity(request, env, body.student_name?.trim()?.toLowerCase());
  if (!ident) return jsonResponse({ error: "Bitte erneut anmelden." }, 401, env);
  const resultId = typeof body.result_id === "string" ? body.result_id : "";
  if (!resultId) return jsonResponse({ error: "result_id erforderlich." }, 400, env);

  const row = await env.DB.prepare(
    "SELECT id, student_name, type, topic, total, feedback_html, created_at AS date FROM results WHERE id = ?"
  ).bind(resultId).first();

  if (!row) return jsonResponse({ error: "Ergebnis nicht gefunden." }, 404, env);
  // Lehrer dürfen jedes Ergebnis sehen (Dashboard); Schüler nur eigene
  if (!ident.isTeacher && (row.student_name || "").trim().toLowerCase() !== ident.nameLower) {
    return jsonResponse({ error: "Kein Zugriff auf dieses Ergebnis." }, 403, env);
  }

  return jsonResponse({
    result: {
      id: row.id,
      type: row.type,
      topic: row.topic,
      total: row.total,
      date: row.date,
      feedback_html: row.feedback_html || null
    }
  }, 200, env);
}

/* ================= KOMPETENZPROFIL ================= */
export async function handleCompetencyProfile(request, env) {
  const body = await request.json().catch(() => ({}));
  const ident = await resolveStudentIdentity(request, env, body.student_name?.trim()?.toLowerCase());
  if (!ident) return jsonResponse({ error: "Bitte erneut anmelden." }, 401, env);
  const nameLower = ident.nameLower;

  // Alle Ergebnisse laden (mit optionalen Details)
  const { results } = await env.DB.prepare(`
    SELECT r.id, r.type, r.topic, r.content, r.language, r.total, r.created_at,
           d.strengths, d.weaknesses, d.error_types, d.missing_topics, d.afb_scores
    FROM results r
    LEFT JOIN result_details d ON d.result_id = r.id
    WHERE LOWER(TRIM(r.student_name)) = ?
    ORDER BY r.created_at ASC
  `).bind(nameLower).all();

  if (!results || results.length === 0) {
    return jsonResponse({
      profile: null,
      message: "Noch keine Ergebnisse vorhanden. Absolviere zuerst einige Übungen!"
    }, 200, env);
  }

  // Typ → Fach-Mapping (umgekehrt: type → subject)
  const typeToSubject = {};
  for (const [subj, types] of Object.entries(SUBJECT_TYPES_MAP)) {
    for (const t of types) typeToSubject[t] = subj;
  }

  // Pro Fach aggregieren
  const subjectData = {};
  for (const r of results) {
    const subj = typeToSubject[r.type] || r.type;
    if (!subjectData[subj]) {
      subjectData[subj] = { scores: [], types: new Set(), details: [] };
    }
    subjectData[subj].scores.push({
      total: r.total,
      content: r.content,
      language: r.language,
      date: r.created_at
    });
    subjectData[subj].types.add(r.type);

    // Detail-Daten (falls vorhanden)
    if (r.strengths || r.weaknesses) {
      try {
        subjectData[subj].details.push({
          strengths: r.strengths ? JSON.parse(r.strengths) : [],
          weaknesses: r.weaknesses ? JSON.parse(r.weaknesses) : [],
          error_types: r.error_types ? JSON.parse(r.error_types) : {},
          afb_scores: r.afb_scores ? JSON.parse(r.afb_scores) : {}
        });
      } catch { /* JSON-Parse-Fehler ignorieren */ }
    }
  }

  // Aggregierte Statistiken pro Fach berechnen
  const subjectStats = {};
  for (const [subj, data] of Object.entries(subjectData)) {
    const scores = data.scores.map(s => s.total).filter(t => t != null);
    if (scores.length === 0) continue;

    const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
    const recent = scores.slice(-5);
    const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
    const older = scores.slice(0, -5);
    const olderAvg = older.length > 0 ? older.reduce((a, b) => a + b, 0) / older.length : avg;
    const trend = recentAvg > olderAvg + 0.5 ? "up" : recentAvg < olderAvg - 0.5 ? "down" : "stable";

    const name = SUBJECT_NAMES[subj] || subj;

    subjectStats[subj] = {
      name,
      avg: Math.round(avg * 10) / 10,
      count: scores.length,
      trend,
      recent_avg: Math.round(recentAvg * 10) / 10,
      best: Math.max(...scores),
      worst: Math.min(...scores),
      types: [...data.types],
      // Erweiterte Daten fuer Profil-Visualisierung
      scores_timeline: data.scores.filter(s => s.total != null).slice(-20).map(s => ({ date: s.date, total: s.total })),
      error_types_agg: aggregateErrorTypes(data.details),
      afb_scores_agg: aggregateAfbScores(data.details),
      missing_topics_agg: aggregateMissingTopics(data.details)
    };
  }

  // Gesamt-Durchschnitt
  const allScores = results.map(r => r.total).filter(t => t != null);
  const overallAvg = allScores.length > 0
    ? Math.round((allScores.reduce((a, b) => a + b, 0) / allScores.length) * 10) / 10
    : 0;

  // KI-Analyse anfordern
  const statsForPrompt = JSON.stringify(subjectStats, null, 2);
  const detailSummary = Object.entries(subjectData)
    .filter(([, d]) => d.details.length > 0)
    .map(([subj, d]) => {
      const allStr = d.details.flatMap(det => det.strengths);
      const allWeak = d.details.flatMap(det => det.weaknesses);
      return `${SUBJECT_NAMES[subj] || subj}: Stärken: ${allStr.join(", ") || "keine Daten"}, Schwächen: ${allWeak.join(", ") || "keine Daten"}`;
    }).join("\n");

  const messages = [
    {
      role: "system",
      content: `Du bist ein erfahrener Lernberater für das bayerische Abitur (G9). Analysiere die Übungsergebnisse eines Schülers und erstelle ein Kompetenzprofil.

Antworte ausschließlich mit validem JSON (keine Markdown-Fences):
{
  "top_strengths": ["Stärke 1", "Stärke 2", "Stärke 3"],
  "critical_weaknesses": ["Schwäche 1", "Schwäche 2", "Schwäche 3"],
  "focus_areas": [
    {"subject": "fachkey", "area": "Konkreter Bereich", "tip": "Konkreter Übungstipp"}
  ],
  "summary": "2-3 Sätze Gesamteinschätzung auf Deutsch"
}

Regeln:
- Stärken und Schwächen müssen KONKRET und FACHLICH sein (nicht generisch)
- Focus-Areas: Die 3 wichtigsten Bereiche, in denen der Schüler sich verbessern sollte
- Berücksichtige Trends: Verbesserung ist positiv, Verschlechterung braucht Aufmerksamkeit
- Summary: Ermutigend aber ehrlich, mit konkreten Empfehlungen`
    },
    {
      role: "user",
      content: `Schüler hat ${results.length} Übungen in ${Object.keys(subjectStats).length} Fächern absolviert.
Gesamtdurchschnitt: ${overallAvg} NP

Fachstatistiken:
${statsForPrompt}

${detailSummary ? `\nDetailanalysen aus Einzelbewertungen:\n${detailSummary}` : ""}`
    }
  ];

  try {
    const aiResponse = await callOpenAI(env, messages, 2000, { temperature: 0.5 });
    const analysis = extractJSON(aiResponse);

    return jsonResponse({
      profile: {
        overall_avg: overallAvg,
        total_exercises: results.length,
        subjects: subjectStats,
        analysis
      }
    }, 200, env);
  } catch (e) {
    // Fallback: Profil ohne KI-Analyse
    console.error("Kompetenzprofil KI-Analyse fehlgeschlagen:", e.message);
    return jsonResponse({
      profile: {
        overall_avg: overallAvg,
        total_exercises: results.length,
        subjects: subjectStats,
        analysis: {
          top_strengths: [],
          critical_weaknesses: [],
          focus_areas: [],
          summary: "Die KI-Analyse konnte nicht erstellt werden. Die Fachstatistiken sind aber verfügbar."
        }
      }
    }, 200, env);
  }
}

/* ================= AGGREGATIONS-HILFSFUNKTIONEN ================= */
export function aggregateErrorTypes(details) {
  const agg = {};
  for (const d of details) {
    if (!d.error_types || typeof d.error_types !== "object") continue;
    for (const [key, count] of Object.entries(d.error_types)) {
      agg[key] = (agg[key] || 0) + (typeof count === "number" ? count : 0);
    }
  }
  return agg;
}

export function aggregateAfbScores(details) {
  const sums = {};
  const counts = {};
  for (const d of details) {
    if (!d.afb_scores || typeof d.afb_scores !== "object") continue;
    for (const [key, val] of Object.entries(d.afb_scores)) {
      if (typeof val !== "number") continue;
      sums[key] = (sums[key] || 0) + val;
      counts[key] = (counts[key] || 0) + 1;
    }
  }
  const result = {};
  for (const [key, sum] of Object.entries(sums)) {
    result[key] = Math.round(sum / counts[key]);
  }
  return result;
}

export function aggregateMissingTopics(details) {
  const topicCount = {};
  for (const d of details) {
    const topics = Array.isArray(d.missing_topics) ? d.missing_topics : [];
    for (const t of topics) {
      if (typeof t === "string" && t.trim()) {
        topicCount[t.trim()] = (topicCount[t.trim()] || 0) + 1;
      }
    }
  }
  return Object.entries(topicCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([topic, count]) => ({ topic, count }));
}

/* ================= KI-LERNPLAN ================= */
export async function handleLearningPlan(request, env) {
  const body = await request.json().catch(() => ({}));
  const { force_refresh } = body;
  const ident = await resolveStudentIdentity(request, env, body.student_name?.trim()?.toLowerCase());
  if (!ident) return jsonResponse({ error: "Bitte erneut anmelden." }, 401, env);
  const nameLower = ident.nameLower;

  // 1. Cache pruefen (wenn nicht force_refresh)
  if (!force_refresh) {
    const cached = await env.DB.prepare(
      "SELECT plan_json, created_at FROM learning_plans WHERE student_name_lower = ? AND expires_at > ? ORDER BY created_at DESC LIMIT 1"
    ).bind(nameLower, new Date().toISOString()).first();

    if (cached) {
      return jsonResponse({
        plan: JSON.parse(cached.plan_json),
        cached: true,
        created_at: cached.created_at
      }, 200, env);
    }
  }

  // 2. Kompetenzprofil-Daten laden
  const { results } = await env.DB.prepare(`
    SELECT r.id, r.type, r.topic, r.total, r.created_at,
           d.strengths, d.weaknesses, d.error_types, d.missing_topics, d.afb_scores
    FROM results r
    LEFT JOIN result_details d ON d.result_id = r.id
    WHERE LOWER(TRIM(r.student_name)) = ?
    ORDER BY r.created_at ASC
  `).bind(nameLower).all();

  if (!results || results.length === 0) {
    return jsonResponse({ error: "Keine Ergebnisse vorhanden." }, 400, env);
  }

  // 3. Fach-Aggregation
  const typeToSubjectMap = {};
  for (const [subj, types] of Object.entries(SUBJECT_TYPES_MAP)) {
    for (const t of types) typeToSubjectMap[t] = subj;
  }

  const subjectData = {};
  for (const r of results) {
    const subj = typeToSubjectMap[r.type] || r.type;
    if (!subjectData[subj]) {
      subjectData[subj] = { scores: [], details: [] };
    }
    if (r.total != null) subjectData[subj].scores.push(r.total);
    if (r.strengths || r.weaknesses) {
      try {
        subjectData[subj].details.push({
          weaknesses: r.weaknesses ? JSON.parse(r.weaknesses) : [],
          missing_topics: r.missing_topics ? JSON.parse(r.missing_topics) : [],
          error_types: r.error_types ? JSON.parse(r.error_types) : {}
        });
      } catch { }
    }
  }

  // 4. Zusammenfassung fuer Prompt
  const profileSummary = {};
  for (const [subj, data] of Object.entries(subjectData)) {
    if (data.scores.length === 0) continue;
    const avg = Math.round((data.scores.reduce((a, b) => a + b, 0) / data.scores.length) * 10) / 10;
    const recent = data.scores.slice(-3);
    const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
    const trend = recentAvg > avg + 0.5 ? "aufwaerts" : recentAvg < avg - 0.5 ? "abwaerts" : "stabil";

    profileSummary[subj] = {
      name: SUBJECT_NAMES[subj] || subj,
      avg, count: data.scores.length, trend,
      weaknesses: [...new Set(data.details.flatMap(d => d.weaknesses))].slice(0, 5),
      missing_topics: [...new Set(data.details.flatMap(d => Array.isArray(d.missing_topics) ? d.missing_topics : []))].slice(0, 5),
      error_types: aggregateErrorTypes(data.details)
    };
  }

  // 5. Fachseiten-URL-Mapping
  const SUBJECT_URLS = {
    english: [{ url: "mediation.html", label: "Mediation" }, { url: "writing.html", label: "Writing" }],
    german: [{ url: "analyse.html", label: "Textanalyse" }, { url: "eroerterung.html", label: "Eroerterung" }, { url: "interpretation.html", label: "Interpretation" }],
    history: [{ url: "geschichte.html", label: "Geschichte" }],
    mathe: [{ url: "mathe.html", label: "Mathematik" }],
    chemie: [{ url: "chemie.html", label: "Chemie" }],
    biologie: [{ url: "biologie.html", label: "Biologie" }],
    physik: [{ url: "physik.html", label: "Physik" }],
    informatik: [{ url: "informatik.html", label: "Informatik" }],
    sport: [{ url: "sport.html", label: "Sport" }],
    pug: [{ url: "politik.html", label: "Politik und Gesellschaft" }],
    wr: [{ url: "wr.html", label: "Wirtschaft und Recht" }],
    french: [{ url: "francais-mediation.html", label: "Mediation" }, { url: "francais-schreiben.html", label: "Production ecrite" }],
    italian: [{ url: "italiano-mediation.html", label: "Mediazione" }, { url: "italiano-schreiben.html", label: "Produzione scritta" }],
    ethik: [{ url: "ethik.html", label: "Ethik" }],
    religion: [{ url: "religion.html", label: "Ev. Religion" }],
    katholisch: [{ url: "katholisch.html", label: "Kath. Religion" }],
    geographie: [{ url: "geographie.html", label: "Geographie" }],
    latein: [{ url: "latein.html", label: "Latein" }]
  };

  // 6. KI-Prompt
  const today = new Date();
  const weekStart = new Date(today);
  weekStart.setDate(today.getDate() - today.getDay() + 1);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);
  const kw = getCalendarWeek(today);

  const messages = [
    {
      role: "system",
      content: `Du bist ein erfahrener Lernberater fuer das bayerische Abitur (G9).
Erstelle einen personalisierten Wochenplan basierend auf dem Kompetenzprofil eines Schuelers.

Antworte ausschliesslich mit validem JSON (keine Markdown-Fences):
{
  "week_label": "KW ${kw} (${weekStart.toLocaleDateString("de-DE")} – ${weekEnd.toLocaleDateString("de-DE")})",
  "motivation": "1-2 ermutigende Saetze",
  "units": [
    {
      "priority": 1,
      "subject_key": "german",
      "subject_name": "Deutsch",
      "title": "Kurzer Titel",
      "description": "Was konkret geuebt werden soll (2-3 Saetze)",
      "duration_min": 30,
      "goal": "Konkretes Lernziel",
      "page_url": "analyse.html",
      "page_label": "Textanalyse"
    }
  ],
  "weekly_goal": "Uebergreifendes Wochenziel (1 Satz)"
}

Regeln:
- Erstelle 3-5 Trainingseinheiten
- Priorisiere Schwaechen und Luecken-Themen
- Variiere die Faecher (nicht alles in einem Fach)
- Realistischer Zeitaufwand (20-45 Min pro Einheit)
- Nutze NUR page_url-Werte aus den verfuegbaren Uebungsseiten
- Lernziele muessen konkret und messbar sein
- Bei Abwaertstrend: Hoehere Prioritaet fuer das Fach
- Faecher mit niedrigem Durchschnitt (<5 NP) haben Vorrang
- Ermutigend aber konkret, auf Deutsch`
    },
    {
      role: "user",
      content: `Kompetenzprofil des Schuelers:
${JSON.stringify(profileSummary, null, 2)}

Verfuegbare Uebungsseiten:
${JSON.stringify(SUBJECT_URLS, null, 2)}`
    }
  ];

  try {
    const aiResponse = await callOpenAI(env, messages, 2000, { temperature: 0.6 });
    const plan = extractJSON(aiResponse);

    // 7. In DB cachen (7 Tage)
    const planId = Date.now().toString(36) + crypto.randomUUID().slice(0, 8);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    await env.DB.prepare(
      "INSERT INTO learning_plans (id, student_name_lower, plan_json, profile_hash, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)"
    ).bind(planId, nameLower, JSON.stringify(plan), String(results.length), new Date().toISOString(), expiresAt).run();

    // Alte Plaene aufraumen
    try {
      await env.DB.prepare(
        "DELETE FROM learning_plans WHERE student_name_lower = ? AND id != ?"
      ).bind(nameLower, planId).run();
    } catch { }

    return jsonResponse({ plan, cached: false, created_at: new Date().toISOString() }, 200, env);
  } catch (e) {
    console.error("Lernplan-Generierung fehlgeschlagen:", e.message);
    return jsonResponse({ error: "Lernplan konnte nicht erstellt werden." }, 500, env);
  }
}

export function getCalendarWeek(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}
