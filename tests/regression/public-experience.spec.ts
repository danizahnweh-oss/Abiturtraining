import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.route('**/api/**', route => route.fulfill({ json: { status: 'none' } }));
});

test('Schüler-CTA führt ohne Rollenwahl und Wizard zur Fachwahl', async ({ page }) => {
  await page.goto('/landing.html');
  await page.locator('#heroPrimaryCta').click();
  await expect(page.locator('#subject-screen')).toBeVisible();
  await expect(page.locator('#role-screen')).toBeHidden();
  await expect(page.locator('#splash')).toBeHidden();
  await expect(page.locator('#abiWizardOverlay')).toBeHidden();
  await expect(page.locator('#greetingText')).toHaveText('Wähle dein Fach');
  await expect(page.locator('.subject-countdown:visible')).toHaveCount(0);
  expect(await page.evaluate(() => sessionStorage.getItem('access'))).toBeNull();
  await page.reload();
  await expect(page.locator('#subject-screen')).toBeVisible();
});

test('Expliziter Login-Einstieg zeigt Anmeldung statt Rollenwahl', async ({ page }) => {
  await page.goto('/index.html?login=1');
  await expect(page.locator('#login-screen')).toBeVisible();
  await expect(page.locator('#role-screen')).toBeHidden();
  await expect(page.locator('#studentName')).toBeFocused();
});

test('Allgemeiner Einstieg behält die Rollenwahl', async ({ page }) => {
  await page.goto('/index.html?app=1');
  await expect(page.locator('#role-screen')).toBeVisible();
});

test('Preise und Schulcode getrennt, mit Tastatur und Browser-Zurück', async ({ page }) => {
  await page.goto('/abo.html');
  await expect(page.locator('#privateOffer')).toBeHidden();
  await expect(page.locator('#licenseSection')).toBeHidden();
  await page.locator('#decisionPrivat').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#privateOffer')).toBeVisible();
  await expect(page.locator('#pricingHeading')).toBeFocused();
  await expect(page.locator('#licenseSection')).toBeHidden();
  await page.locator('#decisionCode').click();
  await expect(page.locator('#licenseInput')).toBeFocused();
  await expect(page.locator('#privateOffer')).toBeHidden();
  await expect(page.locator('#stickyCta')).not.toHaveClass(/visible/);
  await page.goBack();
  await expect(page.locator('#privateOffer')).toBeVisible();
  await expect(page.locator('#licenseSection')).toBeHidden();
});

test('Alle Tarife erklären Gesamtpreis, Verlängerung und richtigen Folgeschritt', async ({ page }) => {
  await page.goto('/abo.html#pricingSection');
  for (const [plan, price, label] of [
    ['monthly', '15 Euro pro Monat', 'Weiter zum Monatsabo'],
    ['6months', '70 Euro einmalig', 'Weiter zum 6-Monats-Paket'],
    ['12months', '120 Euro einmalig', 'Weiter zum 12-Monats-Paket'],
    ['24months', '180 Euro einmalig', 'Weiter zum 24-Monats-Paket'],
  ]) {
    await page.locator(`[data-plan="${plan}"]`).click();
    await expect(page.locator('#planSummary')).toContainText(price);
    await expect(page.locator('#checkoutBtn')).toContainText(label);
    await expect(page.locator('.sticky-cta-btn')).toContainText(label);
    await expect(page.locator('#planSummary')).toContainText(plan === 'monthly' ? 'Automatische monatliche Verlängerung' : 'Endet automatisch');
  }
  await page.locator('[data-plan="24months"]').focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('[data-plan="monthly"]')).toBeFocused();
  await expect(page.locator('[data-plan="monthly"]')).toHaveAttribute('aria-checked', 'true');
});

test('Fehler beim Checkout bewahrt Auswahl und richtigen Buttontext', async ({ page }) => {
  await page.addInitScript(() => {
    sessionStorage.setItem('student_id', 'test');
    sessionStorage.setItem('access_token', 'test');
  });
  let selected = '';
  await page.route('**/api/stripe/create-checkout', route => {
    selected = route.request().postDataJSON().plan;
    return route.fulfill({ status: 503, json: { error: 'Test: Zahlung momentan nicht erreichbar.' } });
  });
  await page.goto('/abo.html#pricingSection');
  await page.locator('[data-plan="6months"]').click();
  await page.locator('#checkoutBtn').click();
  await expect(page.locator('#checkoutBtn')).toBeEnabled();
  await expect(page.locator('#checkoutBtn')).toContainText('6-Monats-Paket');
  expect(selected).toBe('6months');
});

test('Direkter Schulcode-Link und aktive Zugänge behalten ihre Ansicht', async ({ page }) => {
  await page.goto('/abo.html#licenseSection');
  await expect(page.locator('#licenseInput')).toBeVisible();
  await expect(page.locator('#privateOffer')).toBeHidden();
  await page.addInitScript(() => {
    sessionStorage.setItem('student_id', 'test');
    sessionStorage.setItem('access_token', 'test');
  });
  await page.route('**/api/stripe/subscription-status', route => route.fulfill({ json: { status: 'active', plan: '12months' } }));
  await page.goto('/abo.html#pricingSection');
  await page.reload(); // Ein reiner Ankerwechsel führt das Init-Skript nicht erneut aus.
  await expect(page.locator('#activeSubCard')).toBeVisible();
  await expect(page.locator('#pricingSection')).toBeHidden();
  await expect(page.locator('#pageTitle')).toHaveText('Dein Zugang');
});

test('Demo steht vor Testimonials und kennzeichnet Grenzen', async ({ page }) => {
  await page.goto('/landing.html');
  const preview = await page.locator('.lp-feedback-preview').boundingBox();
  const quotes = await page.locator('.lp-experiences').boundingBox();
  expect(preview!.y).toBeLessThan(quotes!.y);
  await expect(page.locator('.lp-feedback-preview')).toContainText('KI-Feedback kann Fehler enthalten');
  await page.goto('/demo.html');
  await expect(page.locator('.dm-hero')).toContainText('kein Nachweis unabhängig geprüfter Bewertungsqualität');
});

for (const width of [320, 390, 834, 1194]) {
  for (const path of ['/landing.html', '/index.html?app=1&role=student', '/abo.html#pricingSection', '/abo.html#licenseSection', '/demo.html', '/schulen.html']) {
    test(`${width}px: ${path} ohne Überlauf in beiden Farbschemata`, async ({ page }) => {
      await page.setViewportSize({ width, height: width === 1194 ? 834 : 900 });
      const errors: string[] = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(path);
      await page.evaluate(() => document.fonts.ready);
      for (const theme of ['light', 'dark']) {
        await page.evaluate(theme => document.documentElement.setAttribute('data-theme', theme), theme);
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width + 1);
      }
      expect(errors).toEqual([]);
    });
  }
}
