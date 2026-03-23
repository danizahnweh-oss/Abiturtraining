/* ================= WOLFRAM EXTRACT ================= */
/* Extrahiert mathematische Ausdrücke aus Schülerarbeiten und konvertiert sie in WolframAlpha-Syntax */

import { callOpenAI } from './openai.js';
import { WOLFRAM_MAX_QUERIES_PER_GRADE } from './config.js';

/**
 * Extrahiert mathematische Ausdrücke aus der Schülerarbeit via kurzem GPT-Call.
 * Gibt ein Array von Objekten zurück: [{teilaufgabe, query, schueler_ergebnis}]
 */
export async function extractMathExpressions(aufgabenInfo, studentSolution, images, env) {
  const systemPrompt = `Du bist ein mathematischer Parser. Deine EINZIGE Aufgabe: Extrahiere alle konkreten Berechnungen und Ergebnisse aus einer Schülerarbeit und konvertiere sie in WolframAlpha-Syntax.

REGELN:
- Extrahiere NUR Ausdrücke, die WolframAlpha berechnen kann (Ableitungen, Integrale, Gleichungen, Wahrscheinlichkeiten, Vektoroperationen, chemische Gleichungen, physikalische Formeln)
- Übersetze LaTeX und Plain-Text-Mathe in englische WolframAlpha-Syntax
- Dezimalkomma (3,6) → Dezimalpunkt (3.6)
- \\frac{a}{b} → a/b
- \\int_a^b f(x) dx → integrate f(x) dx from a to b
- f'(x) → derivative of f(x)
- \\vec{a} \\cdot \\vec{b} → dot product {ax,ay,az} and {bx,by,bz}
- \\sqrt{x} → sqrt(x)
- P(X=k) bei Binomialverteilung → binomial probability p=... n=... k=...
- Chemische Gleichungen → balance ...
- Maximal ${WOLFRAM_MAX_QUERIES_PER_GRADE} Queries (die wichtigsten Berechnungen)

Antworte NUR mit validem JSON-Array:
[{"teilaufgabe": "a)", "query": "derivative of 3x^2 + 2x", "schueler_ergebnis": "6x + 2"}]

Wenn keine berechenbaren Ausdrücke vorhanden sind, antworte mit: []`;

  const userContent = `AUFGABENSTELLUNG:\n${aufgabenInfo}\n\nSCHÜLERLÖSUNG:\n${studentSolution}`;

  const messages = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userContent }
  ];

  try {
    // Kurzer, günstiger Call — max 800 Tokens reichen für die Extraktion
    const result = await callOpenAI(env, messages, 800, {
      temperature: 0.1,
      model: 'gpt-4.1-mini'
    });

    const parsed = JSON.parse(result);
    if (!Array.isArray(parsed)) return [];

    // Validierung: Nur Einträge mit gültigem Query
    return parsed
      .filter(entry => entry.query && entry.query.trim().length > 2)
      .slice(0, WOLFRAM_MAX_QUERIES_PER_GRADE);
  } catch (err) {
    console.warn('[WolframExtract] Fehler bei Mathe-Extraktion:', err.message);
    return [];
  }
}
