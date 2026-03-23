/* ================= WOLFRAM ALPHA LLM API CLIENT ================= */
/* Kapselt die Kommunikation mit der WolframAlpha LLM API */

import { WOLFRAM_TIMEOUT, WOLFRAM_MAX_QUERIES_PER_GRADE } from './config.js';

/**
 * Sendet eine Anfrage an die WolframAlpha LLM API.
 * Die LLM API gibt direkt einen LLM-optimierten Text zurück — kein JSON/XML-Parsing nötig.
 */
export async function queryWolframAlpha(query, env) {
  if (!env.WOLFRAM_APP_ID) {
    console.warn('[WolframAlpha] WOLFRAM_APP_ID nicht konfiguriert — überspringe Verifikation');
    return null;
  }

  if (!query || query.trim().length === 0) return null;

  try {
    const params = new URLSearchParams({
      input: query,
      appid: env.WOLFRAM_APP_ID
    });

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), WOLFRAM_TIMEOUT);

    const response = await fetch(
      `https://www.wolframalpha.com/api/v1/llm-api?${params.toString()}`,
      { signal: controller.signal }
    );
    clearTimeout(timeout);

    if (!response.ok) {
      console.warn(`[WolframAlpha] HTTP ${response.status} für Query: ${query.substring(0, 80)}`);
      return null;
    }

    // LLM API gibt direkt Text zurück — kein Parsing nötig
    const text = await response.text();

    if (!text || text.trim().length === 0) return null;

    return { result: text.trim() };
  } catch (err) {
    if (err.name === 'AbortError') {
      console.warn(`[WolframAlpha] Timeout (${WOLFRAM_TIMEOUT}ms) für Query: ${query.substring(0, 80)}`);
    } else {
      console.warn(`[WolframAlpha] Fehler: ${err.message}`);
    }
    return null;
  }
}

/**
 * Regelbasierte Entscheidung: Soll WolframAlpha für diese Aufgabe verwendet werden?
 */
export function shouldUseWolfram(sachgebiet, aufgabentyp) {
  if (!sachgebiet) return false;

  const sg = sachgebiet.toLowerCase();

  // Mathe: Fast immer ja
  if (['analysis', 'stochastik', 'geometrie'].includes(sg)) return true;

  // Physik: Ja bei Berechnungen
  if (['mechanik', 'elektrizität', 'optik', 'wellen', 'quantenphysik', 'thermodynamik',
       'physik', 'elektrodynamik', 'atomphysik', 'kernphysik'].includes(sg)) return true;

  // Chemie: Ja bei Stöchiometrie, pH, Gleichgewichten
  if (['stöchiometrie', 'gleichgewicht', 'säure-base', 'redox', 'elektrochemie',
       'chemie', 'organische_chemie', 'anorganische_chemie'].includes(sg)) return true;

  // Aufgabentyp-basiert
  if (aufgabentyp) {
    const typ = aufgabentyp.toLowerCase();
    if (typ.includes('berechn') || typ.includes('bestimm') || typ.includes('löse')) return true;
  }

  return false;
}

/**
 * Führt mehrere WolframAlpha-Queries parallel aus (mit Limit).
 */
export async function queryWolframBatch(queries, env) {
  const limited = queries.slice(0, WOLFRAM_MAX_QUERIES_PER_GRADE);

  const results = await Promise.allSettled(
    limited.map(q => queryWolframAlpha(q.query, env))
  );

  return limited.map((q, i) => ({
    teilaufgabe: q.teilaufgabe,
    query: q.query,
    schuelerErgebnis: q.schueler_ergebnis || null,
    wolframResult: results[i].status === 'fulfilled' ? results[i].value : null
  }));
}

/**
 * Formatiert WolframAlpha-Ergebnisse als lesbaren Text für den GPT-Prompt.
 */
export function formatWolframForPrompt(wolframResults) {
  if (!wolframResults || wolframResults.length === 0) return '';

  const lines = ['EXAKTE LÖSUNG (mathematisch verifiziert via WolframAlpha):'];

  for (const r of wolframResults) {
    if (!r.wolframResult) continue;

    let line = `\n--- Teilaufgabe ${r.teilaufgabe} ---\n`;
    line += r.wolframResult.result;

    if (r.schuelerErgebnis) {
      line += `\n(Schüler schrieb: ${r.schuelerErgebnis})`;
    }

    lines.push(line);
  }

  // Nur zurückgeben wenn mindestens ein Ergebnis vorhanden
  if (lines.length <= 1) return '';

  lines.push('');
  lines.push('WICHTIG: Nutze diese verifizierten Ergebnisse als Referenz für die Bewertung.');
  lines.push('Wende die bayerische Folgefehler-Regel an: Wenn der Ansatz korrekt war, aber ein Rechenfehler vorliegt, vergib Teilpunkte für den korrekten Lösungsweg.');

  return '\n\n' + lines.join('\n');
}
