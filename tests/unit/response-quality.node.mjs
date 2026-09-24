import test from 'node:test';
import assert from 'node:assert/strict';
import { pruefeKorrekturqualitaet } from '../../src/response-quality.js';
import { callOpenAI } from '../../src/openai.js';

test('konsistente Teilbewertungen bestehen die Qualitaetskontrolle', () => {
  const output = JSON.stringify({
    teilbewertungen: [
      { id: 'a)', erreichte_be: 3, max_be: 4, bewertung: 'Der Fachbegriff wird korrekt verwendet.' },
      { id: 'b)', erreichte_be: 4, max_be: 6, bewertung: 'Die Begruendung ist teilweise nachvollziehbar.' }
    ],
    gesamt_be: 7,
    max_be: 10,
    note: 10
  });
  assert.equal(pruefeKorrekturqualitaet(output), null);
});

test('unmoegliche Punkte und falsche Summen werden erkannt', () => {
  const output = JSON.stringify({
    teilbewertungen: [
      { id: 'a)', erreichte_be: 5, max_be: 4, bewertung: 'Zu viele Punkte.' },
      { id: 'b)', erreichte_be: 2, max_be: 6, bewertung: 'Teilweise korrekt.' }
    ],
    gesamt_be: 9,
    max_be: 12,
    note: 17
  });
  const problem = pruefeKorrekturqualitaet(output);
  assert.ok(problem);
  assert.match(problem.problems.join(' '), /unmoegliche Punkte/);
  assert.match(problem.problems.join(' '), /Gesamtpunktzahl/);
  assert.match(problem.problems.join(' '), /Maximalpunktzahl/);
  assert.match(problem.problems.join(' '), /ausserhalb 0 bis 15/);
});

test('inkonsistente KI-Korrektur wird automatisch neu erzeugt', async () => {
  const originalFetch = globalThis.fetch;
  const outputs = [
    JSON.stringify({
      teilbewertungen: [{ id: 'a)', erreichte_be: 8, max_be: 5, bewertung: 'Fehlerhaft.' }],
      gesamt_be: 8,
      max_be: 5,
      note: 12
    }),
    JSON.stringify({
      teilbewertungen: [{ id: 'a)', erreichte_be: 4, max_be: 5, bewertung: 'Die Antwort ist weitgehend korrekt begruendet.' }],
      gesamt_be: 4,
      max_be: 5,
      note: 11
    })
  ];
  const requests = [];
  globalThis.fetch = async (_url, options) => {
    requests.push(JSON.parse(options.body));
    return {
      ok: true,
      json: async () => ({ choices: [{ message: { content: outputs.shift() }, finish_reason: 'stop' }] })
    };
  };

  try {
    const result = await callOpenAI(
      { OPENAI_API_KEY: 'test' },
      [
        { role: 'system', content: 'Bewerte die Antwort und antworte als JSON.' },
        { role: 'user', content: 'Schuelerantwort' }
      ],
      1000
    );
    assert.equal(requests.length, 2);
    assert.match(requests[1].messages.at(-1).content, /nicht konsistent/);
    assert.equal(pruefeKorrekturqualitaet(result), null);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
