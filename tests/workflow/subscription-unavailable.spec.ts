import { test, expect, type Page } from '@playwright/test';

async function setup(page: Page, storedStatus = 'none') {
  await page.addInitScript(({ storedStatus }) => {
    sessionStorage.setItem('access', '1');
    sessionStorage.setItem('access_token', 'mock-token');
    sessionStorage.setItem('student_id', '42');
    sessionStorage.setItem('student_name', 'Testzugang');
    sessionStorage.setItem('subscription_status', storedStatus);
    if (storedStatus === 'active') sessionStorage.setItem('free_access', '1');
    localStorage.setItem('myabiflow_tracking_consent', 'rejected');
    localStorage.setItem('onboarding_done', '1');
  }, { storedStatus });
  await page.route('**/api/**', route => route.fulfill({ json: { success: true } }));
}

for (const scenario of [
  { name: '429 JSON', status: 429, json: { rate_limited: true }, headers: { 'Retry-After': '2' } },
  { name: '429 HTML', status: 429, body: '<html>Too many requests</html>', headers: { 'Retry-After': '2' } },
  { name: '503 HTML', status: 503, body: '<html>Service unavailable</html>' },
  { name: 'Netzwerkfehler', network: true },
  { name: 'Ungültige Erfolgsantwort', status: 200, json: { success: true } },
  { name: 'Unbekannter Status', status: 200, json: { status: 'future-unknown' } }
]) {
  test(`${scenario.name}: bleibt auf Fachseite, ohne Kaufaufforderung oder Generierung`, async ({ page }) => {
    await setup(page);
    let calls = 0;
    let generation = 0;
    await page.route('**/api/stripe/subscription-status', async route => {
      calls++;
      if ('network' in scenario) await route.abort();
      else await route.fulfill({ status: scenario.status, body: 'body' in scenario ? scenario.body : undefined,
        json: 'json' in scenario ? scenario.json : undefined, headers: 'headers' in scenario ? scenario.headers : undefined });
    });
    await page.route('**/api/generate', async route => { generation++; await route.fulfill({ json: {} }); });
    await page.goto('/mediation.html');
    await page.locator('#generateBtn').click();
    await expect(page.locator('.toast').last()).toContainText('Dein Zugang konnte gerade nicht geprüft werden');
    await expect(page).toHaveURL(/mediation\.html$/);
    expect(generation).toBe(0);
    await page.locator('#generateBtn').click();
    expect(calls).toBe(1); // Respects backoff rather than issuing a burst of checks.
    expect(await page.evaluate(() => sessionStorage.getItem('subscription_status'))).toBe('none');
  });
}

test('Bekannte Freigabe bleibt gespeichert, schaltet aber bei Statusausfall keine Anfrage frei', async ({ page }) => {
  await setup(page, 'active');
  let generation = 0;
  await page.route('**/api/stripe/subscription-status', route => route.fulfill({ status: 503, body: 'busy' }));
  await page.route('**/api/generate', async route => { generation++; await route.fulfill({ json: {} }); });
  await page.goto('/mediation.html');
  await page.locator('#generateBtn').click();
  await expect(page.locator('.toast').last()).toContainText('versuche es erneut');
  expect(generation).toBe(0);
  expect(await page.evaluate(() => [sessionStorage.getItem('subscription_status'), sessionStorage.getItem('free_access')])).toEqual(['active', '1']);
});

test('Parallele Statusprüfungen teilen dieselbe Anfrage', async ({ page }) => {
  await setup(page);
  let calls = 0;
  await page.route('**/api/stripe/subscription-status', async route => {
    calls++;
    await new Promise(resolve => setTimeout(resolve, 150));
    await route.fulfill({ json: { status: 'active', plan: 'free' } });
  });
  await page.goto('/mediation.html');
  const results = await page.evaluate(async () => Promise.all(Array.from({ length: 8 }, () => (window as any).checkSubscription())));
  expect(calls).toBe(1);
  expect(results.every(result => result.status === 'active')).toBe(true);
});

test('Nach Retry-After klappt dieselbe Aktion mit frisch bestätigtem Zugang', async ({ page }) => {
  await setup(page);
  let calls = 0;
  let generation = 0;
  await page.route('**/api/stripe/subscription-status', route => {
    calls++;
    return route.fulfill(calls === 1 ? { status: 429, headers: { 'Retry-After': '1' }, body: 'busy' } : { json: { status: 'active', plan: 'free' } });
  });
  await page.route('**/api/generate', async route => {
    generation++;
    await route.fulfill({ json: { headline: 'Test', article_text: 'Testtext', task_instruction: 'Write a mediation.' } });
  });
  await page.goto('/mediation.html');
  await page.locator('#generateBtn').click();
  await expect(page.locator('.toast').last()).toContainText('1 Sekunde');
  await page.waitForTimeout(1100);
  await page.locator('#generateBtn').click();
  await expect.poll(() => generation).toBe(1);
  expect(calls).toBe(2);
  await expect(page).toHaveURL(/mediation\.html$/);
});

test('401 führt zur Anmeldung und nicht zum Abo', async ({ page }) => {
  await setup(page, 'active');
  await page.route('**/api/stripe/subscription-status', route => route.fulfill({ status: 401, json: { error: 'Bitte erneut anmelden.' } }));
  await page.goto('/mediation.html');
  await page.locator('#generateBtn').click();
  await expect(page.locator('#sharedLoginOverlay')).toBeVisible();
  await expect(page).toHaveURL(/mediation\.html$/);
  expect(await page.evaluate(() => sessionStorage.getItem('access_token'))).toBeNull();
});

test('Abo-Seite zeigt bei Ausfall einen wiederholbaren Statushinweis statt Preisen', async ({ page }, testInfo) => {
  await setup(page, 'active');
  let calls = 0;
  await page.route('**/api/stripe/subscription-status', route => {
    calls++;
    return route.fulfill(calls === 1 ? { status: 429, headers: { 'Retry-After': '1' }, body: '<html>Busy</html>' } : { json: { status: 'active', plan: 'free', is_free_access: true } });
  });
  await page.goto('/abo.html#pricingSection');
  await expect(page.locator('#subscriptionStatusNotice')).toBeVisible();
  await expect(page.locator('#subscriptionStatusMessage')).toContainText('Dein Zugang konnte gerade nicht geprüft werden');
  await expect(page.locator('#pricingSection')).not.toHaveClass(/visible/);
  await expect(page.locator('#decisionWrap')).toBeHidden();
  await page.screenshot({ path: testInfo.outputPath('status-unavailable.png'), animations: 'disabled' });
  await expect(page.locator('#subscriptionStatusRetry')).toBeEnabled();
  await page.locator('#subscriptionStatusRetry').click();
  await expect(page.locator('#activeSubCard')).toBeVisible();
  await expect(page.locator('#subscriptionStatusNotice')).toBeHidden();
  expect(calls).toBe(2);
});

test('Verspätete 401 einer alten Anmeldung verändert die neue Anmeldung nicht', async ({ page }) => {
  await setup(page);
  let releaseOld!: () => void;
  const oldGate = new Promise<void>(resolve => { releaseOld = resolve; });
  await page.route('**/api/stripe/subscription-status', async route => {
    if (route.request().headers()['x-access-token'] === 'mock-token') {
      await oldGate;
      await route.fulfill({ status: 401, json: {} });
    } else {
      await route.fulfill({ json: { status: 'active', plan: 'free' } });
      releaseOld();
    }
  });
  await page.goto('/mediation.html');
  const results = await page.evaluate(async () => {
    const old = (window as any).checkSubscription();
    sessionStorage.setItem('access_token', 'new-token');
    const fresh = (window as any).checkSubscription();
    return Promise.all([old, fresh]);
  });
  expect(results.map(result => result.status)).toEqual(['unavailable', 'active']);
  expect(await page.evaluate(() => sessionStorage.getItem('access_token'))).toBe('new-token');
  expect(await page.evaluate(() => sessionStorage.getItem('subscription_status'))).toBe('active');
});

for (const stage of ['submit', 'poll', 'stream']) {
  test(`Korrektur ${stage}: vorübergehende Begrenzung startet keinen zweiten Auftrag`, async ({ page }) => {
    await setup(page, 'active');
    await page.route('**/api/stripe/subscription-status', route => route.fulfill({ json: { status: 'active', plan: 'free' } }));
    let submits = 0;
    await page.route('**/api/grade-submit', async route => {
      submits++;
      await route.fulfill({ status: 429, headers: { 'Retry-After': '12' }, body: 'busy' });
    });
    await page.route('**/api/grade-status/**', route => route.fulfill({ status: 503, headers: { 'Retry-After': '12' }, body: '<html>busy</html>' }));
    await page.route('**/api/grade-deutsch-stream', route => route.fulfill({ status: 429, headers: { 'Retry-After': '12' }, body: 'busy' }));
    await page.goto('/mediation.html');
    const result = await page.evaluate(async stage => {
      try {
        await (window as any).apiCallAsync('grade-deutsch', {}, stage === 'poll'
          ? { resumeJobId: 'existing-job', pollInterval: 1 }
          : { forcePolling: stage === 'submit' });
        return { message: 'unexpected success', retryable: false };
      } catch (error: any) { return { message: error.message, retryable: error.retryable }; }
    }, stage);
    expect(result.message).toContain('Bitte warte 12 Sekunden');
    expect(result.retryable).toBe(true);
    expect(submits).toBe(stage === 'submit' ? 1 : 0);
    await expect(page).toHaveURL(/mediation\.html$/);
  });
}

test('Nach erneuter Anmeldung wird die ursprünglich gewünschte Generierung fortgesetzt', async ({ page }) => {
  await setup(page, 'active');
  await page.route('**/api/stripe/subscription-status', route => route.fulfill(route.request().headers()['x-access-token'] === 'mock-token'
    ? { status: 401, json: {} } : { json: { status: 'active', plan: 'free' } }));
  await page.route('**/api/check-student', route => route.fulfill({ json: {
    success: true, token: 'renewed-token', student_id: '42', free_access: true, subscription_status: 'active'
  } }));
  let generation = 0;
  await page.route('**/api/generate', async route => {
    generation++;
    await route.fulfill({ json: { headline: 'Test', article_text: 'Testtext', task_instruction: 'Write a mediation.' } });
  });
  await page.goto('/mediation.html');
  await page.locator('#generateBtn').click();
  await expect(page.locator('#sharedLoginOverlay')).toBeVisible();
  await page.locator('#slModalName').fill('Testzugang');
  await page.locator('#slModalPw').fill('test-password');
  await page.locator('#slModalBtn').click();
  await expect.poll(() => generation).toBe(1);
  await expect(page.locator('#sharedLoginOverlay')).toBeHidden();
  await expect(page).toHaveURL(/mediation\.html$/);
});
