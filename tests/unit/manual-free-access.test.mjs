import test from 'node:test';
import assert from 'node:assert/strict';
import { checkSubscriptionAccess, generateToken } from '../../src/auth.js';
import { handleSubscriptionStatus } from '../../src/handlers/stripe.js';

function freeAccountEnv(freeAccessUntil) {
  const student = {
    id: 42, name_lower: 'free-access-test', subscription_status: 'none',
    subscription_plan: 'free', trial_end: null, class_group: null,
    free_access_until: freeAccessUntil, created_at: '2026-01-01T00:00:00.000Z'
  };
  return {
    ACCESS_PASSWORD: 'test-only-secret', ALLOWED_ORIGIN: 'https://myabiflow.de',
    DB: { prepare(sql) {
      return { bind(...args) {
        return {
          async first() {
            if (/FROM students WHERE (name_lower|id) =/.test(sql)) {
              assert.ok(args[0] === student.name_lower || String(args[0]) === String(student.id));
              return student;
            }
            if (/FROM subscriptions|FROM student_teacher_links|FROM student_subject_licenses/.test(sql)) return null;
            throw new Error('Unexpected test query: ' + sql);
          },
          async all() {
            assert.match(sql, /FROM subscriptions|FROM student_subject_licenses/);
            return { results: [], success: true };
          }
        };
      } };
    } }
  };
}

for (const [label, until, allowed] of [
  ['gültige Freigabe ohne Abo', () => new Date(Date.now() + 86400000).toISOString(), true],
  ['abgelaufene Freigabe ohne Abo', () => new Date(Date.now() - 86400000).toISOString(), false],
  ['fehlende Freigabe ohne Abo', () => null, false],
  ['ungültiges Ablaufdatum', () => 'invalid-date', false]
]) {
  test(label + ': Generierung, Korrektur und Abo-Anzeige sind konsistent', async () => {
    const env = freeAccountEnv(until());
    const token = await generateToken(env, undefined, { sub: 'free-access-test', sid: '42' });
    const req = new Request('https://myabiflow.de/api/stripe/subscription-status', {
      method: 'POST', headers: { 'X-Access-Token': token, 'Content-Type': 'application/json' }, body: '{}'
    });
    const response = await handleSubscriptionStatus(req, env);
    assert.equal(response.status, 200);
    const status = await response.json();
    assert.equal(status.status, allowed ? 'active' : 'none');
    assert.equal(status.plan, 'free');
    assert.equal(status.is_free_access, allowed);
    for (const correction of [false, true]) {
      const accessError = await checkSubscriptionAccess('free-access-test', env, correction, 'Englisch');
      if (allowed) assert.equal(accessError, null);
      else {
        assert.equal(accessError.status, 403);
        assert.equal((await accessError.json()).requires_subscription, true);
      }
    }
  });
}
