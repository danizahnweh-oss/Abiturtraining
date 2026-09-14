import test from 'node:test';
import assert from 'node:assert/strict';
import { gymnasiumMaximum, validateGymnasiumGrade } from '../../src/subjects/gymnasium-points.js';
import { executeGradeHandler, setGradeHandlerMap, setFOSRouteHandler, handleGradeSubmit } from '../../src/handlers/grading.js';
import { handleGradeEthik } from '../../src/subjects/ethik.js';
import { handleGradeFrench } from '../../src/subjects/franzoesisch.js';
import { handleGradeLatein } from '../../src/subjects/latein.js';

const tasks = [{ be: 64, teilaufgaben: [{ be: 24 }, { be: 22 }, { be: 18 }] }];
for (const subject of ['mathe', 'bio', 'biologie', 'chemie', 'physik', 'informatik', 'sport']) {
  test(`${subject}: echte Aufgabenpunkte und berechnete Notenpunkte`, () => {
    const endpoint = 'grade-' + subject;
    const input = { teilaufgaben: tasks, gesamt_be: 60 };
    const result = validateGymnasiumGrade(endpoint, input, { gesamt_be: 49, max_be: 60, note: 15, scores: {} });
    assert.equal(gymnasiumMaximum(endpoint, input), 64);
    assert.equal(result.max_be, 64);
    assert.equal(result.note, 11);
  });
}
test('Teilbewertungen bestimmen Summe; widersprüchliche Maxima werden abgewiesen', () => {
  const result = validateGymnasiumGrade('grade-chemie', { teilaufgaben: [{ be: 5 }, { be: 5 }] }, { gesamt_be: 10, max_be: 10, note: 15, teilbewertungen: [{ erreichte_be: 3, max_be: 5 }, { erreichte_be: 2, max_be: 5 }] });
  assert.equal(result.gesamt_be, 5);
  assert.equal(result.note, 6);
  assert.throws(() => validateGymnasiumGrade('grade-chemie', { teilaufgaben: tasks }, { gesamt_be: 49, max_be: 60, teilbewertungen: [{ erreichte_be: 49, max_be: 60 }] }), /Teilbewertungen/);
});
test('Latein-Übersetzung: BE sind keine Notenpunkte', () => {
  const result = validateGymnasiumGrade('grade-latein', { aufgabentyp: 'uebersetzung', level: 'eA' }, { scores: { uebersetzung: 48, total: 15 } });
  assert.equal(result.scores.total, 12);
});
test('Unmögliche oder fehlende Notenpunkte werden abgewiesen', () => {
  assert.throws(() => validateGymnasiumGrade('grade-ethik', {}, { scores: { verstehen: 18, darstellung: 10, total: 16 } }));
  assert.throws(() => validateGymnasiumGrade('grade-ethik', {}, { scores: { verstehen: null, total: null } }));
});

async function mockAI(answer, fn) {
  const original = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(answer) }, finish_reason: 'stop' }] }));
  try { await fn(); } finally { globalThis.fetch = original; }
}
const env = { OPENAI_API_KEY: 'test-only', ALLOWED_ORIGIN: 'https://example.test' };
test('Echte Ethik-Korrektur berechnet 70/30 statt KI-Gesamtwert', async () => {
  setGradeHandlerMap({ 'grade-ethik': handleGradeEthik });
  await mockAI({ verstehen_np: 10, darstellung_np: 5, gesamt_np: 15, feedback: 'Test' }, async () => {
    const result = await executeGradeHandler('grade-ethik', { student_text: 'Probeantwort', rubric_prompt: 'Ethik' }, env);
    assert.equal(result.scores.total, 9);
    const oldRoute = await handleGradeEthik({ json: async () => ({ student_text: 'Probeantwort', rubric_prompt: 'Ethik' }) }, env);
    assert.equal((await oldRoute.json()).scores.total, 15, 'Unveränderte Aufrufer ohne Gymnasium-Flag behalten ihr Verhalten');
  });
});
test('Spanisch-Korrektur und 40/60-Gewichtung', async () => {
  setGradeHandlerMap({ 'grade-spanisch': (request, env) => handleGradeFrench(request, env, 'Spanisch') });
  await mockAI({ inhalt_np: 10, sprache_np: 5, gesamt_np: 15, feedback: 'Test' }, async () => {
    const result = await executeGradeHandler('grade-spanisch', { source_text_de: 'Quelle', task_fr: 'Tarea', student_text_fr: 'Texto de prueba', rubric_prompt: 'Spanisch' }, env);
    assert.equal(result.scores.total, 7);
  });
});
test('FOS-Pfad wird nicht neu gewichtet oder validiert', async () => {
  setFOSRouteHandler(async (path, request, receivedEnv) => {
    assert.equal(receivedEnv.gymnasiumValidatedScores, undefined);
    return new Response(JSON.stringify({ scores: { total: 17 } }));
  });
  assert.equal((await executeGradeHandler('fos-grade-test', {}, env)).scores.total, 17);
});
test('Mathe-Abitur und Hörverstehen werden als gültige Abgaben angenommen', async () => {
  setGradeHandlerMap({ 'grade-abitur-mathe': () => {}, 'grade-listening': () => {} });
  const db = { prepare: () => ({ bind() { return this; }, async run() {} }) };
  for (const input of [{ endpoint: 'grade-abitur-mathe', student_text_a: 'Lösung' }, { endpoint: 'grade-listening', student_answers: { 1: 'A' } }]) {
    const response = await handleGradeSubmit({ json: async () => input }, { ...env, DB: db, GRADING_QUEUE: { send: async () => {} } }, { waitUntil() {} });
    assert.equal(response.status, 202);
  }
});
