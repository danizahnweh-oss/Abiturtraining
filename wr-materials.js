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
    loadEducationalImage(m.inhalt, sourceId, m.bild_labels || null, type === "bild" ? "diagram" : type);
  });
}

