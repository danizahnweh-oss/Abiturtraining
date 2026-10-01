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

const { GENERATION_DEADLINE, GENERATION_TIMEOUT_MS, GENERATION_PATH, resolveGenerationDeadline, withGenerationRuntime } = await import('../../src/generation-runtime.js');
const { readFileSync } = await import('node:fs');
const requestFor = (path, method = 'POST') => new Request('https://example.test' + path, { method });

test('all registered generation routes match the same application and proxy policy', () => {
  const sources = ['../../src/index.js', '../../src/fos/index.js'].map(path => readFileSync(new URL(path, import.meta.url), 'utf8')).join('\n');
  const paths = [...new Set([...sources.matchAll(/"(\/api\/(?:fos-)?generate[^"\s]*)"/g)].map(match => match[1]))];
  assert.ok(paths.length > 30);
  const nginx = readFileSync(new URL('../../hetzner-backend/config/nginx.conf', import.meta.url), 'utf8');
  const location = nginx.match(/location ~ (\S*generate\S*) \{([\s\S]*?)\n    \}/);
  assert.ok(location);
  const proxyPath = new RegExp(location[1]);
  for (const path of [...paths, '/api/generate', '/api/fos-generate-mathe', '/api/generate-from-materials']) {
    assert.ok(GENERATION_PATH.test(path), path);
    assert.ok(proxyPath.test(path), path);
  }
  assert.match(location[2], /proxy_read_timeout 300s;/);
  assert.ok(GENERATION_TIMEOUT_MS < 300000);
  for (const path of ['/api/grade-wr', '/api/login', '/api/check-student', '/api/generateevil']) {
    assert.equal(GENERATION_PATH.test(path), false);
    assert.equal(proxyPath.test(path), false);
  }
});

test('concurrent subjects receive isolated environments and preserve auth bindings', async () => {
  const sharedEnv = { DB: {}, OPENAI_API_KEY: 'test' };
  const seen = [];
  await Promise.all(['/api/generate-bio', '/api/fos-generate-mathe'].map(path => withGenerationRuntime(requestFor(path), sharedEnv, {}, async (_request, scoped) => {
    seen.push(scoped);
    assert.equal(scoped.DB, sharedEnv.DB);
    assert.ok(scoped[GENERATION_DEADLINE] > Date.now());
    return new Response('{}');
  })));
  assert.notEqual(seen[0], seen[1]);
  assert.equal(sharedEnv[GENERATION_DEADLINE], undefined);
});

test('only generation POSTs get a new deadline', async () => {
  for (const req of [requestFor('/api/login'), requestFor('/api/grade-wr'), requestFor('/api/generate-bio', 'OPTIONS')]) {
    await withGenerationRuntime(req, env, {}, async (_request, scoped) => {
      assert.equal(scoped, env);
      return new Response('{}');
    });
  }
});

test('outer runtime returns a controlled response even when a handler stalls', async () => {
  const scoped = { [GENERATION_DEADLINE]: Date.now() + 25 };
  const response = await withGenerationRuntime(requestFor('/api/generate-from-materials'), scoped, {}, () => new Promise(() => {}));
  assert.equal(response.status, 503);
  assert.equal((await response.json()).code, 'GENERATION_TIMEOUT');
});

test('expired requests never enter the subject handler', async () => {
  const scoped = { [GENERATION_DEADLINE]: Date.now() - 1 };
  const response = await withGenerationRuntime(requestFor('/api/fos-generate-englisch'), scoped, {}, () => assert.fail('must not run'));
  assert.equal(response.status, 503);
});

test('nested calls cannot extend the request deadline', async () => {
  const deadline = Date.now() - 1;
  const scoped = { ...env, [GENERATION_DEADLINE]: deadline };
  assert.equal(resolveGenerationDeadline(scoped, deadline + 500000), deadline);
  await withFetch(() => assert.fail('must not fetch'), async () => {
    await assert.rejects(callOpenAI(scoped, messages, 1000, { deadline: deadline + 500000 }), timeoutError);
    const { callOpenAIStream } = await import('../../src/openai.js');
    await assert.rejects(callOpenAIStream(scoped, messages, 1000, {}, () => {}), timeoutError);
  });
});
