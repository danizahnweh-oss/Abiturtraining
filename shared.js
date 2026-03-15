/* ============================
   shared.js — Abitur Trainer
   Gemeinsame Funktionen für alle Module
   ============================

   Jedes Modul definiert VOR dem Laden dieser Datei:

   const MODULE_CONFIG = {
     sectionPrefix: "sec-",           // "sec-" für Deutsch, "" für Englisch
     steps: ["setup","task","write","feedback","progress"],
     storagePrefix: "deutsch_eroerterung",
     historyKey: "deutsch_eroerterung_history_",
     pdfFilename: "Eroerterung",
     chartColor: "#059669",
     minWords: 100,
     syncHL: (src, dst) => { ... }    // optional: custom sync function
   };
   ============================ */

const API_BASE = "https://sag-abi-mediation-api.sanktannagymnasium.workers.dev";
const CONFIG = { storedData: null };

/* ================= UTILITIES ================= */

function showToast(msg, type) {
  const t = document.createElement("div");
  t.className = "toast" + (type === "success" ? " success" : "");
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => { t.style.opacity = "0"; setTimeout(() => t.remove(), 300); }, 3500);
}

function getStudentKey() {
  return (sessionStorage.getItem("student_name") || "anon").toLowerCase().replace(/\s+/g, "_");
}

function escapeHtml(str) {
  return String(str || "").replace(/[&<>"']/g, m => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  }[m]));
}

function countWords(text) {
  return (text || "").trim().split(/\s+/).filter(w => w.length > 0).length;
}

function updateWordCount() {
  document.getElementById("wordCount").textContent = countWords(document.getElementById("studentText").value);
}

/* ================= API ================= */

function getAccessToken() {
  return sessionStorage.getItem("access_token") || "";
}

async function apiCall(endpoint, body, _isRetry) {
  // Auto-Attach: OCR-Bilder bei Grade-Endpoints mitsenden
  if (/\/api\/(fos-)?grade/.test(endpoint) && typeof getOCRImages === "function") {
    const imgs = getOCRImages();
    if (imgs.length) body.images = imgs;
  }
  const res = await fetch(API_BASE + endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Access-Token": getAccessToken() },
    body: JSON.stringify(body)
  });
  // 401 = Token abgelaufen/ungueltig → Login-Modal zeigen und API-Call wiederholen
  if (res.status === 401 && !_isRetry && typeof requireLogin === "function") {
    sessionStorage.removeItem("access");
    sessionStorage.removeItem("access_token");
    return new Promise(function(resolve, reject) {
      requireLogin(function() {
        apiCall(endpoint, body, true).then(resolve).catch(reject);
      });
    });
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

/* ================= ASYNC API (Queue-basiert) ================= */

// KI-Roboter SVG-Animation (wird automatisch beim Korrigieren angezeigt)
var KI_ROBOT_HTML = '<div class="ki-robot-scene">' +
  '<svg viewBox="0 0 200 170" class="ki-robot-svg" aria-hidden="true">' +
    '<rect class="ki-s-desk" x="38" y="128" width="6" height="35" rx="2" opacity=".45"/>' +
    '<rect class="ki-s-desk" x="156" y="128" width="6" height="35" rx="2" opacity=".45"/>' +
    '<rect class="ki-s-desk" x="25" y="122" width="150" height="8" rx="3"/>' +
    '<rect class="ki-s-paper" x="42" y="98" width="24" height="30" rx="2" transform="rotate(-5 54 113)"/>' +
    '<line class="ki-s-line" x1="46" y1="105" x2="62" y2="104" transform="rotate(-5 54 113)"/>' +
    '<line class="ki-s-line" x1="46" y1="110" x2="62" y2="109" transform="rotate(-5 54 113)"/>' +
    '<line class="ki-s-line" x1="46" y1="115" x2="58" y2="114" transform="rotate(-5 54 113)"/>' +
    '<rect class="ki-s-paper" x="132" y="100" width="24" height="30" rx="2" transform="rotate(4 144 115)"/>' +
    '<line class="ki-s-line" x1="136" y1="107" x2="152" y2="108" transform="rotate(4 144 115)"/>' +
    '<line class="ki-s-line" x1="136" y1="112" x2="152" y2="113" transform="rotate(4 144 115)"/>' +
    '<g class="ki-s-pencil">' +
      '<line x1="110" y1="100" x2="126" y2="118" stroke="#f59e0b" stroke-width="3" stroke-linecap="round"/>' +
      '<line x1="126" y1="118" x2="128" y2="122" stroke="var(--ink,#333)" stroke-width="1.5" stroke-linecap="round"/>' +
    '</g>' +
    '<rect class="ki-s-arm ki-s-arm-l" x="58" y="86" width="20" height="8" rx="4"/>' +
    '<rect class="ki-s-arm ki-s-arm-r" x="122" y="86" width="20" height="8" rx="4"/>' +
    '<rect class="ki-s-body" x="72" y="72" width="56" height="52" rx="10"/>' +
    '<circle cx="100" cy="96" r="6" fill="none" stroke="rgba(255,255,255,.25)" stroke-width="1.5"/>' +
    '<circle cx="100" cy="96" r="3" class="ki-s-chest"/>' +
    '<rect class="ki-s-body" x="70" y="30" width="60" height="46" rx="14"/>' +
    '<g class="ki-s-eyes">' +
      '<circle cx="86" cy="50" r="7.5" class="ki-s-eye-bg"/>' +
      '<circle cx="88" cy="50" r="3.5" class="ki-s-pupil"/>' +
      '<circle cx="114" cy="50" r="7.5" class="ki-s-eye-bg"/>' +
      '<circle cx="112" cy="50" r="3.5" class="ki-s-pupil"/>' +
    '</g>' +
    '<rect x="90" y="64" width="20" height="3.5" rx="1.5" fill="rgba(255,255,255,.3)"/>' +
    '<line class="ki-s-stem" x1="100" y1="30" x2="100" y2="18" stroke-width="3"/>' +
    '<circle cx="100" cy="13" r="5" class="ki-s-glow"/>' +
  '</svg>' +
  '<p class="ki-status-text" id="kiStatusText">KI korrigiert deine Arbeit<span class="ki-dots"><span>.</span><span>.</span><span>.</span></span></p>' +
'</div>';

// Kontext fuer Lazy-Load Detail-Feedback
var _lastGradeBody = null;

async function apiCallAsync(gradeEndpoint, body, options) {
  options = options || {};
  var pollInterval = options.pollInterval || 3000;
  var maxWait = options.maxWait || 180000; // 3 Minuten
  var onProgress = options.onProgress || null;

  // Grading-Kontext speichern fuer spaeteres Detail-Feedback
  _lastGradeBody = body;

  // OCR-Bilder automatisch mitsenden
  if (/grade/.test(gradeEndpoint) && typeof getOCRImages === "function") {
    var imgs = getOCRImages();
    if (imgs.length) body.images = imgs;
  }

  // Roboter-Animation in feedbackLoader einbauen
  var feedbackEl = document.getElementById("feedbackLoader");
  var originalLoaderHTML = null;
  if (feedbackEl) {
    originalLoaderHTML = feedbackEl.innerHTML;
    feedbackEl.innerHTML = KI_ROBOT_HTML;
  }

  try {
    // 1. Job erstellen
    var submitBody = Object.assign({}, body, {
      endpoint: gradeEndpoint,
      student_name: sessionStorage.getItem("student_name") || "Unbekannt"
    });

    var submitRes = await fetch(API_BASE + "/api/grade-submit", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Access-Token": getAccessToken() },
      body: JSON.stringify(submitBody)
    });

    // 401 = Token abgelaufen → Login-Modal zeigen und erneut versuchen
    if (submitRes.status === 401 && typeof requireLogin === "function") {
      // Loader zuruecksetzen
      if (feedbackEl && originalLoaderHTML) feedbackEl.innerHTML = originalLoaderHTML;
      sessionStorage.removeItem("access");
      sessionStorage.removeItem("access_token");
      return new Promise(function(resolve, reject) {
        requireLogin(function() {
          apiCallAsync(gradeEndpoint, body, options).then(resolve).catch(reject);
        });
      });
    }

    if (!submitRes.ok) {
      var submitErr = await submitRes.json().catch(function() { return {}; });
      throw new Error(submitErr.error || "HTTP " + submitRes.status);
    }

    var submitData = await submitRes.json();
    var jobId = submitData.job_id;

    // 2. Polling
    var startTime = Date.now();
    var statusMsgUpdated = false;
    while (Date.now() - startTime < maxWait) {
      await new Promise(function(r) { setTimeout(r, pollInterval); });

      // Status-Text nach 15s aktualisieren
      if (!statusMsgUpdated && feedbackEl && Date.now() - startTime > 15000) {
        var statusEl = document.getElementById("kiStatusText");
        if (statusEl) statusEl.innerHTML = 'KI analysiert deine Antworten<span class="ki-dots"><span>.</span><span>.</span><span>.</span></span>';
        statusMsgUpdated = true;
      }
      // Nach 40s nochmal aktualisieren
      if (statusMsgUpdated && feedbackEl && Date.now() - startTime > 40000) {
        var statusEl2 = document.getElementById("kiStatusText");
        if (statusEl2 && statusEl2.textContent.indexOf("Geduld") === -1) {
          statusEl2.innerHTML = 'Dauert etwas l\u00e4nger, bitte Geduld<span class="ki-dots"><span>.</span><span>.</span><span>.</span></span>';
        }
      }

      var statusRes;
      try {
        statusRes = await fetch(API_BASE + "/api/grade-status/" + jobId, {
          headers: { "X-Access-Token": getAccessToken() }
        });
      } catch (fetchErr) {
        // Netzwerkfehler beim Polling – nächster Versuch
        continue;
      }

      if (!statusRes.ok) continue;

      var statusData = await statusRes.json();

      if (onProgress) {
        try { onProgress(statusData); } catch (e) { /* Callback-Fehler ignorieren */ }
      }

      if (statusData.status === "completed") {
        return statusData.result;
      }

      if (statusData.status === "failed") {
        throw new Error(statusData.error || "Korrektur fehlgeschlagen. Bitte erneut versuchen.");
      }

      // Adaptives Polling: nach 30s langsamer
      if (Date.now() - startTime > 30000 && pollInterval < 8000) {
        pollInterval = Math.min(pollInterval + 1000, 8000);
      }
    }

    throw new Error("Zeitlimit \u00fcberschritten. Die Korrektur dauert ungew\u00f6hnlich lang. Bitte versuche es erneut.");
  } finally {
    // Originalen Loader-Inhalt wiederherstellen
    if (feedbackEl && originalLoaderHTML !== null) {
      feedbackEl.innerHTML = originalLoaderHTML;
    }
  }
}

/* ================= KORREKTUR & ASPEKTE ================= */

function renderKorrekturFeedback(d) {
  const korrekturCard = document.getElementById("korrekturCard");
  const aspekteCard = document.getElementById("aspekteCard");
  if (korrekturCard) korrekturCard.style.display = "none";
  if (aspekteCard) aspekteCard.style.display = "none";

  // Rohe uebungsaufgaben-Sektion aus Feedback entfernen (KI dupliziert sie manchmal als Text)
  var fb = document.getElementById("feedbackBody");
  if (fb) {
    fb.innerHTML = fb.innerHTML
      .replace(/<h\d[^>]*>\s*[Uu]ebungsaufgaben\s*<\/h\d>[\s\S]*$/i, '')
      .replace(/<p>\s*[Uu]ebungsaufgaben\s*<\/p>[\s\S]*$/i, '');
  }
  if (fb && d.feedback_kurz && d.feedback_kurz.length) {
    // Scores + Kurzfeedback fuer spaeteres Detail-Feedback merken
    window._detailFeedbackScores = d.scores || null;
    window._detailFeedbackKurz = d.feedback_kurz;

    var kurzHtml = '<ul class="feedback-kurz">' +
      d.feedback_kurz.map(function(p) { return '<li>' + escapeHtml(p) + '</li>'; }).join('') +
      '</ul>';
    var detailHtml = fb.innerHTML;
    if (detailHtml && detailHtml.trim()) {
      // Detail bereits vorhanden (z.B. Fallback) → direkt aufklappbar anzeigen
      fb.innerHTML = kurzHtml +
        '<details class="feedback-detail-toggle"><summary>Detailliertes Feedback anzeigen</summary>' +
        '<div class="feedback-detail-body">' + detailHtml + '</div></details>';
    } else {
      // Detail noch nicht generiert → Lade-Button anzeigen
      fb.innerHTML = kurzHtml +
        '<button class="btn btn-secondary feedback-load-detail" onclick="loadDetailFeedback(this)">Detailliertes Feedback laden</button>' +
        '<div class="feedback-detail-body" id="feedbackDetailContainer" style="display:none"></div>';
    }
  }

  const sanitizeOpts = { ALLOWED_TAGS: ["mark", "br", "p"], ALLOWED_ATTR: ["class", "title"] };

  // Single-part korrektur
  const body = document.getElementById("korrekturBody");
  if (body && d.korrektur_text) {
    body.innerHTML = DOMPurify.sanitize(d.korrektur_text.replace(/\n/g, "<br>"), sanitizeOpts);
    if (korrekturCard) korrekturCard.style.display = "";
  }

  // Two-part korrektur
  const bodyA = document.getElementById("korrekturBodyA");
  const bodyB = document.getElementById("korrekturBodyB");
  if (bodyA && (d.korrektur_text_a || d.korrektur_text_b)) {
    if (d.korrektur_text_a) bodyA.innerHTML = DOMPurify.sanitize(d.korrektur_text_a.replace(/\n/g, "<br>"), sanitizeOpts);
    if (d.korrektur_text_b && bodyB) bodyB.innerHTML = DOMPurify.sanitize(d.korrektur_text_b.replace(/\n/g, "<br>"), sanitizeOpts);
    if (korrekturCard) korrekturCard.style.display = "";
  }

  // Fehlende Aspekte
  const aspekteBody = document.getElementById("aspekteBody");
  if (aspekteBody && d.fehlende_aspekte?.length) {
    aspekteBody.innerHTML = d.fehlende_aspekte.map(a =>
      `<details class="aspekt-details"><summary>${escapeHtml(a.aufgabe)} <span class="aspekt-count">${a.aspekte.length} fehlend</span></summary><ul class="aspekt-liste">${a.aspekte.map(p => `<li>${escapeHtml(p)}</li>`).join("")}</ul></details>`
    ).join("");
    if (aspekteCard) aspekteCard.style.display = "";
  }

  // Übungsaufgaben bei schwachem Ergebnis
  renderUebungsaufgaben(d);

  // Rewrite-Button anzeigen
  renderRewriteButton(d);
}

/* ================= DETAIL-FEEDBACK LAZY-LOAD ================= */

async function loadDetailFeedback(btn) {
  if (!_lastGradeBody) {
    showToast("Kein Bewertungskontext vorhanden.");
    return;
  }
  btn.disabled = true;
  btn.textContent = "Wird geladen\u2026";

  try {
    var result = await apiCall("/api/detail-feedback", {
      rubric_prompt: _lastGradeBody.rubric_prompt || "",
      task_instruction: _lastGradeBody.task_instruction || "",
      primary_text: _lastGradeBody.primary_text || "",
      student_text: _lastGradeBody.student_text || _lastGradeBody.text_a || "",
      scores: window._detailFeedbackScores || null,
      feedback_kurz: window._detailFeedbackKurz || []
    });

    var container = document.getElementById("feedbackDetailContainer");
    if (!container) {
      container = btn.nextElementSibling;
    }
    if (container) {
      var parseFn = (typeof safeMathParse === "function") ? safeMathParse : marked.parse;
      container.innerHTML = DOMPurify.sanitize(parseFn(result.feedback || ""));
      container.style.display = "";
      if (typeof renderMath === "function") renderMath(container);
    }
    btn.style.display = "none";
  } catch (e) {
    btn.textContent = "Fehler \u2013 erneut versuchen";
    btn.disabled = false;
    showToast("Feedback konnte nicht geladen werden: " + e.message);
  }
}

/* ================= ÜBUNGSAUFGABEN ================= */

function renderUebungsaufgaben(d) {
  var card = document.getElementById("uebungsCard");
  if (!card) return;

  var aufgaben = d.uebungsaufgaben;
  if (!aufgaben || !aufgaben.length) {
    card.style.display = "none";
    return;
  }

  var body = document.getElementById("uebungsBody");
  if (!body) return;

  body.innerHTML = aufgaben.map(function(a, i) {
    var hinweis = a.hinweis ? '<div class="uebung-hinweis">\ud83d\udca1 ' + escapeHtml(a.hinweis) + '</div>' : '';
    return '<div class="uebung-item">' +
      '<div class="uebung-header">' +
        '<span class="uebung-nr">' + (i + 1) + '</span>' +
        '<div>' +
          '<div class="uebung-titel">' + escapeHtml(a.titel || ('Übung ' + (i + 1))) + '</div>' +
          '<div class="uebung-schwerpunkt">' + escapeHtml(a.schwerpunkt || '') + '</div>' +
        '</div>' +
      '</div>' +
      '<div class="uebung-aufgabe">' + DOMPurify.sanitize(marked.parse(a.aufgabe || '')) + '</div>' +
      hinweis +
    '</div>';
  }).join('');

  if (typeof renderMath === "function") renderMath(body);
  card.style.display = "";
}

/* ================= REWRITE / VERBESSERUNGSVORSCHLÄGE ================= */

// Seite → API-Typ Mapping
var REWRITE_TYPE_MAP = {
  "analyse": "deutsch-analyse", "eroerterung": "deutsch-eroerterung",
  "interpretation": "deutsch-interpretation",
  "materialgestuetzt-argumentierend": "deutsch-materialgestuetzt-argumentierend",
  "materialgestuetzt-informierend": "deutsch-materialgestuetzt-informierend",
  "mediation": "mediation", "writing": "writing",
  "francais-mediation": "french-mediation", "francais-schreiben": "french-writing",
  "italiano-mediation": "italian-mediation", "italiano-schreiben": "italian-writing",
  "geschichte": "geschichte", "geschichte-abitur": "geschichte-abitur",
  "ethik": "ethik", "ethik-abitur": "ethik-abitur",
  "religion": "religion", "religion-abitur": "religion-abitur",
  "katholisch": "katholisch", "katholisch-abitur": "katholisch-abitur",
  "geographie": "geographie", "geographie-abitur": "geographie-abitur",
  "politik": "pug-klausur", "pug-abitur": "pug-abitur",
  "wr": "wr", "wr-abitur": "wr-abitur",
  "latein": "latein", "latein-abitur": "latein-abitur",
  "mathe": "mathe", "mathe-abitur": "mathe-abitur",
  "chemie": "chemie", "chemie-abitur": "chemie-abitur",
  "physik": "physik", "physik-abitur": "physik-abitur",
  "biologie": "biologie", "biologie-abitur": "biologie-abitur",
  "sport": "sport", "sport-abitur": "sport-abitur",
  "informatik": "informatik", "informatik-abitur": "informatik-abitur"
};

function getRewriteType() {
  var page = window.location.pathname.split("/").pop().replace(".html", "");
  return REWRITE_TYPE_MAP[page] || page;
}

function getRewriteTopic() {
  if (typeof CONFIG !== "undefined" && CONFIG.storedData) {
    return CONFIG.storedData.textsorte || CONFIG.storedData.thema || CONFIG.storedData.topic || CONFIG.storedData.aufgabenstellung || "";
  }
  return "";
}

function renderRewriteButton(feedbackData) {
  var textarea = document.getElementById("studentText");
  if (!textarea || !textarea.value.trim()) return;

  // Alten Button entfernen
  var old = document.getElementById("rewriteBtnCard");
  if (old) old.remove();

  // Einfuege-Anker: nach aspekteCard, korrekturCard oder feedbackBody
  var anchor = document.getElementById("aspekteCard") || document.getElementById("korrekturCard");
  if (!anchor) {
    var fb = document.getElementById("feedbackBody");
    if (fb) anchor = fb.closest(".card");
  }
  if (!anchor) return;

  var card = document.createElement("div");
  card.id = "rewriteBtnCard";
  card.className = "card";
  card.style.cssText = "padding:1rem 1.2rem;display:flex;align-items:center;gap:.8rem;cursor:pointer;transition:background .15s";
  card.innerHTML = '<span style="font-size:1.4rem">✨</span>' +
    '<div style="flex:1"><strong>Verbesserungsvorschläge</strong><br>' +
    '<small style="color:var(--ink-muted)">KI zeigt dir konkrete Formulierungen, die deinen Text besser machen</small></div>' +
    '<span style="color:var(--ink-muted);font-size:1.2rem">→</span>';
  card.onclick = function () { loadRewriteSuggestions(feedbackData); };

  anchor.parentNode.insertBefore(card, anchor.nextSibling);
}

async function loadRewriteSuggestions(feedbackData) {
  var textarea = document.getElementById("studentText");
  if (!textarea || !textarea.value.trim()) return;

  // Button durch Lade-Zustand ersetzen
  var btnCard = document.getElementById("rewriteBtnCard");
  if (btnCard) {
    btnCard.onclick = null;
    btnCard.style.cursor = "default";
    btnCard.innerHTML = '<div class="loader-spinner" style="width:24px;height:24px;border-width:2px"></div>' +
      '<span style="color:var(--ink-muted)">Verbesserungsvorschläge werden erstellt...</span>';
  }

  try {
    var result = await apiCall("/api/rewrite", {
      student_text: textarea.value,
      type: getRewriteType(),
      feedback: (feedbackData.feedback || "").substring(0, 3000),
      topic: getRewriteTopic()
    });

    if (!result.suggestions || !result.suggestions.length) {
      if (btnCard) btnCard.innerHTML = '<span style="color:var(--ink-muted)">Keine Vorschläge verfügbar.</span>';
      return;
    }

    showRewriteOverlay(result);
  } catch (e) {
    if (btnCard) {
      btnCard.innerHTML = '<span style="color:var(--warning)">Fehler: ' + escapeHtml(e.message) + '</span>';
      btnCard.style.cursor = "pointer";
      btnCard.onclick = function () { loadRewriteSuggestions(feedbackData); };
    }
  }
}

var REWRITE_CATEGORY_COLORS = {
  "Fachsprache": "#6366f1", "Argumentation": "#059669", "Struktur": "#b45309",
  "Stil": "#db2777", "Grammatik": "#ef4444", "Inhalt": "#2563eb", "Quellenarbeit": "#7c3aed"
};

function showRewriteOverlay(result) {
  // Altes Overlay entfernen
  var old = document.getElementById("rewriteOverlay");
  if (old) old.remove();

  var overlay = document.createElement("div");
  overlay.id = "rewriteOverlay";
  overlay.className = "rewrite-overlay";

  var html = '<div class="rewrite-panel">' +
    '<div class="rewrite-header">' +
    '<h3>✨ Verbesserungsvorschläge</h3>' +
    '<button class="rewrite-close" onclick="closeRewriteOverlay()" aria-label="Schließen">✕</button>' +
    '</div>' +
    '<div class="rewrite-body">';

  // Vorschlaege
  result.suggestions.forEach(function (s, i) {
    var catColor = REWRITE_CATEGORY_COLORS[s.category] || "#6b7280";
    html += '<div class="rewrite-suggestion">' +
      '<div class="rewrite-suggestion-header">' +
      '<span class="rewrite-nr">' + (i + 1) + '</span>' +
      '<span class="rewrite-category" style="background:' + catColor + '">' + escapeHtml(s.category || "") + '</span>' +
      '</div>' +
      '<div class="rewrite-comparison">' +
      '<div class="rewrite-before"><div class="rewrite-label">Vorher</div><div class="rewrite-text">' + escapeHtml(s.original || "") + '</div></div>' +
      '<div class="rewrite-arrow">→</div>' +
      '<div class="rewrite-after"><div class="rewrite-label">Nachher</div><div class="rewrite-text">' + escapeHtml(s.improved || "") + '</div></div>' +
      '</div>' +
      '<div class="rewrite-reason">' + escapeHtml(s.reason || "") + '</div>' +
      '</div>';
  });

  // Umgeschriebener Absatz
  if (result.rewritten_paragraph) {
    html += '<div class="rewrite-paragraph">' +
      '<h4>Beispiel-Umformulierung</h4>' +
      '<p>' + escapeHtml(result.rewritten_paragraph) + '</p>' +
      '</div>';
  }

  html += '</div></div>';
  overlay.innerHTML = html;

  // Klick auf Hintergrund schliesst Overlay
  overlay.addEventListener("click", function (e) {
    if (e.target === overlay) closeRewriteOverlay();
  });

  document.body.appendChild(overlay);

  // Button aktualisieren
  var btnCard = document.getElementById("rewriteBtnCard");
  if (btnCard) {
    btnCard.innerHTML = '<span style="font-size:1.4rem">✨</span>' +
      '<div style="flex:1"><strong>Verbesserungsvorschläge</strong><br>' +
      '<small style="color:var(--ink-muted)">' + result.suggestions.length + ' Vorschläge — nochmal anzeigen</small></div>' +
      '<span style="color:var(--ink-muted);font-size:1.2rem">→</span>';
    btnCard.style.cursor = "pointer";
    btnCard.onclick = function () { showRewriteOverlay(result); };
  }
}

function closeRewriteOverlay() {
  var overlay = document.getElementById("rewriteOverlay");
  if (overlay) {
    overlay.style.animation = "fadeOut .2s ease-out forwards";
    setTimeout(function () { overlay.remove(); }, 200);
  }
}

/* ================= NAVIGATION ================= */

let currentStep = null;

function nav(step, _pushHistory) {
  const prefix = MODULE_CONFIG.sectionPrefix || "";
  const steps = MODULE_CONFIG.steps;
  const idx = steps.indexOf(step);

  // Guard: steps 1-3 need a generated task
  if (idx >= 1 && idx <= 3 && !CONFIG.storedData) {
    showToast("Bitte zuerst eine Aufgabe generieren.");
    return;
  }

  // Hide all sections, deactivate all nav buttons
  document.querySelectorAll("main > section").forEach(s => s.classList.remove("active"));
  document.querySelectorAll("nav button").forEach(b => b.classList.remove("active"));

  // Show target section
  const sec = document.getElementById(prefix + step);
  if (sec) sec.classList.add("active");

  // Activate nav button
  const navBtn = document.getElementById("nav-" + step);
  if (navBtn) {
    navBtn.classList.add("active");
  } else {
    // Fallback: use index-based lookup
    document.querySelectorAll("nav button")[idx]?.classList.add("active");
  }

  currentStep = step;
  if (step === "task" || step === "reading") injectPdfButton();
  if (step === "progress") renderProgress();
  window.scrollTo({ top: 0, behavior: "smooth" });

  // Browser history: back button navigates between steps
  if (_pushHistory !== false) {
    history.pushState({ step: step }, "");
  }
}

/* ================= THEME ================= */

function toggleDarkMode() {
  const isDark = document.documentElement.getAttribute("data-theme") === "dark";
  document.documentElement.setAttribute("data-theme", isDark ? "light" : "dark");
  const btn = document.getElementById("themeToggleBtn");
  if (btn) btn.textContent = isDark ? "🌙" : "☀️";
  if (progressChartInstance) renderProgressChart();
}

function initTheme() {
  document.documentElement.setAttribute("data-theme", "light");
  const btn = document.getElementById("themeToggleBtn");
  if (btn) btn.textContent = "🌙";
}

/* ================= TIMER ================= */

let timerInterval = null, timerSeconds = 0, timerPaused = false;

function startTimer() {
  timerSeconds = (parseInt(document.getElementById("timerMinutes").value) || 180) * 60;
  document.getElementById("timerBar").classList.add("active");
  document.getElementById("timerStartBtn").style.display = "none";
  updateTimerDisplay();
  timerInterval = setInterval(() => {
    if (!timerPaused) {
      timerSeconds--;
      updateTimerDisplay();
      if (timerSeconds <= 0) { clearInterval(timerInterval); showToast("Zeit abgelaufen!"); }
    }
  }, 1000);
}

function pauseTimer() {
  timerPaused = !timerPaused;
  document.getElementById("timerPauseBtn").textContent = timerPaused ? "▶ Weiter" : "⏸ Pause";
}

function stopTimer() {
  if (timerInterval) clearInterval(timerInterval);
  timerInterval = null;
  timerSeconds = 0;
  document.getElementById("timerBar").classList.remove("active");
  document.getElementById("timerStartBtn").style.display = "inline-flex";
}

function updateTimerDisplay() {
  const h = Math.floor(timerSeconds / 3600);
  const m = Math.floor((timerSeconds % 3600) / 60);
  const s = timerSeconds % 60;
  document.getElementById("timerDisplay").textContent =
    h > 0
      ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
      : `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  document.getElementById("timerDisplay").classList.toggle("warning", timerSeconds <= 600 && timerSeconds > 0);
}

/* ================= SESSION ================= */

function saveSession() {
  const key = MODULE_CONFIG.storagePrefix + "_session_" + getStudentKey();
  localStorage.setItem(key, JSON.stringify({
    studentText: document.getElementById("studentText").value,
    storedData: CONFIG.storedData
  }));
}

function restoreSession() {
  try {
    const key = MODULE_CONFIG.storagePrefix + "_session_" + getStudentKey();
    const s = JSON.parse(localStorage.getItem(key));
    if (s) {
      if (s.studentText) document.getElementById("studentText").value = s.studentText;
      if (s.storedData && typeof renderTask === "function") {
        CONFIG.storedData = s.storedData;
        renderTask(s.storedData);
      }
      updateWordCount();
    }
  } catch (e) { console.warn("restoreSession failed:", e); }
}

/* ================= PROGRESS ================= */

let progressChartInstance = null;
let serverHistory = null; // cached server results

function getHistory() {
  // Prefer server history if loaded, fall back to localStorage
  if (serverHistory !== null) return serverHistory;
  try {
    return JSON.parse(localStorage.getItem(MODULE_CONFIG.historyKey + getStudentKey()) || "[]");
  } catch { return []; }
}

function saveToHistory(entry) {
  // Save to localStorage (immediate cache)
  const localKey = MODULE_CONFIG.historyKey + getStudentKey();
  let history = [];
  try { history = JSON.parse(localStorage.getItem(localKey) || "[]"); } catch { }
  history.push({ date: new Date().toISOString(), ...entry });
  localStorage.setItem(localKey, JSON.stringify(history));
  // Invalidate server cache so next renderProgress fetches fresh data
  serverHistory = null;
}

function deleteHistoryEntry(index) {
  // Only works on localStorage entries (server entries are permanent)
  const localKey = MODULE_CONFIG.historyKey + getStudentKey();
  let history = [];
  try { history = JSON.parse(localStorage.getItem(localKey) || "[]"); } catch { }
  history.splice(index, 1);
  localStorage.setItem(localKey, JSON.stringify(history));
  serverHistory = null;
  renderProgress();
}

function clearHistory() {
  if (!confirm("Lokalen Verlauf löschen? Server-Ergebnisse bleiben erhalten.")) return;
  localStorage.removeItem(MODULE_CONFIG.historyKey + getStudentKey());
  serverHistory = null;
  renderProgress();
}

function serverEntryToLocal(entry) {
  const base = { date: entry.date, total: entry.total };
  switch (entry.type) {
    case "mediation": case "writing": case "french-mediation": case "french-writing": case "italian-mediation": case "italian-writing":
      return { ...base, topic: entry.topic, content: entry.content, language: entry.language };
    case "deutsch-analyse":
      return { ...base, textsorte: entry.topic, verstehen: entry.content, darstellung: entry.language };
    case "deutsch-eroerterung":
      return { ...base, thema: entry.topic, verstehen: entry.content, darstellung: entry.language };
    case "deutsch-interpretation":
      return { ...base, gattung: entry.topic, verstehen: entry.content, darstellung: entry.language };
    case "deutsch-materialgestuetzt":
      return { ...base, aufgabentyp: entry.topic, verstehen: entry.content, darstellung: entry.language };
    case "geschichte":
      return { ...base, thema: entry.topic, sachkompetenz: entry.content, darstellung: entry.language };
    case "pug-klausur":
      return { ...base, halbjahr: entry.topic, verstehen: entry.content, darstellung: entry.language };
    case "pug-abitur":
      return { ...base, halbjahr: entry.topic, teil_a: entry.content, darstellung: entry.language };
    case "ethik":
      return { ...base, lernbereich: entry.topic, verstehen: entry.content, darstellung: entry.language };
    case "ethik-abitur":
      return { ...base, lernbereich: entry.topic, teil_a: entry.content, darstellung: entry.language };
    case "geographie":
      return { ...base, halbjahr: entry.topic, verstehen: entry.content, darstellung: entry.language };
    case "geographie-abitur":
      return { ...base, halbjahr: entry.topic, teil_a: entry.content, darstellung: entry.language };
    case "latein":
      return { ...base, autor: entry.topic, verstehen: entry.content, darstellung: entry.language };
    case "latein-abitur":
      return { ...base, autor: entry.topic, teil_a: entry.content, darstellung: entry.language };
    case "mathe":
      return { ...base, sachgebiet: entry.topic, aufgabentyp: entry.content, darstellung: entry.language };
    case "mathe-abitur":
      return { ...base, teil_a: entry.content, darstellung: entry.language };
    case "chemie":
      return { ...base, sachgebiet: entry.topic, aufgabentyp: entry.content, darstellung: entry.language };
    case "chemie-abitur":
      return { ...base, level: entry.topic, be: entry.content, darstellung: entry.language };
    case "geschichte-abitur":
      return { ...base, thema: entry.topic, sach_a: entry.content, darstellung: entry.language };
    case "wr":
      return { ...base, fachbereich: entry.topic, be: entry.content, notenpunkte: entry.language, total: entry.total };
    case "wr-abitur":
      return { ...base, fachbereich: entry.topic, be: entry.content, notenpunkte: entry.language, total: entry.total };
    default: return { ...base, topic: entry.topic };
  }
}

async function fetchServerHistory() {
  if (!MODULE_CONFIG.historyType) return null;
  try {
    const data = await apiCall("/api/student-results", {
      student_name: sessionStorage.getItem("student_name") || ""
    });
    if (data.results) {
      return data.results
        .filter(r => r.type === MODULE_CONFIG.historyType)
        .map(serverEntryToLocal);
    }
  } catch { }
  return null;
}

function renderProgressWith(history) {
  const empty = document.getElementById("progressEmpty");
  const content = document.getElementById("progressContent");
  const clearBtn = document.getElementById("clearHistoryBtn");

  if (!history.length) {
    if (empty) empty.style.display = "block";
    if (content) content.style.display = "none";
    if (clearBtn) clearBtn.style.display = "none";
    return;
  }

  if (empty) empty.style.display = "none";
  if (content) content.style.display = "block";
  if (clearBtn) clearBtn.style.display = "inline-flex";

  const totals = history.map(h => h.total).filter(t => t != null);
  document.getElementById("statAttempts").textContent = history.length;
  document.getElementById("statAverage").textContent = totals.length
    ? (totals.reduce((a, b) => a + b, 0) / totals.length).toFixed(1)
    : "–";
  document.getElementById("statBest").textContent = totals.length ? Math.max(...totals) : "–";

  if (typeof renderHistoryTable === "function") {
    renderHistoryTable(history);
  }

  renderProgressChart();
}

function renderProgress() {
  // Show localStorage data immediately
  renderProgressWith(getHistory());

  // Then fetch from server and update
  fetchServerHistory().then(function (results) {
    if (results) {
      serverHistory = results;
      renderProgressWith(results);
    }
  });
}

function renderProgressChart() {
  const history = getHistory();
  if (!history.length) return;
  const ctx = document.getElementById("progressChart");
  if (!ctx) return;
  if (progressChartInstance) progressChartInstance.destroy();

  const color = MODULE_CONFIG.chartColor || "#059669";
  const colorAlpha = color + "1a"; // ~10% opacity

  progressChartInstance = new Chart(ctx, {
    type: "line",
    data: {
      labels: history.map((_, i) => `#${i + 1}`),
      datasets: [{
        label: "Gesamt",
        data: history.map(h => h.total),
        borderColor: color,
        backgroundColor: colorAlpha,
        fill: true,
        tension: 0.3,
        borderWidth: 2.5
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: { y: { min: 0, max: 15 } }
    }
  });
}

/* ================= PDF EXPORT ================= */

// Hilfsfunktion: PDF-freundlichen Off-Screen-Klon erstellen
/* ================= PDF EXPORT (via window.print()) ================= */
/* Blendet alles außer dem Ziel-Element aus, druckt, stellt alles wieder her */

var _printHidden = [];

function printElement(targetEl) {
  if (!targetEl) return;
  _printHidden = [];

  // Alle direkten Kinder von body ausblenden, außer dem Eltern-Pfad des Ziels
  var ancestors = [];
  var node = targetEl;
  while (node && node !== document.body) {
    ancestors.push(node);
    node = node.parentElement;
  }

  // Auf jeder Ebene: Geschwister ausblenden
  ancestors.forEach(function (el) {
    var parent = el.parentElement;
    if (!parent) return;
    Array.from(parent.children).forEach(function (sibling) {
      if (sibling === el) return;
      if (sibling.style.display === "none") return; // bereits versteckt
      var prev = sibling.style.display;
      sibling.style.setProperty("display", "none", "important");
      _printHidden.push({ el: sibling, prev: prev });
    });
  });

  // Ziel-Element sichtbar machen (falls es display:none hat)
  var targetPrev = targetEl.style.display;
  if (getComputedStyle(targetEl).display === "none") {
    targetEl.style.setProperty("display", "block", "important");
    _printHidden.push({ el: targetEl, prev: targetPrev, restore: true });
  }

  window.print();
}

window.addEventListener("afterprint", function () {
  _printHidden.forEach(function (item) {
    if (item.restore) {
      item.el.style.display = item.prev;
    } else {
      if (item.prev) {
        item.el.style.display = item.prev;
      } else {
        item.el.style.removeProperty("display");
      }
    }
  });
  _printHidden = [];
});

function exportPDF() {
  var el = document.getElementById("feedbackContent");
  if (!el) return;
  printElement(el);
}

/* ================= TASK/MATERIAL PDF EXPORT ================= */

function hasMaterial() {
  var prefix = MODULE_CONFIG.sectionPrefix || "";
  var sec = document.getElementById(prefix + "task");
  if (!sec) return false;
  return !!(
    sec.querySelector("#materialsContainer")?.children.length ||
    sec.querySelector("#sourceText")?.textContent.trim() ||
    sec.querySelector("#articleBody")?.textContent.trim()
  );
}

function isExamPage() {
  var prefix = MODULE_CONFIG.sectionPrefix || "";
  return !document.getElementById(prefix + "task") && !!document.getElementById(prefix + "reading");
}

function showPdfExportModal() {
  if (isExamPage()) {
    // Englisch-Abitur: Reading + Writing Sections
    if (document.getElementById("pdfModal")) return;
    var overlay = document.createElement("div");
    overlay.className = "pdf-modal-overlay";
    overlay.id = "pdfModal";
    overlay.onclick = function (e) { if (e.target === overlay) closePdfModal(); };
    overlay.innerHTML =
      '<div class="pdf-modal">' +
      '<h3>Als PDF speichern</h3>' +
      '<div class="pdf-modal-buttons">' +
      '<button class="btn" onclick="exportTaskPDF(\'reading\')">Nur Reading</button>' +
      '<button class="btn" onclick="exportTaskPDF(\'writing-only\')">Nur Writing</button>' +
      '<button class="btn" onclick="exportTaskPDF(\'exam\')">Komplette Pr\u00fcfung</button>' +
      '<button class="btn btn-cancel" onclick="closePdfModal()">Abbrechen</button>' +
      '</div>' +
      '</div>';
    document.body.appendChild(overlay);
    return;
  }
  if (!hasMaterial()) {
    exportTaskPDF("task");
    return;
  }
  if (document.getElementById("pdfModal")) return;
  var overlay = document.createElement("div");
  overlay.className = "pdf-modal-overlay";
  overlay.id = "pdfModal";
  overlay.onclick = function (e) { if (e.target === overlay) closePdfModal(); };
  overlay.innerHTML =
    '<div class="pdf-modal">' +
    '<h3>Als PDF speichern</h3>' +
    '<div class="pdf-modal-buttons">' +
    '<button class="btn" onclick="exportTaskPDF(\'task\')">Nur Aufgaben</button>' +
    '<button class="btn" onclick="exportTaskPDF(\'material\')">Nur Material</button>' +
    '<button class="btn" onclick="exportTaskPDF(\'both\')">Aufgaben + Material</button>' +
    '<button class="btn btn-cancel" onclick="closePdfModal()">Abbrechen</button>' +
    '</div>' +
    '</div>';
  document.body.appendChild(overlay);
}

function closePdfModal() {
  var m = document.getElementById("pdfModal");
  if (m) m.remove();
}

function exportTaskPDF(mode) {
  var prefix = MODULE_CONFIG.sectionPrefix || "";
  closePdfModal();

  // Exam-Modi (Reading/Writing-Seiten wie Englisch Abitur)
  if (mode === "reading" || mode === "writing-only" || mode === "exam") {
    var readingSec = document.getElementById(prefix + "reading");
    var writingSec = document.getElementById(prefix + "writing");
    if (mode === "reading" && readingSec) {
      printElement(readingSec);
    } else if (mode === "writing-only" && writingSec) {
      printElement(writingSec);
    } else if (mode === "exam") {
      // Beide Sections in temporären Wrapper zusammenfassen
      var wrapper = document.createElement("div");
      wrapper.id = "_examPrintWrapper";
      if (readingSec) wrapper.appendChild(readingSec.cloneNode(true));
      if (writingSec) wrapper.appendChild(writingSec.cloneNode(true));
      // Textarea-Inhalte werden nicht geklont – Input-Felder leeren (sind eh leer beim Drucken)
      document.body.appendChild(wrapper);
      var cleanup = function () {
        wrapper.remove();
        window.removeEventListener("afterprint", cleanup);
      };
      window.addEventListener("afterprint", cleanup);
      printElement(wrapper);
    }
    return;
  }

  // Standard-Modi (task/material/both)
  var sec = document.getElementById(prefix + "task");
  if (!sec) return;

  // Mode-spezifisch: Material- oder Aufgaben-Elemente temporär ausblenden
  var tempHidden = [];
  var materialIds = ["materialsContainer", "sourceText", "sourceMeta", "textTitle", "zusatzMaterialien", "articleBody", "articleTitle"];
  var taskIds = ["taskInstruction", "taskMeta", "teilaufgabenContainer", "teilAPflichtContainer", "teilAWahlContainer", "teilBContainer"];

  if (mode === "task") {
    materialIds.forEach(function (id) {
      var el = document.getElementById(id);
      if (el && el.style.display !== "none") {
        tempHidden.push({ el: el, prev: el.style.display });
        el.style.display = "none";
      }
    });
  } else if (mode === "material") {
    taskIds.forEach(function (id) {
      var el = document.getElementById(id);
      if (el && el.style.display !== "none") {
        tempHidden.push({ el: el, prev: el.style.display });
        el.style.display = "none";
      }
    });
  }

  // afterprint-Listener für mode-spezifische Elemente
  var restoreMode = function () {
    tempHidden.forEach(function (item) {
      if (item.prev) {
        item.el.style.display = item.prev;
      } else {
        item.el.style.removeProperty("display");
      }
    });
    window.removeEventListener("afterprint", restoreMode);
  };
  if (tempHidden.length) {
    window.addEventListener("afterprint", restoreMode);
  }

  printElement(sec);
}

function injectPdfButton() {
  var prefix = MODULE_CONFIG.sectionPrefix || "";
  var sec = document.getElementById(prefix + "task") || document.getElementById(prefix + "reading");
  if (!sec) return;
  if (sec.querySelector(".pdf-export-btn")) return;
  var pdfBtn = document.createElement("button");
  pdfBtn.className = "btn btn-secondary pdf-export-btn";
  pdfBtn.style.marginRight = "0.5rem";
  pdfBtn.textContent = "Als PDF speichern";
  pdfBtn.onclick = showPdfExportModal;
  var allBtns = sec.querySelectorAll(":scope > button");
  var lastNavBtn = null;
  for (var i = 0; i < allBtns.length; i++) {
    var oc = allBtns[i].getAttribute("onclick") || "";
    if (oc.indexOf("nav(") !== -1) lastNavBtn = allBtns[i];
  }
  if (lastNavBtn) {
    lastNavBtn.parentNode.insertBefore(pdfBtn, lastNavBtn);
  } else {
    sec.appendChild(pdfBtn);
  }
}

/* ================= HIGHLIGHTER ================= */

let currentHL = null;

function selectHL(color) {
  currentHL = currentHL === color ? null : color;
  document.querySelectorAll(".hl-btn").forEach(b =>
    b.classList.toggle("active", b.dataset.color === currentHL)
  );
}

function initHL() {
  const selector = MODULE_CONFIG.hlSelector || ".source-text";
  document.querySelectorAll(selector).forEach(el => {
    el.addEventListener("mouseup", () => applyHL(el));
    el.addEventListener("touchend", () => applyHL(el));
  });
}

function applyHL(container) {
  if (!currentHL) return;
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed || !sel.rangeCount) return;
  const range = sel.getRangeAt(0);
  if (!container.contains(range.commonAncestorContainer)) return;

  if (currentHL === "eraser") {
    const spans = [];
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_ELEMENT);
    let node;
    while (node = walker.nextNode()) {
      if (node.className && node.className.toString().startsWith("hl-") && sel.containsNode(node, true))
        spans.push(node);
    }
    spans.forEach(span => {
      const p = span.parentNode;
      while (span.firstChild) p.insertBefore(span.firstChild, span);
      p.removeChild(span);
    });
    container.normalize();
  } else {
    const textNodes = [];
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
    let node;
    while (node = walker.nextNode()) {
      if (sel.containsNode(node, true)) textNodes.push(node);
    }
    textNodes.forEach(textNode => {
      let startOffset = 0, endOffset = textNode.length;
      if (textNode === range.startContainer) startOffset = range.startOffset;
      if (textNode === range.endContainer) endOffset = range.endOffset;
      if (startOffset >= endOffset) return;
      const hlRange = document.createRange();
      hlRange.setStart(textNode, startOffset);
      hlRange.setEnd(textNode, endOffset);
      const span = document.createElement("span");
      span.className = "hl-" + currentHL;
      try { hlRange.surroundContents(span); } catch { }
    });
  }
  sel.removeAllRanges();
  if (MODULE_CONFIG.afterHL) MODULE_CONFIG.afterHL();
  syncHL();
}

function clearAllHL() {
  const selector = MODULE_CONFIG.hlSelector || ".source-text";
  document.querySelectorAll(selector).forEach(c => {
    c.querySelectorAll("[class^='hl-']").forEach(s => {
      const p = s.parentNode;
      while (s.firstChild) p.insertBefore(s.firstChild, s);
      p.removeChild(s);
    });
    c.normalize();
  });
  if (MODULE_CONFIG.afterHL) MODULE_CONFIG.afterHL();
  syncHL();
}

function syncHL() {
  // Use module-specific sync if defined
  if (MODULE_CONFIG.syncHL) {
    MODULE_CONFIG.syncHL();
    return;
  }
  // Default: sync sourceText -> writeSourceRef
  const s = document.getElementById("sourceText");
  const w = document.getElementById("writeSourceRef");
  if (s && w) w.innerHTML = s.innerHTML;
}

/* ================= OCR ================= */

const ocrPages = [];

/** Bild auf max maxDim px resizen und als JPEG Base64 zurückgeben */
function compressImage(file, maxDim) {
  maxDim = maxDim || 2000;
  return new Promise(function (resolve, reject) {
    var img = new Image();
    img.onload = function () {
      var w = img.naturalWidth, h = img.naturalHeight;
      if (w > maxDim || h > maxDim) {
        var ratio = Math.min(maxDim / w, maxDim / h);
        w = Math.round(w * ratio);
        h = Math.round(h * ratio);
      }
      var canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      canvas.getContext("2d").drawImage(img, 0, 0, w, h);
      var dataUrl = canvas.toDataURL("image/jpeg", 0.85);
      resolve(dataUrl.split(",")[1]);
      URL.revokeObjectURL(img.src);
    };
    img.onerror = function () { reject(new Error("Bild konnte nicht geladen werden.")); };
    img.src = URL.createObjectURL(file);
  });
}

/** Komprimierte Base64-Bilder aller erfolgreich erkannten OCR-Seiten */
function getOCRImages() {
  return ocrPages.filter(function (p) { return p.base64 && p.status === "done"; }).map(function (p) { return p.base64; });
}

async function handleOCRFiles(fileList) {
  const files = Array.from(fileList).filter(f => {
    if (!f.type.startsWith("image/")) { showToast(f.name + " ist kein Bild."); return false; }
    if (f.size > 10 * 1024 * 1024) { showToast(f.name + " ist zu groß (max 10 MB)."); return false; }
    return true;
  });
  for (const f of files) {
    ocrPages.push({ file: f, url: URL.createObjectURL(f), base64: null, text: "", status: "pending" });
  }
  renderOCRPages();

  const startIdx = ocrPages.length - files.length;
  const ocrEndpoint = (typeof MODULE_CONFIG !== "undefined" && MODULE_CONFIG.ocrEndpoint) || "/api/ocr";
  document.getElementById("ocrLoader").style.display = "block";

  for (let i = startIdx; i < ocrPages.length; i++) {
    const p = ocrPages[i];
    p.status = "processing";
    renderOCRPages();
    document.getElementById("ocrProgress").textContent = `Seite ${i + 1} von ${ocrPages.length} wird erkannt …`;

    try {
      const b64 = await compressImage(p.file, 2000);
      p.base64 = b64;
      const d = await apiCall(ocrEndpoint, { image_base64: b64 });
      p.text = d.text || "";
      p.status = "done";
    } catch (e) {
      p.text = `[Fehler bei Seite ${i + 1}: ${e.message}]`;
      p.status = "error";
    }
    renderOCRPages();
  }

  document.getElementById("ocrLoader").style.display = "none";
  document.getElementById("ocrProgress").textContent = "";
  combineOCRTexts();
  document.getElementById("ocrResult").style.display = "block";
  document.getElementById("ocrFileInput").value = "";
}

function fileToBase64(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result.split(",")[1]);
    r.onerror = rej;
    r.readAsDataURL(file);
  });
}

/* PDF.js lazy loader (v3.x legacy build for non-module usage) */
let _pdfjsLoaded = false, _pdfjsLoading = false, _pdfjsCbs = [];
function loadPdfJs() {
  return new Promise(function (resolve) {
    if (_pdfjsLoaded && window.pdfjsLib) { resolve(); return; }
    _pdfjsCbs.push(resolve);
    if (_pdfjsLoading) return;
    _pdfjsLoading = true;
    const s = document.createElement("script");
    s.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
    s.onload = function () {
      _pdfjsLoaded = true; _pdfjsLoading = false;
      if (window.pdfjsLib) window.pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
      _pdfjsCbs.forEach(function (c) { c(); }); _pdfjsCbs = [];
    };
    s.onerror = function () { _pdfjsLoading = false; _pdfjsCbs.forEach(function (c) { c(); }); _pdfjsCbs = []; };
    document.head.appendChild(s);
  });
}

/**
 * Convert uploaded files (images + PDFs) to an array of { url, base64 } objects.
 * PDF pages are rendered to canvas at 2x scale and converted to JPEG.
 */
async function processUploadFiles(files) {
  const results = [];
  for (const f of Array.from(files)) {
    if (f.type === "application/pdf") {
      await loadPdfJs();
      if (!window.pdfjsLib) { console.error("PDF.js not loaded"); continue; }
      try {
        const arrayBuf = await f.arrayBuffer();
        const pdf = await window.pdfjsLib.getDocument({ data: arrayBuf }).promise;
        for (let p = 1; p <= pdf.numPages; p++) {
          const page = await pdf.getPage(p);
          const vp = page.getViewport({ scale: 2 });
          const canvas = document.createElement("canvas");
          canvas.width = vp.width;
          canvas.height = vp.height;
          await page.render({ canvasContext: canvas.getContext("2d"), viewport: vp }).promise;
          const dataUrl = canvas.toDataURL("image/jpeg", 0.92);
          results.push({ url: dataUrl, base64: dataUrl.split(",")[1] });
        }
      } catch (e) { console.error("PDF error:", e); }
    } else if (f.type.startsWith("image/")) {
      const url = URL.createObjectURL(f);
      const base64 = await fileToBase64(f);
      results.push({ url: url, base64: base64 });
    }
  }
  return results;
}

function renderOCRPages() {
  const c = document.getElementById("ocrPages");
  if (!ocrPages.length) { c.innerHTML = ""; return; }
  c.innerHTML = ocrPages.map((p, i) => `
    <div class="ocr-page-thumb ${p.status}">
      <img src="${p.url}" alt="Seite ${i + 1}">
      <div class="page-num">Seite ${i + 1}</div>
      <button class="remove-page" onclick="removeOCRPage(${i})" title="Entfernen">✕</button>
    </div>
  `).join("");
}

function removeOCRPage(i) {
  URL.revokeObjectURL(ocrPages[i].url);
  ocrPages.splice(i, 1);
  renderOCRPages();
  if (ocrPages.length) combineOCRTexts();
  else document.getElementById("ocrResult").style.display = "none";
}

function combineOCRTexts() {
  const t = ocrPages
    .map((p, i) => ocrPages.length > 1 ? `--- Seite ${i + 1} ---\n${p.text}` : p.text)
    .join("\n\n");
  document.getElementById("ocrText").value = t;
  updateOCRWordCount();
}

function updateOCRWordCount() {
  document.getElementById("ocrWordCount").textContent =
    countWords(document.getElementById("ocrText").value) + " Wörter erkannt";
}

function useOCRText() {
  const t = document.getElementById("ocrText").value;
  if (!t.trim()) { showToast("Kein Text vorhanden."); return; }
  const clean = t.replace(/---\s*Seite\s*\d+\s*---\n?/g, "").trim();
  document.getElementById("studentText").value = clean;
  updateWordCount();
  showToast("Text übernommen!", "success");
  document.getElementById("studentText").scrollIntoView({ behavior: "smooth" });
}

function clearOCR() {
  ocrPages.forEach(p => URL.revokeObjectURL(p.url));
  ocrPages.length = 0;
  renderOCRPages();
  document.getElementById("ocrText").value = "";
  document.getElementById("ocrResult").style.display = "none";
  document.getElementById("ocrFileInput").value = "";
}

/* ================= DASHBOARD-LINK IM FOOTER ================= */

;(function() {
  var footer = document.querySelector("footer");
  if (!footer || /dashboard/i.test(footer.innerHTML)) return;
  var br = document.createElement("br");
  var a = document.createElement("a");
  a.href = "dashboard.html";
  a.textContent = "Lehrer-Dashboard \u2192";
  a.style.cssText = "font-size:0.75rem; opacity:0.6; margin-top:0.5rem; display:inline-block;";
  footer.appendChild(br);
  footer.appendChild(a);
})();

/* ================= INIT ================= */

// Drag & Drop for OCR upload zone
; (function () {
  const z = document.getElementById("uploadZone");
  if (!z) return;
  z.addEventListener("dragover", e => { e.preventDefault(); z.classList.add("dragover"); });
  z.addEventListener("dragleave", () => z.classList.remove("dragover"));
  z.addEventListener("drop", e => {
    e.preventDefault();
    z.classList.remove("dragover");
    const f = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith("image/"));
    if (f.length) handleOCRFiles(f);
  });
})();

// beforeunload protection — only warn when actively writing
window.addEventListener("beforeunload", function (e) {
  if (currentStep !== "write") return;
  const ta = document.getElementById("studentText");
  if (ta && ta.value.trim().length > 50) {
    e.preventDefault();
    e.returnValue = "";
  }
});

// bfcache handler
window.addEventListener("pageshow", function (e) {
  if (e.persisted) {
    if (sessionStorage.getItem("access") !== "1" || !sessionStorage.getItem("student_name")) {
      if (typeof MODULE_CONFIG !== 'undefined' && MODULE_CONFIG.hasOwnLogin) {
        const ls = document.getElementById("login-screen");
        const aw = document.getElementById("app-wrapper");
        if (ls) ls.style.display = "flex";
        if (aw) aw.style.display = "none";
      }
      // Kein Redirect mehr – Seite bleibt sichtbar im Gast-Modus
    }
  }
});

// Browser back/forward navigates between stepper steps
window.addEventListener("popstate", function (e) {
  if (e.state && e.state.step) {
    nav(e.state.step, false);
  }
});

/* ================= LEHRER-CODE UI ================= */

function initTeacherCodeUI() {
  var headerRight = document.querySelector(".header-right");
  if (!headerRight || !sessionStorage.getItem("student_name")) return;
  if (typeof MODULE_CONFIG === "undefined" || !MODULE_CONFIG.historyType) return;

  var subject = MODULE_CONFIG.historyType;
  var savedCode = localStorage.getItem("teacher_code_" + subject) || "";

  var codeBtn = document.createElement("button");
  codeBtn.className = "teacher-code-btn";
  codeBtn.id = "teacherCodeBtn";
  codeBtn.title = savedCode ? "Lehrer-Code: " + savedCode : "Lehrer-Code eingeben";
  codeBtn.textContent = savedCode || "Code";
  codeBtn.style.cssText = "background:" + (savedCode ? "var(--accent)" : "var(--accent-soft)") + ";border:1px solid " + (savedCode ? "var(--accent)" : "var(--border)") + ";border-radius:var(--radius-sm);padding:.3rem .6rem;font-size:.75rem;font-family:var(--font-mono);font-weight:700;color:" + (savedCode ? "#fff" : "var(--accent)") + ";cursor:pointer;min-height:36px;min-width:44px;transition:all .15s;";
  codeBtn.onclick = showTeacherCodeModal;

  var themeBtn = headerRight.querySelector(".theme-toggle");
  if (themeBtn) {
    headerRight.insertBefore(codeBtn, themeBtn);
  } else {
    headerRight.appendChild(codeBtn);
  }
}

function showTeacherCodeModal() {
  var old = document.getElementById("teacherCodeModal");
  if (old) old.remove();

  var subject = MODULE_CONFIG.historyType;
  var savedCode = localStorage.getItem("teacher_code_" + subject) || "";
  var savedInfo = localStorage.getItem("teacher_code_info_" + subject) || "";

  var overlay = document.createElement("div");
  overlay.id = "teacherCodeModal";
  overlay.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:9999;display:flex;align-items:center;justify-content:center;";

  var infoHtml = savedInfo ? '<p style="font-size:.82rem;color:var(--accent);margin-bottom:.8rem;font-weight:600;">' + escapeHtml(savedInfo) + '</p>' : '';
  var removeBtn = savedCode ? '<button class="btn btn-secondary" style="flex:1" onclick="removeTeacherCode()">Entfernen</button>' : '';

  overlay.innerHTML =
    '<div style="background:var(--surface);border-radius:var(--radius-lg);padding:2rem;max-width:400px;width:90%;box-shadow:var(--shadow-xl,0 25px 50px -12px rgba(0,0,0,.25));">' +
      '<h3 style="margin:0 0 1rem;font-family:var(--font-display);">Lehrer-Code</h3>' +
      '<p style="font-size:.85rem;color:var(--ink-muted);margin-bottom:1rem;">' +
        'Gib den Code deiner Lehrkraft ein, damit sie deine Ergebnisse in diesem Fach sehen kann.' +
      '</p>' +
      infoHtml +
      '<input type="text" id="teacherCodeInput" value="' + savedCode + '" placeholder="Z.B. ABC123" ' +
        'style="width:100%;padding:.7rem;font-size:1.1rem;font-family:var(--font-mono);text-align:center;text-transform:uppercase;letter-spacing:.15em;border:2px solid var(--border);border-radius:var(--radius);background:var(--surface);color:var(--ink);box-sizing:border-box;" ' +
        'maxlength="6" autocomplete="off" onkeyup="if(event.key===\'Enter\')saveTeacherCode()">' +
      '<div id="teacherCodeError" style="color:#ef4444;font-size:.82rem;margin-top:.5rem;display:none;"></div>' +
      '<div style="display:flex;gap:.5rem;margin-top:1rem;">' +
        '<button class="btn" style="flex:1" onclick="saveTeacherCode()">Speichern</button>' +
        removeBtn +
        '<button class="btn btn-secondary" onclick="document.getElementById(\'teacherCodeModal\').remove()">Abbrechen</button>' +
      '</div>' +
    '</div>';

  overlay.addEventListener("click", function(e) {
    if (e.target === overlay) overlay.remove();
  });

  document.body.appendChild(overlay);
  document.getElementById("teacherCodeInput").focus();
}

async function saveTeacherCode() {
  var input = document.getElementById("teacherCodeInput");
  var code = input.value.toUpperCase().trim();
  var errEl = document.getElementById("teacherCodeError");
  var subject = MODULE_CONFIG.historyType;

  if (!code || code.length < 4) {
    errEl.textContent = "Code muss mindestens 4 Zeichen haben.";
    errEl.style.display = "block";
    return;
  }

  try {
    var res = await apiCall("/api/link-student-code", {
      student_name: sessionStorage.getItem("student_name"),
      code: code,
      subject: subject
    });
    localStorage.setItem("teacher_code_" + subject, code);
    localStorage.setItem("teacher_code_info_" + subject, res.teacher_name + " \u00b7 " + res.label);
    var modal = document.getElementById("teacherCodeModal");
    if (modal) modal.remove();
    updateTeacherCodeBtn(code);
    if (typeof showToast === "function") showToast("Code gespeichert!", "success");
  } catch (e) {
    errEl.textContent = e.message || "Ungueltiger Code.";
    errEl.style.display = "block";
  }
}

function removeTeacherCode() {
  var subject = MODULE_CONFIG.historyType;
  localStorage.removeItem("teacher_code_" + subject);
  localStorage.removeItem("teacher_code_info_" + subject);
  var modal = document.getElementById("teacherCodeModal");
  if (modal) modal.remove();
  updateTeacherCodeBtn("");
  if (typeof showToast === "function") showToast("Code entfernt.");
}

function updateTeacherCodeBtn(code) {
  var btn = document.getElementById("teacherCodeBtn");
  if (!btn) return;
  btn.textContent = code || "Code";
  btn.title = code ? "Lehrer-Code: " + code : "Lehrer-Code eingeben";
  btn.style.background = code ? "var(--accent)" : "var(--accent-soft)";
  btn.style.color = code ? "#fff" : "var(--accent)";
  btn.style.borderColor = code ? "var(--accent)" : "var(--border)";
}

// Main init — only for module pages (deutsch.html, etc.), not index.html
if (typeof MODULE_CONFIG !== 'undefined') window.onload = function () {
  initTheme();

  var isLoggedIn = sessionStorage.getItem("access") === "1" && sessionStorage.getItem("student_name");

  // Modules mit eigenem Login-Screen
  if (MODULE_CONFIG.hasOwnLogin) {
    if (!isLoggedIn) {
      const ls = document.getElementById("login-screen");
      const aw = document.getElementById("app-wrapper");
      if (ls) ls.style.display = "flex";
      if (aw) aw.style.display = "none";
      return;
    }
    const ls = document.getElementById("login-screen");
    const aw = document.getElementById("app-wrapper");
    if (ls) ls.style.display = "none";
    if (aw) aw.style.display = "flex";
    const greeting = document.getElementById("studentGreeting");
    if (greeting) {
      const name = sessionStorage.getItem("student_name") || "";
      const course = sessionStorage.getItem("student_course") || "";
      const level = (sessionStorage.getItem("student_level") || "").toUpperCase();
      greeting.textContent = [name, course, level].filter(Boolean).join(" · ");
      greeting.style.display = "inline";
    }
    restoreSession();
    // Sicherstellen, dass die aktive Section sichtbar ist
    // (fadeUp-Animation lief ggf. ab, während app-wrapper noch hidden war)
    if (!currentStep) {
      nav(MODULE_CONFIG.steps[0]);
    }
    initHL();
    initTeacherCodeUI();
    setInterval(saveSession, 15000);
    history.replaceState({ step: currentStep || MODULE_CONFIG.steps[0] }, "");
    return;
  }

  // Seite fuer alle zeigen – kein Redirect mehr
  if (isLoggedIn) {
    const greeting = document.getElementById("studentGreeting");
    if (greeting) {
      greeting.textContent = `${sessionStorage.getItem("student_name")} · ${(sessionStorage.getItem("student_level") || "").toUpperCase()}`;
      greeting.style.display = "inline";
    }
    restoreSession();
    initHL();
    initTeacherCodeUI();
    setInterval(saveSession, 30000);
  } else {
    // Gast-Modus: Seite anzeigen ohne Session/Greeting
    const greeting = document.getElementById("studentGreeting");
    if (greeting) greeting.style.display = "none";
    initHL();
  }
  history.replaceState({ step: MODULE_CONFIG.steps[0] }, "");

  // KI-Disclaimer in Feedback-Bereich einfügen
  var fc = document.getElementById("feedbackContent");
  if (fc && !fc.querySelector(".ki-disclaimer")) {
    var d = document.createElement("div");
    d.className = "ki-disclaimer";
    d.style.cssText = "background:var(--accent-glow);border:1px solid var(--border);border-radius:var(--radius-sm);padding:.8rem 1.2rem;margin-top:1rem;font-size:.82rem;color:var(--ink-muted);line-height:1.5;";
    d.innerHTML = '\u26a0\ufe0f <strong>Hinweis:</strong> Alle Aufgaben, Bewertungen und Musterl\u00f6sungen auf dieser Plattform werden mithilfe von KI (K\u00fcnstlicher Intelligenz) erstellt. Die Richtigkeit und Vollst\u00e4ndigkeit der Inhalte kann nicht garantiert werden. Besprich deine Ergebnisse im Zweifelsfall mit deiner Lehrkraft.';
    fc.appendChild(d);
  }

  // Übungsaufgaben-Card dynamisch einfügen
  if (fc && !fc.querySelector("#uebungsCard")) {
    var uc = document.createElement("div");
    uc.className = "card";
    uc.id = "uebungsCard";
    uc.style.display = "none";
    uc.innerHTML = '<h2 class="card-header">Gezielte \u00dcbungsaufgaben</h2>' +
      '<p style="color:var(--ink-muted);font-size:.9rem;margin-bottom:1.2rem;">Basierend auf deinen h\u00e4ufigsten Fehlern hat die KI diese \u00dcbungen f\u00fcr dich zusammengestellt:</p>' +
      '<div id="uebungsBody"></div>';
    // Vor dem KI-Disclaimer einfügen, damit die Card direkt nach dem Feedback erscheint
    var disclaimer = fc.querySelector(".ki-disclaimer");
    if (disclaimer) {
      fc.insertBefore(uc, disclaimer);
    } else {
      fc.appendChild(uc);
    }
  }
  // generateTask() automatisch mit Login-Check wrappen
  if (typeof window.generateTask === "function") {
    var _origGenerateTask = window.generateTask;
    window.generateTask = function () {
      if (sessionStorage.getItem("access") !== "1") {
        requireLogin(function () { _origGenerateTask(); });
        return;
      }
      _origGenerateTask();
    };
  }
};

/* ============================
   Zentrale Bildlade-Funktion
   Ersetzt die inline loadDallEImage/loadUnsplashImage in allen Seiten.
   Generiert textfreie Bilder mit HTML-Label-Overlays.
   ============================ */
async function loadEducationalImage(prompt, containerId, labels, style, _isRetry) {
  var el = document.getElementById(containerId);
  if (!el) return;

  // Bei Neu-Generierung: Ladeanimation anzeigen
  if (_isRetry) {
    el.innerHTML = '<div style="text-align:center;padding:1.5rem;"><div class="loader-spinner"></div><span style="display:block;margin-top:.5rem;font-size:.85rem;color:var(--ink-muted);">Bild wird neu generiert…</span></div>';
  }

  // Bei Retry: Hinweis an Prompt anhängen, genauer auf Details zu achten
  var actualPrompt = _isRetry
    ? prompt + " --- IMPORTANT: Pay extra close attention to fine details, accuracy, proportions, and clarity. Make sure all elements are precisely rendered and clearly distinguishable. Improve the overall quality and visual precision compared to the previous attempt."
    : prompt;

  try {
    var d = await apiCall("/api/generate-image", {
      prompt: actualPrompt,
      noText: false,
      style: style || "diagram"
    });

    var credit = d.credit
      ? '<div class="edu-img-credit">' + escapeHtml(d.credit) + '</div>'
      : '';
    var caption = d.caption
      ? '<figcaption class="edu-img-caption">' + escapeHtml(d.caption) + '</figcaption>'
      : '';

    // Labels unter dem Bild als Beschriftungen
    var titleHtml = '';
    var labelsHtml = '';
    var legendHtml = '';
    var numberedLegendHtml = '';
    var hasNumberedLegend = false;
    if (labels && typeof labels === 'object') {
      // Prüfe ob es ein nummeriertes Labels-Objekt ist {"1": "Zellkern", "2": "..."}
      var numKeys = Object.keys(labels).filter(function(k) { return /^\d+$/.test(k); });
      if (numKeys.length > 0) {
        hasNumberedLegend = true;
        var entries = numKeys.sort(function(a, b) { return parseInt(a) - parseInt(b); });
        numberedLegendHtml = '<div class="edu-img-numbered-legend">' +
          entries.map(function(k) {
            return '<div class="edu-img-legend-entry"><span class="edu-img-legend-num">' + escapeHtml(k) + '</span> ' + escapeHtml(labels[k]) + '</div>';
          }).join('') +
        '</div>';
      } else {
        // Altes Format: title, labels[], legend[]
        if (labels.title) {
          titleHtml = '<div class="edu-img-title">' + escapeHtml(labels.title) + '</div>';
        }
        var allLabels = [];
        if (labels.y_axis) allLabels.push(labels.y_axis);
        if (labels.x_axis) allLabels.push(labels.x_axis);
        if (labels.labels && labels.labels.length) {
          labels.labels.forEach(function(lbl) { allLabels.push(lbl.text); });
        }
        if (allLabels.length) {
          labelsHtml = '<div class="edu-img-labels">' +
            allLabels.map(function(t) {
              return '<span class="edu-img-label-tag">' + escapeHtml(t) + '</span>';
            }).join('') +
            '</div>';
        }
        if (labels.legend && labels.legend.length) {
          legendHtml = '<div class="edu-img-legend">' +
            labels.legend.map(function(l) {
              return '<span class="edu-legend-item">' + escapeHtml(l) + '</span>';
            }).join('') +
            '</div>';
        }
      }
    }

    // KI-Hinweis
    var noticeText = hasNumberedLegend
      ? 'KI-generiertes Bild — Beschriftungen siehe Legende.'
      : 'KI-generiertes Bild — Texte und Beschriftungen können Fehler enthalten.';
    var aiNoticeHtml =
      '<div class="edu-img-ai-notice">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="edu-img-ai-notice-icon"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>' +
        noticeText +
      '</div>';

    // Neu-Generieren-Button
    var regenBtnHtml =
      '<div style="text-align:center;">' +
        '<button type="button" class="edu-img-regen-btn" title="Bild neu generieren">' +
          '<svg class="regen-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>' +
          'Neu generieren' +
        '</button>' +
      '</div>';

    var altText = labels && labels.title ? escapeHtml(labels.title) : 'Illustration';
    el.innerHTML =
      '<figure class="edu-img-figure">' +
        '<div class="edu-img-wrapper">' +
          '<img src="' + d.url + '" alt="' + altText + '" class="edu-img">' +
        '</div>' +
        titleHtml + labelsHtml + numberedLegendHtml + caption + legendHtml + credit +
        aiNoticeHtml + regenBtnHtml +
      '</figure>';

    // Klick-Handler für Neu-Generieren
    var regenBtn = el.querySelector('.edu-img-regen-btn');
    if (regenBtn) {
      regenBtn.addEventListener('click', function() {
        loadEducationalImage(prompt, containerId, labels, style, true);
      });
    }
  } catch (e) {
    console.error('Bild-Fehler:', e);
    var el2 = document.getElementById(containerId);
    if (el2) el2.innerHTML =
      '<div class="edu-img-error">Bild konnte nicht geladen werden.</div>';
  }
}

// Rückwärtskompatibilität
var loadDallEImage = function(prompt, containerId) {
  loadEducationalImage(prompt, containerId, null);
};
var loadUnsplashImage = loadDallEImage;

/* ============================
   Login-Modal für Fachseiten
   Wird von requireLogin() aufgerufen wenn ein Gast
   "Aufgabe generieren" oder ähnliches klickt.
   ============================ */
var _loginModalCallback = null;
var _loginModalMode = "login";

function requireLogin(callback) {
  if (sessionStorage.getItem("access") === "1" && sessionStorage.getItem("student_name")) {
    callback();
    return;
  }
  _loginModalCallback = callback;
  _loginModalMode = "login";
  _ensureLoginModal();
  document.getElementById("sharedLoginOverlay").style.display = "flex";
  _updateLoginModalUI();
  setTimeout(function () {
    var nameInput = document.getElementById("slModalName");
    if (nameInput) nameInput.focus();
  }, 100);
}

function _ensureLoginModal() {
  if (document.getElementById("sharedLoginOverlay")) return;
  var overlay = document.createElement("div");
  overlay.id = "sharedLoginOverlay";
  overlay.style.cssText = "display:none;position:fixed;inset:0;z-index:9800;background:rgba(0,0,0,.6);align-items:center;justify-content:center;padding:1rem;backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);";
  overlay.addEventListener("click", function (e) { if (e.target === overlay) _closeLoginModal(); });
  overlay.innerHTML =
    '<div style="background:var(--surface);border-radius:20px;padding:2rem;max-width:400px;width:100%;box-shadow:0 25px 60px rgba(0,0,0,.3);animation:slideUp .25s ease;">' +
    '<h2 style="font-size:1.2rem;margin:0 0 .3rem;text-align:center;">Anmeldung erforderlich</h2>' +
    '<p style="color:var(--ink-muted);text-align:center;font-size:.85rem;margin:0 0 1.2rem;">Um eine Aufgabe zu generieren, melde dich bitte an.</p>' +
    '<div style="display:flex;gap:.3rem;margin-bottom:1rem;">' +
    '<button id="slModeLogin" type="button" style="flex:1;padding:.5rem;border:1px solid var(--border);border-radius:8px;background:var(--accent);color:#fff;font-weight:600;cursor:pointer;min-height:44px;font-family:inherit;font-size:.85rem;" onclick="_setLoginModalMode(\'login\')">Anmelden</button>' +
    '<button id="slModeRegister" type="button" style="flex:1;padding:.5rem;border:1px solid var(--border);border-radius:8px;background:var(--surface);color:var(--ink);font-weight:600;cursor:pointer;min-height:44px;font-family:inherit;font-size:.85rem;" onclick="_setLoginModalMode(\'register\')">Registrieren</button>' +
    '</div>' +
    '<input type="text" id="slModalName" placeholder="Dein Name …" style="width:100%;padding:.7rem .9rem;font-size:16px;border:1px solid var(--border);border-radius:10px;margin-bottom:.6rem;background:var(--surface);color:var(--ink);box-sizing:border-box;min-height:44px;font-family:inherit;">' +
    '<input type="password" id="slModalPw" placeholder="Dein Passwort …" style="width:100%;padding:.7rem .9rem;font-size:16px;border:1px solid var(--border);border-radius:10px;margin-bottom:.6rem;background:var(--surface);color:var(--ink);box-sizing:border-box;min-height:44px;font-family:inherit;">' +
    '<div id="slRegFields" style="display:none;">' +
    '<input type="password" id="slModalPwConfirm" placeholder="Passwort bestätigen …" style="width:100%;padding:.7rem .9rem;font-size:16px;border:1px solid var(--border);border-radius:10px;margin-bottom:.6rem;background:var(--surface);color:var(--ink);box-sizing:border-box;min-height:44px;font-family:inherit;">' +
    '<input type="password" id="slModalClassPw" placeholder="Schulcode …" style="width:100%;padding:.7rem .9rem;font-size:16px;border:1px solid var(--border);border-radius:10px;margin-bottom:.6rem;background:var(--surface);color:var(--ink);box-sizing:border-box;min-height:44px;font-family:inherit;">' +
    '</div>' +
    '<div id="slModalError" style="display:none;color:#ef4444;font-size:.82rem;margin-bottom:.6rem;text-align:center;"></div>' +
    '<button id="slModalBtn" type="button" onclick="_doLoginModal()" style="width:100%;padding:.85rem;background:var(--accent);color:#fff;border:none;border-radius:12px;font-size:1rem;font-weight:600;cursor:pointer;min-height:52px;font-family:inherit;">Anmelden</button>' +
    '<button type="button" onclick="_closeLoginModal()" style="width:100%;padding:.5rem;background:none;border:none;color:var(--ink-muted);font-size:.82rem;cursor:pointer;margin-top:.5rem;min-height:44px;font-family:inherit;">Abbrechen</button>' +
    '</div>';
  document.body.appendChild(overlay);
}

function _setLoginModalMode(mode) {
  _loginModalMode = mode;
  _updateLoginModalUI();
}

function _updateLoginModalUI() {
  var loginBtn = document.getElementById("slModeLogin");
  var regBtn = document.getElementById("slModeRegister");
  var regFields = document.getElementById("slRegFields");
  var submitBtn = document.getElementById("slModalBtn");
  var pwInput = document.getElementById("slModalPw");
  if (_loginModalMode === "register") {
    loginBtn.style.background = "var(--surface)"; loginBtn.style.color = "var(--ink)";
    regBtn.style.background = "var(--accent)"; regBtn.style.color = "#fff";
    regFields.style.display = "block";
    submitBtn.textContent = "Registrieren";
    pwInput.placeholder = "Eigenes Passwort wählen …";
  } else {
    loginBtn.style.background = "var(--accent)"; loginBtn.style.color = "#fff";
    regBtn.style.background = "var(--surface)"; regBtn.style.color = "var(--ink)";
    regFields.style.display = "none";
    submitBtn.textContent = "Anmelden";
    pwInput.placeholder = "Dein Passwort …";
  }
  var err = document.getElementById("slModalError");
  if (err) err.style.display = "none";
}

async function _doLoginModal() {
  var name = document.getElementById("slModalName").value.trim();
  var pw = document.getElementById("slModalPw").value;
  var err = document.getElementById("slModalError");
  var btn = document.getElementById("slModalBtn");

  if (!name) { err.textContent = "Bitte gib deinen Namen ein."; err.style.display = "block"; return; }
  if (!pw) { err.textContent = "Passwort erforderlich."; err.style.display = "block"; return; }
  if (_loginModalMode === "register" && pw.length < 6) { err.textContent = "Passwort muss mindestens 6 Zeichen haben."; err.style.display = "block"; return; }

  var level = sessionStorage.getItem("student_level") || "eA";
  var body = { student_name: name, personal_password: pw, mode: _loginModalMode, level: level };

  if (_loginModalMode === "register") {
    var confirmPw = document.getElementById("slModalPwConfirm").value;
    var classPw = document.getElementById("slModalClassPw").value.trim();
    if (pw !== confirmPw) { err.textContent = "Passwörter stimmen nicht überein."; err.style.display = "block"; return; }
    if (!classPw) { err.textContent = "Bitte gib den Schulcode ein."; err.style.display = "block"; return; }
    body.password = classPw;
  }

  btn.disabled = true;
  btn.textContent = "Prüfe …";
  err.style.display = "none";

  try {
    var res = await fetch(API_BASE + "/api/check-student", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    var data = await res.json();

    if (data.success) {
      sessionStorage.setItem("access", "1");
      sessionStorage.setItem("access_token", data.token);
      sessionStorage.setItem("student_name", name);
      if (!sessionStorage.getItem("student_level")) sessionStorage.setItem("student_level", "eA");

      // Greeting aktualisieren
      var greeting = document.getElementById("studentGreeting");
      if (greeting) {
        greeting.textContent = name + " · " + (sessionStorage.getItem("student_level") || "eA").toUpperCase();
        greeting.style.display = "inline";
      }

      _closeLoginModal();
      // Callback ausfuehren (z.B. generateTask)
      if (_loginModalCallback) {
        var cb = _loginModalCallback;
        _loginModalCallback = null;
        cb();
      }
    } else {
      err.textContent = data.error || "Fehler bei der Anmeldung.";
      err.style.display = "block";
    }
  } catch (e) {
    err.textContent = "Verbindungsfehler. Bitte versuche es erneut.";
    err.style.display = "block";
  }

  btn.disabled = false;
  btn.textContent = _loginModalMode === "register" ? "Registrieren" : "Anmelden";
}

function _closeLoginModal() {
  var overlay = document.getElementById("sharedLoginOverlay");
  if (overlay) overlay.style.display = "none";
  _loginModalCallback = null;
}

