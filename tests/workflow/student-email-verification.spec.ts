import { test, expect, type Page } from '@playwright/test';

// All API calls are mocked: no accounts, emails, subscriptions or code redemptions.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('abi_wizard_done', '1');
    localStorage.setItem('onboarding_done', '1');
    localStorage.setItem('myabiflow_tracking_consent', 'rejected');
  });
  await page.route('**/api/**', route => route.fulfill({ json: { success: true, status: 'none' } }));
});

async function fillLogin(page: Page, register = false) {
  await page.goto('/index.html?login=1');
  if (register) await page.locator('#modeRegister').click();
  await page.locator('#studentName').fill('E-Mail Test');
  await page.locator('#personalPassword').fill('Testpasswort123');
  if (register) {
    await page.locator('#personalPasswordConfirm').fill('Testpasswort123');
    await page.locator('#registerEmail').fill('schueler@example.com');
  }
}

test('Registrierung fordert E-Mail-Bestätigung statt Anmeldung oder Schulcode-Eingabe', async ({ page }, testInfo) => {
  let codeRequests = 0;
  page.on('request', request => { if (request.url().includes('redeem-license')) codeRequests++; });
  await page.route('**/api/check-student', route => route.fulfill({ json: {
    success: true, verification_required: true, email: 'sc***@example.com'
  } }));
  await page.route('**/api/resend-verification', async route => {
    expect(route.request().postDataJSON()).toEqual({ student_name: 'E-Mail Test', personal_password: 'Testpasswort123' });
    await route.fulfill({ json: { success: true } });
  });
  await fillLogin(page, true);
  await page.evaluate(() => {
    sessionStorage.setItem('student_id', 'stale-student');
    sessionStorage.setItem('access_token', 'undefined');
    sessionStorage.setItem('free_access', '1');
    localStorage.setItem('teacher_code_mediation', 'TESTCODE');
  });
  await page.locator('#loginBtn').click();
  await expect(page.locator('#verifyPendingOverlay')).toBeVisible();
  await expect(page.locator('#verifyPendingOverlay')).toContainText('Bestätigungs-E-Mail');
  await expect(page.locator('#verifyPendingOverlay')).toContainText('sc***@example.com');
  await expect(page).toHaveURL(/index\.html\?login=1$/);
  expect(await page.evaluate(() => ['access', 'access_token', 'student_id', 'free_access'].map(key => sessionStorage.getItem(key)))).toEqual([null, null, null, null]);
  expect(await page.evaluate(() => localStorage.getItem('teacher_code_mediation'))).toBe('TESTCODE');
  expect(codeRequests).toBe(0);
  await page.screenshot({ path: testInfo.outputPath('email-confirmation-pending.png') });
  await page.locator('#verifyResendBtn').click();
  await expect(page.locator('#verifyPendingStatus')).toHaveText('Neue Bestätigungs-E-Mail wurde gesendet. Schau in dein Postfach.');
  await page.locator('#verifyCloseBtn').click();
  await expect(page.locator('#loginBtn')).toBeEnabled();
  await expect(page.locator('#loginBtn')).toHaveText('Anmelden');
  await expect(page.locator('#studentName')).toHaveValue('E-Mail Test');
});

test('Unbestätigter Login zeigt bei HTTP 403 ebenfalls den Bestätigungsdialog', async ({ page }) => {
  await page.route('**/api/check-student', route => route.fulfill({ status: 403, json: {
    success: false, verification_required: true, email: 'sc***@example.com', error: 'Bitte bestätige zuerst deine E-Mail-Adresse.'
  } }));
  await fillLogin(page);
  await page.locator('#loginBtn').click();
  await expect(page.locator('#verifyPendingOverlay')).toContainText('E-Mail-Bestätigung ausstehend');
  await expect(page.locator('#verifyPendingOverlay')).toContainText('noch nicht bestätigt');
  expect(await page.evaluate(() => sessionStorage.getItem('access_token'))).toBeNull();
  await page.locator('#verifyCloseBtn').click();
  await expect(page.locator('#loginBtn')).toBeEnabled();
});

test('Falsche Zugangsdaten werden nicht als ausstehende E-Mail-Bestätigung angezeigt', async ({ page }) => {
  await page.route('**/api/check-student', route => route.fulfill({ status: 401, json: {
    success: false, error: 'Name oder Passwort ist falsch.'
  } }));
  await fillLogin(page);
  await page.locator('#loginBtn').click();
  await expect(page.locator('#loginError')).toHaveText('Name oder Passwort ist falsch.');
  await expect(page.locator('#verifyPendingOverlay')).toHaveCount(0);
  expect(await page.evaluate(() => sessionStorage.getItem('access_token'))).toBeNull();
});

test('Bestätigter Schüler kann sich anmelden und anschließend einen Schulcode einlösen', async ({ page }) => {
  await page.route('**/api/check-student', route => route.fulfill({ json: {
    success: true, token: 'verified-test-token', student_id: 'verified-student', subscription_status: 'none'
  } }));
  await page.route('**/api/stripe/redeem-license', async route => {
    expect(route.request().headers()['x-access-token']).toBe('verified-test-token');
    expect(route.request().postDataJSON().license_code).toBe('SCHULCODE');
    await route.fulfill({ json: { success: true, free_access: true } });
  });
  await fillLogin(page);
  await page.locator('#loginBtn').click();
  await expect(page).toHaveURL(/abo\.html$/);
  await page.locator('#decisionCode').click();
  await page.locator('#licenseInput').fill('SCHULCODE');
  await page.locator('#redeemBtn').click();
  await expect(page.locator('.toast')).toContainText('Schulcode aktiviert!');
  expect(await page.evaluate(() => sessionStorage.getItem('free_access'))).toBe('1');
});

test('Ein tatsächlich abgelaufener Zugang bleibt beim Code-Einlösen ein Anmeldefehler', async ({ page }) => {
  await page.addInitScript(() => {
    sessionStorage.setItem('student_id', 'expired-student');
    sessionStorage.setItem('access_token', 'expired-test-token');
  });
  await page.route('**/api/stripe/redeem-license', route => route.fulfill({ status: 401, json: { error: 'Bitte erneut anmelden.' } }));
  await page.goto('/abo.html#licenseSection');
  await page.locator('#licenseInput').fill('SCHULCODE');
  await page.locator('#redeemBtn').click();
  await expect(page.locator('.toast')).toHaveText('Bitte erneut anmelden.');
  await expect(page.locator('#verifyPendingOverlay')).toHaveCount(0);
  expect(await page.evaluate(() => sessionStorage.getItem('free_access'))).toBeNull();
});
