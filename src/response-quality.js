/* Zentrale Plausibilitaetskontrolle fuer KI-Korrekturen. */

function parseJson(text) {
  if (typeof text !== 'string') return null;
  try { return JSON.parse(text); } catch {
    const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start < 0 || end <= start) return null;
    try { return JSON.parse(cleaned.slice(start, end + 1)); } catch { return null; }
  }
}

function asNumber(value) {
  const number = typeof value === 'string' ? Number(value.replace(',', '.')) : Number(value);
  return Number.isFinite(number) ? number : null;
}

export function pruefeKorrekturqualitaet(outputText) {
  const parsed = parseJson(outputText);
  if (!parsed) return null;

  const rows = Array.isArray(parsed.teilbewertungen)
    ? parsed.teilbewertungen
    : Array.isArray(parsed.aufgaben_be)
      ? parsed.aufgaben_be
      : null;
  if (!rows || !rows.length) return null;

  const problems = [];
  const blockingProblems = [];
  let reachedSum = 0;
  let maxSum = 0;
  let completeScores = true;

  rows.forEach((row, index) => {
    const reached = asNumber(row?.erreichte_be);
    const maximum = asNumber(row?.max_be);
    if (reached === null || maximum === null) {
      completeScores = false;
      const problem = `Bewertung ${index + 1} ohne gueltige Punkte`;
      problems.push(problem);
      blockingProblems.push(problem);
      return;
    }
    if (maximum <= 0 || reached < 0 || reached > maximum) {
      const problem = `Bewertung ${index + 1} hat unmoegliche Punkte ${reached}/${maximum}`;
      problems.push(problem);
      blockingProblems.push(problem);
    }
    reachedSum += reached;
    maxSum += maximum;
    if (typeof row.bewertung !== 'string' || row.bewertung.trim().length < 8) {
      problems.push(`Bewertung ${index + 1} ist nicht nachvollziehbar begruendet`);
    }
  });

  const totalReached = asNumber(parsed.gesamt_be);
  const totalMax = asNumber(parsed.max_be);
  const grade = asNumber(parsed.note ?? parsed.notenpunkte);
  if (completeScores && totalReached !== null && Math.abs(totalReached - reachedSum) > 0.01) {
    problems.push(`Gesamtpunktzahl ${totalReached} passt nicht zur Summe ${reachedSum}`);
  }
  if (completeScores && totalMax !== null && Math.abs(totalMax - maxSum) > 0.01) {
    problems.push(`Maximalpunktzahl ${totalMax} passt nicht zur Summe ${maxSum}`);
  }
  if (grade !== null && (grade < 0 || grade > 15)) problems.push(`Notenpunkte ${grade} liegen ausserhalb 0 bis 15`);

  return problems.length ? { problems, blockingProblems, blocking: blockingProblems.length > 0, reachedSum, maxSum } : null;
}

export const KORREKTUR_QUALITAETSHINWEIS = `\n\nVERBINDLICHE KORREKTURKONTROLLE VOR DER AUSGABE:
- Vergib Punkte ausschliesslich fuer Leistungen, die in der Schuelerantwort oder auf den Bildern tatsaechlich erkennbar sind. Erfinde keine impliziten Aussagen.
- Begruende jede Teilbewertung knapp anhand einer konkreten Leistung oder eines konkreten Fehlers.
- Zaehle am Ende alle erreichten und maximalen BE unabhaengig nach. Die Summen im JSON muessen exakt mit den Teilbewertungen uebereinstimmen.
- Ziehe denselben Fehler nicht mehrfach ab. Bei unleserlichen oder fehlenden Stellen benenne die Unsicherheit, statt Inhalte zu erfinden.`;
