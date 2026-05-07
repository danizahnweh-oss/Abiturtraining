// Handler: Lehrer-Aufgaben-Sharing (Erstellen, Teilen, Ergebnisse)
import { jsonResponse, extractJSON, buildUserContent } from '../utils.js';
import { verifyTeacherAuthToken, generateClassCode } from '../auth.js';
import { callOpenAI } from '../openai.js';

// 8-stelliger Share-Code fuer Aufgaben (laenger als 6-stellige Lehrer-Codes)
function generateShareCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const arr = new Uint8Array(8);
  crypto.getRandomValues(arr);
  let code = "";
  for (let i = 0; i < 8; i++) code += chars[arr[i] % chars.length];
  return code;
}

// ===== Lehrer-Profil (Faecher) =====
export async function handleTeacherProfile(request, env) {
  const token = request.headers.get("X-Teacher-Auth-Token");
  const teacherId = await verifyTeacherAuthToken(token, env);
  if (!teacherId) {
    return jsonResponse({ error: "Nicht autorisiert." }, 401, env);
  }
  const { action, subjects } = await request.json();

  if (action === "get") {
    const row = await env.DB.prepare("SELECT name, subjects FROM teachers WHERE id = ?").bind(teacherId).first();
    return jsonResponse({ success: true, name: row?.name || "", subjects: JSON.parse(row?.subjects || "[]") }, 200, env);
  }

  if (action === "update") {
    if (!Array.isArray(subjects)) {
      return jsonResponse({ error: "subjects muss ein Array sein." }, 400, env);
    }
    await env.DB.prepare("UPDATE teachers SET subjects = ? WHERE id = ?")
      .bind(JSON.stringify(subjects), teacherId).run();
    return jsonResponse({ success: true }, 200, env);
  }

  return jsonResponse({ error: "Unbekannte Aktion." }, 400, env);
}

// ===== Lehrer-Aufgaben CRUD =====
export async function handleTeacherTasks(request, env) {
  const token = request.headers.get("X-Teacher-Auth-Token");
  const teacherId = await verifyTeacherAuthToken(token, env);
  if (!teacherId) {
    return jsonResponse({ error: "Nicht autorisiert." }, 401, env);
  }
  const body = await request.json();
  const { action } = body;

  // Aufgabe speichern
  if (action === "save") {
    const { task_data, subject, subject_group, title } = body;
    if (!task_data || !subject || !subject_group || !title) {
      return jsonResponse({ error: "task_data, subject, subject_group und title erforderlich." }, 400, env);
    }

    // Einzigartigen Share-Code generieren
    let shareCode = null;
    for (let i = 0; i < 10; i++) {
      const candidate = generateShareCode();
      const exists = await env.DB.prepare("SELECT 1 FROM teacher_tasks WHERE share_code = ?").bind(candidate).first();
      if (!exists) { shareCode = candidate; break; }
    }
    if (!shareCode) {
      return jsonResponse({ error: "Code-Generierung fehlgeschlagen." }, 500, env);
    }

    const id = Date.now().toString(36) + crypto.randomUUID().slice(0, 8);
    const kvKey = `task:${id}`;

    // Komplette Aufgabendaten (inkl. Bilder) in KV speichern
    await env.RESULTS_KV.put(kvKey, JSON.stringify(task_data));

    // Abgespeckte Metadaten (ohne Bilder) fuer D1
    const meta = { ...task_data };
    // Bilder entfernen (koennen sehr gross sein)
    delete meta._uploadImages;
    delete meta.images;
    if (meta.materials) {
      meta.materials = meta.materials.map(m => {
        if (m.type === "image" || m.type === "foto") return { ...m, image_url: "[KV]" };
        return m;
      });
    }

    await env.DB.prepare(
      `INSERT INTO teacher_tasks (id, teacher_id, share_code, subject, subject_group, title, task_meta, kv_key, active, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`
    ).bind(id, teacherId, shareCode, subject, subject_group, title.trim(), JSON.stringify(meta), kvKey, new Date().toISOString()).run();

    return jsonResponse({ success: true, task_id: id, share_code: shareCode }, 200, env);
  }

  // Alle Aufgaben des Lehrers
  if (action === "list") {
    const { results: tasks } = await env.DB.prepare(
      `SELECT t.id, t.share_code, t.subject, t.subject_group, t.title, t.active, t.created_at,
              (SELECT COUNT(*) FROM task_submissions ts WHERE ts.task_id = t.id) as submission_count
       FROM teacher_tasks t
       WHERE t.teacher_id = ?
       ORDER BY t.created_at DESC`
    ).bind(teacherId).all();
    return jsonResponse({ success: true, tasks: tasks || [] }, 200, env);
  }

  // Einzelne Aufgabe laden (fuer Vorschau)
  if (action === "get") {
    const { task_id } = body;
    if (!task_id) return jsonResponse({ error: "task_id erforderlich." }, 400, env);
    const task = await env.DB.prepare(
      "SELECT * FROM teacher_tasks WHERE id = ? AND teacher_id = ?"
    ).bind(task_id, teacherId).first();
    if (!task) return jsonResponse({ error: "Aufgabe nicht gefunden." }, 404, env);

    // Komplette Daten aus KV laden
    let taskData = null;
    if (task.kv_key) {
      const kvData = await env.RESULTS_KV.get(task.kv_key);
      if (kvData) taskData = JSON.parse(kvData);
    }
    return jsonResponse({ success: true, task, task_data: taskData }, 200, env);
  }

  // Aufgabe aktivieren/deaktivieren
  if (action === "toggle") {
    const { task_id } = body;
    if (!task_id) return jsonResponse({ error: "task_id erforderlich." }, 400, env);
    await env.DB.prepare(
      "UPDATE teacher_tasks SET active = CASE WHEN active = 1 THEN 0 ELSE 1 END WHERE id = ? AND teacher_id = ?"
    ).bind(task_id, teacherId).run();
    return jsonResponse({ success: true }, 200, env);
  }

  // Aufgabe aktualisieren
  if (action === "update") {
    const { task_id, task_data, title } = body;
    if (!task_id || !task_data) return jsonResponse({ error: "task_id und task_data erforderlich." }, 400, env);
    const task = await env.DB.prepare(
      "SELECT * FROM teacher_tasks WHERE id = ? AND teacher_id = ?"
    ).bind(task_id, teacherId).first();
    if (!task) return jsonResponse({ error: "Aufgabe nicht gefunden." }, 404, env);

    // Komplette Aufgabendaten in KV aktualisieren
    if (task.kv_key) {
      await env.RESULTS_KV.put(task.kv_key, JSON.stringify(task_data));
    }

    // Metadaten (ohne Bilder) fuer D1 aktualisieren
    const meta = { ...task_data };
    delete meta._uploadImages;
    delete meta.images;
    if (meta.materials) {
      meta.materials = meta.materials.map(m => {
        if (m.type === "image" || m.type === "foto") return { ...m, image_url: "[KV]" };
        return m;
      });
    }

    const newTitle = title ? title.trim() : task.title;
    await env.DB.prepare(
      "UPDATE teacher_tasks SET title = ?, task_meta = ? WHERE id = ? AND teacher_id = ?"
    ).bind(newTitle, JSON.stringify(meta), task_id, teacherId).run();

    return jsonResponse({ success: true }, 200, env);
  }

  // Aufgabe loeschen
  if (action === "delete") {
    const { task_id } = body;
    if (!task_id) return jsonResponse({ error: "task_id erforderlich." }, 400, env);
    const task = await env.DB.prepare(
      "SELECT kv_key FROM teacher_tasks WHERE id = ? AND teacher_id = ?"
    ).bind(task_id, teacherId).first();
    if (task?.kv_key) {
      await env.RESULTS_KV.delete(task.kv_key);
    }
    await env.DB.prepare("DELETE FROM task_submissions WHERE task_id = ?").bind(task_id).run();
    await env.DB.prepare("DELETE FROM teacher_tasks WHERE id = ? AND teacher_id = ?").bind(task_id, teacherId).run();
    return jsonResponse({ success: true }, 200, env);
  }

  return jsonResponse({ error: "Unbekannte Aktion." }, 400, env);
}

// ===== Lehrer: Ergebnisse pro Aufgabe =====
export async function handleTeacherTaskResults(request, env) {
  const token = request.headers.get("X-Teacher-Auth-Token");
  const teacherId = await verifyTeacherAuthToken(token, env);
  if (!teacherId) {
    return jsonResponse({ error: "Nicht autorisiert." }, 401, env);
  }
  const { task_id } = await request.json();
  if (!task_id) return jsonResponse({ error: "task_id erforderlich." }, 400, env);

  // Pruefen ob Aufgabe dem Lehrer gehoert
  const task = await env.DB.prepare(
    "SELECT id FROM teacher_tasks WHERE id = ? AND teacher_id = ?"
  ).bind(task_id, teacherId).first();
  if (!task) return jsonResponse({ error: "Aufgabe nicht gefunden." }, 404, env);

  const { results: submissions } = await env.DB.prepare(
    `SELECT ts.student_name_lower, ts.submitted_at, ts.result_id,
            r.total, r.content, r.language, r.student_name,
            d.strengths, d.weaknesses, d.error_types
     FROM task_submissions ts
     LEFT JOIN results r ON r.id = ts.result_id
     LEFT JOIN result_details d ON d.result_id = ts.result_id
     WHERE ts.task_id = ?
     ORDER BY ts.submitted_at DESC`
  ).bind(task_id).all();

  return jsonResponse({ success: true, submissions: submissions || [] }, 200, env);
}

// ===== Schueler: Geteilte Aufgabe laden =====
export async function handleGetSharedTask(request, env) {
  const { share_code, task_id } = await request.json();

  let task;
  if (task_id) {
    // Direkter Abruf per task_id (fuer Weiterleitung von aufgabe.html)
    task = await env.DB.prepare(
      "SELECT * FROM teacher_tasks WHERE id = ? AND active = 1"
    ).bind(task_id).first();
  } else if (share_code) {
    const codeUpper = share_code.toUpperCase().trim();
    task = await env.DB.prepare(
      "SELECT * FROM teacher_tasks WHERE share_code = ? AND active = 1"
    ).bind(codeUpper).first();
  } else {
    return jsonResponse({ error: "share_code oder task_id erforderlich." }, 400, env);
  }

  if (!task) {
    return jsonResponse({ error: "Aufgabe nicht gefunden oder deaktiviert." }, 404, env);
  }

  // Komplette Daten aus KV laden
  let taskData = null;
  if (task.kv_key) {
    const kvData = await env.RESULTS_KV.get(task.kv_key);
    if (kvData) taskData = JSON.parse(kvData);
  }
  if (!taskData) {
    // Fallback auf D1-Metadaten
    taskData = JSON.parse(task.task_meta);
  }

  // Lehrer-Name laden
  const teacher = await env.DB.prepare("SELECT name FROM teachers WHERE id = ?").bind(task.teacher_id).first();

  return jsonResponse({
    success: true,
    task_id: task.id,
    subject: task.subject,
    subject_group: task.subject_group,
    title: task.title,
    teacher_name: teacher?.name || "Lehrkraft",
    task_data: taskData
  }, 200, env);
}

// ===== Schueler: Ergebnis einer geteilten Aufgabe zuordnen =====
export async function handleSubmitSharedTask(request, env) {
  const { task_id, result_id, student_name } = await request.json();
  if (!task_id || !result_id || !student_name) {
    return jsonResponse({ error: "task_id, result_id und student_name erforderlich." }, 400, env);
  }

  const nameLower = student_name.trim().toLowerCase();
  const id = Date.now().toString(36) + crypto.randomUUID().slice(0, 8);
  const task = await env.DB.prepare(
    "SELECT teacher_id, subject FROM teacher_tasks WHERE id = ? AND active = 1"
  ).bind(task_id).first();
  if (!task) {
    return jsonResponse({ error: "Aufgabe nicht gefunden oder deaktiviert." }, 404, env);
  }

  const result = await env.DB.prepare(
    "SELECT student_name FROM results WHERE id = ?"
  ).bind(result_id).first();
  if (!result) {
    return jsonResponse({ error: "Ergebnis nicht gefunden." }, 404, env);
  }
  if ((result.student_name || "").trim().toLowerCase() !== nameLower) {
    return jsonResponse({ error: "Result gehört nicht zu diesem Schüler." }, 403, env);
  }

  // Upsert: Neuen Eintrag oder result_id aktualisieren
  const existing = await env.DB.prepare(
    "SELECT id FROM task_submissions WHERE task_id = ? AND student_name_lower = ?"
  ).bind(task_id, nameLower).first();

  if (existing) {
    await env.DB.prepare(
      "UPDATE task_submissions SET result_id = ?, submitted_at = ? WHERE id = ?"
    ).bind(result_id, new Date().toISOString(), existing.id).run();
  } else {
    await env.DB.prepare(
      "INSERT INTO task_submissions (id, task_id, student_name_lower, result_id, submitted_at) VALUES (?, ?, ?, ?, ?)"
    ).bind(id, task_id, nameLower, result_id, new Date().toISOString()).run();
  }

  // Automatisch Schueler mit Lehrer verlinken (fuer alle Faecher des Codes)
  await env.DB.prepare(
    "INSERT INTO student_teacher_links (student_name_lower, code, teacher_id, subject, linked_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT DO NOTHING"
  ).bind(nameLower, "TASK:" + task_id.slice(0, 10), task.teacher_id, task.subject, new Date().toISOString()).run();

  return jsonResponse({ success: true }, 200, env);
}

// ===== Lehrer: Aufgaben aus eigenen Materialien generieren =====

const MATERIAL_PROMPTS = {
  wr: `Du bist ein erfahrener WR-Lehrer (Bayern G9). Der Lehrer hat eigene Materialien (Grafiken, Tabellen, Texte) hochgeladen.
Erstelle eine materialgestuetzte Klausuraufgabe dazu.

Antworte NUR mit validem JSON:
{
  "task_instruction": "Situationstext / Rahmenhandlung (3-5 Saetze, konkreter Bezug zu den Materialien)",
  "aufgabenbloecke": [
    {
      "nr": 1,
      "titel": "Block-Titel",
      "teilaufgaben": [
        { "nr": "1.1", "text": "Aufgabentext mit konkretem Bezug auf die Materialien", "be": 5, "afb": "I" }
      ],
      "be_gesamt": 15
    }
  ],
  "gesamt_be": 60,
  "thema": "Konkretes Thema",
  "fachbereich": "bwl/vwl/recht"
}

Regeln:
- Beziehe dich KONKRET auf die hochgeladenen Materialien (M 1, M 2, ...)
- AFB I (Reproduktion) ca. 30%, AFB II (Transfer) ca. 40%, AFB III (Bewertung) ca. 30%
- Teilaufgaben mit Operatoren (nennen, beschreiben, erklaeren, beurteilen, eroertern)
- Die Materialien selbst werden NICHT in der Antwort mitgeliefert — nur Verweise darauf`,

  history: `Du bist ein erfahrener Geschichte-Lehrer (Bayern G9). Der Lehrer hat eigene Materialien (Quellen, Bilder, Karten) hochgeladen.
Erstelle eine quellenbasierte Geschichtsaufgabe dazu.

Antworte NUR mit validem JSON:
{
  "task_instruction_a": "Teil A: Quellenanalyse-Aufgabenstellung (Bezug auf M 1)",
  "task_instruction_b": "Teil B: Darstellungsaufgabe",
  "thema": "Konkretes historisches Thema"
}

Regeln:
- Teil A: Analysiere/Interpretiere die Quelle, ordne historisch ein
- Teil B: Eigene Darstellung zu verwandtem Aspekt
- Operatoren: analysieren, einordnen, beurteilen, darstellen`,

  german: `Du bist ein erfahrener Deutsch-Lehrer (Bayern G9). Der Lehrer hat eigene Texte/Materialien hochgeladen.
Erstelle eine Aufgabenstellung dazu (Analyse, Eroerterung oder materialgestuetztes Schreiben).

Antworte NUR mit validem JSON:
{
  "task_instruction": "Aufgabenstellung mit klarem Arbeitsauftrag und Bezug auf den Text/das Material",
  "thema": "Thema der Aufgabe"
}

Regeln:
- Klare Operatoren verwenden (analysieren, eroertern, vergleichen)
- Aufgabe soll zum hochgeladenen Material passen`,

  science: `Du bist ein erfahrener Naturwissenschafts-Lehrer (Bayern G9). Der Lehrer hat eigene Materialien (Diagramme, Versuchsbeschreibungen, Grafiken) hochgeladen.
Erstelle eine materialgestuetzte Klausuraufgabe dazu.

Antworte NUR mit validem JSON:
{
  "aufgabe": "Einleitender Aufgabentext mit Kontext und Bezug auf die Materialien",
  "teilaufgaben": [
    { "id": "a)", "text": "Aufgabentext mit Bezug auf Material", "be": 5 }
  ],
  "gesamt_be": 40,
  "sachgebiet": "Konkretes Sachgebiet"
}

Regeln:
- Beziehe dich KONKRET auf die hochgeladenen Materialien
- Teilaufgaben von leicht nach schwer
- Operatoren: beschreiben, erklaeren, begruenden, bewerten`,

  languages: `Du bist ein erfahrener Fremdsprachen-Lehrer (Bayern G9). Der Lehrer hat eigene Materialien (Texte, Bilder) hochgeladen.
Erstelle eine Aufgabenstellung dazu.

Antworte NUR mit validem JSON:
{
  "task_instruction": "Task description referencing the uploaded materials",
  "tasks": [
    { "task": "Sub-task with reference to materials", "words": 150 }
  ],
  "thema": "Topic"
}`,

  default: `Du bist ein erfahrener Lehrer (Bayern G9). Der Lehrer hat eigene Materialien hochgeladen.
Erstelle eine materialgestuetzte Aufgabe dazu.

Antworte NUR mit validem JSON:
{
  "task_instruction": "Aufgabenstellung mit Kontext und Bezug auf die Materialien",
  "teilaufgaben": [
    { "id": "a)", "text": "Teilaufgabe mit Bezug auf Material", "be": 5 }
  ],
  "gesamt_be": 40,
  "thema": "Konkretes Thema"
}

Regeln:
- Beziehe dich KONKRET auf die hochgeladenen Materialien
- Klare Operatoren verwenden
- Teilaufgaben von leicht nach schwer`
};

const SUBJECT_GROUP_TO_PROMPT = {
  wr: "wr", pug: "wr", // Gleiche Struktur
  history: "history",
  german: "german",
  mathe: "science", chemie: "science", physik: "science", biologie: "science", informatik: "science",
  english: "languages", french: "languages", italian: "languages", latein: "languages",
  ethik: "default", religion: "default", katholisch: "default", geographie: "default", sport: "default"
};

export async function handleGenerateFromMaterials(request, env) {
  const token = request.headers.get("X-Teacher-Auth-Token");
  const teacherId = await verifyTeacherAuthToken(token, env);
  if (!teacherId) {
    return jsonResponse({ error: "Nicht autorisiert." }, 401, env);
  }

  const { images, subject, subject_group, instructions, niveau } = await request.json();

  if (!images || !Array.isArray(images) || images.length < 1) {
    return jsonResponse({ error: "Mindestens 1 Bild erforderlich." }, 400, env);
  }
  if (images.length > 5) {
    return jsonResponse({ error: "Maximal 5 Bilder erlaubt." }, 400, env);
  }
  if (!subject_group) {
    return jsonResponse({ error: "Fachgruppe (subject_group) erforderlich." }, 400, env);
  }

  const promptKey = SUBJECT_GROUP_TO_PROMPT[subject_group] || "default";
  let systemPrompt = MATERIAL_PROMPTS[promptKey] || MATERIAL_PROMPTS.default;

  // Materialien-Hinweis
  const matCount = images.length;
  let userText = `Der Lehrer hat ${matCount} Material${matCount > 1 ? 'ien' : ''} hochgeladen (M 1${matCount > 1 ? ' bis M ' + matCount : ''}).
Erstelle passende Aufgaben, die sich auf diese Materialien beziehen.
Fach: ${subject_group} | Aufgabentyp: ${subject || subject_group}`;

  if (niveau) userText += ` | Niveau: ${niveau}`;
  if (instructions) userText += `\n\nZusaetzliche Anweisungen des Lehrers: ${instructions}`;

  const messages = [
    { role: "system", content: systemPrompt },
    { role: "user", content: buildUserContent(userText, images) }
  ];

  try {
    const openaiRes = await callOpenAI(env, messages, 6000, { model: "gpt-5.2", temperature: 0.3, jsonMode: true });
    const parsed = extractJSON(openaiRes);

    // Materialien-Array mit den hochgeladenen Bildern erstellen
    const matFieldName = (subject_group === "wr" || subject_group === "pug") ? "materialien"
      : (subject_group === "chemie" || subject_group === "physik" || subject_group === "biologie") ? "material"
      : "materialien";

    // Falls die KI kein Materialien-Array erstellt hat, erstellen wir eins
    if (!parsed[matFieldName]) {
      parsed[matFieldName] = [];
    }

    // Bilder als Materialien hinzufuegen/aktualisieren
    images.forEach((base64, i) => {
      const dataUrl = base64.startsWith("data:") ? base64 : `data:image/jpeg;base64,${base64}`;
      const matNr = `M ${i + 1}`;
      const existing = parsed[matFieldName].find(m => (m.nr || m.id || "") === matNr);
      if (existing) {
        existing.image_url = dataUrl;
        existing.inhalt = dataUrl;
        existing.content = dataUrl;
        existing.text = dataUrl;
        if (!existing.typ && !existing.type) existing.typ = "bild";
      } else {
        parsed[matFieldName].push({
          nr: matNr,
          id: matNr,
          titel: `Material ${i + 1}`,
          typ: "bild",
          type: "bild",
          inhalt: dataUrl,
          content: dataUrl,
          text: dataUrl,
          image_url: dataUrl,
          quelle: ""
        });
      }
    });

    return jsonResponse(parsed, 200, env);
  } catch (e) {
    return jsonResponse({ error: "Aufgabenerstellung fehlgeschlagen: " + e.message }, 500, env);
  }
}
