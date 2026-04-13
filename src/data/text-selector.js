import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Gecachte Textdatenbanken (einmalig beim ersten Aufruf geladen)
let deutschTexte = null;
let lateinTexte = null;

function ladeDeutschTexte() {
  if (!deutschTexte) {
    try {
      const raw = readFileSync(join(__dirname, 'texte-deutsch.json'), 'utf-8');
      deutschTexte = JSON.parse(raw).texte;
    } catch (e) {
      console.error('Fehler beim Laden der deutschen Texte:', e.message);
      deutschTexte = [];
    }
  }
  return deutschTexte;
}

function ladeLateinTexte() {
  if (!lateinTexte) {
    try {
      const raw = readFileSync(join(__dirname, 'texte-latein.json'), 'utf-8');
      lateinTexte = JSON.parse(raw).texte;
    } catch (e) {
      console.error('Fehler beim Laden der lateinischen Texte:', e.message);
      lateinTexte = [];
    }
  }
  return lateinTexte;
}

/**
 * Wählt einen zufälligen deutschen Originaltext aus der Datenbank.
 * @param {Object} options
 * @param {string} [options.gattung] - "lyrik", "drama", "epik"
 * @param {string} [options.epoche] - Epochen-Schlüssel (z.B. "moderne", "nachkriegszeit")
 * @param {string} [options.level] - "eA" oder "gA"
 * @param {string[]} [options.exclude_ids] - Bereits gezeigte Text-IDs
 * @returns {Object|null} - Textobjekt oder null (Fallback auf KI-Generierung)
 */
export function selectDeutschText({ gattung, epoche, level, exclude_ids = [] } = {}) {
  const texte = ladeDeutschTexte();
  if (texte.length === 0) return null;

  let pool = [...texte];

  // Nach Gattung filtern
  if (gattung) {
    pool = pool.filter(t => t.gattung === gattung.toLowerCase());
  }

  // Nach Epoche filtern
  if (epoche && epoche !== "random") {
    const epocheNorm = epoche.toLowerCase();
    pool = pool.filter(t => {
      const tEpoche = t.epoche.toLowerCase();
      return tEpoche === epocheNorm || tEpoche.includes(epocheNorm) || epocheNorm.includes(tEpoche);
    });
  }

  // Nach Level filtern
  if (level) {
    const levelNorm = level.toLowerCase();
    pool = pool.filter(t => t.geeignet_fuer.some(l => l.toLowerCase() === levelNorm));
  }

  // Bereits gezeigte Texte ausschließen
  if (exclude_ids.length > 0) {
    const excludeSet = new Set(exclude_ids);
    const filtered = pool.filter(t => !excludeSet.has(t.id));
    // Nur ausschließen wenn noch Texte übrig bleiben, sonst Pool zurücksetzen
    if (filtered.length > 0) {
      pool = filtered;
    }
  }

  if (pool.length === 0) return null;

  // Zufällige Auswahl
  return pool[Math.floor(Math.random() * pool.length)];
}

/**
 * Wählt einen zufälligen lateinischen Originaltext aus der Datenbank.
 * @param {Object} options
 * @param {string} [options.autor_key] - "cicero", "seneca", "vergil", "livius", "lyrik"
 * @param {string} [options.aufgabentyp] - "uebersetzung" oder "interpretation"
 * @param {string} [options.level] - "eA" oder "gA"
 * @param {string} [options.schwerpunkt] - Thematischer Schwerpunkt
 * @param {string[]} [options.exclude_ids] - Bereits gezeigte Text-IDs
 * @returns {Object|null} - Textobjekt oder null (Fallback auf KI-Generierung)
 */
export function selectLateinText({ autor_key, aufgabentyp, level, schwerpunkt, exclude_ids = [] } = {}) {
  const texte = ladeLateinTexte();
  if (texte.length === 0) return null;

  let pool = [...texte];

  // Nach Autor filtern
  if (autor_key) {
    const autorNorm = autor_key.toLowerCase();
    pool = pool.filter(t => t.autor_key === autorNorm);
  }

  // Nach Aufgabentyp filtern
  if (aufgabentyp) {
    pool = pool.filter(t => t.aufgabentyp_geeignet.includes(aufgabentyp.toLowerCase()));
  }

  // Nach Level filtern
  if (level) {
    const levelNorm = level.toLowerCase();
    pool = pool.filter(t => t.geeignet_fuer.some(l => l.toLowerCase() === levelNorm));
  }

  // Bereits gezeigte Texte ausschließen
  if (exclude_ids.length > 0) {
    const excludeSet = new Set(exclude_ids);
    const filtered = pool.filter(t => !excludeSet.has(t.id));
    if (filtered.length > 0) {
      pool = filtered;
    }
  }

  if (pool.length === 0) return null;

  return pool[Math.floor(Math.random() * pool.length)];
}
