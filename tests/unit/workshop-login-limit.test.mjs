import test from 'node:test';
import assert from 'node:assert/strict';
import { getStudentLoginLimit, WORKSHOP_LOGIN_LIMIT_UNTIL, MAX_LOGIN_ATTEMPTS } from '../../src/config.js';
import { checkRateLimit, studentLoginRateLimitMap, loginRateLimitMap } from '../../src/auth.js';

const env = { ALLOWED_ORIGIN: 'https://myabiflow.de' };
const request = new Request('https://myabiflow.de/api/check-student', { headers: { 'X-Real-IP': '192.0.2.60' } });

test('Workshop limit automatically ends at midnight Berlin time', () => {
  assert.equal(getStudentLoginLimit(WORKSHOP_LOGIN_LIMIT_UNTIL - 1), 100);
  assert.equal(getStudentLoginLimit(WORKSHOP_LOGIN_LIMIT_UNTIL), 5);
  assert.equal(getStudentLoginLimit(WORKSHOP_LOGIN_LIMIT_UNTIL + 86400000), 5);
  assert.equal(MAX_LOGIN_ATTEMPTS, 5);
});

test('100 student requests fit into one school-IP window; request 101 is blocked', () => {
  studentLoginRateLimitMap.clear();
  const max = getStudentLoginLimit(WORKSHOP_LOGIN_LIMIT_UNTIL - 1);
  for (let i = 0; i < 100; i++) assert.equal(checkRateLimit(request, studentLoginRateLimitMap, max, env), null);
  assert.equal(checkRateLimit(request, studentLoginRateLimitMap, max, env).status, 429);
  studentLoginRateLimitMap.clear();
});

test('Student requests do not consume other login limits', () => {
  studentLoginRateLimitMap.clear();
  loginRateLimitMap.clear();
  for (let i = 0; i < 60; i++) assert.equal(checkRateLimit(request, studentLoginRateLimitMap, 100, env), null);
  for (let i = 0; i < 5; i++) assert.equal(checkRateLimit(request, loginRateLimitMap, MAX_LOGIN_ATTEMPTS, env), null);
  assert.equal(checkRateLimit(request, loginRateLimitMap, MAX_LOGIN_ATTEMPTS, env).status, 429);
  studentLoginRateLimitMap.clear();
  loginRateLimitMap.clear();
});

test('After expiry the sixth student request is blocked', () => {
  const map = new Map();
  const max = getStudentLoginLimit(WORKSHOP_LOGIN_LIMIT_UNTIL);
  for (let i = 0; i < 5; i++) assert.equal(checkRateLimit(request, map, max, env), null);
  assert.equal(checkRateLimit(request, map, max, env).status, 429);
});
