import { wrNotenpunkte } from './wr-points.js';

// Nur tatsächlich eingereichte Aufgaben zählen, niemals ungewählte Alternativen.
export function sumGymnasiumBE(tasks) {
  if (!Array.isArray(tasks) || !tasks.length) return null;
  let sum = 0;
  for (const task of tasks) {
    const points = task.teilaufgaben?.length ? sumGymnasiumBE(task.teilaufgaben) : task.be;
    if (!Number.isFinite(points) || points < 0) return null;
    sum += points;
  }
  return sum > 0 ? sum : null;
}

export function gymnasiumMaximum(endpoint, data) {
  if (!/^grade-(?:abitur-)?(?:mathe|bio|biologie|chemie|physik|astrophysik|informatik|sport)$/.test(endpoint)) return null;
  if (endpoint === 'grade-abitur-mathe') return sumGymnasiumBE([...(data.teil_a_pflicht || []), ...(data.teil_a_wahl || []), ...(data.teil_b || [])]);
  return sumGymnasiumBE(data.teilaufgaben || data.aufgaben);
}

export function validateGymnasiumGrade(endpoint, input, result) {
  const maximum = gymnasiumMaximum(endpoint, input);
  const isBE = /^grade-(?:abitur-)?(?:mathe|bio|biologie|chemie|physik|astrophysik|informatik|sport)$/.test(endpoint);
  if (isBE) {
    const max = maximum ?? result.max_be ?? result.scores?.be_max;
    const parts = result.teilbewertungen || result.aufgaben_be;
    let achieved = result.gesamt_be ?? result.scores?.be_erreicht;
    if (Array.isArray(parts) && parts.length) {
      const partMax = parts.reduce((sum, part) => sum + (part.max_be ?? NaN), 0);
      if (parts.some(part => !Number.isFinite(part.erreichte_be) || !Number.isFinite(part.max_be) || part.erreichte_be < 0 || part.erreichte_be > part.max_be) || partMax !== max) {
        throw new Error('Die Teilbewertungen sind nicht mit den Aufgabenpunkten vereinbar. Bitte die Korrektur erneut starten.');
      }
      achieved = parts.reduce((sum, part) => sum + part.erreichte_be, 0);
    } else if (endpoint === 'grade-abitur-mathe' && Number.isFinite(result.teil_a_be) && Number.isFinite(result.teil_b_be)) {
      achieved = result.teil_a_be + result.teil_b_be;
    }
    const points = wrNotenpunkte(achieved, max);
    if (points === null) throw new Error('Die Bewertung enthält keine gültige Punktesumme. Bitte die Korrektur erneut starten.');
    result.gesamt_be = achieved;
    result.max_be = max;
    result.note = points;
    if (result.scores) Object.assign(result.scores, { be_erreicht: achieved, be_max: max, notenpunkte: points, total: points });
  } else if (result.scores && !endpoint.includes('wr')) {
    if (endpoint === 'grade-latein' && input.aufgabentyp === 'uebersetzung') {
      const maximum = (input.level || 'eA').toLowerCase() === 'ea' ? 60 : 45;
      result.scores.total = wrNotenpunkte(result.scores.uebersetzung, maximum);
    }
    for (const [key, value] of Object.entries(result.scores)) {
      if (key === 'uebersetzung' && endpoint === 'grade-latein') continue;
      if (value != null && (!Number.isFinite(value) || value < 0 || value > 15)) throw new Error('Die Bewertung enthält ungültige Notenpunkte. Bitte die Korrektur erneut starten.');
    }
    if (result.scores.total == null) throw new Error('Die Teilbewertungen sind unvollständig. Bitte die Korrektur erneut starten.');
  }
  return result;
}
