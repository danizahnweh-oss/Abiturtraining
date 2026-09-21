/* Gemeinsame Wiederherstellung der Gymnasiums-Fachseiten. FOS/BOS lädt diese Datei nicht. */
const gymImageRequests = new WeakMap();
let gymRestoringTask = null;
let gymLastCompleted = null;

function gymStore(key, value) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('myabiflow-gymnasium', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('records');
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction('records', value === undefined ? 'readonly' : 'readwrite');
      const op = value === undefined ? tx.objectStore('records').get(key) : tx.objectStore('records').put(value, key);
      tx.oncomplete = () => { db.close(); resolve(op.result); };
      tx.onerror = tx.onabort = () => { db.close(); reject(tx.error || new Error('Speicher nicht verfügbar')); };
    };
  });
}

function gymSaveSession() {
  try { saveSession(); return true; }
  catch (error) {
    showToast('Dein Browser konnte den Stand nicht speichern. Bitte sichere deine Antwort zusätzlich außerhalb der Website.');
    return false;
  }
}

function gymRecoveryKey(task) {
  if (!task._gymRecoveryId) task._gymRecoveryId = crypto.randomUUID();
  return MODULE_CONFIG.storagePrefix + ':' + getStudentKey() + ':' + task._gymRecoveryId;
}

// Nur kleine Verweise im Textentwurf; große Bilder bleiben in IndexedDB.
async function gymImageOptions(prompt, style, retry, original) {
  const task = CONFIG.storedData;
  if (!task || original?.onReady || /^(data:|https?:)/i.test(prompt)) return original;
  const signature = JSON.stringify([prompt, style || 'diagram', original?.noText === true]);
  const refs = task._gymImages || (task._gymImages = {});
  const key = refs[signature] || crypto.randomUUID();
  const cachedImage = !retry ? await gymStore(key).catch(() => null) : null;
  return Object.assign({}, original, {
    cachedImage,
    onReady: async (url, response) => {
      if (!response || CONFIG.storedData !== task) return;
      try {
        if (!cachedImage || cachedImage.url !== url) await gymStore(key, { url, credit: response.credit, caption: response.caption });
        refs[signature] = key;
        gymSaveSession();
      } catch (error) {
        showToast('Das Bild ist sichtbar, konnte aber nicht dauerhaft gespeichert werden. Bitte sichere die Aufgabe als PDF.');
      }
    }
  });
}

// Gleiche Materialien in Aufgabe und Schreibansicht nicht doppelt bezahlen/generieren.
async function gymGenerateImage(body, generate) {
  const task = CONFIG.storedData;
  if (!task) return generate();
  let requests = gymImageRequests.get(task);
  if (!requests) { requests = new Map(); gymImageRequests.set(task, requests); }
  const key = JSON.stringify(body);
  if (requests.has(key)) return requests.get(key);
  const pending = generate();
  requests.set(key, pending);
  try { return await pending; }
  finally { if (requests.get(key) === pending) requests.delete(key); }
}

function gymFeedbackView() {
  const content = document.getElementById('feedbackContent');
  if (!content || content.style.display === 'none') return null;
  const scores = {};
  content.querySelectorAll('[id^="score"]').forEach(el => {
    if (!el.children.length) scores[el.id] = el.textContent;
  });
  const grid = content.querySelector('#scoresGrid, .scores-grid');
  return {
    scores,
    grid: grid ? { id: grid.id, html: grid.innerHTML } : null,
    body: document.getElementById('feedbackBody')?.innerHTML,
    details: document.getElementById('beScoresGrid')?.innerHTML
  };
}

async function gymCaptureFeedback() {
  const completed = gymLastCompleted;
  if (!completed || completed.task !== CONFIG.storedData) return;
  const maximum = document.getElementById('scoreBEMax');
  if (maximum && Number.isFinite(completed.record.result?.max_be)) maximum.textContent = '/ ' + completed.record.result.max_be + ' BE';
  const view = gymFeedbackView();
  if (!view) return;
  completed.record.view = view;
  await gymStore(completed.key, completed.record).catch(() => {});
}

function gymDisplayFeedback(record) {
  const result = record.result;
  if (!result) return;
  _lastGradeBody = record.body;
  const view = record.view;
  const content = document.getElementById('feedbackContent');
  const body = document.getElementById('feedbackBody');
  const grid = content?.querySelector('#scoresGrid, .scores-grid');
  if (view) {
    if (grid && view.grid) grid.innerHTML = DOMPurify.sanitize(view.grid.html);
    const details = document.getElementById('beScoresGrid');
    if (details && view.details) details.innerHTML = DOMPurify.sanitize(view.details);
    Object.entries(view.scores || {}).forEach(([id, text]) => {
      const el = document.getElementById(id);
      if (el) el.textContent = text;
    });
  } else {
    // Vorhandene IDs erhalten: spätere Abgaben verwenden dieselben Anzeigeelemente.
    const scores = result.scores || {};
    const total = scores.total ?? scores.notenpunkte ?? result.note ?? result.notenpunkte;
    const max = result.max_be ?? scores.be_max;
    const achieved = result.gesamt_be ?? scores.be_erreicht;
    const values = {
      scoreVerstehen: scores.verstehen ?? scores.uebersetzung, scoreDarstellung: scores.darstellung,
      scoreContent: scores.content_textstructure ?? scores.content, scoreLang: scores.language,
      scoreTotal: total, scoreNP: total, scoreBE: achieved,
      scoreTeilA: scores.teil_a ?? result.teil_a_be, scoreTeilB: scores.teil_b ?? result.teil_b_be,
      scoreSachA: scores.sach_a, scoreSachB: scores.sach_b, scoreSachkompetenz: scores.sachkompetenz,
      scoreBEMax: max != null ? '/ ' + max + ' BE' : undefined,
      scoreProzent: Number.isFinite(achieved) && max > 0 ? Math.round(achieved / max * 100) + '%' : undefined,
      scorePoints: result.total_points != null ? result.total_points + '/' + result.max_points : undefined,
      scoreMax: result.max_points != null ? 'von ' + result.max_points : undefined, scorePercent: result.percentage
    };
    if (typeof npToGrade === 'function' && Number.isFinite(total)) {
      const grade = npToGrade(total);
      values.scoreGrade = grade.note;
      values.scoreGradeLabel = grade.label;
    }
    Object.entries(values).forEach(([id, value]) => {
      const el = document.getElementById(id);
      if (el && value != null) el.textContent = value;
    });
    if (scores.uebersetzung != null) {
      const card = document.getElementById('scoreVerstehen')?.closest('.score-card');
      if (card?.querySelector('.score-label')) card.querySelector('.score-label').textContent = 'Übersetzung (BE)';
      if (card?.querySelector('.score-max')) card.querySelector('.score-max').textContent = '/ ' + ((record.body?.level || 'eA').toLowerCase() === 'ea' ? 60 : 45) + ' BE';
    }
    const parts = result.teilbewertungen || result.aufgaben_be;
    const details = document.getElementById('beScoresGrid');
    if (Array.isArray(parts) && parts.length) {
      const html = parts.map((part, i) => '<div class="score-card"><div class="score-label">' + escapeHtml(part.id || part.titel || 'Aufgabe ' + (i + 1)) + '</div><div class="score-value">' + escapeHtml(String(part.erreichte_be ?? '–')) + '</div><div class="score-max">/ ' + escapeHtml(String(part.max_be ?? '–')) + ' BE</div></div>').join('');
      if (details) details.innerHTML = html;
      else if (grid) {
        // Dynamische Abitur-Raster werden auch bei jeder regulären Abgabe neu aufgebaut.
        grid.innerHTML = html + '<div class="score-card"><div class="score-label">Gesamt</div><div class="score-value" id="scoreBE">' + escapeHtml(String(achieved ?? '–')) + '</div><div class="score-max" id="scoreBEMax">/ ' + escapeHtml(String(max ?? '–')) + ' BE</div></div><div class="score-card total"><div class="score-label">Notenpunkte</div><div class="score-value" id="scoreTotal">' + escapeHtml(String(total ?? '–')) + '</div></div>';
      }
    }
  }
  if (body) {
    const parse = typeof safeMathParse === 'function' ? safeMathParse : marked.parse;
    body.innerHTML = DOMPurify.sanitize(view?.body || parse(result.feedback || 'Die Korrektur ist abgeschlossen.'));
    if (typeof renderMath === 'function') renderMath(body);
  }
  if (typeof renderKorrekturFeedback === 'function') renderKorrekturFeedback(result);
  if (typeof renderFeedbackQuestions === 'function' && result.results) renderFeedbackQuestions(result.results);
  if (typeof feedbackMode !== 'undefined' && result.results) feedbackMode = true;
  const transcript = document.getElementById('transcriptBody');
  if (transcript) transcript.textContent = record.body?.transcript || '';
  if (content) content.style.display = 'block';
  const loader = document.getElementById('feedbackLoader');
  if (loader) loader.style.display = 'none';
  if (typeof stopTimer === 'function') stopTimer();
}

async function gymPollRecord(key, record) {
  try { return await gymOriginalGrade(record.endpoint, record.body, { resumeJobId: record.jobId }); }
  catch (error) {
    if (error.gradeJobTerminal) { delete record.jobId; await gymStore(key, record); }
    throw error;
  }
}

async function gymRestoreFeedback() {
  const task = CONFIG.storedData;
  if (!task || document.getElementById('submitBtn')?.disabled || gymRestoringTask === task) return;
  if (!task._gymRecoveryId) {
    const body = document.getElementById('feedbackBody');
    if (body) body.textContent = 'Für diese Aufgabe ist noch kein vollständiges Feedback gespeichert. Gib deine Antwort im Schreibschritt ab.';
    const content = document.getElementById('feedbackContent');
    if (content) {
      content.style.display = 'block';
      content.querySelectorAll('[id^="score"]').forEach(el => { if (!el.children.length && !/label|max/i.test(el.id)) el.textContent = '–'; });
    }
    return;
  }
  gymRestoringTask = task;
  const key = gymRecoveryKey(task);
  const btn = document.getElementById('submitBtn');
  try {
    const record = await gymStore(key);
    if (CONFIG.storedData !== task || !record) return;
    if (record.result) { gymDisplayFeedback(record); return; }
    if (!record.jobId) return;
    if (btn) btn.disabled = true;
    const loader = document.getElementById('feedbackLoader');
    if (loader) loader.style.display = 'block';
    const result = await gymPollRecord(key, record);
    record.result = result;
    delete record.jobId;
    await gymStore(key, record);
    if (CONFIG.storedData === task) gymDisplayFeedback(record);
  } catch (error) {
    if (CONFIG.storedData === task) showToast('Die gespeicherte Korrektur konnte nicht geladen werden: ' + error.message);
  } finally {
    if (gymRestoringTask === task) gymRestoringTask = null;
    if (CONFIG.storedData === task) {
      if (btn) btn.disabled = false;
      const loader = document.getElementById('feedbackLoader');
      if (loader) loader.style.display = 'none';
    }
  }
}

const gymOriginalGrade = apiCallAsync;
apiCallAsync = async function(endpoint, body, options) {
  const task = CONFIG.storedData;
  if (!task || options?.resumeJobId) return gymOriginalGrade(endpoint, body, options);
  const key = gymRecoveryKey(task);
  const previous = await gymStore(key).catch(() => null);
  // Auch ein erneuter Klick nach einem Verbindungsabbruch darf keinen zweiten Job starten.
  if (previous?.jobId) {
    const result = await gymPollRecord(key, previous);
    previous.result = result;
    delete previous.jobId;
    await gymStore(key, previous);
    gymLastCompleted = { task, key, record: previous };
    setTimeout(gymCaptureFeedback, 0);
    return result;
  }
  gymLastCompleted = null;
  const record = { endpoint, body };
  // Vor der Abgabe prüfen, ob die Wiederherstellung tatsächlich gespeichert werden kann.
  await gymStore(key, record);
  if (!gymSaveSession()) throw new Error('Bitte sichere zuerst deinen Text. Der Browser-Speicher ist voll.');
  let result;
  try { result = await gymOriginalGrade(endpoint, body, Object.assign({}, options, {
    forcePolling: true,
    onJobSubmitted: async jobId => {
      record.jobId = jobId;
      await gymStore(key, record);
      if (options?.onJobSubmitted) await options.onJobSubmitted(jobId);
    }
  })); }
  catch (error) {
    if (error.gradeJobTerminal) { delete record.jobId; await gymStore(key, record); }
    throw error;
  }
  record.result = result;
  delete record.jobId;
  await gymStore(key, record);
  gymLastCompleted = { task, key, record };
  setTimeout(gymCaptureFeedback, 0);
  return result;
};

const gymOriginalApi = apiCall;
function gymValidateTaskPoints(data) {
  function taskText(value) {
    if (!value || typeof value !== 'object') return '';
    return Object.entries(value).filter(([key]) => /(?:task|instruction|aufgab|teilaufgab)/i.test(key)).map(([, item]) => {
      if (typeof item === 'string') return item;
      if (Array.isArray(item)) return item.map(entry => typeof entry === 'string' ? entry : (entry?.text || entry?.aufgabe || entry?.instruction || '')).join(' ');
      return item?.text || item?.aufgabe || item?.instruction || '';
    }).join(' ');
  }
  function validateMaterialReferences(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return;
    const instructions = taskText(value).replace(/\s+/g, ' ');
    if (!instructions) return;
    Object.entries(value).filter(([key, materials]) => /^(?:materials?|materialien(?:_\d+)?|zusatz_materialien)$/i.test(key) && Array.isArray(materials)).forEach(([, materials]) => {
      const missing = materials.map(material => String(material?.id || material?.nr || '').trim()).filter(id => /^(?:M|A|B)\s*\d+$/i.test(id)).filter(id => !new RegExp('\\b' + id.replace(/\s+/g, '\\s*') + '\\b', 'i').test(instructions));
      if (missing.length) throw new Error('Die erzeugte Aufgabe verwendet ' + missing.join(', ') + ' nicht in der Aufgabenstellung. Bitte erstelle die Aufgabe erneut.');
    });
  }
  function visit(value) {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value.teilaufgaben) && value.teilaufgaben.length && value.teilaufgaben.every(task => Number.isFinite(task.be))) {
      const sum = value.teilaufgaben.reduce((total, task) => total + task.be, 0);
      const declared = value.gesamt_be ?? value.be_gesamt ?? value.be;
      if (value.teilaufgaben.some(task => task.be < 0) || (Number.isFinite(declared) && declared !== sum)) {
        throw new Error('Die erzeugte Aufgabe enthält widersprüchliche Punktesummen. Bitte erstelle die Aufgabe erneut.');
      }
    }
    validateMaterialReferences(value);
    Object.values(value).forEach(visit);
  }
  visit(data);
  return data;
}
apiCall = function(endpoint, body, ...args) {
  if (endpoint === '/api/generate-image') return gymGenerateImage(body, () => gymOriginalApi(endpoint, body, ...args));
  if (/^\/api\/grade-listening(?:-french)?$/.test(endpoint)) return apiCallAsync(endpoint.slice(5), body);
  if (/^\/api\/generate(?:-|$)/.test(endpoint) && endpoint !== '/api/generate-image') return gymOriginalApi(endpoint, body, ...args).then(gymValidateTaskPoints);
  return gymOriginalApi(endpoint, body, ...args);
};
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') gymCaptureFeedback(); });
window.addEventListener('pagehide', gymCaptureFeedback);

// Alte sprachübergreifende Entwürfe bleiben erhalten und werden nur bewusst übernommen.
document.addEventListener('DOMContentLoaded', () => {
  if (!/listening|writing|mediation|schreiben/.test(location.pathname)) return;
  try {
    const legacyKey = 'session_' + getStudentKey();
    const key = MODULE_CONFIG.storagePrefix + '_session_' + getStudentKey();
    const raw = localStorage.getItem(legacyKey);
    if (!raw || localStorage.getItem(key) || localStorage.getItem(legacyKey + '_imported')) return;
    const saved = JSON.parse(raw);
    if (!saved.examData && !saved.listeningData) return;
    const notice = document.createElement('div');
    notice.className = 'draft-save-status';
    notice.setAttribute('role', 'status');
    notice.style.cssText = 'padding:1rem;display:flex;gap:1rem;align-items:center;flex-wrap:wrap';
    const text = document.createElement('span');
    text.textContent = 'Ein älterer Sprach-Entwurf ist vorhanden: ' + (saved.examData?.headline || saved.listeningData?.title || 'ohne Titel') + '. Lade ihn nur hier, wenn er zu diesem Fach gehört.';
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'btn btn-secondary';
    button.style.minHeight = '44px';
    button.textContent = 'Alten Entwurf übernehmen';
    button.addEventListener('click', () => {
      if (CONFIG.storedData && !confirm('Die aktuell geöffnete Aufgabe durch den älteren Entwurf ersetzen?')) return;
      localStorage.setItem(key, raw);
      localStorage.setItem(legacyKey + '_imported', MODULE_CONFIG.storagePrefix);
      notice.remove();
      restoreSession();
    });
    notice.append(text, button);
    document.querySelector('main')?.prepend(notice);
  } catch (error) { /* Ein beschädigter Alteintrag verhindert das Training nicht. */ }
});
