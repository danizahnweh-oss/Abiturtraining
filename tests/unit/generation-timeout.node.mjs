import test from 'node:test';
import assert from 'node:assert/strict';
import { callOpenAI } from '../../src/openai.js';
import { callTopicScopedOpenAI } from '../../src/topic-scope.js';
import { zeitbudgetPrompt } from '../../src/time-budget.js';

const env = { OPENAI_API_KEY: 'test' };
const messages = [{ role: 'system', content: 'Return JSON.' }];
const timeoutError = error => error.code === 'GENERATION_TIMEOUT';

async function withFetch(fetchMock, run) {
  const previous = globalThis.fetch;
  globalThis.fetch = fetchMock;
  try { await run(); } finally { globalThis.fetch = previous; }
}

test('expired overall deadline prevents another paid API call', async () => {
  await withFetch(() => assert.fail('must not fetch'), async () => {
    await assert.rejects(callOpenAI(env, messages, 1000, { deadline: Date.now() - 1 }), timeoutError);
  });
});

test('deadline cancels a stalled response body, not just waiting for headers', async () => {
  let aborted = false;
  await withFetch(async (_url, { signal }) => ({
    ok: true,
    json: () => new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => {
        aborted = true;
        reject(new DOMException('Aborted', 'AbortError'));
      }, { once: true });
    })
  }), async () => {
    await assert.rejects(callOpenAI(env, messages, 1000, { deadline: Date.now() + 25 }), timeoutError);
    assert.ok(aborted);
  });
});

test('material repair retains the original deadline', async () => {
  const originalNow = Date.now;
  let now = originalNow();
  const deadline = now + 1000;
  let calls = 0;
  Date.now = () => now;
  try {
    await withFetch(async () => {
      calls++;
      now = deadline + 1;
      return new Response(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({
        teilaufgaben: [{ text: 'Analysieren Sie M1.' }],
        material: [{ id: 'M1', type: 'text', text: 'Wort '.repeat(250) }]
      }) } }] }));
    }, async () => {
      await assert.rejects(callOpenAI(env, [{ role: 'system', content: 'JSON ' + zeitbudgetPrompt(30) }], 1000, { deadline }), timeoutError);
      assert.equal(calls, 1);
    });
  } finally { Date.now = originalNow; }
});

test('topic review shares the generation deadline', async () => {
  const originalNow = Date.now;
  let now = originalNow();
  const deadline = now + 1000;
  let calls = 0;
  Date.now = () => now;
  try {
    await withFetch(async () => {
      calls++;
      now = deadline + 1;
      return new Response(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: '{"task_instruction":"Break-even berechnen"}' } }] }));
    }, async () => {
      await assert.rejects(callTopicScopedOpenAI(env, { unterpunkte: ['Break-even'] }, messages, 1000, { deadline }), timeoutError);
      assert.equal(calls, 1);
    });
  } finally { Date.now = originalNow; }
});
