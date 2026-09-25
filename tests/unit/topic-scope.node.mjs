import test from 'node:test';
import assert from 'node:assert/strict';
import { extractTopicScope, callTopicScopedOpenAI } from '../../src/topic-scope.js';
import { zeitbudgetPrompt } from '../../src/time-budget.js';

const env = { OPENAI_API_KEY: 'test' };
const selection = { sachgebiet: 'genetik', unterpunkte: ['DNA-Replikation'] };
const prompts = [{ role: 'system', content: 'Erstelle eine Klausur als JSON. Genetik: Replikation, Mendel, CRISPR.' }];
const wrong = JSON.stringify({ teilaufgaben: [{ text: 'Erläutern Sie CRISPR.', be: 5 }] });
const correct = JSON.stringify({ teilaufgaben: [{ text: 'Erklären Sie die semikonservative Replikation.', be: 5 }] });
const pass = JSON.stringify({ conforms: true, violations: [] });
const fail = JSON.stringify({ conforms: false, violations: ['Aufgabe 1: CRISPR liegt außerhalb DNA-Replikation.'] });

async function withResponses(responses, action) {
  const previous = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (_url, init) => {
    calls.push(JSON.parse(init.body));
    assert.ok(responses.length, 'unexpected API call');
    return new Response(JSON.stringify({ choices: [{ message: { content: responses.shift() }, finish_reason: 'stop' }] }), { status: 200 });
  };
  try { await action(calls); } finally { globalThis.fetch = previous; }
}

test('scope preserves explicit topics and ignores random choices and student answers', () => {
  assert.deepEqual(extractTopicScope({ ...selection, thema: 'random', student_text: 'Evolution' }), selectionToScope());
  assert.equal(extractTopicScope({ schwerpunkt: 'random', unterpunkte: [] }), null);
  assert.deepEqual(extractTopicScope({ thema: '  Kant ', unterpunkte: ['Pflicht', 'Pflicht'] }), { unterpunkte: ['Pflicht'], thema: ['Kant'] });
  assert.throws(() => extractTopicScope({ unterpunkte: [123] }), /ungültig/);
});
function selectionToScope() { return { unterpunkte: ['DNA-Replikation'], sachgebiet: ['genetik'] }; }

test('valid exam is reviewed before release and boundary overrides broad catalogue', async () => {
  await withResponses([correct, pass], async calls => {
    assert.equal(await callTopicScopedOpenAI(env, selection, prompts), correct);
    assert.equal(calls.length, 2);
    assert.match(calls[0].messages.at(-1).content, /abschließende Liste/);
    assert.deepEqual(JSON.parse(calls[1].messages[1].content).selection, selectionToScope());
    assert.equal(JSON.parse(calls[1].messages[1].content).examination, correct);
  });
});

test('off-topic exam is repaired and checked again', async () => {
  await withResponses([wrong, fail, correct, pass], async calls => {
    assert.equal(await callTopicScopedOpenAI(env, selection, prompts), correct);
    assert.equal(calls.length, 4);
    assert.match(calls[2].messages.at(-2).content, /CRISPR/);
    assert.match(calls[2].messages.at(-1).content, /DNA-Replikation/);
  });
});

for (const report of [fail, 'not json', '{}', '{"conforms":true}', '{"conforms":true,"violations":["outside"]}']) {
  test(`unconfirmed scope never reaches the student: ${report}`, async () => {
    await withResponses([wrong, report, wrong, report], async calls => {
      await assert.rejects(callTopicScopedOpenAI(env, selection, prompts), /nicht sicher/);
      assert.equal(calls.length, 4);
    });
  });
}

test('no selection keeps normal generation without extra review', async () => {
  await withResponses([correct], async calls => {
    assert.equal(await callTopicScopedOpenAI(env, {}, prompts), correct);
    assert.equal(calls.length, 1);
  });
});

test('time-budget generation and scope review coexist', async () => {
  await withResponses([correct, pass], async calls => {
    assert.equal(await callTopicScopedOpenAI(env, selection, [{ role: 'system', content: prompts[0].content + zeitbudgetPrompt(30) }]), correct);
    assert.equal(calls.length, 2);
    assert.ok(!JSON.stringify(calls[1]).includes('MYABIFLOW_TIME_BUDGET'));
  });
});

test('Biologie endpoint forwards the actual selection and blocks a rejected exam', async () => {
  const { handleGenerateBio } = await import('../../src/subjects/biologie.js');
  const request = () => new Request('https://example.test/api/generate-bio', { method: 'POST', body: JSON.stringify({ ...selection, zeit: 30, be: 10 }) });
  await withResponses([correct, pass], async calls => {
    const response = await handleGenerateBio(request(), env);
    assert.equal(response.status, 200);
    assert.deepEqual(JSON.parse(calls[1].messages[1].content).selection, selectionToScope());
  });
  await withResponses([wrong, fail, wrong, fail], async () => {
    const response = await handleGenerateBio(request(), env);
    assert.equal(response.status, 500);
    assert.ok((await response.json()).error);
  });
});
