/* ====== tour.js — Wiederverwendbare Onboarding-Tour-Engine ====== */
(function () {
  "use strict";

  var _tourIndex = 0;
  var _tourSteps = [];
  var _storageKey = "";
  var _onComplete = null;
  var _activeSteps = []; // Gefilterte Schritte (nach condition)

  /**
   * Startet eine Tour.
   * @param {Object} config
   * @param {Array} config.steps - Tour-Schritte
   * @param {string} config.storageKey - localStorage-Key
   * @param {boolean} [config.force] - Tour auch starten wenn bereits abgeschlossen
   * @param {Function} [config.onComplete] - Callback nach Abschluss
   */
  function startTour(config) {
    if (!config || !config.steps || !config.storageKey) return;
    if (!config.force && localStorage.getItem(config.storageKey)) return;

    _storageKey = config.storageKey;
    _onComplete = config.onComplete || null;
    _tourSteps = config.steps;

    // Schritte filtern: nur solche deren condition() true ergibt
    _activeSteps = [];
    for (var i = 0; i < _tourSteps.length; i++) {
      var step = _tourSteps[i];
      if (typeof step.condition === "function") {
        if (!step.condition()) continue;
      }
      _activeSteps.push(step);
    }

    if (_activeSteps.length === 0) return;

    _tourIndex = 0;
    _showStep();
  }

  /**
   * Setzt eine Tour zurück (löscht localStorage-Key).
   */
  function resetTour(storageKey) {
    if (storageKey) localStorage.removeItem(storageKey);
  }

  /**
   * Prüft ob eine Tour bereits abgeschlossen wurde.
   */
  function isTourDone(storageKey) {
    return !!localStorage.getItem(storageKey);
  }

  // Alle Tour-Elemente entfernen
  function _cleanup() {
    var els = document.querySelectorAll(
      ".tour-overlay,.tour-backdrop,.tour-spotlight,.tour-tooltip,.tour-welcome"
    );
    for (var i = 0; i < els.length; i++) els[i].remove();
  }

  // Fortschritts-HTML erzeugen (Dots + Zähler)
  function _buildProgress() {
    var total = _activeSteps.length;
    var html = '<div class="tour-progress">';
    html += '<span class="tour-step-counter">' + (_tourIndex + 1) + "/" + total + "</span>";
    html += '<div class="tour-dots">';
    for (var i = 0; i < total; i++) {
      html += '<span class="tour-dot' + (i === _tourIndex ? " active" : "") + '"></span>';
    }
    html += "</div></div>";
    return html;
  }

  // Aktuellen Schritt anzeigen
  function _showStep() {
    _cleanup();

    if (_tourIndex >= _activeSteps.length) {
      localStorage.setItem(_storageKey, "1");
      if (typeof _onComplete === "function") _onComplete();
      return;
    }

    var step = _activeSteps[_tourIndex];
    var progressHtml = _buildProgress();

    // Welcome-Schritt (Vollbild-Modal)
    if (step.type === "welcome") {
      _showWelcome(step, progressHtml);
      return;
    }

    // Normaler Schritt mit Spotlight
    var target = document.querySelector(step.target);
    if (!target || target.offsetParent === null) {
      _tourIndex++;
      _showStep();
      return;
    }

    // Zum Ziel scrollen
    if (step.scrollTo) {
      target.scrollIntoView({ behavior: "smooth", block: "center" });
      setTimeout(function () {
        _showSpotlight(step, target, progressHtml);
      }, 400);
    } else {
      _showSpotlight(step, target, progressHtml);
    }
  }

  // Welcome-Modal anzeigen
  function _showWelcome(step, progressHtml) {
    var backdrop = document.createElement("div");
    backdrop.className = "tour-backdrop";
    document.body.appendChild(backdrop);

    var welcome = document.createElement("div");
    welcome.className = "tour-welcome";
    welcome.innerHTML =
      '<div class="tour-welcome-box">' +
      progressHtml +
      "<h2>" + DOMPurify.sanitize(step.title) + "</h2>" +
      "<p>" + DOMPurify.sanitize(step.text) + "</p>" +
      '<div class="tour-actions">' +
      '<button class="tour-skip" data-tour-action="end">Tour überspringen</button>' +
      '<button class="btn" data-tour-action="next">Los geht\'s</button>' +
      "</div></div>";
    document.body.appendChild(welcome);

    _bindActions(welcome);
  }

  // Spotlight + Tooltip anzeigen
  function _showSpotlight(step, target, progressHtml) {
    var rect = target.getBoundingClientRect();
    var pad = 8;

    // Backdrop
    var backdrop = document.createElement("div");
    backdrop.className = "tour-backdrop";
    backdrop.setAttribute("data-tour-action", "end");
    document.body.appendChild(backdrop);

    // Spotlight
    var spotlight = document.createElement("div");
    spotlight.className = "tour-spotlight";
    spotlight.style.top = (rect.top + window.scrollY - pad) + "px";
    spotlight.style.left = (rect.left - pad) + "px";
    spotlight.style.width = (rect.width + pad * 2) + "px";
    spotlight.style.height = (rect.height + pad * 2) + "px";
    document.body.appendChild(spotlight);

    // Tooltip
    var isLast = _tourIndex === _activeSteps.length - 1;
    var tooltip = document.createElement("div");
    tooltip.className = "tour-tooltip";
    tooltip.innerHTML =
      progressHtml +
      "<h3>" + DOMPurify.sanitize(step.title) + "</h3>" +
      "<p>" + DOMPurify.sanitize(step.text) + "</p>" +
      '<div class="tour-actions">' +
      '<button class="tour-skip" data-tour-action="end">Überspringen</button>' +
      '<button class="btn btn-small" data-tour-action="next">' +
      (isLast ? "Fertig" : "Weiter") +
      "</button></div>";
    document.body.appendChild(tooltip);

    // Tooltip positionieren
    _positionTooltip(tooltip, rect, step.pos || "bottom", pad);

    _bindActions(tooltip);
    _bindActions(backdrop);
  }

  // Tooltip-Positionierung mit Auto-Reposition
  function _positionTooltip(tooltip, rect, pos, pad) {
    var tRect = tooltip.getBoundingClientRect();
    var vw = window.innerWidth;
    var vh = window.innerHeight;
    var top, left;

    if (pos === "bottom") {
      top = rect.bottom + window.scrollY + pad + 8;
      left = rect.left + rect.width / 2 - tRect.width / 2;
      // Wenn unten kein Platz, nach oben spiegeln
      if (rect.bottom + tRect.height + pad + 16 > vh) {
        top = rect.top + window.scrollY - tRect.height - pad - 8;
      }
    } else if (pos === "top") {
      top = rect.top + window.scrollY - tRect.height - pad - 8;
      left = rect.left + rect.width / 2 - tRect.width / 2;
      // Wenn oben kein Platz, nach unten spiegeln
      if (rect.top - tRect.height - pad - 16 < 0) {
        top = rect.bottom + window.scrollY + pad + 8;
      }
    } else if (pos === "left") {
      top = rect.top + window.scrollY + rect.height / 2 - tRect.height / 2;
      left = rect.left - tRect.width - pad - 8;
      // Wenn links kein Platz, nach rechts spiegeln
      if (left < 8) {
        left = rect.right + pad + 8;
      }
    } else if (pos === "right") {
      top = rect.top + window.scrollY + rect.height / 2 - tRect.height / 2;
      left = rect.right + pad + 8;
      // Wenn rechts kein Platz, nach links spiegeln
      if (rect.right + tRect.width + pad + 16 > vw) {
        left = rect.left - tRect.width - pad - 8;
      }
    }

    // Tooltip im Viewport halten (links/rechts)
    left = Math.max(8, Math.min(left, vw - tRect.width - 8));

    tooltip.style.top = top + "px";
    tooltip.style.left = left + "px";
  }

  // Event-Listener für Tour-Buttons binden
  function _bindActions(container) {
    var btns = container.querySelectorAll("[data-tour-action]");
    for (var i = 0; i < btns.length; i++) {
      btns[i].addEventListener("click", _handleAction);
    }
  }

  function _handleAction(e) {
    var action = e.currentTarget.getAttribute("data-tour-action");
    if (action === "next") {
      _tourIndex++;
      _showStep();
    } else if (action === "end") {
      _cleanup();
      localStorage.setItem(_storageKey, "1");
    }
  }

  // Tastatur: Escape zum Beenden, Pfeiltaste rechts/Enter für Weiter
  document.addEventListener("keydown", function (e) {
    // Nur reagieren wenn Tour aktiv ist
    if (!document.querySelector(".tour-tooltip,.tour-welcome")) return;

    if (e.key === "Escape") {
      _cleanup();
      localStorage.setItem(_storageKey, "1");
    } else if (e.key === "ArrowRight" || e.key === "Enter") {
      e.preventDefault();
      _tourIndex++;
      _showStep();
    } else if (e.key === "ArrowLeft" && _tourIndex > 0) {
      e.preventDefault();
      _tourIndex--;
      _showStep();
    }
  });

  // Globale API
  window.startTour = startTour;
  window.resetTour = resetTour;
  window.isTourDone = isTourDone;
})();
