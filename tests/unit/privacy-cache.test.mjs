import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

function worker(cacheControl = '') {
  const handlers = {};
  const writes = [];
  vm.runInNewContext(readFileSync(new URL('../../sw.js', import.meta.url), 'utf8'), {
    self: { addEventListener(name, handler) { handlers[name] = handler; } },
    location: new URL('https://myabiflow.de/'), URL, Response,
    caches: { match: async () => undefined, open: async () => ({ put: async (request) => writes.push(request.url) }) },
    fetch: async () => new Response('ok', { headers: { 'Cache-Control': cacheControl } }),
  });
  return { handlers, writes };
}
for (const path of ['/session/123/transcript', '/session/123/status', '/api/account/export', '/tutor/chat', '/v1beta/models/test', '/health', '/index.html?token=private', 'https://external.example/result.json']) {
  test('offline cache ignores ' + path, () => {
    const { handlers } = worker();
    handlers.fetch({ request: new Request(new URL(path, 'https://myabiflow.de')), respondWith() { assert.fail('Private/dynamic request intercepted'); } });
  });
}
test('authenticated static request is not cached', () => {
  const { handlers } = worker();
  handlers.fetch({ request: new Request('https://myabiflow.de/index.html', { headers: { 'X-Access-Token': 'synthetic' } }), respondWith() { assert.fail('Authenticated request intercepted'); } });
});
for (const control of ['', 'no-store']) {
  test('public static file respects Cache-Control ' + control, async () => {
    const { handlers, writes } = worker(control);
    let result;
    handlers.fetch({ request: new Request('https://myabiflow.de/shared.js'), respondWith(promise) { result = promise; } });
    assert.equal((await result).status, 200);
    await Promise.resolve();
    assert.equal(writes.length, control ? 0 : 1);
  });
}
