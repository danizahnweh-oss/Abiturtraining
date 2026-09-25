import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.removeItem('myabiflow_tracking_consent');
    localStorage.removeItem('myabiflow_tracking_preferences');
    sessionStorage.removeItem('kolloquium_age_18_confirmed');
    sessionStorage.setItem('access', '1');
    sessionStorage.setItem('free_access', '1');
    sessionStorage.setItem('student_name', 'Datenschutztest');
    sessionStorage.setItem('student_id', 'privacy-test');
    sessionStorage.setItem('access_token', 'test-token');
  });
  await page.route('**/api/**', route => route.fulfill({ json: { success: true, status: 'active', unlimited: true } }));
});

test('Tracking-Zwecke sind getrennt und dauerhaft wieder erreichbar', async ({ page }) => {
  await page.goto('/index.html?app=1&role=student');
  await expect(page.getByRole('button', { name: 'Alle ablehnen', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Auswählen', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Datenschutz-Einstellungen' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel(/Analyse/i)).not.toBeChecked();
  await expect(dialog.getByLabel(/Werbung/)).not.toBeChecked();
  await dialog.getByLabel(/Analyse/i).check();
  await dialog.getByRole('button', { name: 'Auswahl speichern' }).click();
  await expect(page.getByRole('button', { name: 'Datenschutz-Einstellungen' })).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('myabiflow_tracking_preferences') || '{}')))
    .toMatchObject({ analytics: true, marketing: false });
});

test('Kolloquium ist ohne ausdrückliche Volljährigkeitsbestätigung gesperrt', async ({ page }) => {
  await page.goto('/abitur-kolloquium-trainer/dist/');
  const ageDialog = page.getByRole('alertdialog');
  await expect(ageDialog.getByRole('heading', { name: 'Kolloquium erst ab 18 Jahren' })).toBeVisible();
  await expect(ageDialog.getByText(/darf derzeit nicht von Minderjährigen genutzt werden/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Ich bin mindestens 18 Jahre alt' })).toBeVisible();
  await page.getByRole('button', { name: 'Ich bin mindestens 18 Jahre alt' }).click();
  await expect(ageDialog).toBeHidden();
  expect(await page.evaluate(() => sessionStorage.getItem('kolloquium_age_18_confirmed'))).toBe('1');
});

test('Datenschutzseiten und neue Steuerelemente haben auf Mobilgeräten keinen horizontalen Überlauf', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const path of ['/index.html?app=1&role=student', '/impressum.html#datenschutz', '/dsfa.html', '/tom.html', '/abitur-kolloquium-trainer/dist/']) {
    await page.goto(path, { waitUntil: 'networkidle' });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), path).toBe(true);
  }
});
