/* ================= KI-Tutor Widget ================= */

/**
 * Initialisiert das KI-Tutor Widget.
 * Wird automatisch beim Laden aufgerufen, prüft aber auf gültige Session.
 */
function initAiTutor() {
  if (document.getElementById("ai-tutor-widget")) return;

  // 1. Session Check (optional hier, aber gut für Sicherheit)
  // Wir zeigen das Widget erst an, wenn ein Name da ist.
  const name = sessionStorage.getItem("student_name");

  // 2. Inject Styles
  const style = document.createElement("style");
  style.textContent = `
    /* AI Widget Styles */
    #ai-tutor-widget {
      position: fixed;
      bottom: 3rem;
      right: 5rem;
      z-index: 10000;
      font-family: var(--font-body, system-ui, sans-serif);
      display: none;
    }
    #ai-tutor-btn {
      width: 70px;
      height: 70px;
      border-radius: 50%;
      background: white url('flowie-icon.png') no-repeat center center;
      background-size: 90%;
      border: 3px solid #fff;
      cursor: pointer;
      box-shadow: 0 8px 25px rgba(0, 0, 0, 0.15);
      transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
      display: flex;
      align-items: center;
      justify-content: center;
      position: relative;
      animation: ai-pulse 2.5s infinite;
    }
    @keyframes ai-pulse {
      0% { transform: scale(1); box-shadow: 0 8px 25px rgba(0, 0, 0, 0.15); }
      50% { transform: scale(1.05); box-shadow: 0 12px 35px rgba(0, 0, 0, 0.2); }
      100% { transform: scale(1); box-shadow: 0 8px 25px rgba(0, 0, 0, 0.15); }
    }
    #ai-tutor-btn:hover { 
      transform: scale(1.1) rotate(2deg);
    }
    #ai-tutor-btn:hover .ai-hover-hint {
      opacity: 1;
      transform: translateX(-10px);
      pointer-events: auto;
    }
    .ai-hover-hint {
      position: absolute;
      right: 75px;
      white-space: nowrap;
      background: rgba(31, 41, 55, 0.9);
      color: white;
      padding: 0.5rem 1rem;
      border-radius: 12px;
      font-size: 0.85rem;
      font-weight: 600;
      opacity: 0;
      pointer-events: none;
      transition: all 0.3s ease;
      transform: translateX(0);
      box-shadow: 0 4px 10px rgba(0,0,0,0.2);
    }
    .ai-hover-hint::after {
      content: '';
      position: absolute;
      right: -6px;
      top: 50%;
      transform: translateY(-50%);
      border-top: 6px solid transparent;
      border-bottom: 6px solid transparent;
      border-left: 6px solid rgba(31, 41, 55, 0.9);
    }
    #ai-chat-window {
      display: none;
      position: absolute;
      bottom: 85px;
      right: 0;
      width: 380px;
      height: 550px;
      background: var(--surface-glass, rgba(255, 255, 255, 0.85));
      backdrop-filter: blur(12px) saturate(180%);
      -webkit-backdrop-filter: blur(12px) saturate(180%);
      border: 1px solid rgba(255, 255, 255, 0.3);
      border-radius: 20px;
      box-shadow: 0 10px 40px rgba(0,0,0,0.15);
      flex-direction: column;
      overflow: hidden;
      animation: slideUp 0.4s cubic-bezier(0.16, 1, 0.3, 1);
    }
    @keyframes slideUp {
      from { opacity: 0; transform: translateY(30px) scale(0.95); }
      to { opacity: 1; transform: translateY(0) scale(1); }
    }
    .ai-chat-header {
      background: linear-gradient(90deg, #3b82f6, #8b5cf6);
      color: white;
      padding: 1.25rem;
      font-weight: 700;
      display: flex;
      justify-content: space-between;
      align-items: center;
      letter-spacing: -0.01em;
    }
    .ai-chat-header button {
      background: rgba(255, 255, 255, 0.2);
      border: none;
      color: white;
      width: 28px;
      height: 28px;
      border-radius: 50%;
      font-size: 1rem;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: background 0.2s;
    }
    .ai-chat-header button:hover { background: rgba(255, 255, 255, 0.3); }
    #ai-chat-messages {
      flex: 1;
      padding: 1.25rem;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 1rem;
      background: transparent;
      color: var(--ink, #1f2937);
      scrollbar-width: thin;
      scrollbar-color: rgba(0,0,0,0.1) transparent;
    }
    .ai-message {
      max-width: 85%;
      padding: 0.9rem 1.1rem;
      border-radius: 16px;
      font-size: 0.95rem;
      line-height: 1.5;
      font-weight: 450;
      box-shadow: 0 2px 5px rgba(0,0,0,0.03);
    }
    .ai-message.ai {
      align-self: flex-start;
      background: white;
      border: 1px solid rgba(0,0,0,0.05);
      border-bottom-left-radius: 4px;
      color: #1f2937;
    }
    .ai-message.user {
      align-self: flex-end;
      background: linear-gradient(135deg, #3b82f6, #2563eb);
      color: white;
      border-bottom-right-radius: 4px;
    }
    .ai-chat-input {
      border-top: 1px solid rgba(0,0,0,0.08);
      padding: 1.1rem;
      display: flex;
      gap: 0.75rem;
      background: rgba(255, 255, 255, 0.5);
    }
    #ai-input {
      flex: 1;
      padding: 0.75rem 1.1rem;
      border: 1px solid rgba(0,0,0,0.1);
      border-radius: 24px;
      outline: none;
      background: white;
      color: #1f2937;
      font-size: 0.95rem;
      transition: border-color 0.2s;
    }
    #ai-input:focus { border-color: #3b82f6; }
    .ai-chat-input button {
      background: linear-gradient(135deg, #3b82f6, #8b5cf6);
      color: white;
      border: none;
      width: 40px;
      height: 40px;
      border-radius: 50%;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: transform 0.2s;
      box-shadow: 0 2px 10px rgba(59, 130, 246, 0.3);
    }
    .ai-chat-input button:hover { transform: scale(1.1); }
    /* Drag styles */
    #ai-tutor-widget.dragging {
      user-select: none;
      -webkit-user-select: none;
    }
    #ai-tutor-widget.dragging #ai-tutor-btn {
      animation: none;
      cursor: grabbing;
    }
    .ai-chat-header {
      cursor: grab;
    }
    .ai-chat-header.dragging {
      cursor: grabbing;
    }
  `;
  document.head.appendChild(style);

  // 3. Build greeting based on current page and login status
  var pageInfo = detectPageInfo();
  var isLoggedIn = !!name;
  var greeting = "Hallo! Ich bin Flowie, deine Abi-Trainerin.";
  if (!isLoggedIn) {
    greeting = "Hey! Ich bin Flowie, deine Abi-Trainerin. \uD83D\uDC4B Melde dich an, damit ich dir bei deinen Aufgaben helfen kann!";
  } else if (pageInfo.isIndex) {
    greeting = "Hey! Ich bin Flowie, deine Abi-Trainerin. Waehle ein Fach aus und ich helfe dir bei den Aufgaben!";
  } else if (pageInfo.isAbitur) {
    greeting = "Hey! Ich bin Flowie, deine " + pageInfo.subject + "-Trainerin. Generiere eine Pruefung und ich helfe dir bei den Aufgaben \u2014 ohne die Loesung zu verraten!";
  } else {
    greeting = "Hey! Ich bin Flowie, deine " + pageInfo.subject + "-Trainerin. Starte eine Aufgabe und ich unterstuetze dich Schritt fuer Schritt!";
  }

  // 4. Inject HTML
  const widget = document.createElement("div");
  widget.id = "ai-tutor-widget";
  widget.innerHTML = `
    <button id="ai-tutor-btn" onclick="toggleAiChat()" aria-label="KI-Tutor öffnen">
      <span class="ai-hover-hint">Frag mich!</span>
    </button>
    <div id="ai-chat-window">
      <div class="ai-chat-header">
        <span>🤖 Flowie</span>
        <button id="ai-close-btn" onclick="toggleAiChat()">×</button>
      </div>
      <div id="ai-chat-messages">
        <div class="ai-message ai">${greeting}</div>
      </div>
      <div class="ai-chat-input">
        <input type="text" id="ai-input" placeholder="Deine Frage zu ${pageInfo.isIndex ? "den Fächern" : pageInfo.subject}..." onkeypress="handleAiEnter(event)">
        <button id="ai-send-btn" onclick="sendAiMessage()">➤</button>
      </div>
    </div>
  `;
  document.body.appendChild(widget);

  // 5. Init drag-and-drop
  initWidgetDrag(widget);

  // 6. Always show widget (even for guests)
  widget.style.display = "block";
}

/* ====== DRAG-AND-DROP ====== */
function initWidgetDrag(widget) {
  var isDragging = false;
  var wasDragged = false;
  var startX, startY, origX, origY;
  var DRAG_THRESHOLD = 5;

  function getHandles() {
    var handles = [];
    var btn = document.getElementById("ai-tutor-btn");
    if (btn) handles.push(btn);
    var header = widget.querySelector(".ai-chat-header");
    if (header) handles.push(header);
    return handles;
  }

  function getWidgetPos() {
    var rect = widget.getBoundingClientRect();
    return { x: rect.left, y: rect.top };
  }

  function switchToAbsolutePos() {
    // Convert from bottom/right positioning to top/left
    if (widget.style.top) return; // already switched
    var pos = getWidgetPos();
    widget.style.bottom = "auto";
    widget.style.right = "auto";
    widget.style.left = pos.x + "px";
    widget.style.top = pos.y + "px";
  }

  function clampPosition() {
    // Use button size for clamping (chat window overflows and repositions itself)
    var btn = document.getElementById("ai-tutor-btn");
    var btnSize = btn ? btn.offsetWidth : 64;
    var maxX = window.innerWidth - btnSize;
    var maxY = window.innerHeight - btnSize;
    var x = Math.max(0, Math.min(parseFloat(widget.style.left) || 0, maxX));
    var y = Math.max(0, Math.min(parseFloat(widget.style.top) || 0, maxY));
    widget.style.left = x + "px";
    widget.style.top = y + "px";
  }

  function onStart(e) {
    // Don't drag from close button, input, or send button
    var target = e.target;
    if (target.id === "ai-close-btn" || target.id === "ai-input" || target.id === "ai-send-btn") return;
    // Only drag from button or header
    var handles = getHandles();
    var fromHandle = handles.some(function (h) { return h === target || h.contains(target); });
    if (!fromHandle) return;

    var clientX = e.touches ? e.touches[0].clientX : e.clientX;
    var clientY = e.touches ? e.touches[0].clientY : e.clientY;

    switchToAbsolutePos();
    startX = clientX;
    startY = clientY;
    origX = parseFloat(widget.style.left) || 0;
    origY = parseFloat(widget.style.top) || 0;
    isDragging = true;
    wasDragged = false;

    widget.classList.add("dragging");
    var header = widget.querySelector(".ai-chat-header");
    if (header) header.classList.add("dragging");

    e.preventDefault();
  }

  function onMove(e) {
    if (!isDragging) return;
    var clientX = e.touches ? e.touches[0].clientX : e.clientX;
    var clientY = e.touches ? e.touches[0].clientY : e.clientY;
    var dx = clientX - startX;
    var dy = clientY - startY;

    if (!wasDragged && Math.abs(dx) < DRAG_THRESHOLD && Math.abs(dy) < DRAG_THRESHOLD) return;
    wasDragged = true;

    widget.style.left = (origX + dx) + "px";
    widget.style.top = (origY + dy) + "px";
  }

  function onEnd() {
    if (!isDragging) return;
    isDragging = false;
    widget.classList.remove("dragging");
    var header = widget.querySelector(".ai-chat-header");
    if (header) header.classList.remove("dragging");

    if (wasDragged) {
      clampPosition();
      // Prevent the click from toggling chat after drag
      widget._justDragged = true;
      setTimeout(function () { widget._justDragged = false; }, 50);
    }
  }

  document.addEventListener("mousedown", onStart);
  document.addEventListener("mousemove", onMove);
  document.addEventListener("mouseup", onEnd);
  document.addEventListener("touchstart", onStart, { passive: false });
  document.addEventListener("touchmove", onMove, { passive: false });
  document.addEventListener("touchend", onEnd);

  // Re-clamp on window resize
  window.addEventListener("resize", function () {
    if (widget.style.top && widget.style.top !== "auto") {
      clampPosition();
    }
  });
}

function toggleAiChat() {
  var widget = document.getElementById("ai-tutor-widget");
  if (widget && widget._justDragged) return;
  var win = document.getElementById("ai-chat-window");
  if (!win) return;
  if (win.style.display === "flex") {
    win.style.display = "none";
  } else {
    // Smart positioning: open upward or downward depending on space
    var rect = widget.getBoundingClientRect();
    var chatHeight = 550;
    var chatWidth = 380;
    var spaceAbove = rect.top;
    var spaceBelow = window.innerHeight - rect.bottom;
    if (spaceAbove >= chatHeight + 20) {
      win.style.bottom = "85px";
      win.style.top = "auto";
    } else if (spaceBelow >= chatHeight + 20) {
      win.style.top = "85px";
      win.style.bottom = "auto";
    } else {
      win.style.bottom = "85px";
      win.style.top = "auto";
    }
    // Horizontal: if not enough space to the left, open to the right
    var spaceRight = window.innerWidth - rect.left;
    if (spaceRight < chatWidth + 20) {
      win.style.right = "auto";
      win.style.left = "0";
    } else {
      win.style.right = "0";
      win.style.left = "auto";
    }
    win.style.display = "flex";
    setTimeout(() => {
      const inp = document.getElementById("ai-input");
      if (inp) inp.focus();
    }, 100);
  }
}

function handleAiEnter(e) {
  if (e.key === "Enter") sendAiMessage();
}

/**
 * Erkennt das aktuelle Fach anhand des Seitentitels oder der URL.
 */
function detectSubject() {
  var title = document.title || "";
  var path = location.pathname || "";
  // Aus Titel extrahieren: "myAbiFlow · Chemie Abiturtraining" → "Chemie"
  var match = title.match(/·\s*(.+?)(?:\s+Abitur|\s*$)/i);
  if (match) return match[1].trim();
  // Fallback: aus Dateiname
  var file = path.split("/").pop().replace(".html", "").replace(/-/g, " ");
  return file || "Unbekannt";
}

/**
 * Erkennt den Seitentyp (Abitur-Prüfung vs. Übung) und den aktuellen Schritt.
 */
function detectPageInfo() {
  var path = location.pathname || "";
  var filename = path.split("/").pop().replace(".html", "");
  var isAbitur = filename.indexOf("-abitur") !== -1;
  var isIndex = filename === "index" || filename === "" || filename === "dashboard";

  // Aktuellen Schritt erkennen über sichtbare Section oder aktiven Nav-Button
  var step = "";
  var activeBtn = document.querySelector("nav button.active");
  if (activeBtn) {
    step = activeBtn.textContent.trim();
  } else {
    // Fallback: sichtbare Section prüfen
    ["sec-setup", "sec-task", "sec-write", "sec-feedback", "sec-progress"].forEach(function (id) {
      var el = document.getElementById(id);
      if (el && el.style.display !== "none" && el.offsetParent !== null) {
        var map = { "sec-setup": "Aufgabe generieren", "sec-task": "Prüfung", "sec-write": "Lösung schreiben", "sec-feedback": "Feedback", "sec-progress": "Fortschritt" };
        step = map[id] || id;
      }
    });
  }

  return {
    subject: detectSubject(),
    isAbitur: isAbitur,
    isIndex: isIndex,
    step: step,
    filename: filename
  };
}

/**
 * Liest den aktuellen Aufgabentext von der Seite — funktioniert für alle Seitentypen.
 * Sendet IMMER mindestens Fach + Seite + Schritt, auch ohne generierte Aufgabe.
 */
function getCurrentTaskContext() {
  var info = detectPageInfo();
  var parts = [];

  parts.push("Fach: " + info.subject);
  parts.push("Seite: " + (info.isAbitur ? "Abiturprüfung" : info.isIndex ? "Startseite" : "Übungsaufgabe"));
  if (info.step) parts.push("Aktueller Schritt: " + info.step);

  // 1. Abitur-Seiten: Aufgabengruppen-Container
  var gruppenContainer = document.getElementById("aufgabengruppenContainer");
  if (gruppenContainer && gruppenContainer.textContent.trim()) {
    var cards = gruppenContainer.querySelectorAll(".aufgabengruppe-card");
    if (cards.length) {
      cards.forEach(function (card, i) {
        var selected = card.classList.contains("selected");
        var heading = card.querySelector("h4, h3, .aufgabengruppe-title");
        var title = heading ? heading.textContent.trim() : "Aufgabengruppe " + (i + 1);
        var text = card.textContent.trim();
        if (text.length > 800) text = text.substring(0, 800) + "...";
        parts.push((selected ? "[AUSGEWÄHLT] " : "") + title + ":\n" + text);
      });
    } else {
      var text = gruppenContainer.textContent.trim();
      if (text.length > 2000) text = text.substring(0, 2000) + "...";
      parts.push("Aufgaben:\n" + text);
    }
  }

  // 2. Übungs-Seiten: taskInstruction
  var taskInstr = document.getElementById("taskInstruction");
  if (taskInstr && taskInstr.textContent.trim()) {
    var text = taskInstr.textContent.trim();
    if (text.length > 2000) text = text.substring(0, 2000) + "...";
    parts.push("Aufgabenstellung:\n" + text);
  }

  // 3. Schülertext (einzelnes Textarea oder mehrere)
  var studentTexts = [];
  var singleTA = document.getElementById("studentText");
  if (singleTA && singleTA.value.trim()) {
    studentTexts.push(singleTA.value.trim());
  }
  ["studentTextA", "studentTextB"].forEach(function (id) {
    var ta = document.getElementById(id);
    if (ta && ta.value.trim()) studentTexts.push(ta.value.trim());
  });
  document.querySelectorAll("#studentTextareas textarea").forEach(function (ta) {
    if (ta.value.trim()) studentTexts.push(ta.value.trim());
  });

  if (studentTexts.length) {
    var combined = studentTexts.join("\n---\n");
    if (combined.length > 2000) combined = combined.substring(0, 2000) + "...";
    parts.push("Bisherige Antwort des Schülers:\n" + combined);
  }

  return parts.join("\n\n");
}

async function sendAiMessage() {
  var input = document.getElementById("ai-input");
  var text = input.value.trim();
  if (!text) return;

  // Check if user is logged in
  if (sessionStorage.getItem("access") !== "1" || !sessionStorage.getItem("student_name")) {
    addAiMessage(text, "user");
    input.value = "";
    addAiMessage("Ich w\u00fcrde dir super gerne helfen! \uD83D\uDC9C Aber du musst dich erst anmelden, damit ich mit dir arbeiten kann. Klick oben rechts auf 'Anmelden' oder w\u00e4hle einfach ein Fach aus.", "ai");
    return;
  }

  // Add user message
  addAiMessage(text, "user");
  input.value = "";

  // Show typing indicator
  var loadingId = addAiMessage("...", "ai");
  var sName = sessionStorage.getItem("student_name") ? sessionStorage.getItem("student_name").split(" ")[0] : "";
  var taskContext = getCurrentTaskContext();

  try {
    console.log("Sending request to AI Tutor...");
    var res = await fetch("https://backend-tutor.sanktannagymnasium.workers.dev/query", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: text, studentName: sName, taskContext: taskContext })
    });

    if (!res.ok) {
      throw new Error(`HTTP Error: ${res.status} ${res.statusText}`);
    }

    var data = await res.json();

    // Remove loading and add AI response
    var loadingEl = document.getElementById(loadingId);
    if (loadingEl) loadingEl.remove();

    addAiMessage(data.answer, "ai");

  } catch (e) {
    console.error("AI Tutor Error:", e);
    var loadingEl = document.getElementById(loadingId);
    if (loadingEl) loadingEl.remove();

    // Show more specific error to user
    let errorMsg = "Entschuldigung, ich habe gerade Verbindungsprobleme. 😓";
    if (e.message.includes("HTTP Error")) {
      errorMsg += ` (${e.message})`;
    } else if (e.message.includes("Failed to fetch")) {
      errorMsg += " (Netzwerkfehler/CORS)";
    }

    addAiMessage(errorMsg, "ai");
  }
}

function addAiMessage(text, sender) {
  var div = document.createElement("div");
  div.className = "ai-message " + sender;
  div.textContent = text;
  var id = "msg-" + Date.now();
  div.id = id;

  var container = document.getElementById("ai-chat-messages");
  if (container) {
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
  }
  return id;
}

// Auto-Init on Load if not already called
// Use DOMContentLoaded to make sure body exists
document.addEventListener("DOMContentLoaded", function () {
  // If we are on a page that needs login (like tasks), we can check session
  // Or if we are on index.html, checkSession might also call it.
  // It is safe to call it multiple times because of the check at the top of initAiTutor.
  initAiTutor();
});

// Fallback for immediate load if deferred
if (document.readyState === "interactive" || document.readyState === "complete") {
  initAiTutor();
}
