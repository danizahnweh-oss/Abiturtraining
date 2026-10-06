import test from 'node:test';
import assert from 'node:assert/strict';
import { generateToken, generateTeacherToken, resolveStudentIdentity } from '../../src/auth.js';
import { handleStudentResultDetail, handleStudentResults, handleLearningPlan, handleCompetencyProfile } from '../../src/handlers/analytics.js';
import { handleGetPreferences } from '../../src/handlers/student.js';
import { handleStudentMessages } from '../../src/handlers/messages.js';
import { handleLinkStudentCode, handleStudentCodes } from '../../src/handlers/teacher.js';

function fixture() {
  const queries = [];
  const env = {
    ACCESS_TOKEN_SECRET: 'test-student-key', TEACHER_AUTH_SECRET: 'test-teacher-key',
    queries,
    DB: { prepare(sql) {
      let args = [];
      return {
        bind(...values) { args = values; return this; },
        async first() {
          queries.push({ sql, args });
          if (sql.includes('FROM students WHERE id')) return args[0] === '1' && args[1] === 'alice' ? { found: 1 } : null;
          if (sql.includes('FROM student_teacher_links')) {
            return args[0] === 'teacher-a' && args[1] === 'alice' && (args.length === 2 || args[2] === 'mathe') ? { found: 1 } : null;
          }
          if (sql.includes('FROM results WHERE id')) return {
            own: { id: 'own', student_name: 'Alice', type: 'mathe', feedback_html: 'own feedback' },
            otherSubject: { id: 'otherSubject', student_name: 'Alice', type: 'religion', feedback_html: 'private subject' },
            otherPerson: { id: 'otherPerson', student_name: 'Bob', type: 'mathe', feedback_html: 'private person' },
          }[args[0]] || null;
          if (sql.includes('FROM teacher_codes')) return { teacher_id: 'teacher-a', teacher_name: 'Teacher', label: 'Class' };
          throw new Error('Unexpected query: ' + sql);
        },
        async all() { queries.push({ sql, args }); return { results: [] }; },
        async run() { queries.push({ sql, args }); return { meta: { changes: 1 } }; },
      };
    } },
  };
  return env;
}
function request(headers, body = {}) {
  return new Request('https://myabiflow.de/api/test', { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
}
async function teacherHeaders(env) { return { 'X-Teacher-Auth-Token': await generateTeacherToken(env, 'teacher-a') }; }
async function studentHeaders(env) { return { 'X-Access-Token': await generateToken(env, undefined, { sub: 'alice', sid: '1' }) }; }

for (const [name, handler] of Object.entries({ results: handleStudentResults, plan: handleLearningPlan, profile: handleCompetencyProfile, preferences: handleGetPreferences, inbox: handleStudentMessages })) {
  test('teacher cannot read student-private ' + name, async () => {
    const env = fixture();
    const response = await handler(request(await teacherHeaders(env), { student_name: 'alice' }), env);
    assert.equal(response.status, 401);
    assert.equal(env.queries.length, 0);
  });
}
for (const [id, status] of [['own', 200], ['otherSubject', 403], ['otherPerson', 403]]) {
  test('teacher result detail checks person and subject: ' + id, async () => {
    const env = fixture();
    const response = await handleStudentResultDetail(request(await teacherHeaders(env), { student_name: 'alice', result_id: id }), env);
    assert.equal(response.status, status);
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
    if (status === 403) assert.doesNotMatch(await response.text(), /private subject|private person/);
  });
}
test('student identity ignores another name in the request body', async () => {
  const env = fixture();
  const headers = await studentHeaders(env);
  const ident = await resolveStudentIdentity(request(headers), env, 'bob');
  assert.equal(ident.nameLower, 'alice');
  assert.equal((await handleStudentResultDetail(request(headers, { student_name: 'bob', result_id: 'otherPerson' }), env)).status, 403);
  assert.equal((await handleStudentResultDetail(request(headers, { result_id: 'own' }), env)).status, 200);
});
for (const handler of [handleLinkStudentCode, handleStudentCodes]) {
  test(handler.name + ' rejects legacy group login without personal identity', async () => {
    const env = fixture();
    const response = await handler(request({ 'X-Access-Token': await generateToken(env) }, { student_name: 'bob', code: 'CLASS', subject: 'mathe' }), env);
    assert.equal(response.status, 401);
    assert.equal(env.queries.length, 0);
  });
}
test('link creation binds the signed identity, never the supplied name', async () => {
  const env = fixture();
  const response = await handleLinkStudentCode(request(await studentHeaders(env), { student_name: 'bob', code: 'CLASS', subject: 'mathe' }), env);
  assert.equal(response.status, 200);
  assert.equal(env.queries.find(q => q.sql.startsWith('INSERT INTO student_teacher_links')).args[0], 'alice');
});
