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

async function captureGeneration(body) {
  const original = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (_url, init) => {
    const call = JSON.parse(init.body);
    calls.push(call);
    const review = call.messages[0].content.startsWith('Du prüfst ausschließlich');
    const content = review ? { conforms: true, violations: [] } : { aufgabenbloecke: blocks(60) };
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(content) }, finish_reason: 'stop' }] }));
  };
  try {
    assert.equal((await handleGenerateWR(request({ be: 60, zeit: 180, ...body }), env)).status, 200);
    return calls;
  } finally { globalThis.fetch = original; }
}

test('gA single-topic selection removes all mandatory cross-subject instructions', async () => {
  const calls = await captureGeneration({ niveau: 'gA', fachbereich: 'integriert', sachgebiet: 'integriert', unterpunkte: ['Break-even-Analyse'] });
  const generation = calls[0].messages.map(m => m.content).join('\n');
  assert.doesNotMatch(generation, /muss alle drei Fachbereiche|integriert: BWL\+VWL\+Recht/);
  assert.match(generation, /Erlaubte Prüfungsinhalte: Break-even-Analyse/);
  assert.match(generation, /Thema: Break-even-Analyse/);
  assert.equal(calls.length, 2, 'topic review stays enabled');
});

test('eA multi-selection includes every chosen area instead of falling back to BWL', async () => {
  const calls = await captureGeneration({ niveau: 'eA', sachgebiet: 'vwl, recht', fachbereich: 'vwl, recht' });
  const generation = calls[0].messages[0].content;
  assert.match(generation, /Fachbereich: Volkswirtschaftslehre \+ Recht/);
  assert.match(generation, /Erlaubte Prüfungsinhalte:.*Magisches Viereck/);
  assert.doesNotMatch(generation, /Fachbereich: Betriebswirtschaftslehre/);
});

test('unrestricted integrated gA exam still covers all three areas', async () => {
  const calls = await captureGeneration({ niveau: 'gA', fachbereich: 'integriert', sachgebiet: 'integriert', unterpunkte: [] });
  assert.match(calls[0].messages[0].content, /muss alle drei Fachbereiche/);
  assert.equal(calls.length, 1);
});

test('rejected topic checks return a controlled error and never an off-topic exam', async () => {
  await withResponses([
    { aufgabenbloecke: blocks(60) }, { conforms: false, violations: ['Fremdes Thema'] },
    { aufgabenbloecke: blocks(60) }, { conforms: false, violations: ['Fremdes Thema'] }
  ], async calls => {
    const response = await handleGenerateWR(request({ niveau: 'gA', be: 60, zeit: 180, unterpunkte: ['Break-even-Analyse'] }), env);
    assert.equal(response.status, 502);
    const data = await response.json();
    assert.equal(data.code, 'TOPIC_SCOPE_REJECTED');
    assert.equal(data.aufgabenbloecke, undefined);
    assert.equal(calls(), 4);
  });
});
