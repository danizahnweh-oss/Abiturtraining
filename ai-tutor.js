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
      bottom: 2rem;
      right: 2rem;
      z-index: 10000;
      font-family: var(--font-body, system-ui, sans-serif);
      display: none; /* Hidden by default until login check calls this or we toggle it */
    }
    #ai-tutor-btn {
      width: 60px;
      height: 60px;
      border-radius: 50%;
      background: var(--accent, #3b82f6);
      color: white;
      border: none;
      font-size: 2rem;
      cursor: pointer;
      box-shadow: 0 4px 15px rgba(0,0,0,0.2);
      transition: transform 0.2s;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    #ai-tutor-btn:hover { transform: scale(1.1); }
    #ai-chat-window {
      display: none;
      position: absolute;
      bottom: 80px;
      right: 0;
      width: 350px;
      height: 500px;
      background: var(--surface, #fff);
      border: 1px solid var(--border, #e5e7eb);
      border-radius: 16px;
      box-shadow: 0 5px 30px rgba(0,0,0,0.15);
      flex-direction: column;
      overflow: hidden;
      animation: slideUp 0.3s ease-out;
    }
    @keyframes slideUp {
      from { opacity: 0; transform: translateY(20px); }
      to { opacity: 1; transform: translateY(0); }
    }
    .ai-chat-header {
      background: var(--accent, #3b82f6);
      color: white;
      padding: 1rem;
      font-weight: 700;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .ai-chat-header button {
      background: none;
      border: none;
      color: white;
      font-size: 1.2rem;
      cursor: pointer;
    }
    #ai-chat-messages {
      flex: 1;
      padding: 1rem;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 0.8rem;
      background: var(--bg, #f9fafb);
      color: var(--ink, #1f2937);
    }
    .ai-message {
      max-width: 85%;
      padding: 0.8rem;
      border-radius: 12px;
      font-size: 0.9rem;
      line-height: 1.4;
    }
    .ai-message.ai {
      align-self: flex-start;
      background: var(--surface, #fff);
      border: 1px solid var(--border, #e5e7eb);
      border-bottom-left-radius: 2px;
    }
    .ai-message.user {
      align-self: flex-end;
      background: var(--accent, #3b82f6);
      color: white;
      border-bottom-right-radius: 2px;
    }
    .ai-chat-input {
      border-top: 1px solid var(--border, #e5e7eb);
      padding: 0.8rem;
      display: flex;
      gap: 0.5rem;
      background: var(--surface, #fff);
    }
    #ai-input {
      flex: 1;
      padding: 0.6rem;
      border: 1px solid var(--border, #e5e7eb);
      border-radius: 20px;
      outline: none;
      background: var(--bg, #fff);
      color: var(--ink, #000);
    }
    .ai-chat-input button {
      background: var(--accent, #3b82f6);
      color: white;
      border: none;
      width: 36px;
      height: 36px;
      border-radius: 50%;
      cursor: pointer;
    }
  `;
    document.head.appendChild(style);

    // 3. Inject HTML
    const widget = document.createElement("div");
    widget.id = "ai-tutor-widget";
    widget.innerHTML = `
    <button id="ai-tutor-btn" onclick="toggleAiChat()" aria-label="KI-Tutor öffnen">🤖</button>
    <div id="ai-chat-window">
      <div class="ai-chat-header">
        <span>🤖 Abi-Coach</span>
        <button id="ai-close-btn" onclick="toggleAiChat()">×</button>
      </div>
      <div id="ai-chat-messages">
        <div class="ai-message ai">Hallo! 👋 Ich bin dein persönlicher Abi-Coach. Frag mich etwas zu den Fächern oder Aufgaben!</div>
      </div>
      <div class="ai-chat-input">
        <input type="text" id="ai-input" placeholder="Deine Frage..." onkeypress="handleAiEnter(event)">
        <button id="ai-send-btn" onclick="sendAiMessage()">➤</button>
      </div>
    </div>
  `;
    document.body.appendChild(widget);

    // 4. Initial Visibility Check
    if (name) {
        widget.style.display = "block";
    }
}

function toggleAiChat() {
    var win = document.getElementById("ai-chat-window");
    if (!win) return;
    if (win.style.display === "flex") {
        win.style.display = "none";
    } else {
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

async function sendAiMessage() {
    var input = document.getElementById("ai-input");
    var text = input.value.trim();
    if (!text) return;

    // Add user message
    addAiMessage(text, "user");
    input.value = "";

    // Show typing indicator
    var loadingId = addAiMessage("...", "ai");
    var sName = sessionStorage.getItem("student_name") ? sessionStorage.getItem("student_name").split(" ")[0] : "";

    try {
        var res = await fetch("https://backend-tutor.sanktannagymnasium.workers.dev/query", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ prompt: text, studentName: sName })
        });

        var data = await res.json();

        // Remove loading and add AI response
        var loadingEl = document.getElementById(loadingId);
        if (loadingEl) loadingEl.remove();

        addAiMessage(data.answer, "ai");

    } catch (e) {
        var loadingEl = document.getElementById(loadingId);
        if (loadingEl) loadingEl.remove();
        addAiMessage("Entschuldigung, ich habe gerade Verbindungsprobleme. 😓", "ai");
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
