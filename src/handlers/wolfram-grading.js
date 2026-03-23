/* ================= WOLFRAM GRADING ================= */
/* Sandwich-Wrapper: Gemini extrahiert → WolframAlpha rechnet → Gemini bewertet */

import { callOpenAI } from '../openai.js';
import { shouldUseWolfram, queryWolframBatch, formatWolframForPrompt } from '../wolfram.js';
import { extractMathExpressions } from '../wolfram-extract.js';

/**
 * Erweiterte Grading-Funktion mit optionaler WolframAlpha-Verifikation.
 *
 * Ersetzt den direkten callOpenAI()-Aufruf in den MINT-Handlern.
 * Bei qualitative Aufgaben oder Fehler fällt sie auf den normalen Flow zurück.
 *
 * @param {string} aufgabenInfo - Aufgabenstellung + Teilaufgaben als Text
 * @param {string} studentSolution - Schülerlösung als Text
 * @param {Array} images - Base64-Bilder der Schülerlösung (oder null)
 * @param {string} sachgebiet - Sachgebiet (analysis, stochastik, mechanik, etc.)
 * @param {Array} messages - Fertige Messages für callOpenAI (system + user)
 * @param {object} env - Umgebungsvariablen
 * @returns {string} - GPT-Antwort (JSON-String wie bei normalem callOpenAI)
 */
export async function gradeWithWolframVerification(aufgabenInfo, studentSolution, images, sachgebiet, messages, env) {
  // Schritt 1: Prüfen ob WolframAlpha nötig ist
  if (!shouldUseWolfram(sachgebiet) || !env.WOLFRAM_APP_ID) {
    // Normaler Grading-Flow (wie bisher)
    return await callOpenAI(env, messages, 8000, { temperature: 0.3 });
  }

  try {
    // Schritt 2: Mathematische Ausdrücke extrahieren
    const expressions = await extractMathExpressions(aufgabenInfo, studentSolution, images, env);

    if (!expressions || expressions.length === 0) {
      // Keine berechenbaren Ausdrücke → normaler Flow
      return await callOpenAI(env, messages, 8000, { temperature: 0.3 });
    }

    // Schritt 3: WolframAlpha-Verifikation (parallel)
    const wolframResults = await queryWolframBatch(expressions, env);

    // Schritt 4: Ergebnisse formatieren
    const wolframContext = formatWolframForPrompt(wolframResults);

    if (!wolframContext) {
      // Alle WolframAlpha-Queries fehlgeschlagen → normaler Flow
      return await callOpenAI(env, messages, 8000, { temperature: 0.3 });
    }

    // Schritt 5: Erweiterten Prompt bauen
    const enhancedMessages = messages.map((msg, i) => {
      if (i === 0 && msg.role === 'system') {
        // WolframAlpha-Kontext an den System-Prompt anhängen
        return { ...msg, content: msg.content + wolframContext };
      }
      return msg;
    });

    // Schritt 6: Grading mit erweitertem Prompt
    console.log(`[WolframGrading] ${wolframResults.filter(r => r.wolframResult).length}/${expressions.length} Queries erfolgreich für Sachgebiet: ${sachgebiet}`);
    return await callOpenAI(env, enhancedMessages, 8000, { temperature: 0.3 });

  } catch (err) {
    // Bei jedem Fehler: Graceful Fallback auf normalen Flow
    console.warn('[WolframGrading] Fehler im Sandwich-Flow, Fallback auf Standard:', err.message);
    return await callOpenAI(env, messages, 8000, { temperature: 0.3 });
  }
}
