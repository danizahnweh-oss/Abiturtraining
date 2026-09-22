import { test, expect, type Page } from '@playwright/test';
import path from 'node:path';

test.setTimeout(20_000);

const tourElements = '.tour-overlay, .tour-backdrop, .tour-spotlight, .tour-tooltip, .tour-welcome';

// Deliberately no onboarding flags and no disableTours fixture: these are first visits.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('myabiflow_tracking_consent', 'rejected');
  });
  await page.route('**/api/**', route => route.fulfill({ json: {
    success: true, results: [], messages: [], reminders: [],
    preferences: { exam_subjects: { written: [], oral: [], ea: '' }, hidden_subjects: [] }
  } }));
  await page.route('**/api/check-student', route => route.fulfill({ json: {
    success: true, token: 'mock-token', student_id: '42', free_access: true, subscription_status: 'active'
  } }));
  await page.route('**/api/stripe/subscription-status', route => route.fulfill({ json: {
    status: 'active', plan: 'free', is_free_access: true, subject_licenses: []
  } }));
  // FOS source pages receive the same shared assets that build-fos copies on deployment.
  for (const file of ['shared.js', 'tour.js', 'shared-v4.css', 'ai-tutor.js']) {
    await page.route(`**/fos/${file}*`, route => route.fulfill({ path: path.resolve(file) }));
  }
});

async function loginAndOpenWizard(page: Page) {
  await page.goto('/index.html?login=1');
  await page.locator('#studentName').fill('Testzugang');
  await page.locator('#personalPassword').fill('mock-password');
  await page.locator('#loginBtn').click();
  await expect(page.locator('#abiWizardOverlay')).toBeVisible();
}

async function openEnglishExercise(page: Page) {
  // The old tour started 500 ms after closing the wizard; wait beyond that trigger.
  await page.waitForTimeout(800);
  await expect(page.locator(tourElements)).toHaveCount(0);
  await page.locator('#subject-screen .subject-card.english:visible').click();
  await expect(page.locator('#examTypeOverlay')).toBeVisible();
  await page.locator('#examTypeOverlay').getByRole('button', { name: /Schriftliches Abitur/ }).click();
  await expect(page.locator('#module-screen-english')).toBeVisible();
  await page.locator('#module-screen-english a[href="mediation.html"]').click();
  await expect(page).toHaveURL(/\/mediation\.html$/);
  await expect(page.locator('#generateBtn')).toBeVisible();
}

test('Erste Anmeldung: Abifächer überspringen lässt die Fachauswahl und Übungslinks bedienbar', async ({ page }, testInfo) => {
  await loginAndOpenWizard(page);
  await page.getByRole('button', { name: 'Überspringen – später einrichten' }).click();
  await expect(page.locator('#abiWizardOverlay')).toBeHidden();
  await openEnglishExercise(page);
  await page.screenshot({ path: testInfo.outputPath('first-login-exercise-accessible.png'), animations: 'disabled' });
});

test('Erste Anmeldung: Abifächer vollständig einrichten startet keine blockierende Tour', async ({ page }) => {
  await loginAndOpenWizard(page);
  for (const subject of ['english', 'english', 'german', 'mathe', 'history', 'biologie']) {
    await page.locator(`#wizardSubjectGrid .subject-card.${subject}`).click();
  }
  await expect(page.locator('#wizardNextBtn')).toBeEnabled();
  await page.locator('#wizardNextBtn').click();
  await expect(page.locator('#wizardStep2')).toBeVisible();
  await page.getByRole('button', { name: "Los geht's!" }).click();
  await expect(page.locator('#abiWizardOverlay')).toBeHidden();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('maf_exam_subjects') || '{}'))).toEqual({
    written: ['english', 'german', 'mathe'], oral: ['history', 'biologie'], ea: 'english'
  });
  await openEnglishExercise(page);
});

for (const url of ['/mathe.html', '/mathe-abitur.html', '/fos/mathe-abitur.html', '/fos/mathe-abitur13.html']) {
  test(`Erstbesuch ${url}: Aufgabenwahl bleibt ohne Tour bedienbar`, async ({ page }) => {
    await page.goto(url);
    await page.waitForTimeout(1000);
    await expect(page.locator(tourElements)).toHaveCount(0);
    if (url === '/mathe-abitur.html') {
      await page.locator('#timerMinutes').click();
      await page.locator('#timerMinutes').fill('180');
      await expect(page.locator('#timerMinutes')).toHaveValue('180');
    } else {
      await page.locator('#modeUpload').click();
      await expect(page.locator('#setupUpload')).toBeVisible();
      await page.locator('#modeGenerate').click();
      await expect(page.locator('#setupGenerate')).toBeVisible();
    }
    await expect(page.locator('#generateBtn')).toBeEnabled();
  });
}

test('Kompatibilität mit alten Seiten entfernt nur Tourreste und erhält die Abifächerauswahl', async ({ page }) => {
  await loginAndOpenWizard(page);
  await page.evaluate(() => {
    const staleBackdrop = document.createElement('div');
    staleBackdrop.className = 'tour-backdrop';
    staleBackdrop.style.cssText = 'position:fixed;inset:0;z-index:999999;';
    document.body.appendChild(staleBackdrop);
  });
  await page.addScriptTag({ url: '/tour.js?compatibility-test=1' });
  await page.evaluate(() => (window as any).startTour({ force: true, storageKey: 'unused-tour', steps: [{ type: 'welcome', title: 'Alt', text: 'Alt' }] }));
  await expect(page.locator(tourElements)).toHaveCount(0);
  await expect(page.locator('#abiWizardOverlay')).toBeVisible();
  await page.getByRole('button', { name: 'Überspringen – später einrichten' }).click();
  await expect(page.locator('#abiWizardOverlay')).toBeHidden();
  await openEnglishExercise(page);
});
