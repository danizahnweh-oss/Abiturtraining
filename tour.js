/* Geführte Touren wurden entfernt. Kompatibilität für ältere, gecachte Seiten. */
(function () {
  "use strict";
  function removeTourOverlays() {
    document.querySelectorAll(".tour-overlay,.tour-backdrop,.tour-spotlight,.tour-tooltip,.tour-welcome")
      .forEach(function (element) { element.remove(); });
  }
  window.startTour = removeTourOverlays;
  window.resetTour = removeTourOverlays;
  window.isTourDone = function () { return true; };
  removeTourOverlays();
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", removeTourOverlays, { once: true });
  }
})();
