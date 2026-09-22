import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import router from '../../src/index.js';
import { generateToken, generateTeacherToken, checkAuthenticatedRateLimit, getStudentTokenIdentity, getRateLimitScope, accountRateLimitMap, rateLimitMap, loginRateLimitMap } from '../../src/auth.js';
import { ACCOUNT_RATE_LIMITS, RATE_LIMIT_WINDOW } from '../../src/config.js';

beforeEach(() => { accountRateLimitMap.clear(); rateLimitMap.clear(); loginRateLimitMap.clear(); });
function fixture() {
  const students = Array.from({ length: 60 }, (_, n) => ({ id: String(n + 1), name_lower: `student-${n + 1}`, name: `Student ${n + 1}` }));
  const env = { ACCESS_PASSWORD: 'test-only-access', ACCESS_TOKEN_SECRET: 'test-only-token', TEACHER_AUTH_SECRET: 'test-only-teacher', ALLOWED_ORIGIN: 'https://myabiflow.de', students, authReads: 0 };
  env.DB = { prepare(sql) {
    let args = [];
    const statement = {
      bind(...values) { args = values; return statement; },
      async run() { return { success: true }; },
      async all() { return { results: [] }; },
      async first() {
        if (sql.includes('FROM students WHERE id = ? AND name_lower = ?')) {
          env.authReads++;
          return students.some(s => s.id === args[0] && s.name_lower === args[1]) ? { found: 1 } : null;
        }
        if (sql.includes('FROM students WHERE name_lower = ?')) return students.find(s => s.name_lower === args[0]) || null;
        if (sql.includes('FROM grading_jobs')) return { status: 'processing', created_at: new Date().toISOString() };
        if (sql.includes('FROM teachers WHERE id = ?')) return { name: 'Teacher', subjects: '[]' };
        return null;
      },
    };
    return statement;
  } };
  return env;
}
const tokenFor = (env, id = 1) => generateToken(env, undefined, { sub: `student-${id}`, sid: String(id) });
function request(path, token, { teacher = false, method = 'POST', body = {}, extra = {} } = {}) {
  return new Request('https://myabiflow.de' + path, {
    method,
    headers: { 'Content-Type': 'application/json', 'X-Real-IP': '192.0.2.25', [teacher ? 'X-Teacher-Auth-Token' : 'X-Access-Token']: token, ...extra },
    ...(method !== 'GET' ? { body: JSON.stringify(body) } : {}),
  });
}
const apply = (env, path, token, options) => checkAuthenticatedRateLimit(request(path, token, options), env);

test('60 students behind one school IP get separate status, general and AI budgets', async () => {
  const env = fixture();
  const tokens = await Promise.all(env.students.map(s => tokenFor(env, s.id)));
  for (const token of tokens) {
    for (const path of ['/api/stripe/subscription-status', '/api/student-results', '/api/ocr']) {
      for (let n = 0; n < 3; n++) assert.equal((await apply(env, path, token)).error, null);
    }
  }
  assert.equal(accountRateLimitMap.size, 180);
  assert.equal(rateLimitMap.size, 0);
});

test('rotating signed tokens for the same account shares the AI limit and returns retry instructions', async () => {
  const env = fixture();
  for (let n = 0; n < ACCOUNT_RATE_LIMITS.ai; n++) assert.equal((await apply(env, '/api/generate-image', await tokenFor(env))).error, null);
  const blocked = (await apply(env, '/api/ocr', await tokenFor(env))).error;
  assert.equal(blocked.status, 429);
  const body = await blocked.json();
  assert.equal(body.code, 'rate_limited');
  assert.equal(body.scope, 'ai');
  assert.match(body.error, /Bitte warte/);
  assert.equal(Number(blocked.headers.get('Retry-After')), body.retry_after);
  assert.ok(body.retry_after > 0 && body.retry_after <= 60);
  assert.equal(accountRateLimitMap.size, 1);
  assert.equal((await apply(env, '/api/ocr', await tokenFor(env, 2))).error, null);
});

test('status polling, general actions and AI requests do not spend each other’s budgets', async () => {
  const env = fixture(); const token = await tokenFor(env);
  for (const [path, max] of [['/api/grade-status/job', 120], ['/api/student-results', 60], ['/api/model-answer', 10]]) {
    for (let n = 0; n < max; n++) assert.equal((await apply(env, path, token)).error, null);
    assert.equal((await apply(env, path, token)).error.status, 429);
  }
  for (const entry of accountRateLimitMap.values()) entry.windowStart -= RATE_LIMIT_WINDOW;
  assert.equal((await apply(env, '/api/model-answer', token)).error, null);
});

test('unverified tokens and spoofed identity headers never allocate account buckets', async () => {
  const env = fixture();
  for (let n = 0; n < 60; n++) {
    const result = await apply(env, '/api/generate', 'forged-' + n, { extra: { 'X-Student-Name': 'student-' + n, 'X-Teacher-Auth-Token': 'fake-' + n }, body: { student_name: 'student-' + n } });
    assert.equal(result.error.status, 401);
  }
  assert.equal(accountRateLimitMap.size, 0);
  assert.equal(rateLimitMap.size, 0);
  const token = await tokenFor(env);
  const result = await apply(env, '/api/ocr', token, { extra: { 'X-Teacher-Auth-Token': 'fake', 'X-Student-Name': 'someone-else' }, body: { student_name: 'someone-else' } });
  assert.deepEqual(result.identity, { kind: 'student', id: '1' });
});

test('deleted accounts remain denied and identity lookup is only reused within one request', async () => {
  const env = fixture(); const token = await tokenFor(env);
  const req = request('/api/get-preferences', token);
  assert.equal((await checkAuthenticatedRateLimit(req, env)).error, null);
  assert.equal((await getStudentTokenIdentity(req, env)).studentId, '1');
  assert.equal(env.authReads, 1);
  env.students.shift();
  assert.equal((await apply(env, '/api/ocr', token)).error.status, 401);
  assert.equal(env.authReads, 2);
  assert.equal(accountRateLimitMap.size, 1);
});

test('legacy tokens without a verified account retain the 25-request IP fallback', async () => {
  const env = fixture();
  for (let n = 0; n < 25; n++) assert.equal((await apply(env, '/api/ocr', await generateToken(env))).error, null);
  assert.equal((await apply(env, '/api/ocr', await generateToken(env))).error.status, 429);
  assert.equal(accountRateLimitMap.size, 0);
  assert.equal(rateLimitMap.size, 1);
});

test('classifier covers costly families including FOS, images and early material generation', () => {
  for (const path of ['generate', 'generate-from-materials', 'generate-cartoon', 'generate-image', 'grade-submit', 'grade-deutsch-stream', 'fos-grade-bwr', 'fos-model-answer-mathe', 'ocr-text', 'parse-task-kunst', 'model-answer-french', 'detail-feedback', 'rewrite', 'learning-plan', 'fetch-unsplash', 'colloquium/start']) assert.equal(getRateLimitScope('/api/' + path), 'ai', path);
  for (const path of ['grade-status/job', 'stripe/subscription-status', 'colloquium/status', 'teacher/credit-balance', 'get-preferences']) assert.equal(getRateLimitScope('/api/' + path), 'status', path);
  assert.equal(getRateLimitScope('/api/save-preferences'), 'general');
});

test('actual router allows 60 students on one IP and limits grade polling separately from OCR', async () => {
  const env = fixture();
  for (let id = 1; id <= 60; id++) {
    const token = await tokenFor(env, id);
    assert.equal((await router.fetch(request('/api/get-preferences', token), env)).status, 200);
    assert.equal((await router.fetch(request('/api/grade-status/job', token, { method: 'GET' }), env)).status, 200);
    assert.equal((await router.fetch(request('/api/ocr', token), env)).status, 400);
  }
  const token = await tokenFor(env);
  // Two status requests already used above.
  for (let n = 2; n < 120; n++) assert.equal((await router.fetch(request('/api/grade-status/job', token, { method: 'GET' }), env)).status, 200);
  assert.equal((await router.fetch(request('/api/grade-status/job', token, { method: 'GET' }), env)).status, 429);
  assert.equal((await router.fetch(request('/api/ocr', token), env)).status, 400);
});

test('actual early teacher routes use each verified teacher account and material generation uses AI bucket', async () => {
  const env = fixture();
  for (let id = 1; id <= 25; id++) {
    const token = await generateTeacherToken(env, 'teacher-' + id);
    assert.equal((await router.fetch(request('/api/teacher-profile', token, { teacher: true, body: { action: 'get' } }), env)).status, 200);
    assert.equal((await router.fetch(request('/api/generate-from-materials', token, { teacher: true }), env)).status, 400);
  }
  const token = await generateTeacherToken(env, 'teacher-1');
  for (let n = 1; n < 10; n++) assert.equal((await router.fetch(request('/api/generate-from-materials', token, { teacher: true }), env)).status, 400);
  assert.equal((await router.fetch(request('/api/generate-from-materials', token, { teacher: true }), env)).status, 429);
  assert.equal((await router.fetch(request('/api/teacher-profile', token, { teacher: true, body: { action: 'get' } }), env)).status, 200);
  const before = accountRateLimitMap.size;
  assert.equal((await router.fetch(request('/api/generate-from-materials', await tokenFor(env)), env)).status, 401);
  assert.equal((await router.fetch(request('/api/teacher-profile', 'fake', { teacher: true, body: { action: 'get' } }), env)).status, 401);
  assert.equal(accountRateLimitMap.size, before);
});

test('a forged teacher header cannot skip the subscription check with a valid student token', async () => {
  const env = fixture();
  const token = await tokenFor(env);
  const response = await router.fetch(request('/api/generate', token, {
    extra: { 'X-Teacher-Auth-Token': 'forged-teacher' }, body: { student_name: 'student-1' },
  }), env);
  assert.equal(response.status, 403);
  const body = await response.json();
  assert.equal(body.requires_subscription, true);
  assert.ok(accountRateLimitMap.has(JSON.stringify(['student', '1', 'ai'])));
});
