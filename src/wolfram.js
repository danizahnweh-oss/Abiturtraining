/* ================= WOLFRAM ALPHA API CLIENT ================= */
/* Kapselt die Kommunikation mit der WolframAlpha Full Results API */

import { WOLFRAM_TIMEOUT, WOLFRAM_MAX_QUERIES_PER_GRADE } from './config.js';

/**
 * Sendet eine Anfrage an die WolframAlpha Full Results API.
 * Gibt die relevanten Pods (Result, Step-by-step, Input) zurück oder null bei Fehler.
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
      appid: env.WOLFRAM_APP_ID,
      output: 'JSON',
      format: 'plaintext'
    });

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), WOLFRAM_TIMEOUT);

    const response = await fetch(
      `https://api.wolframalpha.com/v2/query?${params.toString()}`,
      { signal: controller.signal }
    );
    clearTimeout(timeout);

    if (!response.ok) {
      console.warn(`[WolframAlpha] HTTP ${response.status} für Query: ${query.substring(0, 80)}`);
      return null;
    }

    const data = await response.json();
    return parseWolframResult(data);
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
 * Parst die WolframAlpha JSON-Antwort und extrahiert relevante Pods.
 */
function parseWolframResult(data) {
  const queryResult = data?.queryresult;
  if (!queryResult || !queryResult.success || !queryResult.pods) return null;

  const result = {
    input: null,
    result: null,
    stepByStep: null,
    allPods: []
  };

  for (const pod of queryResult.pods) {
    const plaintext = pod.subpods?.[0]?.plaintext || '';

    // Alle Pods sammeln (für Kontext)
    if (plaintext) {
      result.allPods.push({ title: pod.title, text: plaintext });
    }

    // Relevante Pods extrahieren
    const titleLower = pod.title.toLowerCase();
    if (titleLower.includes('input')) {
      result.input = plaintext;
    } else if (titleLower === 'result' || titleLower === 'results' || titleLower.includes('solution')) {
      result.result = plaintext;
    } else if (titleLower.includes('step-by-step') || titleLower.includes('step by step')) {
      result.stepByStep = plaintext;
    }

    // Zusätzlich: Alle Subpods bei Result/Solution sammeln
    if ((titleLower === 'result' || titleLower.includes('solution')) && pod.subpods?.length > 1) {
      result.result = pod.subpods.map(sp => sp.plaintext).filter(Boolean).join('\n');
    }
  }

  // Wenn kein expliziter "Result"-Pod, nehme den ersten nicht-Input Pod
  if (!result.result && result.allPods.length > 0) {
    const nonInput = result.allPods.find(p => !p.title.toLowerCase().includes('input'));
    if (nonInput) result.result = nonInput.text;
  }

  return result.result ? result : null;
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
  // Maximal WOLFRAM_MAX_QUERIES_PER_GRADE Queries
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
 * Formatiert WolframAlpha-Ergebnisse als lesbaren Text für den Gemini/GPT-Prompt.
 */
export function formatWolframForPrompt(wolframResults) {
  if (!wolframResults || wolframResults.length === 0) return '';

  const lines = ['EXAKTE LÖSUNG (mathematisch verifiziert via WolframAlpha):'];

  for (const r of wolframResults) {
    if (!r.wolframResult) continue;

    let line = `Teilaufgabe ${r.teilaufgabe}: `;
    line += `Korrektes Ergebnis: ${r.wolframResult.result}`;

    if (r.wolframResult.stepByStep) {
      line += ` | Lösungsweg: ${r.wolframResult.stepByStep}`;
    }

    if (r.schuelerErgebnis) {
      line += ` (Schüler schrieb: ${r.schuelerErgebnis})`;
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
