import test from 'node:test';
import assert from 'node:assert/strict';
import {
  generateToken, getTokenPayload, verifyToken, getStudentTokenIdentity,
  checkAuth, generateTeacherToken, verifyTeacherAuthToken,
} from '../../src/auth.js';
import { TOKEN_EXPIRY } from '../../src/config.js';

function makeEnv(students = [{ id: 42, name_lower: 'workshop-test' }]) {
  const reads = [];
  return {
    ACCESS_TOKEN_SECRET: 'unit-test-student-secret',
    ACCESS_PASSWORD: 'unit-test-access-secret',
    TEACHER_AUTH_SECRET: 'unit-test-teacher-secret',
    TEACHER_PASSWORD: 'unit-test-dashboard-secret',
    students, reads,
    DB: {
      prepare(sql) {
        return {
          bind(...args) {
            return { async first() {
              reads.push({ sql, args });
              assert.match(sql, /FROM students WHERE id = \? AND name_lower = \?/);
              return students.some(row => String(row.id) === args[0] && row.name_lower === args[1]) ? { found: 1 } : null;
            } };
          },
        };
      },
    },
  };
}
const studentToken = env => generateToken(env, undefined, { sub: 'workshop-test', sid: '42' });
const requestFor = token => new Request('https://myabiflow.de/api/test', { headers: { 'X-Access-Token': token } });

test('a signed token for the existing exact student identity remains valid', async () => {
  const env = makeEnv();
  const token = await studentToken(env);
  const payload = await getTokenPayload(token, env);
  assert.equal(payload.sub, 'workshop-test');
  assert.equal(payload.sid, '42');
  assert.deepEqual(env.reads[0].args, ['42', 'workshop-test']);
  assert.deepEqual(await getStudentTokenIdentity(requestFor(token), env), { nameLower: 'workshop-test', studentId: '42' });
  assert.equal(await checkAuth(requestFor(token), env), null);
});

test('deleting the account immediately invalidates its already issued token', async () => {
  const env = makeEnv();
  const token = await studentToken(env);
  assert.equal(await verifyToken(token, env), true);
  env.students.splice(0);
  assert.equal(await getTokenPayload(token, env), null);
  assert.equal(await getStudentTokenIdentity(requestFor(token), env), null);
  assert.equal((await checkAuth(requestFor(token), env)).status, 401);
});

test('recreating the same name with a new id does not revive the old token', async () => {
  const env = makeEnv();
  const token = await studentToken(env);
  env.students[0].id = 43;
  assert.equal(await verifyToken(token, env), false);
  const newToken = await generateToken(env, undefined, { sub: 'workshop-test', sid: '43' });
  assert.equal(await verifyToken(newToken, env), true);
});

test('renaming the existing id invalidates the previous name binding', async () => {
  const env = makeEnv();
  const token = await studentToken(env);
  env.students[0].name_lower = 'renamed-student';
  assert.equal(await verifyToken(token, env), false);
});

test('expired and forged tokens are rejected before consulting the database', async () => {
  const env = makeEnv();
  const expired = await generateToken(env, undefined, { sub: 'workshop-test', sid: '42', iat: Date.now() - TOKEN_EXPIRY - 1000 });
  assert.equal(await getTokenPayload(expired, env), null);
  const valid = await studentToken(env);
  const [data, signature] = valid.split('.');
  const forgedData = { ...JSON.parse(atob(data)), sid: '43' };
  assert.equal(await getTokenPayload(btoa(JSON.stringify(forgedData)) + '.' + signature, env), null);
  assert.equal(env.reads.length, 0);
});

test('database failure denies a bound student token', async () => {
  const env = makeEnv();
  const token = await studentToken(env);
  env.DB.prepare = () => { throw new Error('database unavailable'); };
  assert.equal(await getTokenPayload(token, env), null);
  assert.equal((await checkAuth(requestFor(token), env)).status, 401);
});

test('teacher tokens and legacy tokens without student identity keep their behavior', async () => {
  const env = makeEnv([]);
  env.DB.prepare = () => { throw new Error('student lookup must not happen'); };
  const teacherToken = await generateTeacherToken(env, 'teacher-test');
  assert.equal(await verifyTeacherAuthToken(teacherToken, env), 'teacher-test');
  assert.equal(await checkAuth(new Request('https://myabiflow.de/api/test', { headers: { 'X-Teacher-Auth-Token': teacherToken } }), env), null);
  const legacy = await generateToken(env);
  assert.ok(await getTokenPayload(legacy, env));
  assert.equal(await getStudentTokenIdentity(requestFor(legacy), env), null);
  const dashboardToken = await generateToken(env, env.TEACHER_PASSWORD);
  assert.ok(await getTokenPayload(dashboardToken, env, env.TEACHER_PASSWORD));
  assert.equal(env.reads.length, 0);
});
