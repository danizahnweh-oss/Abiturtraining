import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
const source = readFileSync(new URL('../../shared.js', import.meta.url), 'utf8');
const functions = source.slice(source.indexOf('function isPublicTrackingPage()'), source.indexOf('// Google Tag (gtag.js) laden'));
function context(path, session = {}, preferences = { analytics: true, marketing: true, version: 2, saved_at: new Date().toISOString() }) {
  const scope = {
    window: { location: new URL(path, 'https://myabiflow.de') }, URLSearchParams,
    sessionStorage: { getItem: key => session[key] || null },
    localStorage: { getItem: key => key === 'myabiflow_tracking_preferences' ? JSON.stringify(preferences) : null },
  };
  vm.createContext(scope); vm.runInContext(functions, scope);
  return scope;
}
for (const path of ['/index.html?app=1', '/mathe.html', '/lehrer.html', '/dashboard.html', '/fos/index.html', '/abo.html', '/abitur-kolloquium-trainer/dist/', '/new-learning-page.html', '/landing.html?token=private', '/?app=1']) {
  test('stored consent cannot enable tracking on ' + path, () => {
    const scope = context(path);
    assert.equal(scope.getTrackingConsent('analytics'), false);
    assert.equal(scope.getTrackingConsent('marketing'), false);
  });
}
test('public information page can measure only with current granular consent', () => {
  assert.equal(context('/landing.html?utm_source=test').getTrackingConsent('analytics'), true);
  assert.equal(context('/landing.html', {}, { version: 2, analytics: true }).getTrackingConsent('analytics'), false);
  assert.equal(context('/landing.html', {}, { version: 2, analytics: true, saved_at: '2020-01-01' }).getTrackingConsent('analytics'), false);
});
test('signed-in users remain excluded even on public pages', () => {
  assert.equal(context('/landing.html', { access_token: 'synthetic' }).getTrackingConsent('marketing'), false);
});
