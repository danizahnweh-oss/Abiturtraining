import test from 'node:test';
import assert from 'node:assert/strict';
import { generateToken, generateTeacherToken } from '../../src/auth.js';
import { handleGradeSubmit, handleGradeStatus, setGradeHandlerMap, executeGradeHandler } from '../../src/handlers/grading.js';

function fixture() {
  const jobs = new Map();
  const env = { ACCESS_TOKEN_SECRET: 'test-key', TEACHER_AUTH_SECRET: 'teacher-test',
    GRADING_QUEUE: { async send() {} },
    DB: { prepare(sql) { let args;
      return { bind(...values) { args = values; return this; },
        async first() {
          if (sql.includes('FROM students')) return { found: 1 };
          return jobs.get(args[0]);
        },
        async run() { jobs.set(args[0], { input_data: args[3], name: args[1], status: 'completed', result_data: '{"feedback":"private answer"}' }); },
      };
    } },
  };
  return { env, jobs };
}
function request(headers, body) {
  return new Request('https://example.test/api/grade', { headers, ...(body ? { method: 'POST', body: JSON.stringify(body) } : {}) });
}
async function student(env, id) { return { 'X-Access-Token': await generateToken(env, undefined, { sid: id, sub: 'student-' + id }) }; }
async function submit(env, headers) {
  setGradeHandlerMap({ 'grade-test': async () => new Response('{}') });
  const response = await handleGradeSubmit(request(headers, { endpoint: 'grade-test', student_name: 'somebody-else', student_text: 'synthetic exercise', _jobOwner: 'student:2' }), env, {});
  assert.equal(response.status, 202);
  return (await response.json()).job_id;
}
test('student job binds verified account, denies another account and never exposes output', async () => {
  const { env, jobs } = fixture();
  const own = await student(env, 1);
  const id = await submit(env, own);
  assert.equal(jobs.get(id).name, 'student-1');
  assert.equal((await handleGradeStatus(id, request(own), env)).status, 200);
  const denied = await handleGradeStatus(id, request(await student(env, 2)), env);
  assert.equal(denied.status, 404);
  assert.doesNotMatch(await denied.text(), /private answer/);
});
test('teacher can only retrieve own jobs', async () => {
  const { env } = fixture();
  const own = { 'X-Teacher-Auth-Token': await generateTeacherToken(env, 'a') };
  const other = { 'X-Teacher-Auth-Token': await generateTeacherToken(env, 'b') };
  const id = await submit(env, own);
  assert.equal((await handleGradeStatus(id, request(own), env)).status, 200);
  assert.equal((await handleGradeStatus(id, request(other), env)).status, 404);
});
test('group sessions are isolated and raw token is not stored', async () => {
  const { env, jobs } = fixture();
  const token = await generateToken(env);
  const own = { 'X-Access-Token': token };
  const id = await submit(env, own);
  assert.equal((await handleGradeStatus(id, request(own), env)).status, 200);
  assert.equal((await handleGradeStatus(id, request({ 'X-Access-Token': await generateToken(env) }), env)).status, 404);
  assert.ok(!jobs.get(id).input_data.includes(token));
});
test('legacy and malformed jobs cannot bypass ownership', async () => {
  const { env, jobs } = fixture();
  for (const input_data of ['{}', '{']) {
    jobs.set('old', { input_data, status: 'completed', result_data: '{"secret":1}' });
    assert.equal((await handleGradeStatus('old', request(await student(env, 1)), env)).status, 404);
  }
  assert.equal((await handleGradeStatus('old', request({}), env)).status, 401);
});
test('ownership metadata never reaches grading provider handlers', async () => {
  setGradeHandlerMap({ 'grade-test': async req => {
    assert.deepEqual(await req.json(), { student_text: 'exercise' });
    return new Response('{}');
  } });
  await executeGradeHandler('grade-test', { student_text: 'exercise', _jobOwner: 'student:1' }, {});
});
