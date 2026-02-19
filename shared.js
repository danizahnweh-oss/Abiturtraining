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

async function apiCall(endpoint, body) {
  const res = await fetch(API_BASE + endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Access-Token": getAccessToken() },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

/* ================= KORREKTUR & ASPEKTE ================= */

function renderKorrekturFeedback(d) {
  const korrekturCard = document.getElementById("korrekturCard");
  const aspekteCard = document.getElementById("aspekteCard");
  if (korrekturCard) korrekturCard.style.display = "none";
  if (aspekteCard) aspekteCard.style.display = "none";

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
  if (step === "task") injectPdfButton();
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
  localStorage.setItem("theme", isDark ? "light" : "dark");
  document.getElementById("themeToggleBtn").textContent = isDark ? "🌙" : "☀️";
  if (progressChartInstance) renderProgressChart();
}

function initTheme() {
  const saved = localStorage.getItem("theme");
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const theme = saved || (prefersDark ? "dark" : "light");
  document.documentElement.setAttribute("data-theme", theme);
  document.getElementById("themeToggleBtn").textContent = theme === "dark" ? "☀️" : "🌙";
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
  } catch {}
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
  try { history = JSON.parse(localStorage.getItem(localKey) || "[]"); } catch {}
  history.push({ date: new Date().toISOString(), ...entry });
  localStorage.setItem(localKey, JSON.stringify(history));
  // Invalidate server cache so next renderProgress fetches fresh data
  serverHistory = null;
}

function deleteHistoryEntry(index) {
  // Only works on localStorage entries (server entries are permanent)
  const localKey = MODULE_CONFIG.historyKey + getStudentKey();
  let history = [];
  try { history = JSON.parse(localStorage.getItem(localKey) || "[]"); } catch {}
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
  } catch {}
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

function exportPDF() {
  const filename = (MODULE_CONFIG.pdfFilename || "Export") + "_" + new Date().toISOString().slice(0, 10) + ".pdf";
  html2pdf().set({ margin: 10, filename: filename }).from(document.getElementById("feedbackContent")).save();
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

function showPdfExportModal() {
  if (!hasMaterial()) {
    exportTaskPDF("task");
    return;
  }
  if (document.getElementById("pdfModal")) return;
  var overlay = document.createElement("div");
  overlay.className = "pdf-modal-overlay";
  overlay.id = "pdfModal";
  overlay.onclick = function(e) { if (e.target === overlay) closePdfModal(); };
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
  var sec = document.getElementById(prefix + "task");
  if (!sec) { closePdfModal(); return; }

  // Force light theme for PDF (dark text on white bg)
  var root = document.documentElement;
  var prevTheme = root.getAttribute("data-theme");
  root.setAttribute("data-theme", "light");

  // Clone section into a clean absolute-positioned container
  var wrap = sec.cloneNode(true);
  wrap.removeAttribute("id");
  wrap.style.cssText = "display:block;position:absolute;left:0;top:0;width:800px;padding:10px 20px;margin:0;background:#fff;color:#1a1a2e;animation:none;z-index:-9999;";

  // Remove UI elements from clone
  wrap.querySelectorAll("button, .highlighter-toolbar, .ggb-container, .wahl-hint").forEach(function(el) { el.remove(); });

  // Mode-specific: remove material or task elements from clone
  var materialIds = ["materialsContainer", "sourceText", "sourceMeta", "textTitle", "zusatzMaterialien", "articleBody", "articleTitle"];
  var taskIds = ["taskInstruction", "taskMeta", "teilaufgabenContainer", "teilAPflichtContainer", "teilAWahlContainer", "teilBContainer"];
  if (mode === "task") {
    materialIds.forEach(function(id) { var el = wrap.querySelector("#" + id); if (el) el.remove(); });
  } else if (mode === "material") {
    taskIds.forEach(function(id) { var el = wrap.querySelector("#" + id); if (el) el.remove(); });
  }

  document.body.appendChild(wrap);

  var suffix = mode === "task" ? "_Aufgabe_" : mode === "material" ? "_Material_" : "_Aufgabe+Material_";
  var filename = (MODULE_CONFIG.pdfFilename || "Export") + suffix + new Date().toISOString().slice(0, 10) + ".pdf";

  html2pdf().set({
    margin: [10, 10, 10, 10],
    filename: filename,
    html2canvas: { scale: 2, useCORS: true, backgroundColor: "#ffffff" },
    jsPDF: { format: "a4", orientation: "portrait" },
    pagebreak: { mode: ["css", "legacy"], avoid: [".card", ".aufgabe-item", ".aufgabengruppe-card", ".task-box", ".teilaufgabe-item"] }
  }).from(wrap).save().then(function() {
    wrap.remove();
    root.setAttribute("data-theme", prevTheme);
  });

  closePdfModal();
}

function injectPdfButton() {
  var prefix = MODULE_CONFIG.sectionPrefix || "";
  var sec = document.getElementById(prefix + "task");
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
      try { hlRange.surroundContents(span); } catch {}
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
  document.getElementById("ocrLoader").style.display = "block";

  for (let i = startIdx; i < ocrPages.length; i++) {
    const p = ocrPages[i];
    p.status = "processing";
    renderOCRPages();
    document.getElementById("ocrProgress").textContent = `Seite ${i + 1} von ${ocrPages.length}`;

    try {
      const b64 = await fileToBase64(p.file);
      p.base64 = b64;
      const d = await apiCall("/api/ocr", { image_base64: b64 });
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

/* ================= INIT ================= */

// Drag & Drop for OCR upload zone
;(function () {
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
      if (MODULE_CONFIG.hasOwnLogin) {
        const ls = document.getElementById("login-screen");
        const aw = document.getElementById("app-wrapper");
        if (ls) ls.style.display = "flex";
        if (aw) aw.style.display = "none";
      } else {
        window.location.href = "index.html";
      }
    }
  }
});

// Browser back/forward navigates between stepper steps
window.addEventListener("popstate", function (e) {
  if (e.state && e.state.step) {
    nav(e.state.step, false);
  }
});

// Main init
window.onload = function () {
  initTheme();

  // Modules with their own login screen handle auth themselves
  if (MODULE_CONFIG.hasOwnLogin) {
    if (sessionStorage.getItem("access") !== "1" || !sessionStorage.getItem("student_name")) {
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
    initHL();
    setInterval(saveSession, 15000);
    history.replaceState({ step: MODULE_CONFIG.steps[0] }, "");
    return;
  }

  // Auth check for German-style modules (redirect if not logged in)
  if (sessionStorage.getItem("access") !== "1") {
    window.location.href = "index.html";
    return;
  }

  // Greeting
  const greeting = document.getElementById("studentGreeting");
  if (greeting) {
    greeting.textContent = `${sessionStorage.getItem("student_name")} · ${(sessionStorage.getItem("student_level") || "").toUpperCase()}`;
    greeting.style.display = "inline";
  }

  // Restore & init
  restoreSession();
  initHL();
  setInterval(saveSession, 30000);
  history.replaceState({ step: MODULE_CONFIG.steps[0] }, "");
};
