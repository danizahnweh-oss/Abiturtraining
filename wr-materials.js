let _wrAbiMatIdx = 0;
function normalizeWRMaterialType(material) {
  const rawType = material && (material.typ != null ? material.typ : material.type);
  const normalized = String(rawType || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\s\u200B-\u200D\uFEFF_-]+/g, "");

  if (normalized.includes("karikatur") || normalized.includes("cartoon")) return "karikatur";
  if (["bild", "image", "abbildung", "illustration", "grafik"].includes(normalized)) return "bild";
  if (["foto", "photo", "photograph", "fotografie"].includes(normalized)) return "foto";
  if (["statistik", "statistics", "tabelle", "table", "diagramm", "chart"].includes(normalized)) return "statistik";

  // Letzte Sicherung: Ein ausdrücklich als Karikatur betiteltes Material darf nie
  // als Text gerendert werden, selbst wenn das KI-Modell das Typ-Feld beschädigt.
  const materialDescription = [material && material.titel, material && material.quelle]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  if (/\b(karikatur|cartoon)\b/.test(materialDescription)) return "karikatur";

  return normalized;
}

function renderMaterialsHtml(mats, prefix) {
  const pfx = prefix || ('wra-' + (_wrAbiMatIdx++));
  return (mats || []).map((m, idx) => {
    const materialType = normalizeWRMaterialType(m);
    let inhalt;
    if (!["bild", "foto", "karikatur"].includes(materialType) && (m.inhalt || "").includes("|")) {
      inhalt = DOMPurify.sanitize(marked.parse(m.inhalt || ""));
      inhalt += `<div class="material-chart"><canvas id="chart-${pfx}-${idx}"></canvas></div>`;
    } else if (materialType === "bild") {
      inhalt = `<div class="material-img-loading" data-required-material data-image-state="loading" id="img-${pfx}-${idx}"><div class="loader-spinner"></div><span>Bild wird generiert...</span></div>`;
    } else if (materialType === "foto") {
      inhalt = `<div class="material-img-loading" data-required-material data-image-state="loading" id="img-${pfx}-${idx}"><div class="loader-spinner"></div><span>Foto wird geladen...</span></div>`;
    } else if (materialType === "karikatur") {
      inhalt = `<div class="material-img-loading" data-required-material data-image-state="loading" id="img-${pfx}-${idx}"><div class="loader-spinner"></div><span>Karikatur wird generiert...</span></div>`;
    } else {
      inhalt = formatTextWithLineNumbers(m.inhalt);
    }
    return `<details class="material-card" open>
  <summary><span class="material-badge">${escapeHtml(m.nr || "")}</span> ${escapeHtml(m.titel || "")} <span style="margin-left:auto;font-size:.8rem;color:var(--ink-muted)">${escapeHtml(materialType || m.typ || m.type || "")}</span></summary>
  <div class="material-body">${inhalt}<div class="material-source">${escapeHtml(m.quelle || "")}</div></div>
</details>`;
  }).join("");
}

const _wrMaterialObservers = [];
function resetWRMaterials() {
  _wrMaterialObservers.splice(0).forEach(observer => observer.disconnect());
  document.getElementById('feedbackContent').style.display = 'none';
  document.getElementById('feedbackBody').textContent = '';
  document.querySelectorAll('[id^="scoreBE"], #scoreNP').forEach(el => { el.textContent = '–'; });
  queueMicrotask(() => persistWritingDraft());
}
function ensureMaterialsReady() {
  const missing = document.querySelector('#sec-task [data-required-material]:not([data-image-state="ready"])');
  if (!missing) return true;
  showToast(missing.dataset.imageState === "error"
    ? "Ein erforderliches Bild fehlt. Bitte lade es in der Aufgabenansicht erneut."
    : "Die Bilder werden noch erstellt. Bitte warte, bis alle Materialien bereit sind.");
  return false;
}
function loadMaterialAssets(mats, prefix, mirrorPrefix) {
  (mats || []).forEach((m, idx) => {
    const type = normalizeWRMaterialType(m);
    if (!["bild", "foto", "karikatur"].includes(type)) {
      if ((m.inhalt || "").includes("|")) {
        renderStatistikChart(m.inhalt, `chart-${prefix}-${idx}`);
        if (mirrorPrefix) renderStatistikChart(m.inhalt, `chart-${mirrorPrefix}-${idx}`);
      }
      return;
    }
    const sourceId = `img-${prefix}-${idx}`;
    const source = document.getElementById(sourceId);
    const mirror = mirrorPrefix && document.getElementById(`img-${mirrorPrefix}-${idx}`);
    if (!source) return;
    if (mirror) {
      // Eine Generierung, zwei Ansichten. Auch Wiederholen und Fehler synchronisieren.
      const sync = () => {
        mirror.innerHTML = source.innerHTML;
        mirror.dataset.imageState = source.dataset.imageState;
        mirror.setAttribute("aria-busy", source.getAttribute("aria-busy") || "false");
        mirror.querySelectorAll("[id]").forEach(el => el.removeAttribute("id"));
        mirror.querySelectorAll(".edu-img-regen-btn").forEach(button => {
          button.addEventListener("click", () => source.querySelector(".edu-img-regen-btn")?.click());
        });
      };
      const observer = new MutationObserver(sync);
      observer.observe(source, { childList: true, subtree: true, attributes: true });
      _wrMaterialObservers.push(observer);
      sync();
    }
    loadEducationalImage(m.inhalt, sourceId, m.bild_labels || null, type === "bild" ? "diagram" : type, false, {
      cachedImage: m._generatedImage?.prompt === m.inhalt ? m._generatedImage : null,
      onReady: (url, response) => {
        if (m._generatedImage?.url === url) return;
        m._generatedImage = { prompt: m.inhalt, url, credit: response?.credit || '', caption: response?.caption || '' };
        saveWRState();
      }
    });
  });
}

// Rohdaten statt HTML sichern: Feedback bleibt sicher renderbar und wird nicht erneut bewertet.
let wrRestoringGrade = null;
function saveWRState() {
  try { saveSession(); }
  catch { showToast('Speicher voll oder nicht verfügbar. Bitte sichere deine Antwort und das Feedback als PDF, bevor du diese Seite schließt.'); }
}
function wrGradeOptions(endpoint, body) {
  const task = CONFIG.storedData;
  return {
    forcePolling: true,
    onJobSubmitted: jobId => {
      // Fertige Bilddaten sind bereits am Material gespeichert, nicht doppelt im Auftrag.
      const savedBody = JSON.parse(JSON.stringify(body, (key, value) => key === '_generatedImage' ? undefined : value));
      task._wrPendingGrade = { jobId, endpoint, body: savedBody };
      delete task._wrFeedback;
      saveWRState();
    }
  };
}
function rememberWRFeedback(result) {
  CONFIG.storedData._wrGradeBody = CONFIG.storedData._wrPendingGrade?.body || CONFIG.storedData._wrGradeBody;
  CONFIG.storedData._wrFeedback = result;
  delete CONFIG.storedData._wrPendingGrade;
  saveWRState();
}
function displayWRFeedback(result) {
  if (CONFIG.storedData._wrGradeBody) _lastGradeBody = CONFIG.storedData._wrGradeBody;
  const s = result.scores || {};
  const fields = MODULE_CONFIG.storagePrefix === 'wr' ? {
    scoreBE: s.be_erreicht, scoreBEMax: s.be_max, scoreNP: s.notenpunkte ?? s.total
  } : {
    scoreBE1: s.be_1, scoreBEMax1: s.be_max_1, scoreBE2: s.be_2,
    scoreBEMax2: s.be_max_2, scoreBEGesamt: s.be_gesamt,
    scoreBEMaxGesamt: s.be_max_gesamt, scoreNP: s.notenpunkte
  };
  Object.entries(fields).forEach(([id, value]) => {
    const el = document.getElementById(id);
    if (el) el.textContent = value ?? '–';
  });
  const blocks = document.getElementById('blockScoresContainer');
  if (blocks) blocks.innerHTML = (result.bewertung_bloecke || []).map(b =>
    `<div class="block-score"><span class="block-name">Block ${escapeHtml(String(b.block_nr))}</span><span class="block-be">${escapeHtml(String(b.be_erreicht))} / ${escapeHtml(String(b.be_max))} BE</span></div>`).join('');
  document.getElementById('feedbackBody').innerHTML = DOMPurify.sanitize(marked.parse(result.feedback || 'Zu dieser Korrektur liegt kein ausführlicher Rückmeldungstext vor.'));
  renderKorrekturFeedback(result);
  document.getElementById('feedbackLoader').style.display = 'none';
  document.getElementById('feedbackContent').style.display = 'block';
}
async function restoreWRFeedback() {
  const task = CONFIG.storedData;
  if (!task) return;
  if (task._wrFeedback) { displayWRFeedback(task._wrFeedback); return; }
  if (document.getElementById('submitBtn').disabled || wrRestoringGrade === task) return;
  const pending = task._wrPendingGrade;
  if (!pending) {
    document.getElementById('feedbackLoader').style.display = 'none';
    document.getElementById('feedbackContent').style.display = 'block';
    document.getElementById('feedbackBody').textContent = 'Für diese Aufgabe ist auf diesem Gerät noch kein vollständiges Feedback gespeichert. Deine Antwort findest du unter „Schreiben“. Bereits vorhandene Punkte bleiben im Fortschritt erhalten.';
    return;
  }
  wrRestoringGrade = task;
  document.getElementById('submitBtn').disabled = true;
  document.getElementById('feedbackLoader').style.display = 'block';
  document.getElementById('feedbackContent').style.display = 'none';
  try {
    const result = await apiCallAsync(pending.endpoint, pending.body, { resumeJobId: pending.jobId });
    if (CONFIG.storedData !== task) return;
    rememberWRFeedback(result);
    displayWRFeedback(result);
  } catch (error) {
    if (CONFIG.storedData !== task) return;
    document.getElementById('feedbackContent').style.display = 'block';
    document.getElementById('feedbackBody').textContent = 'Korrektur konnte nicht wiederhergestellt werden: ' + error.message;
  } finally {
    wrRestoringGrade = null;
    if (CONFIG.storedData === task) {
      document.getElementById('feedbackLoader').style.display = 'none';
      document.getElementById('submitBtn').disabled = false;
    }
  }
}
