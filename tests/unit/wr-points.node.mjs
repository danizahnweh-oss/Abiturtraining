import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleGenerateWR, handleGenerateAbiturWR, handleGradeWR, handleGradeAbiturWR } from '../../src/subjects/wr.js';

const env = { OPENAI_API_KEY: 'test-only', ALLOWED_ORIGIN: 'https://example.test' };
const blocks = (...points) => [{ nr: 1, titel: 'Test', be_gesamt: 999, teilaufgaben: points.map((be, i) => ({ nr: String(i + 1), text: 'Testaufgabe', be })) }];
const request = body => new Request('https://example.test/api/test', { method: 'POST', body: JSON.stringify(body) });
async function withResponses(responses, run) {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(responses[Math.min(calls++, responses.length - 1)]) }, finish_reason: 'stop' }] }));
  try { await run(() => calls); } finally { globalThis.fetch = original; }
}
test('64/60 wird einmal repariert und erst konsistent ausgeliefert', async () => {
  await withResponses([{ aufgabenbloecke: blocks(24,22,18) }, { aufgabenbloecke: blocks(24,20,16) }], async calls => {
    const response = await handleGenerateWR(request({ niveau:'eA', be:60 }), env);
    assert.equal(response.status, 200);
    const data = await response.json();
    assert.equal(data.gesamt_be, 60);
    assert.equal(data.aufgabenbloecke[0].be_gesamt, 60);
    assert.equal(calls(), 2);
  });
});
test('Wiederholt falsche Punkte liefern Fehler statt Aufgabe', async () => {
  await withResponses([{ aufgabenbloecke: blocks(64) }], async calls => {
    const response = await handleGenerateWR(request({ be:60 }), env);
    assert.equal(response.status, 502);
    assert.match((await response.json()).error, /Bewertungseinheiten/);
    assert.equal(calls(), 2);
  });
});
test('WR-Abitur prüft beide Teilprüfungen getrennt', async () => {
  await withResponses([{ aufgabenbloecke_1: blocks(75), aufgabenbloecke_2: blocks(25) }], async () => {
    const response = await handleGenerateAbiturWR(request({ niveau:'gA' }), env);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).gesamt_be, 100);
  });
});
test('Legacy-Aufgabe: tatsächliche 64 BE statt falscher 60 bestimmen Notenpunkte', async () => {
  await withResponses([{ be_erreicht:49, be_max:60, notenpunkte:12 }], async () => {
    const response = await handleGradeWR(request({ student_text:'Testantwort', gesamt_be:60, aufgabenbloecke:blocks(24,22,18) }), env);
    const data = await response.json();
    assert.equal(data.scores.be_max, 64);
    assert.equal(data.scores.notenpunkte, 11);
  });
});
test('WR-Abitur: Gesamtergebnis wird aus beiden Bewertungen berechnet', async () => {
  await withResponses([{ be_1:30, be_2:30, be_gesamt:110, notenpunkte:15 }], async () => {
    const response = await handleGradeAbiturWR(request({ student_text_1:'Test', student_text_2:'Test', niveau:'eA', aufgabenbloecke_1:blocks(60), aufgabenbloecke_2:blocks(60) }), env);
    const data = await response.json();
    assert.equal(data.scores.be_gesamt, 60);
    assert.equal(data.scores.notenpunkte, 6);
  });
});
