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

const API_BASE = "";
const CONFIG = { storedData: null };

/* ================= TEACHER MODE & SHARED TASK ================= */
const _urlParams = new URLSearchParams(window.location.search);
const isTeacherMode = _urlParams.get("mode") === "teacher";
const _teacherToken = _urlParams.get("teacher_token") || "";
const sharedTaskId = _urlParams.get("task_id") || null;

// Teacher-Mode: Banner zum Uebernehmen der Aufgabe
function _showTeacherAdoptBanner() {
  if (document.getElementById("teacherAdoptBanner")) return;
  var banner = document.createElement("div");
  banner.id = "teacherAdoptBanner";
  banner.style.cssText = "position:sticky;top:0;z-index:9999;background:linear-gradient(135deg,#4f46e5,#7c3aed);color:#fff;padding:.8rem 1.2rem;display:flex;align-items:center;justify-content:space-between;gap:.8rem;flex-wrap:wrap;font-size:.9rem;box-shadow:0 2px 8px rgba(0,0,0,.2);";
  banner.innerHTML = '<span style="font-weight:600;">Aufgabe generiert — so sehen es deine Schueler.</span>'
    + '<button onclick="_teacherAdoptTask()" style="background:#fff;color:#4f46e5;border:none;padding:.5rem 1.2rem;border-radius:8px;font-weight:700;font-size:.85rem;cursor:pointer;min-height:44px;white-space:nowrap;">Aufgabe uebernehmen</button>';
  document.body.prepend(banner);
}

function _teacherAdoptTask() {
  window.parent.postMessage({ type: "task-generated", data: CONFIG.storedData }, "*");
  var banner = document.getElementById("teacherAdoptBanner");
  if (banner) { banner.innerHTML = '<span style="font-weight:600;">Aufgabe uebernommen — du kannst den iFrame jetzt schliessen.</span>'; }
}

/* ================= FOCUS-TRAP ================= */

/**
 * Beschränkt Tab/Shift+Tab auf Elemente innerhalb eines Containers.
 * Gibt eine Cleanup-Funktion zurück (zum Entfernen des Listeners).
 */
function trapFocus(container) {
  const focusable = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
  function getFocusable() {
    return Array.from(container.querySelectorAll(focusable)).filter(el => !el.closest('[hidden]'));
  }
  function handler(e) {
    if (e.key !== "Tab") return;
    const els = getFocusable();
    if (!els.length) { e.preventDefault(); return; }
    const first = els[0];
    const last = els[els.length - 1];
    if (e.shiftKey) {
      if (document.activeElement === first) { e.preventDefault(); last.focus(); }
    } else {
      if (document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  }
  container.addEventListener("keydown", handler);
  return () => container.removeEventListener("keydown", handler);
}

/* ================= UTILITIES ================= */

function showToast(msg, type) {
  const t = document.createElement("div");
  t.className = "toast" + (type === "success" ? " success" : "");
  t.setAttribute("role", "status");
  t.setAttribute("aria-live", "polite");
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

function formatTextWithLineNumbers(text) {
  const lines = String(text || "").split("\n");
  return '<div class="lined-text">' + lines.map(line => {
    const isEmpty = line.trim() === "";
    const cls = "text-line" + (isEmpty ? " text-line--empty" : "");
    return `<div class="${cls}"><span class="text-line-content">${escapeHtml(line) || ""}</span></div>`;
  }).join("") + "</div>";
}

function countWords(text) {
  return (text || "").trim().split(/\s+/).filter(w => w.length > 0).length;
}

function updateWordCount() {
  var el = document.getElementById("wordCount");
  if (el) el.textContent = countWords(document.getElementById("studentText").value);
}

/* ================= API ================= */

function getAccessToken() {
  return sessionStorage.getItem("access_token") || "";
}

// API-Headers: Im Teacher-Mode zusaetzlich den Lehrer-Token mitsenden
function _apiHeaders(contentType) {
  var h = { "X-Access-Token": getAccessToken() };
  if (contentType) h["Content-Type"] = contentType;
  if (isTeacherMode && _teacherToken) h["X-Teacher-Auth-Token"] = _teacherToken;
  return h;
}

async function apiCall(endpoint, body, _isRetry) {
  // Abo-Check vor kostenpflichtigen Endpoints (generate/grade)
  if (/\/api\/(fos-)?(generate|grade)/.test(endpoint) && !isTeacherMode) {
    var sub = await checkSubscription();
    var isGrade = /\/api\/(fos-)?grade/.test(endpoint);
    // Generierung: nur mit Abo/Trial. Korrektur: auch mit Lehrer-Credits.
    var hasAccess = sub.status === "active" || sub.status === "trialing" || (isGrade && sub.teacher_credits_available);
    if (!hasAccess) {
      window.location.href = "/abo.html";
      throw new Error("Kein aktives Abo.");
    }
  }
  // Auto-Attach: OCR-Bilder bei Grade-Endpoints mitsenden
  if (/\/api\/(fos-)?grade/.test(endpoint) && typeof getOCRImages === "function") {
    const imgs = getOCRImages();
    if (imgs.length) body.images = imgs;
  }
  const res = await fetch(API_BASE + endpoint, {
    method: "POST",
    headers: _apiHeaders("application/json"),
    body: JSON.stringify(body)
  });
  // 401 = Token abgelaufen/ungueltig → Login-Modal zeigen und API-Call wiederholen
  // Im Teacher-Mode kein Schüler-Login-Modal anzeigen
  if (res.status === 401 && !_isRetry && !isTeacherMode && typeof requireLogin === "function") {
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
  const json = await res.json();

  // Shared-Task: Nach submit-result automatisch Zuordnung machen
  if (endpoint === "/api/submit-result" && json.result_id) {
    const stId = sessionStorage.getItem("_shared_task_id");
    if (stId) {
      apiCall("/api/submit-shared-task", {
        task_id: stId,
        result_id: json.result_id,
        student_name: sessionStorage.getItem("student_name") || "Unbekannt"
      }).catch(function(e) { console.warn("submit-shared-task:", e); });
      sessionStorage.removeItem("_shared_task_id");
    }
  }

  return json;
}

/* ================= SUBSCRIPTION CHECK ================= */

// Abo-Status im Cache halten (pro Session)
var _subscriptionCache = null;
var _subscriptionCacheTime = 0;
var SUBSCRIPTION_CACHE_TTL = 30 * 1000; // 30 Sekunden

async function checkSubscription() {
  var studentId = sessionStorage.getItem("student_id") || "";
  var token = getAccessToken();
  if (!studentId || !token) return { status: "none", plan: "free" };

  // Cache prüfen (Cache invalidieren wenn sessionStorage 'active' sagt aber Cache noch 'trialing')
  var ssStatus = sessionStorage.getItem("subscription_status") || "";
  if (_subscriptionCache && (Date.now() - _subscriptionCacheTime < SUBSCRIPTION_CACHE_TTL)) {
    if (ssStatus === "active" && _subscriptionCache.status === "trialing") {
      _subscriptionCache = null; // Cache invalidieren
    } else {
      return _subscriptionCache;
    }
  }

  // Fallback bei Netzwerkfehler: sessionStorage nutzen, aber nur für Stripe-Abos (nicht Schullizenzen)
  var ssPlan = sessionStorage.getItem("subscription_plan") || "";
  var ssFallback = ((ssStatus === "active" || ssStatus === "trialing") && ssPlan !== "school")
    ? { status: ssStatus, plan: ssPlan || "unknown", teacher_credits_available: sessionStorage.getItem("teacher_credits_available") === "1" }
    : { status: "none", plan: "free" };

  try {
    var res = await fetch(API_BASE + "/api/stripe/subscription-status", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Access-Token": token },
      body: JSON.stringify({ student_id: studentId })
    });
    if (!res.ok) return ssFallback;
    var data = await res.json();
    // Lehrer-Credits in sessionStorage speichern
    if (data.teacher_credits_available) {
      sessionStorage.setItem("teacher_credits_available", "1");
      if (data.teacher_credits_name) sessionStorage.setItem("teacher_credits_name", data.teacher_credits_name);
    } else {
      sessionStorage.removeItem("teacher_credits_available");
      sessionStorage.removeItem("teacher_credits_name");
    }
    // Fach-Lizenzen in sessionStorage speichern
    if (data.subject_licenses && data.subject_licenses.length) {
      sessionStorage.setItem("subject_licenses", JSON.stringify(data.subject_licenses.map(function(s) { return s.subject; })));
    }
    // SessionStorage mit Backend-Antwort synchronisieren
    sessionStorage.setItem("subscription_status", data.status || "none");
    if (data.status !== "active" && data.status !== "trialing") {
      sessionStorage.removeItem("free_access");
    }
    _subscriptionCache = data;
    _subscriptionCacheTime = Date.now();
    return data;
  } catch (e) {
    return ssFallback;
  }
}

// Prüft ob der Nutzer ein aktives Abo hat. Gibt true zurück wenn Zugriff erlaubt.
// Bei abgelaufenem Trial/keinem Abo wird zur Abo-Seite weitergeleitet.
async function requireSubscription() {
  var sub = await checkSubscription();
  if (sub.status === "active" || sub.status === "trialing") {
    return true;
  }
  // Lehrer-Credits als Alternative prüfen
  if (sub.teacher_credits_available) {
    return true;
  }
  // Kein Abo und keine Lehrer-Credits → zur Abo-Seite weiterleiten
  window.location.href = "/abo.html";
  return false;
}

// Trial-Banner einblenden (wenn Trial aktiv)
async function showTrialBannerIfNeeded(containerId) {
  var sub = await checkSubscription();
  if (sub.status === "trialing" && sub.trial_days_left > 0) {
    var container = document.getElementById(containerId);
    if (!container) return;
    if (container.querySelector(".trial-hint-banner")) return;
    var banner = document.createElement("div");
    banner.className = "trial-hint-banner";
    banner.setAttribute("role", "status");
    banner.innerHTML =
      '<div style="display:flex;align-items:center;gap:.5rem;">' +
        '<span style="font-size:1.1em;">&#9200;</span>' +
        '<span>Deine <strong>kostenlose Testphase</strong> l\u00e4uft noch <strong>' + sub.trial_days_left + (sub.trial_days_left === 1 ? ' Tag' : ' Tage') + '</strong></span>' +
      '</div>' +
      '<a href="/abo.html" style="background:var(--accent,#4f46e5);color:#fff;padding:.45rem 1rem;border-radius:8px;font-weight:700;font-size:.82rem;text-decoration:none;white-space:nowrap;min-height:36px;display:inline-flex;align-items:center;">Abo w\u00e4hlen</a>';
    banner.style.cssText = "background:var(--surface,#fff);border:1px solid var(--border,#e2e8f0);border-radius:14px;padding:.75rem 1.2rem;margin:0 1rem 1rem;display:flex;align-items:center;justify-content:space-between;gap:1rem;font-size:.9rem;box-shadow:0 2px 8px rgba(0,0,0,.06);";
    container.prepend(banner);
  }
  // Lehrer-Credits-Banner (wenn kein eigenes Abo, aber Lehrer stellt Credits bereit)
  if (sub.teacher_credits_available && sub.status !== "active" && sub.status !== "trialing") {
    var container = document.getElementById(containerId);
    if (!container) return;
    if (container.querySelector(".teacher-credits-banner")) return;
    var tcBanner = document.createElement("div");
    tcBanner.className = "teacher-credits-banner";
    tcBanner.setAttribute("role", "status");
    var tName = sub.teacher_credits_name || "Deine Lehrkraft";
    tcBanner.innerHTML =
      '<div style="display:flex;align-items:center;gap:.5rem;">' +
        '<span style="font-size:1.1em;">&#127891;</span>' +
        '<span><strong>' + tName + '</strong> stellt dir Korrekturen zur Verf\u00fcgung.</span>' +
      '</div>';
    tcBanner.style.cssText = "background:#eff6ff;border:1px solid #bfdbfe;border-radius:14px;padding:.75rem 1.2rem;margin:0 1rem 1rem;display:flex;align-items:center;gap:1rem;font-size:.9rem;box-shadow:0 2px 8px rgba(0,0,0,.06);";
    container.prepend(tcBanner);
  }
}

/* ================= STREAMING API (SSE-basiert) ================= */

// Endpoints die Streaming unterstützen (Mapping: Grade-Endpoint → Stream-Endpoint)
var STREAM_ENDPOINTS = {
  "grade-deutsch": "grade-deutsch-stream"
};

// SSE-basierter API-Aufruf für Echtzeit-Fortschritt bei langen Korrekturen
async function apiCallStream(streamEndpoint, body) {
  // OCR-Bilder automatisch mitsenden
  if (/grade/.test(streamEndpoint) && typeof getOCRImages === "function") {
    var imgs = getOCRImages();
    if (imgs.length) body.images = imgs;
  }

  var response = await fetch(API_BASE + "/api/" + streamEndpoint, {
    method: "POST",
    headers: _apiHeaders("application/json"),
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    var err = await response.json().catch(function() { return {}; });
    throw new Error(err.error || "HTTP " + response.status);
  }

  var reader = response.body.getReader();
  var decoder = new TextDecoder();
  var buffer = "";
  var result = null;
  var statusEl = document.getElementById("kiStatusText");

  while (true) {
    var chunk = await reader.read();
    if (chunk.done) break;

    buffer += decoder.decode(chunk.value, { stream: true });
    var lines = buffer.split("\n");
    buffer = lines.pop();

    var currentEvent = null;
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      if (line.startsWith("event: ")) {
        currentEvent = line.slice(7);
      } else if (line.startsWith("data: ") && currentEvent) {
        try {
          var data = JSON.parse(line.slice(6));
          if (currentEvent === "status" && statusEl && data.message) {
            statusEl.innerHTML = data.message + '<span class="ki-dots"><span>.</span><span>.</span><span>.</span></span>';
          } else if (currentEvent === "result") {
            result = data;
          } else if (currentEvent === "error") {
            throw new Error(data.message || "Korrektur fehlgeschlagen.");
          }
        } catch (e) {
          if (e.message && e.message !== "Korrektur fehlgeschlagen." && !e.message.startsWith("HTTP")) {
            // JSON-Parse-Fehler ignorieren, echte Fehler weiterwerfen
            if (currentEvent === "error") throw e;
          } else {
            throw e;
          }
        }
        currentEvent = null;
      } else if (line === "") {
        currentEvent = null;
      }
    }
  }

  if (!result) throw new Error("Keine Ergebnisse empfangen.");
  return result;
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
  var maxWait = options.maxWait || 300000; // 5 Minuten
  var onProgress = options.onProgress || null;

  // Abo-Check vor Korrektur
  if (!isTeacherMode) {
    var sub = await checkSubscription();
    if (sub.status !== "active" && sub.status !== "trialing" && !sub.teacher_credits_available) {
      window.location.href = "/abo.html";
      throw new Error("Kein aktives Abo.");
    }
  }

  // Grading-Kontext speichern fuer spaeteres Detail-Feedback
  _lastGradeBody = body;

  // Streaming-Variante bevorzugen, wenn verfügbar (kein Timeout, Echtzeit-Fortschritt)
  var streamEndpoint = STREAM_ENDPOINTS[gradeEndpoint];
  if (streamEndpoint && typeof ReadableStream !== "undefined") {
    // Roboter-Animation zeigen
    var feedbackEl = document.getElementById("feedbackLoader");
    var origHTML = null;
    if (feedbackEl) {
      origHTML = feedbackEl.innerHTML;
      feedbackEl.innerHTML = KI_ROBOT_HTML;
    }
    try {
      var streamResult = await apiCallStream(streamEndpoint, Object.assign({}, body));
      // Loader-Inhalt wiederherstellen nach Erfolg
      if (feedbackEl && origHTML !== null) feedbackEl.innerHTML = origHTML;
      return streamResult;
    } catch (streamErr) {
      console.warn("Streaming fehlgeschlagen, Fallback auf Polling:", streamErr.message);
      // Loader zurücksetzen für Polling-Fallback
      if (feedbackEl && origHTML !== null) feedbackEl.innerHTML = origHTML;
      // Weiter mit normalem Polling unten
    }
  }

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
      headers: _apiHeaders("application/json"),
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

    if (submitRes.status === 403) {
      var errData = await submitRes.json().catch(function() { return {}; });
      if (errData.requires_subscription) {
        window.location.href = "/abo.html";
        throw new Error("Kein aktives Abo.");
      }
      throw new Error(errData.error || "Zugriff verweigert.");
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
    var _networkErrors = 0;
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
          headers: _apiHeaders()
        });
      } catch (fetchErr) {
        _networkErrors++;
        if (_networkErrors >= 5) throw new Error("Verbindung zum Server verloren. Bitte prüfe deine Internetverbindung und versuche es erneut.");
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
    var kiHinweis = '<p class="ki-hinweis">🤖 KI-generiert\u2013 Inhalte können Fehler enthalten.</p>';
    if (detailHtml && detailHtml.trim()) {
      // Detail bereits vorhanden (z.B. Fallback) → direkt aufklappbar anzeigen
      fb.innerHTML = kurzHtml +
        '<details class="feedback-detail-toggle"><summary>Detailliertes Feedback anzeigen</summary>' +
        '<div class="feedback-detail-body">' + detailHtml + '</div></details>' +
        kiHinweis;
    } else {
      // Detail noch nicht generiert → Lade-Button anzeigen
      fb.innerHTML = kurzHtml +
        '<button class="btn btn-secondary feedback-load-detail" onclick="loadDetailFeedback(this)">Detailliertes Feedback laden</button>' +
        '<div class="feedback-detail-body" id="feedbackDetailContainer" style="display:none"></div>' +
        kiHinweis;
    }
  }

  const sanitizeOpts = { ALLOWED_TAGS: ["mark", "br", "p"], ALLOWED_ATTR: ["class", "title"] };

  // Single-part korrektur
  const body = document.getElementById("korrekturBody");
  if (body && d.korrektur_text) {
    body.innerHTML = DOMPurify.sanitize(d.korrektur_text.replace(/\n/g, "<br>"), sanitizeOpts);
    body.insertAdjacentHTML("beforeend", '<p class="ki-hinweis">🤖 KI-generiert\u2013 Inhalte können Fehler enthalten.</p>');
    if (korrekturCard) korrekturCard.style.display = "";
  }

  // Two-part korrektur
  const bodyA = document.getElementById("korrekturBodyA");
  const bodyB = document.getElementById("korrekturBodyB");
  if (bodyA && (d.korrektur_text_a || d.korrektur_text_b)) {
    if (d.korrektur_text_a) bodyA.innerHTML = DOMPurify.sanitize(d.korrektur_text_a.replace(/\n/g, "<br>"), sanitizeOpts);
    if (d.korrektur_text_b && bodyB) {
      bodyB.innerHTML = DOMPurify.sanitize(d.korrektur_text_b.replace(/\n/g, "<br>"), sanitizeOpts);
      bodyB.insertAdjacentHTML("beforeend", '<p class="ki-hinweis">🤖 KI-generiert\u2013 Inhalte können Fehler enthalten.</p>');
    } else if (d.korrektur_text_a && bodyA) {
      bodyA.insertAdjacentHTML("beforeend", '<p class="ki-hinweis">🤖 KI-generiert\u2013 Inhalte können Fehler enthalten.</p>');
    }
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
      container.insertAdjacentHTML("beforeend", '<p class="ki-hinweis">🤖 KI-generiert\u2013 Inhalte können Fehler enthalten.</p>');
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
  }).join('') + '<p class="ki-hinweis">🤖 KI-generiert\u2013 Inhalte können Fehler enthalten.</p>';

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

var _rewriteOverlayCleanup = null;
var _rewriteOverlayPreviousFocus = null;

function showRewriteOverlay(result) {
  // Altes Overlay entfernen
  var old = document.getElementById("rewriteOverlay");
  if (old) { old.remove(); if (_rewriteOverlayCleanup) _rewriteOverlayCleanup(); }

  // Fokus merken, um ihn beim Schließen wiederherzustellen
  _rewriteOverlayPreviousFocus = document.activeElement;

  var overlay = document.createElement("div");
  overlay.id = "rewriteOverlay";
  overlay.className = "rewrite-overlay";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-labelledby", "rewriteOverlayTitle");

  var html = '<div class="rewrite-panel">' +
    '<div class="rewrite-header">' +
    '<h3 id="rewriteOverlayTitle"><span aria-hidden="true">✨</span> Verbesserungsvorschläge</h3>' +
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

  // Escape-Taste schliesst Overlay
  overlay.addEventListener("keydown", function (e) {
    if (e.key === "Escape") closeRewriteOverlay();
  });

  document.body.appendChild(overlay);

  // Focus-Trap aktivieren
  _rewriteOverlayCleanup = trapFocus(overlay);

  // Focus auf Close-Button setzen
  var closeBtn = overlay.querySelector(".rewrite-close");
  if (closeBtn) closeBtn.focus();

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
    if (_rewriteOverlayCleanup) { _rewriteOverlayCleanup(); _rewriteOverlayCleanup = null; }
    overlay.style.animation = "fadeOut .2s ease-out forwards";
    setTimeout(function () { overlay.remove(); }, 200);
    // Fokus zurücksetzen
    if (_rewriteOverlayPreviousFocus && _rewriteOverlayPreviousFocus.focus) {
      _rewriteOverlayPreviousFocus.focus();
    }
    _rewriteOverlayPreviousFocus = null;
  }
}

/* ================= NAVIGATION ================= */

let currentStep = null;

function nav(step, _pushHistory) {
  const prefix = MODULE_CONFIG.sectionPrefix || "";
  const steps = MODULE_CONFIG.steps;
  const idx = steps.indexOf(step);

  // Teacher-Mode: Aufgabe normal anzeigen, aber "Uebernehmen"-Banner einblenden
  if (isTeacherMode && step === "task" && CONFIG.storedData) {
    _showTeacherAdoptBanner();
  }

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
  const next = isDark ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", next);
  try { localStorage.setItem("theme", next); } catch(e) {}
  const btn = document.getElementById("themeToggleBtn");
  if (btn) btn.textContent = isDark ? "🌙" : "☀️";
  if (progressChartInstance) renderProgressChart();
}

function initTheme() {
  let saved;
  try { saved = localStorage.getItem("theme"); } catch(e) {}
  const prefersDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
  const theme = saved || (prefersDark ? "dark" : "light");
  document.documentElement.setAttribute("data-theme", theme);
  const btn = document.getElementById("themeToggleBtn");
  if (btn) btn.textContent = theme === "dark" ? "☀️" : "🌙";
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

/* ================= SHARED TASK LOADING ================= */
async function loadSharedTask() {
  const taskId = sharedTaskId || sessionStorage.getItem("_shared_task_id");
  if (!taskId) return false;
  try {
    const data = await apiCall("/api/get-shared-task", { task_id: taskId });
    if (data && data.task_data) {
      CONFIG.storedData = data.task_data;
      // _shared_task_id merken fuer spaetere Zuordnung nach Grading
      sessionStorage.setItem("_shared_task_id", data.task_id);
      if (typeof renderTask === "function") renderTask(data.task_data);
      nav("task");
      return true;
    }
  } catch (e) {
    console.warn("loadSharedTask failed:", e);
    showToast("Aufgabe konnte nicht geladen werden: " + e.message);
  }
  return false;
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

  // Screenreader-Beschreibung: zugängliche Zusammenfassung der Daten
  const avg = history.length ? Math.round(history.reduce((s, h) => s + (h.total || 0), 0) / history.length) : 0;
  ctx.setAttribute("role", "img");
  ctx.setAttribute("aria-label", `Fortschrittsdiagramm: ${history.length} Einträge, Ø ${avg} Punkte`);
  // Fallback-Text innerhalb des Canvas (für Browser ohne Canvas-Support)
  ctx.textContent = `Fortschritt: ${history.length} Einträge, Durchschnitt ${avg} Punkte.`;

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

var _pdfModalCleanup = null;
var _pdfModalPreviousFocus = null;

function _openPdfModal(innerHtml) {
  if (document.getElementById("pdfModal")) return;
  _pdfModalPreviousFocus = document.activeElement;
  var overlay = document.createElement("div");
  overlay.className = "pdf-modal-overlay";
  overlay.id = "pdfModal";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-labelledby", "pdfModalTitle");
  overlay.onclick = function (e) { if (e.target === overlay) closePdfModal(); };
  overlay.addEventListener("keydown", function (e) { if (e.key === "Escape") closePdfModal(); });
  overlay.innerHTML = '<div class="pdf-modal">' +
    '<h3 id="pdfModalTitle">Als PDF speichern</h3>' +
    '<div class="pdf-modal-buttons">' + innerHtml + '</div>' +
    '</div>';
  document.body.appendChild(overlay);
  _pdfModalCleanup = trapFocus(overlay);
  overlay.querySelector(".btn").focus();
}

function showPdfExportModal() {
  if (isExamPage()) {
    _openPdfModal(
      '<button class="btn" onclick="exportTaskPDF(\'reading\')">Nur Reading</button>' +
      '<button class="btn" onclick="exportTaskPDF(\'writing-only\')">Nur Writing</button>' +
      '<button class="btn" onclick="exportTaskPDF(\'exam\')">Komplette Pr\u00fcfung</button>' +
      '<button class="btn btn-cancel" onclick="closePdfModal()">Abbrechen</button>'
    );
    return;
  }
  if (!hasMaterial()) {
    exportTaskPDF("task");
    return;
  }
  _openPdfModal(
    '<button class="btn" onclick="exportTaskPDF(\'task\')">Nur Aufgaben</button>' +
    '<button class="btn" onclick="exportTaskPDF(\'material\')">Nur Material</button>' +
    '<button class="btn" onclick="exportTaskPDF(\'both\')">Aufgaben + Material</button>' +
    '<button class="btn btn-cancel" onclick="closePdfModal()">Abbrechen</button>'
  );
}

function closePdfModal() {
  var m = document.getElementById("pdfModal");
  if (m) {
    if (_pdfModalCleanup) { _pdfModalCleanup(); _pdfModalCleanup = null; }
    m.remove();
    if (_pdfModalPreviousFocus && _pdfModalPreviousFocus.focus) {
      _pdfModalPreviousFocus.focus();
    }
    _pdfModalPreviousFocus = null;
  }
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
  var done = ocrPages.filter(function (p) { return p.base64 && p.status === "done"; });
  // Bei vielen Seiten (>6) sind die Bilder bereits mit 2000px gespeichert.
  // Wir geben sie trotzdem zurück – das Backend wechselt auf detail:"auto".
  return done.map(function (p) { return p.base64; });
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

  // Bei vielen Seiten (>6) Bilder stärker komprimieren, damit KI nicht überfordert wird
  const maxDim = ocrPages.length > 6 ? 1400 : 2000;

  for (let i = startIdx; i < ocrPages.length; i++) {
    const p = ocrPages[i];
    p.status = "processing";
    renderOCRPages();
    document.getElementById("ocrProgress").textContent = `Seite ${i + 1} von ${ocrPages.length} wird erkannt …`;

    try {
      const b64 = await compressImage(p.file, maxDim);
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
    s.src = "https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js";
    s.onload = function () {
      _pdfjsLoaded = true; _pdfjsLoading = false;
      if (window.pdfjsLib) window.pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js";
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
      <img src="${p.url}" alt="Seite ${i + 1}" loading="lazy" decoding="async">
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

/* ================= VERWANDTE FÄCHER (SEO Interlinking) ================= */

;(function() {
  var path = window.location.pathname;
  // Nur auf Fachseiten (Training + Abitur) anzeigen, nicht auf index/profil/abo etc.
  var allSubjects = [
    { file: "mathe-abitur.html", name: "Mathe Abitur", cat: "nawi" },
    { file: "mathe.html", name: "Mathe Training", cat: "nawi" },
    { file: "biologie-abitur.html", name: "Biologie Abitur", cat: "nawi" },
    { file: "biologie.html", name: "Biologie Training", cat: "nawi" },
    { file: "chemie-abitur.html", name: "Chemie Abitur", cat: "nawi" },
    { file: "chemie.html", name: "Chemie Training", cat: "nawi" },
    { file: "physik-abitur.html", name: "Physik Abitur", cat: "nawi" },
    { file: "physik.html", name: "Physik Training", cat: "nawi" },
    { file: "informatik-abitur.html", name: "Informatik Abitur", cat: "nawi" },
    { file: "informatik.html", name: "Informatik Training", cat: "nawi" },
    { file: "analyse.html", name: "Deutsch Analyse", cat: "sprachen" },
    { file: "interpretation.html", name: "Deutsch Interpretation", cat: "sprachen" },
    { file: "eroerterung.html", name: "Deutsch Er\u00f6rterung", cat: "sprachen" },
    { file: "mediation.html", name: "Englisch Mediation", cat: "sprachen" },
    { file: "writing.html", name: "Englisch Writing", cat: "sprachen" },
    { file: "listening.html", name: "Englisch Listening", cat: "sprachen" },
    { file: "latein.html", name: "Latein Training", cat: "sprachen" },
    { file: "latein-abitur.html", name: "Latein Abitur", cat: "sprachen" },
    { file: "geschichte-abitur.html", name: "Geschichte Abitur", cat: "gewi" },
    { file: "geschichte.html", name: "Geschichte Training", cat: "gewi" },
    { file: "geographie-abitur.html", name: "Geographie Abitur", cat: "gewi" },
    { file: "geographie.html", name: "Geographie Training", cat: "gewi" },
    { file: "pug-abitur.html", name: "PuG Abitur", cat: "gewi" },
    { file: "politik.html", name: "PuG Training", cat: "gewi" },
    { file: "wr-abitur.html", name: "WR Abitur", cat: "gewi" },
    { file: "wr.html", name: "WR Training", cat: "gewi" },
    { file: "ethik-abitur.html", name: "Ethik Abitur", cat: "gewi" },
    { file: "ethik.html", name: "Ethik Training", cat: "gewi" },
    { file: "religion-abitur.html", name: "Ev. Religion Abitur", cat: "gewi" },
    { file: "religion.html", name: "Ev. Religion Training", cat: "gewi" },
    { file: "katholisch-abitur.html", name: "Kath. Religion Abitur", cat: "gewi" },
    { file: "katholisch.html", name: "Kath. Religion Training", cat: "gewi" },
    { file: "sport-abitur.html", name: "Sport Abitur", cat: "nawi" },
    { file: "sport.html", name: "Sport Training", cat: "nawi" }
  ];

  var currentFile = path.split("/").pop();
  var current = allSubjects.find(function(s) { return s.file === currentFile; });
  if (!current) return;

  // Verwandte Fächer: gleiche Kategorie, aber anderes Fach (max 6)
  var related = allSubjects.filter(function(s) {
    return s.cat === current.cat && s.file !== currentFile;
  });
  // Mische und limitiere auf 6
  for (var i = related.length - 1; i > 0; i--) {
    var j = Math.floor(Math.random() * (i + 1));
    var t = related[i]; related[i] = related[j]; related[j] = t;
  }
  related = related.slice(0, 6);

  var footer = document.querySelector("footer");
  if (!footer) return;

  var section = document.createElement("nav");
  section.setAttribute("aria-label", "Verwandte F\u00e4cher");
  section.style.cssText = "max-width:900px;margin:2rem auto 0;padding:0 1rem;";
  section.innerHTML = '<h3 style="font-family:var(--font-display);font-size:1.05rem;margin-bottom:.8rem;color:var(--ink);">Weitere F\u00e4cher entdecken</h3>' +
    '<div style="display:flex;flex-wrap:wrap;gap:.5rem;">' +
    related.map(function(s) {
      return '<a href="/' + s.file + '" style="display:inline-block;padding:.45rem .9rem;border-radius:8px;background:var(--surface);border:1px solid var(--border);color:var(--ink);text-decoration:none;font-size:.88rem;transition:border-color .2s,background .2s;">' + s.name + '</a>';
    }).join("") +
    '</div>' +
    '<a href="/" style="display:inline-block;margin-top:.8rem;font-size:.85rem;color:var(--accent);text-decoration:none;">\u2190 Alle F\u00e4cher anzeigen</a>';

  footer.parentNode.insertBefore(section, footer);
})();

/* ================= LEGAL-LINKS + DASHBOARD-LINK IM FOOTER ================= */

;(function() {
  var footers = document.querySelectorAll("footer");
  footers.forEach(function(footer) {
    // Legal-Links: Impressum, AGB, Barrierefreiheit
    if (!/impressum/i.test(footer.innerHTML)) {
      var legalDiv = document.createElement("div");
      legalDiv.style.cssText = "margin-top:0.5rem; font-size:0.75rem; color:var(--ink-light);";
      legalDiv.innerHTML =
        '<a href="/impressum.html" style="color:var(--ink-light);text-decoration:underline;">Impressum</a>' +
        ' &middot; <a href="/agb.html" style="color:var(--ink-light);text-decoration:underline;">AGB</a>' +
        ' &middot; <a href="/barrierefreiheit.html" style="color:var(--ink-light);text-decoration:underline;">Barrierefreiheit</a>';
      footer.appendChild(legalDiv);
    }
    // Dashboard-Link (nur wenn noch nicht vorhanden)
    if (!/dashboard/i.test(footer.innerHTML)) {
      var br = document.createElement("br");
      var a = document.createElement("a");
      a.href = "/lehrer.html";
      a.textContent = "Lehrer-Dashboard \u2192";
      a.style.cssText = "font-size:0.75rem; color:var(--ink-light); text-decoration:underline; margin-top:0.25rem; display:inline-block;";
      footer.appendChild(br);
      footer.appendChild(a);
    }
  });
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

  // Teacher-Mode: Login umgehen, Setup + Aufgabe anzeigen
  if (isTeacherMode) {
    const ls = document.getElementById("login-screen");
    const aw = document.getElementById("app-wrapper");
    if (ls) ls.style.display = "none";
    if (aw) aw.style.display = "flex";
    // Schreiben/Feedback/Fortschritt ausblenden, Setup+Task sichtbar lassen
    const hideSteps = ["write", "feedback", "progress"];
    document.querySelectorAll("nav button").forEach(function(btn, i) {
      const step = MODULE_CONFIG.steps[i];
      if (hideSteps.includes(step)) btn.style.display = "none";
    });
    // Lehrer-Name per API holen, Fallback "Lehrer-Vorschau"
    sessionStorage.setItem("access", "1");
    sessionStorage.setItem("student_name", "Lehrer-Vorschau");
    if (_teacherToken) {
      fetch("https://myabiflow.de/api/teacher-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Teacher-Auth-Token": _teacherToken },
        body: JSON.stringify({ action: "get" })
      }).then(function(r) { return r.json(); }).then(function(d) {
        if (d.name) sessionStorage.setItem("student_name", "Lehrer: " + d.name);
      }).catch(function() {});
    }
    nav(MODULE_CONFIG.steps[0]);
    initHL();
    return;
  }

  // Shared Task laden
  if (sharedTaskId) {
    sessionStorage.setItem("_shared_task_id", sharedTaskId);
  }

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
    _makeProfileGreetingClickable();
    restoreSession();
    // Shared Task laden falls vorhanden
    if (sharedTaskId || sessionStorage.getItem("_shared_task_id")) {
      loadSharedTask();
    } else if (!currentStep) {
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
    _makeProfileGreetingClickable();
    restoreSession();
    // Shared Task laden falls vorhanden
    if (sharedTaskId || sessionStorage.getItem("_shared_task_id")) {
      loadSharedTask();
    }
    initHL();
    initTeacherCodeUI();
    setInterval(saveSession, 30000);
  } else {
    // Gast-Modus: Seite anzeigen ohne Session/Greeting
    const greeting = document.getElementById("studentGreeting");
    if (greeting) greeting.style.display = "none";
    initHL();
    // Auch Gaeste koennen Shared Tasks laden (nach Login-Redirect)
    if (sharedTaskId) {
      showToast("Bitte zuerst anmelden, um die Aufgabe zu bearbeiten.");
    }
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
      if (isTeacherMode) {
        // Lehrer-Modus (iFrame aus Lehrer-Dashboard): kein Schüler-Login nötig
        _origGenerateTask();
        return;
      }
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

  // Bereits fertiges Bild (z.B. Lehrer-Upload als Data-URL)? Direkt anzeigen.
  if (typeof prompt === "string" && prompt.startsWith("data:image")) {
    var labelsHtml = '';
    if (labels && typeof labels === 'object') {
      var numKeys = Object.keys(labels).filter(function(k) { return /^\d+$/.test(k); });
      if (numKeys.length > 0) {
        labelsHtml = '<div class="edu-img-numbered-legend">' +
          numKeys.sort(function(a,b){ return parseInt(a)-parseInt(b); }).map(function(k) {
            return '<div class="edu-img-legend-entry"><span class="edu-img-legend-num">' + escapeHtml(k) + '</span> ' + escapeHtml(labels[k]) + '</div>';
          }).join('') + '</div>';
      }
    }
    el.innerHTML = '<figure class="material-figure"><img src="' + prompt + '" class="material-img" alt="Material" style="max-width:100%;border-radius:var(--radius-sm);" loading="lazy" decoding="async">' + labelsHtml + '</figure>';
    return;
  }

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
          '<img src="' + d.url + '" alt="' + altText + '" class="edu-img" loading="lazy" decoding="async">' +
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

async function requireLogin(callback) {
  if (sessionStorage.getItem("access") === "1" && sessionStorage.getItem("student_name")) {
    // Paywall-Check: Frischen Abo-Status vom Server holen statt nur sessionStorage zu vertrauen
    var freeAccess = sessionStorage.getItem("free_access") === "1";
    if (!freeAccess) {
      var sub = await checkSubscription();
      var hasAccess = sub.status === "active" || sub.status === "trialing" || sub.teacher_credits_available;
      if (!hasAccess) {
        window.location.href = "/abo.html";
        return;
      }
    }
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
    '<input type="password" id="slModalPwConfirm" placeholder="Passwort best\u00e4tigen \u2026" style="width:100%;padding:.7rem .9rem;font-size:16px;border:1px solid var(--border);border-radius:10px;margin-bottom:.6rem;background:var(--surface);color:var(--ink);box-sizing:border-box;min-height:44px;font-family:inherit;">' +
    '<input type="email" id="slModalEmail" placeholder="Deine E-Mail-Adresse \u2026" style="width:100%;padding:.7rem .9rem;font-size:16px;border:1px solid var(--border);border-radius:10px;margin-bottom:.6rem;background:var(--surface);color:var(--ink);box-sizing:border-box;min-height:44px;font-family:inherit;">' +
    '<p style="font-size:.82rem;color:var(--ink-muted);margin-top:.2rem;text-align:center;">Schulcode? Gibst du sp\u00e4ter beim Abo ein.</p>' +
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
    var regEmail = document.getElementById("slModalEmail").value.trim();
    if (pw !== confirmPw) { err.textContent = "Passw\u00f6rter stimmen nicht \u00fcberein."; err.style.display = "block"; return; }
    if (!regEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(regEmail)) { err.textContent = "Bitte gib eine g\u00fcltige E-Mail-Adresse ein."; err.style.display = "block"; return; }
    body.email = regEmail;
    try { if (localStorage.getItem("myabiflow_trial_used")) body.trial_used = true; } catch(e) {}
  }

  btn.disabled = true;
  btn.textContent = "Pr\u00fcfe \u2026";
  err.style.display = "none";

  try {
    // Retry-Logik bei Netzwerkfehlern (max 2 Versuche)
    var res, data;
    for (var _attempt = 0; _attempt < 2; _attempt++) {
      try {
        res = await fetch(API_BASE + "/api/check-student", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body)
        });
        break;
      } catch (fetchErr) {
        if (_attempt === 1) throw fetchErr;
        await new Promise(function(r) { setTimeout(r, 1500); });
      }
    }
    if (!res.ok) {
      data = await res.json().catch(function() { return {}; });
      err.textContent = data.error || "Serverfehler (" + res.status + "). Bitte versuche es erneut.";
      err.style.display = "block";
      btn.disabled = false;
      btn.textContent = _loginModalMode === "register" ? "Registrieren" : "Anmelden";
      return;
    }
    data = await res.json();

    if (data.success) {
      sessionStorage.setItem("access", "1");
      sessionStorage.setItem("access_token", data.token);
      sessionStorage.setItem("student_name", name);
      // Fallback für Feedback nach Tab-Neustart
      try { localStorage.setItem("myabiflow_student_name", name); } catch(e) {}
      if (data.student_id) sessionStorage.setItem("student_id", data.student_id);
      if (data.free_access) sessionStorage.setItem("free_access", "1");
      if (data.subscription_status) sessionStorage.setItem("subscription_status", data.subscription_status);
      if (data.subject_licenses && data.subject_licenses.length) {
        sessionStorage.setItem("subject_licenses", JSON.stringify(data.subject_licenses));
      }
      if (!sessionStorage.getItem("student_level")) sessionStorage.setItem("student_level", "eA");
      // Ger\u00e4te-Flag: Trial auf diesem Ger\u00e4t wurde genutzt
      if (_loginModalMode === "register" && data.subscription_status === "trialing") {
        try { localStorage.setItem("myabiflow_trial_used", "1"); } catch(e) {}
      }

      // Greeting aktualisieren
      var greeting = document.getElementById("studentGreeting");
      if (greeting) {
        greeting.textContent = name + " · " + (sessionStorage.getItem("student_level") || "eA").toUpperCase();
        greeting.style.display = "inline";
      }
      _makeProfileGreetingClickable();

      _closeLoginModal();

      // Lehrer-Credits synchron prüfen bevor Paywall-Check
      var subData = await checkSubscription();

      // E-Mail nachtragen falls fehlend
      if (data.email_missing) {
        _showEmailCollectModal(function() {
          // Paywall-Check nach E-Mail-Dialog
          var hasTeacherCredits = subData.teacher_credits_available || sessionStorage.getItem("teacher_credits_available") === "1";
          if (!data.free_access && !hasTeacherCredits && data.subscription_status !== "active" && data.subscription_status !== "trialing" && subData.status !== "active" && subData.status !== "trialing") {
            window.location.href = "/abo.html";
            return;
          }
          if (_loginModalCallback) {
            var cb = _loginModalCallback;
            _loginModalCallback = null;
            cb();
          }
        });
        return;
      }

      // Paywall-Check: Kein free_access, kein aktives Abo und keine Lehrer-Credits → zur Abo-Seite
      var hasTeacherCredits = subData.teacher_credits_available || sessionStorage.getItem("teacher_credits_available") === "1";
      if (!data.free_access && !hasTeacherCredits && data.subscription_status !== "active" && data.subscription_status !== "trialing" && subData.status !== "active" && subData.status !== "trialing") {
        window.location.href = "/abo.html";
        return;
      }

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

/* ================= E-MAIL NACHTRAGEN ================= */
function _showEmailCollectModal(callback) {
  // Overlay erstellen
  var overlay = document.createElement("div");
  overlay.id = "emailCollectOverlay";
  overlay.style.cssText = "position:fixed;inset:0;z-index:100000;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.45);padding:1rem;";
  overlay.innerHTML =
    '<div style="background:var(--surface,#fff);border-radius:16px;padding:1.8rem;max-width:400px;width:100%;box-shadow:0 8px 32px rgba(0,0,0,.15);">' +
    '<h3 style="margin:0 0 .5rem;font-size:1.1rem;color:var(--ink,#1a1a1a);">E-Mail-Adresse ergänzen</h3>' +
    '<p style="margin:0 0 1rem;font-size:.88rem;color:var(--ink-muted,#666);">Bitte hinterlege deine E-Mail-Adresse, damit wir dir bei Bedarf Erinnerungen schicken können.</p>' +
    '<input type="email" id="emailCollectInput" placeholder="Deine E-Mail-Adresse …" style="width:100%;padding:.7rem .9rem;font-size:16px;border:1px solid var(--border,#ddd);border-radius:10px;margin-bottom:.6rem;background:var(--surface,#fff);color:var(--ink,#1a1a1a);box-sizing:border-box;min-height:44px;font-family:inherit;">' +
    '<div id="emailCollectError" style="display:none;color:#ef4444;font-size:.82rem;margin-bottom:.6rem;text-align:center;"></div>' +
    '<button id="emailCollectBtn" type="button" style="width:100%;padding:.85rem;background:var(--accent,#4f6ef7);color:#fff;border:none;border-radius:12px;font-size:1rem;font-weight:600;cursor:pointer;min-height:52px;font-family:inherit;">Speichern</button>' +
    '<button id="emailCollectSkip" type="button" style="width:100%;padding:.6rem;background:none;border:none;color:var(--ink-muted,#666);font-size:.82rem;cursor:pointer;margin-top:.4rem;">Später</button>' +
    '</div>';
  document.body.appendChild(overlay);

  var input = document.getElementById("emailCollectInput");
  var errEl = document.getElementById("emailCollectError");
  var saveBtn = document.getElementById("emailCollectBtn");
  var skipBtn = document.getElementById("emailCollectSkip");

  setTimeout(function() { input.focus(); }, 100);

  function close() {
    var el = document.getElementById("emailCollectOverlay");
    if (el) el.remove();
    if (callback) callback();
  }

  skipBtn.onclick = close;

  saveBtn.onclick = async function() {
    var email = input.value.trim();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errEl.textContent = "Bitte gib eine gültige E-Mail-Adresse ein.";
      errEl.style.display = "block";
      return;
    }
    saveBtn.disabled = true;
    saveBtn.textContent = "Speichere …";
    errEl.style.display = "none";
    try {
      var name = sessionStorage.getItem("student_name");
      var res = await fetch(API_BASE + "/api/save-preferences", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Access-Token": sessionStorage.getItem("access_token") || "" },
        body: JSON.stringify({ student_name: name, email: email })
      });
      var d = await res.json();
      if (d.success) {
        close();
      } else {
        errEl.textContent = d.error || "Fehler beim Speichern.";
        errEl.style.display = "block";
        saveBtn.disabled = false;
        saveBtn.textContent = "Speichern";
      }
    } catch(e) {
      errEl.textContent = "Verbindungsfehler. Bitte versuche es erneut.";
      errEl.style.display = "block";
      saveBtn.disabled = false;
      saveBtn.textContent = "Speichern";
    }
  };

  // Enter-Taste
  input.onkeyup = function(e) { if (e.key === "Enter") saveBtn.onclick(); };
}

/* ================= PROFIL-MODAL ================= */
function _makeProfileGreetingClickable() {
  var greeting = document.getElementById("studentGreeting");
  if (!greeting) return;
  if (sessionStorage.getItem("access") !== "1") return;
  greeting.style.cursor = "pointer";
  greeting.title = "Profil öffnen";
  greeting.onclick = showProfileModal;
}

function showProfileModal() {
  var old = document.getElementById("profileModalOverlay");
  if (old) old.remove();

  var overlay = document.createElement("div");
  overlay.id = "profileModalOverlay";
  overlay.style.cssText = "display:flex;position:fixed;inset:0;z-index:9900;background:rgba(0,0,0,.6);align-items:center;justify-content:center;padding:1rem;backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);";
  overlay.addEventListener("click", function (e) { if (e.target === overlay) overlay.remove(); });

  overlay.innerHTML =
    '<div style="background:var(--surface);border-radius:20px;padding:2rem;max-width:440px;width:100%;box-shadow:0 25px 60px rgba(0,0,0,.3);animation:slideUp .25s ease;max-height:90vh;overflow-y:auto;-webkit-overflow-scrolling:touch;">' +
      '<h2 style="font-size:1.2rem;margin:0 0 1.2rem;text-align:center;font-family:var(--font-display);">Mein Profil</h2>' +

      // Profil-Info
      '<div id="profileInfo" style="margin-bottom:1.2rem;">' +
        '<div style="display:flex;align-items:center;gap:.5rem;margin-bottom:.8rem;">' +
          '<span style="font-size:.82rem;color:var(--ink-muted);min-width:80px;">Name</span>' +
          '<span id="profName" style="font-weight:600;font-size:.95rem;">–</span>' +
        '</div>' +
        '<div style="display:flex;align-items:center;gap:.5rem;margin-bottom:.8rem;">' +
          '<span style="font-size:.82rem;color:var(--ink-muted);min-width:80px;">Klasse</span>' +
          '<span id="profClass" style="font-size:.95rem;">–</span>' +
        '</div>' +
        '<div style="display:flex;align-items:center;gap:.5rem;margin-bottom:.8rem;">' +
          '<label for="profSchool" style="font-size:.82rem;color:var(--ink-muted);min-width:80px;">Schule</label>' +
          '<input type="text" id="profSchool" placeholder="z.\u2009B. Gymnasium Musterstadt" style="flex:1;padding:.5rem .7rem;font-size:16px;border:1px solid var(--border);border-radius:10px;background:var(--surface);color:var(--ink);box-sizing:border-box;min-height:44px;font-family:inherit;">' +
        '</div>' +
        '<div style="display:flex;align-items:center;gap:.5rem;margin-bottom:.8rem;">' +
          '<label for="profEmail" style="font-size:.82rem;color:var(--ink-muted);min-width:80px;">E-Mail</label>' +
          '<input type="email" id="profEmail" placeholder="Optional – für Erinnerungen" style="flex:1;padding:.5rem .7rem;font-size:16px;border:1px solid var(--border);border-radius:10px;background:var(--surface);color:var(--ink);box-sizing:border-box;min-height:44px;font-family:inherit;">' +
        '</div>' +
        '<div style="display:flex;align-items:center;gap:.5rem;margin-bottom:.8rem;">' +
          '<span style="font-size:.82rem;color:var(--ink-muted);min-width:80px;">Dabei seit</span>' +
          '<span id="profSince" style="font-size:.85rem;color:var(--ink-muted);">–</span>' +
        '</div>' +
        '<div style="display:flex;align-items:center;gap:.5rem;margin-bottom:.4rem;">' +
          '<span style="font-size:.82rem;color:var(--ink-muted);min-width:80px;">Abo</span>' +
          '<span id="profAbo" style="font-size:.85rem;">–</span>' +
        '</div>' +
      '</div>' +

      '<div id="profMsg" style="display:none;font-size:.82rem;margin-bottom:.8rem;text-align:center;padding:.5rem;border-radius:8px;"></div>' +

      '<button type="button" onclick="_saveProfileChanges()" style="width:100%;padding:.75rem;background:var(--accent);color:#fff;border:none;border-radius:12px;font-size:.95rem;font-weight:600;cursor:pointer;min-height:48px;font-family:inherit;margin-bottom:1rem;">Änderungen speichern</button>' +

      // Passwort ändern (aufklappbar)
      '<details style="margin-bottom:1rem;">' +
        '<summary style="cursor:pointer;font-size:.9rem;font-weight:600;color:var(--ink);padding:.6rem 0;min-height:44px;display:flex;align-items:center;">Passwort ändern</summary>' +
        '<div style="padding-top:.5rem;">' +
          '<input type="password" id="profOldPw" placeholder="Aktuelles Passwort" style="width:100%;padding:.6rem .8rem;font-size:16px;border:1px solid var(--border);border-radius:10px;margin-bottom:.5rem;background:var(--surface);color:var(--ink);box-sizing:border-box;min-height:44px;font-family:inherit;">' +
          '<input type="password" id="profNewPw" placeholder="Neues Passwort (min. 6 Zeichen)" style="width:100%;padding:.6rem .8rem;font-size:16px;border:1px solid var(--border);border-radius:10px;margin-bottom:.5rem;background:var(--surface);color:var(--ink);box-sizing:border-box;min-height:44px;font-family:inherit;">' +
          '<input type="password" id="profNewPwConfirm" placeholder="Neues Passwort bestätigen" style="width:100%;padding:.6rem .8rem;font-size:16px;border:1px solid var(--border);border-radius:10px;margin-bottom:.5rem;background:var(--surface);color:var(--ink);box-sizing:border-box;min-height:44px;font-family:inherit;">' +
          '<div id="profPwMsg" style="display:none;font-size:.82rem;margin-bottom:.5rem;text-align:center;padding:.4rem;border-radius:8px;"></div>' +
          '<button type="button" onclick="_changePassword()" style="width:100%;padding:.65rem;background:var(--ink);color:var(--surface);border:none;border-radius:10px;font-size:.9rem;font-weight:600;cursor:pointer;min-height:44px;font-family:inherit;">Passwort ändern</button>' +
        '</div>' +
      '</details>' +

      // Aktionen
      '<div style="display:flex;gap:.5rem;">' +
        '<button type="button" onclick="_doLogout()" style="flex:1;padding:.6rem;background:none;border:1px solid #ef4444;color:#ef4444;border-radius:10px;font-size:.85rem;font-weight:600;cursor:pointer;min-height:44px;font-family:inherit;">Abmelden</button>' +
        '<button type="button" onclick="document.getElementById(\'profileModalOverlay\').remove()" style="flex:1;padding:.6rem;background:none;border:1px solid var(--border);color:var(--ink-muted);border-radius:10px;font-size:.85rem;cursor:pointer;min-height:44px;font-family:inherit;">Schließen</button>' +
      '</div>' +
    '</div>';

  document.body.appendChild(overlay);
  _loadProfileData();
}

async function _loadProfileData() {
  var name = sessionStorage.getItem("student_name");
  if (!name) return;

  document.getElementById("profName").textContent = name;

  try {
    var data = await apiCall("/api/get-preferences", { student_name: name });
    if (data.profile) {
      document.getElementById("profClass").textContent = data.profile.class_group || "–";
      if (data.profile.created_at) {
        var d = new Date(data.profile.created_at);
        document.getElementById("profSince").textContent = d.toLocaleDateString("de-DE", { day: "2-digit", month: "long", year: "numeric" });
      }
      document.getElementById("profSchool").value = data.profile.school || "";
    }
    if (data.preferences) {
      document.getElementById("profEmail").value = data.preferences.email || "";
    }
  } catch (e) {
    _showProfileMsg("profMsg", "Profil konnte nicht geladen werden.", true);
  }

  // Abo-Status laden
  try {
    var sub = await checkSubscription();
    var aboEl = document.getElementById("profAbo");
    if (!aboEl) return;
    var planNames = { monthly: "Monatsabo", "6months": "6-Monats-Abo", "12months": "12-Monats-Abo", "24months": "24-Monats-Abo", abitur: "Abiturendspurt", school: "Schullizenz", trial: "Testphase" };
    var manageBtn = '';
    if (sub.has_stripe_customer && (sub.status === "active" || sub.status === "trialing")) {
      manageBtn = '<button type="button" onclick="_openCustomerPortal()" id="profManageAbo" style="margin-top:.6rem;width:100%;padding:.6rem;background:none;border:1px solid var(--accent);color:var(--accent);border-radius:10px;font-size:.85rem;font-weight:600;cursor:pointer;min-height:44px;font-family:inherit;">Abo verwalten</button>';
    }
    if (sub.status === "active") {
      var planLabel = planNames[sub.plan] || sub.plan || "Aktiv";
      var endStr = "";
      if (sub.current_period_end) {
        var endDate = new Date(sub.current_period_end);
        endStr = " (bis " + endDate.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" }) + ")";
      }
      aboEl.innerHTML = '<span style="background:#ecfdf5;color:#059669;padding:.2rem .6rem;border-radius:6px;font-weight:700;font-size:.82rem;">' + planLabel + '</span>' +
        (endStr ? '<span style="color:var(--ink-muted);font-size:.8rem;margin-left:.4rem;">' + endStr + '</span>' : '') + manageBtn;
    } else if (sub.status === "trialing") {
      var daysLeft = sub.trial_days_left || 0;
      aboEl.innerHTML = '<span style="background:#fef3c7;color:#d97706;padding:.2rem .6rem;border-radius:6px;font-weight:700;font-size:.82rem;">Testphase</span>' +
        '<span style="color:var(--ink-muted);font-size:.8rem;margin-left:.4rem;">(' + daysLeft + ' Tage übrig)</span>' + manageBtn;
    } else if (sub.teacher_credits_available) {
      aboEl.innerHTML = '<span style="background:#eff6ff;color:#2563eb;padding:.2rem .6rem;border-radius:6px;font-weight:700;font-size:.82rem;">Lehrer-Credits</span>';
    } else {
      aboEl.innerHTML = '<span style="color:var(--ink-muted);font-size:.82rem;">Kein aktives Abo</span> <a href="/abo.html" style="color:var(--accent);font-size:.82rem;font-weight:600;margin-left:.3rem;">Jetzt abonnieren</a>';
    }
  } catch (e) {
    // Abo-Status nicht kritisch
  }
}

async function _openCustomerPortal() {
  var btn = document.getElementById("profManageAbo");
  if (btn) { btn.disabled = true; btn.textContent = "Wird geladen …"; }
  try {
    var studentId = sessionStorage.getItem("student_id");
    var res = await fetch(API_BASE + "/api/stripe/customer-portal", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Access-Token": getAccessToken() },
      body: JSON.stringify({ student_id: studentId })
    });
    var data = await res.json();
    if (data.url) {
      window.location.href = data.url;
    } else {
      _showProfileMsg("profMsg", data.error || "Kundenportal konnte nicht geöffnet werden.", true);
    }
  } catch (e) {
    _showProfileMsg("profMsg", "Fehler beim Öffnen des Kundenportals.", true);
  }
  if (btn) { btn.disabled = false; btn.textContent = "Abo verwalten"; }
}

async function _saveProfileChanges() {
  var name = sessionStorage.getItem("student_name");
  var school = document.getElementById("profSchool").value.trim();
  var email = document.getElementById("profEmail").value.trim();

  try {
    await apiCall("/api/update-profile", { student_name: name, school: school, email: email });

    _showProfileMsg("profMsg", "Änderungen gespeichert!", false);
  } catch (e) {
    _showProfileMsg("profMsg", e.message || "Fehler beim Speichern.", true);
  }
}

async function _changePassword() {
  var oldPw = document.getElementById("profOldPw").value;
  var newPw = document.getElementById("profNewPw").value;
  var confirmPw = document.getElementById("profNewPwConfirm").value;

  if (!oldPw) { _showProfileMsg("profPwMsg", "Aktuelles Passwort eingeben.", true); return; }
  if (!newPw || newPw.length < 6) { _showProfileMsg("profPwMsg", "Neues Passwort muss mind. 6 Zeichen haben.", true); return; }
  if (newPw !== confirmPw) { _showProfileMsg("profPwMsg", "Passwörter stimmen nicht überein.", true); return; }

  try {
    var res = await fetch(API_BASE + "/api/change-password", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Access-Token": sessionStorage.getItem("access_token") || "" },
      body: JSON.stringify({ student_name: sessionStorage.getItem("student_name"), old_password: oldPw, new_password: newPw })
    });
    var data = await res.json();

    if (data.success) {
      if (data.token) sessionStorage.setItem("access_token", data.token);
      document.getElementById("profOldPw").value = "";
      document.getElementById("profNewPw").value = "";
      document.getElementById("profNewPwConfirm").value = "";
      _showProfileMsg("profPwMsg", "Passwort erfolgreich geändert!", false);
    } else {
      _showProfileMsg("profPwMsg", data.error || "Fehler beim Ändern.", true);
    }
  } catch (e) {
    _showProfileMsg("profPwMsg", "Verbindungsfehler.", true);
  }
}

function _showProfileMsg(id, msg, isError) {
  var el = document.getElementById(id);
  if (!el) return;
  el.textContent = msg;
  el.style.display = "block";
  el.style.background = isError ? "#fef2f2" : "#f0fdf4";
  el.style.color = isError ? "#ef4444" : "#16a34a";
  if (!isError) setTimeout(function () { el.style.display = "none"; }, 3000);
}

function _doLogout() {
  sessionStorage.removeItem("access");
  sessionStorage.removeItem("access_token");
  sessionStorage.removeItem("student_name");
  sessionStorage.removeItem("student_level");
  sessionStorage.removeItem("student_course");
  location.reload();
}

/* ================= FEEDBACK-WIDGET ================= */

function initFeedbackWidget() {
  // Nicht auf Dashboard/Lehrer/Impressum/AGB-Seiten anzeigen
  var page = window.location.pathname;
  if (/dashboard|lehrer|impressum|agb|barrierefreiheit|dsfa|tom|404/.test(page)) return;

  // Widget-Container
  var widget = document.createElement("div");
  widget.className = "feedback-widget";
  widget.innerHTML =
    '<button class="feedback-fab" aria-label="Feedback geben" title="Feedback geben">' +
      '<span class="feedback-fab-pulse"></span>' +
      '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
        '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>' +
      '</svg>' +
      '<span class="feedback-fab-label">Feedback</span>' +
    '</button>' +
    '<div class="feedback-panel" role="dialog" aria-label="Feedback" aria-hidden="true">' +
      '<div class="feedback-panel-header">' +
        '<span>Wie findest du myAbiFlow?</span>' +
        '<button class="feedback-close" aria-label="Schließen">&times;</button>' +
      '</div>' +
      '<div class="feedback-panel-body">' +
        '<div class="feedback-emojis" role="radiogroup" aria-label="Bewertung">' +
          '<button class="feedback-emoji" data-rating="1" aria-label="Schlecht" title="Schlecht">😞</button>' +
          '<button class="feedback-emoji" data-rating="2" aria-label="Geht so" title="Geht so">😐</button>' +
          '<button class="feedback-emoji" data-rating="3" aria-label="Gut" title="Gut">😊</button>' +
          '<button class="feedback-emoji" data-rating="4" aria-label="Super" title="Super">🤩</button>' +
        '</div>' +
        '<div class="feedback-categories" style="display:none">' +
          '<button class="feedback-cat" data-cat="bug">🐛 Problem</button>' +
          '<button class="feedback-cat" data-cat="wunsch">💡 Wunsch</button>' +
          '<button class="feedback-cat" data-cat="lob">👍 Lob</button>' +
        '</div>' +
        '<textarea class="feedback-text" placeholder="Was möchtest du uns sagen? (optional)" rows="3" style="display:none"></textarea>' +
        '<div class="feedback-photo-area" style="display:none">' +
          '<label class="feedback-photo-label">' +
            '<input type="file" class="feedback-photo-input" accept="image/*" style="display:none">' +
            '<span class="feedback-photo-btn">📷 Foto hinzufügen (optional)</span>' +
          '</label>' +
          '<div class="feedback-photo-preview" style="display:none"></div>' +
        '</div>' +
        '<button class="feedback-submit btn" style="display:none">Absenden</button>' +
      '</div>' +
    '</div>';
  document.body.appendChild(widget);

  var fab = widget.querySelector(".feedback-fab");
  var panel = widget.querySelector(".feedback-panel");
  var closeBtn = widget.querySelector(".feedback-close");
  var emojis = widget.querySelectorAll(".feedback-emoji");
  var cats = widget.querySelectorAll(".feedback-cat");
  var catGroup = widget.querySelector(".feedback-categories");
  var textarea = widget.querySelector(".feedback-text");
  var submitBtn = widget.querySelector(".feedback-submit");

  var photoInput = widget.querySelector(".feedback-photo-input");
  var photoArea = widget.querySelector(".feedback-photo-area");
  var photoPreview = widget.querySelector(".feedback-photo-preview");

  var selectedRating = 0;
  var selectedCategory = null;
  var selectedPhoto = null; // base64 JPEG

  function togglePanel(open) {
    if (open) {
      panel.classList.add("open");
      panel.setAttribute("aria-hidden", "false");
      fab.style.display = "none";
    } else {
      panel.classList.remove("open");
      panel.setAttribute("aria-hidden", "true");
      fab.style.display = "";
      // Zustand zurücksetzen
      selectedRating = 0;
      selectedCategory = null;
      emojis.forEach(function(e) { e.classList.remove("active"); });
      cats.forEach(function(c) { c.classList.remove("active"); });
      catGroup.style.display = "none";
      textarea.style.display = "none";
      textarea.value = "";
      photoArea.style.display = "none";
      photoPreview.style.display = "none";
      photoPreview.innerHTML = "";
      photoInput.value = "";
      selectedPhoto = null;
      submitBtn.style.display = "none";
    }
  }

  fab.addEventListener("click", function() { togglePanel(true); });
  closeBtn.addEventListener("click", function() { togglePanel(false); });

  // Emoji-Auswahl
  emojis.forEach(function(btn) {
    btn.addEventListener("click", function() {
      selectedRating = parseInt(btn.dataset.rating);
      emojis.forEach(function(e) { e.classList.remove("active"); });
      btn.classList.add("active");
      catGroup.style.display = "";
      textarea.style.display = "";
      photoArea.style.display = "";
      submitBtn.style.display = "";
    });
  });

  // Kategorie-Auswahl
  cats.forEach(function(btn) {
    btn.addEventListener("click", function() {
      cats.forEach(function(c) { c.classList.remove("active"); });
      btn.classList.add("active");
      selectedCategory = btn.dataset.cat;
    });
  });

  // Foto-Upload
  photoInput.addEventListener("change", async function() {
    var file = photoInput.files[0];
    if (!file) return;
    // Bild via Canvas komprimieren (max 800px, JPEG 0.65)
    var dataURL = await new Promise(function(resolve) {
      var reader = new FileReader();
      reader.onload = function(e) {
        var img = new Image();
        img.onload = function() {
          var maxW = 800;
          var scale = Math.min(1, maxW / img.width);
          var canvas = document.createElement("canvas");
          canvas.width = Math.round(img.width * scale);
          canvas.height = Math.round(img.height * scale);
          canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL("image/jpeg", 0.65));
        };
        img.src = e.target.result;
      };
      reader.readAsDataURL(file);
    });
    selectedPhoto = dataURL.split(",")[1]; // nur base64-Teil
    // Vorschau anzeigen
    photoPreview.innerHTML = '<img src="' + dataURL + '" alt="Vorschau">' +
      '<button class="feedback-photo-remove" aria-label="Foto entfernen" title="Foto entfernen">&times;</button>';
    photoPreview.style.display = "";
    photoPreview.querySelector(".feedback-photo-remove").addEventListener("click", function() {
      selectedPhoto = null;
      photoInput.value = "";
      photoPreview.style.display = "none";
      photoPreview.innerHTML = "";
    });
  });

  // Absenden
  submitBtn.addEventListener("click", async function() {
    if (!selectedRating) return;
    submitBtn.disabled = true;
    submitBtn.textContent = "Wird gesendet…";
    try {
      var res = await fetch(API_BASE + "/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rating: selectedRating,
          category: selectedCategory,
          message: textarea.value.trim() || null,
          page: window.location.pathname,
          studentName: sessionStorage.getItem("student_name") || localStorage.getItem("myabiflow_student_name") || null,
          photo: selectedPhoto || null
        })
      });
      if (res.ok) {
        showToast("Danke für dein Feedback!", "success");
      } else {
        showToast("Feedback konnte nicht gesendet werden.");
      }
    } catch (e) {
      showToast("Feedback konnte nicht gesendet werden.");
    }
    togglePanel(false);
    submitBtn.disabled = false;
    submitBtn.textContent = "Absenden";
  });

  // Panel schließen bei Klick außerhalb
  document.addEventListener("click", function(e) {
    if (panel.classList.contains("open") && !widget.contains(e.target)) {
      togglePanel(false);
    }
  });

  // Escape-Taste
  document.addEventListener("keydown", function(e) {
    if (e.key === "Escape" && panel.classList.contains("open")) {
      togglePanel(false);
    }
  });
}

document.addEventListener("DOMContentLoaded", initFeedbackWidget);

/* ================= WÖCHENTLICHER FEEDBACK-NUDGE ================= */

function initFeedbackNudge() {
  // Nur auf Trainingsseiten (nicht auf Präsentation, Dashboard, etc.)
  var page = window.location.pathname;
  if (/dashboard|lehrer|impressum|agb|barrierefreiheit|dsfa|tom|404|praesentation|datenschutz|features/.test(page)) return;

  var NUDGE_KEY = "feedback_nudge_last";
  var WEEK_MS = 7 * 24 * 60 * 60 * 1000;
  var lastShown = parseInt(localStorage.getItem(NUDGE_KEY) || "0", 10);

  if (Date.now() - lastShown < WEEK_MS) return;

  // Verzögert anzeigen (nach 30 Sekunden aktiver Nutzung)
  setTimeout(function() {
    // Prüfen ob Feedback-Panel gerade offen ist
    var openPanel = document.querySelector(".feedback-panel.open");
    if (openPanel) return;

    showFeedbackNudge();
    localStorage.setItem(NUDGE_KEY, String(Date.now()));
  }, 30000);
}

function showFeedbackNudge() {
  // Overlay
  var overlay = document.createElement("div");
  overlay.className = "feedback-nudge-overlay";

  // Modal
  var modal = document.createElement("div");
  modal.className = "feedback-nudge-modal";
  modal.setAttribute("role", "dialog");
  modal.setAttribute("aria-label", "Feedback geben");
  modal.innerHTML =
    '<button class="feedback-nudge-close" aria-label="Schließen">&times;</button>' +
    '<div class="feedback-nudge-icon">💬</div>' +
    '<h3 class="feedback-nudge-title">Deine Meinung zählt!</h3>' +
    '<p class="feedback-nudge-text">Hilf uns, myAbiFlow noch besser zu machen. Was gefällt dir? Was können wir verbessern?</p>' +
    '<div class="feedback-nudge-actions">' +
      '<button class="feedback-nudge-btn feedback-nudge-btn-primary" data-action="widget">Feedback geben</button>' +
      '<a href="mailto:feedback@myabiflow.de?subject=Feedback%20zu%20myAbiFlow" class="feedback-nudge-btn feedback-nudge-btn-secondary">Per E-Mail schreiben</a>' +
    '</div>' +
    '<button class="feedback-nudge-later">Später erinnern</button>';

  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  // Animation
  requestAnimationFrame(function() {
    overlay.classList.add("visible");
  });

  // Schließen-Funktion
  function closeNudge() {
    overlay.classList.remove("visible");
    setTimeout(function() { overlay.remove(); }, 300);
  }

  // Schließen-Button
  modal.querySelector(".feedback-nudge-close").addEventListener("click", closeNudge);

  // "Später erinnern" — nächstes Mal in 3 Tagen
  modal.querySelector(".feedback-nudge-later").addEventListener("click", function() {
    localStorage.setItem("feedback_nudge_last", String(Date.now() - (4 * 24 * 60 * 60 * 1000)));
    closeNudge();
  });

  // Feedback-Widget öffnen
  modal.querySelector('[data-action="widget"]').addEventListener("click", function() {
    closeNudge();
    // Feedback-FAB klicken
    setTimeout(function() {
      var fab = document.querySelector(".feedback-fab");
      if (fab) fab.click();
    }, 350);
  });

  // Overlay-Klick schließt
  overlay.addEventListener("click", function(e) {
    if (e.target === overlay) closeNudge();
  });

  // Escape-Taste
  function escHandler(e) {
    if (e.key === "Escape") { closeNudge(); document.removeEventListener("keydown", escHandler); }
  }
  document.addEventListener("keydown", escHandler);
}

document.addEventListener("DOMContentLoaded", initFeedbackNudge);

/* ================= KI-HINWEIS AUFGABEN ================= */

function _appendKiHinweisToTask() {
  // Bekannte Aufgaben-Container aller Fachseiten
  var ids = ["aufgabengruppenContainer", "taskInstruction", "materialsContainer"];
  for (var i = 0; i < ids.length; i++) {
    var el = document.getElementById(ids[i]);
    if (el && el.innerHTML.trim() && !el.querySelector(".ki-hinweis")) {
      el.insertAdjacentHTML("afterend", '<p class="ki-hinweis">🤖 KI-generiert\u2013 Inhalte können Fehler enthalten.</p>');
      return;
    }
  }
}

// renderTask nach DOMContentLoaded wrappen, damit der Hinweis bei jeder
// Aufgabengenerierung automatisch erscheint (ohne jede HTML-Seite anzufassen).
document.addEventListener("DOMContentLoaded", function () {
  if (typeof renderTask === "function") {
    var _orig = renderTask;
    window.renderTask = function (data) {
      _orig(data);
      _appendKiHinweisToTask();
    };
  }
});

/* ================= DSGVO CONSENT-BANNER + TRACKING ================= */

// Platzhalter-IDs – nach Einrichtung der Konten ersetzen:
var TRACKING_CONFIG = {
  GA_MEASUREMENT_ID: "G-H2T0ZWDHW8",       // Google Analytics 4
  AW_CONVERSION_ID: "AW-18038861321",       // Google Ads
  META_PIXEL_ID: "XXXXXXXXXXXXXXX"          // Meta/Facebook Pixel
};

function getTrackingConsent() {
  return localStorage.getItem("myabiflow_tracking_consent");
}

function setTrackingConsent(value) {
  localStorage.setItem("myabiflow_tracking_consent", value);
}

// Google Tag (gtag.js) laden
function loadGoogleTag() {
  if (TRACKING_CONFIG.GA_MEASUREMENT_ID === "G-XXXXXXXXXX") return;
  if (document.getElementById("gtag-script")) return;

  var s = document.createElement("script");
  s.id = "gtag-script";
  s.async = true;
  s.src = "https://www.googletagmanager.com/gtag/js?id=" + TRACKING_CONFIG.GA_MEASUREMENT_ID;
  document.head.appendChild(s);

  window.dataLayer = window.dataLayer || [];
  window.gtag = function() { window.dataLayer.push(arguments); };
  window.gtag("js", new Date());
  window.gtag("config", TRACKING_CONFIG.GA_MEASUREMENT_ID, { anonymize_ip: true });

  if (TRACKING_CONFIG.AW_CONVERSION_ID !== "AW-XXXXXXXXXX") {
    window.gtag("config", TRACKING_CONFIG.AW_CONVERSION_ID);
  }
}

// Meta Pixel laden
function loadMetaPixel() {
  if (TRACKING_CONFIG.META_PIXEL_ID === "XXXXXXXXXXXXXXX") return;
  if (window.fbq) return;

  !function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
  n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;
  n.push=n;n.loaded=!0;n.version="2.0";n.queue=[];t=b.createElement(e);t.async=!0;
  t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,
  document,"script","https://connect.facebook.net/en_US/fbevents.js");

  window.fbq("init", TRACKING_CONFIG.META_PIXEL_ID);
  window.fbq("track", "PageView");
}

function loadTrackingScripts() {
  loadGoogleTag();
  loadMetaPixel();
}

// Tracking-Event senden (nur wenn Consent gegeben)
function trackEvent(eventName, params) {
  if (getTrackingConsent() !== "accepted") return;

  // Google Analytics / Ads
  if (window.gtag) {
    window.gtag("event", eventName, params || {});
  }

  // Meta Pixel
  if (window.fbq) {
    window.fbq("track", eventName, params || {});
  }
}

// UTM-Parameter aus URL lesen
function getUtmParams() {
  var params = new URLSearchParams(window.location.search);
  var utm = {};
  ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"].forEach(function(key) {
    var val = params.get(key);
    if (val) utm[key] = val;
  });
  // UTM in sessionStorage speichern (bleibt waehrend des Besuchs erhalten)
  if (Object.keys(utm).length > 0) {
    sessionStorage.setItem("myabiflow_utm", JSON.stringify(utm));
  }
  return JSON.parse(sessionStorage.getItem("myabiflow_utm") || "{}");
}

// Consent-Banner anzeigen
function initConsentBanner() {
  if (getTrackingConsent()) {
    // Consent schon gegeben oder abgelehnt
    if (getTrackingConsent() === "accepted") loadTrackingScripts();
    return;
  }

  var banner = document.createElement("div");
  banner.id = "consentBanner";
  banner.setAttribute("role", "dialog");
  banner.setAttribute("aria-label", "Cookie-Hinweis");
  banner.style.cssText = "position:fixed;bottom:0;left:0;right:0;z-index:99999;background:var(--surface,#fff);border-top:1px solid var(--border,#e2e8f0);padding:1rem 1.2rem;display:flex;align-items:center;justify-content:space-between;gap:1rem;flex-wrap:wrap;font-size:.875rem;color:var(--ink,#0f172a);box-shadow:0 -4px 20px rgba(0,0,0,.1);font-family:var(--font-body,'DM Sans',sans-serif);";

  banner.innerHTML =
    '<p style="flex:1;min-width:200px;margin:0;line-height:1.5;">' +
      'Wir nutzen Cookies fuer Analyse und Marketing, um myAbiFlow zu verbessern. ' +
      '<a href="/dsfa.html" style="color:var(--accent,#4f46e5);text-decoration:underline;">Mehr erfahren</a>' +
    '</p>' +
    '<div style="display:flex;gap:.5rem;flex-shrink:0;">' +
      '<button id="consentReject" style="background:transparent;color:var(--ink-light,#475569);border:1px solid var(--border,#e2e8f0);padding:.5rem 1rem;border-radius:8px;font-size:.85rem;cursor:pointer;min-height:44px;min-width:44px;font-family:inherit;">Ablehnen</button>' +
      '<button id="consentAccept" style="background:var(--accent,#4f46e5);color:#fff;border:none;padding:.5rem 1.2rem;border-radius:8px;font-weight:600;font-size:.85rem;cursor:pointer;min-height:44px;min-width:44px;font-family:inherit;">Akzeptieren</button>' +
    '</div>';

  document.body.appendChild(banner);

  document.getElementById("consentAccept").addEventListener("click", function() {
    setTrackingConsent("accepted");
    loadTrackingScripts();
    banner.remove();
  });

  document.getElementById("consentReject").addEventListener("click", function() {
    setTrackingConsent("rejected");
    banner.remove();
  });
}

// UTM-Parameter beim Laden erfassen + Consent-Banner initialisieren
document.addEventListener("DOMContentLoaded", function() {
  getUtmParams();
  initConsentBanner();
});

