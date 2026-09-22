import { test, expect } from '@playwright/test';

test.use({ bypassCSP: false });

test('Mathe-Formeleditor lädt mit aktiver Sicherheitsrichtlinie', async ({ page }) => {
  await page.goto('/mathe.html');
  const response = await page.request.get('/vendor/mathlive.min.mjs');
  expect(response.status()).toBe(200);
  expect(response.headers()['content-type']).toMatch(/(?:application|text)\/javascript/);
  await page.evaluate(async () => {
    await (window as any).loadMathLive();
    await customElements.whenDefined('math-field');
  });
  expect(await page.evaluate(() => !!customElements.get('math-field'))).toBe(true);
});

test('Google-CCM-Endpunkt wird durch CSP zugelassen', async ({ page }) => {
  // Keine echten Tracking-Daten senden.
  await page.route('https://www.google.com/ccm/collect**', route => route.fulfill({
    status: 200, body: 'ok', headers: { 'access-control-allow-origin': '*' },
  }));
  await page.goto('/mathe.html');
  const result = await page.evaluate(async () => {
    const response = await fetch('https://www.google.com/ccm/collect?csp-test=1');
    return response.ok;
  });
  expect(result).toBe(true);
});

test('DOMPurify-Debug-Datei ist erreichbar und gültig', async ({ request }) => {
  const response = await request.get('/vendor/purify.min.js.map');
  expect(response.status()).toBe(200);
  const map = await response.json();
  expect(map.version).toBe(3);
  expect(map.file).toBe('purify.min.js');
  expect(Array.isArray(map.sources)).toBe(true);
  expect(typeof map.mappings).toBe('string');
});
