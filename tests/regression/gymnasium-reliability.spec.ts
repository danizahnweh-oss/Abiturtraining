import { expect, test } from '@playwright/test';

const image = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
const prompt = 'Create an editorial cartoon in a supermarket.';

test.beforeEach(async ({ page }) => {
  await page.route('**/api/**', route => route.fulfill({ json: { status: 'active', plan: 'monthly' } }));
});

for (const path of ['abo', 'profil', 'dashboard', 'lehrer', 'meine-korrekturen']) {
  test(`${path}: keine Skriptfehler`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`/${path}.html`);
    await page.waitForTimeout(400);
    expect(errors).toEqual([]);
  });
}

for (const path of ['wr', 'wr-abitur']) {
  const source = path === 'wr' ? '#materialienContainer' : '#materialien1Container';
  const mirror = path === 'wr' ? '#writeMaterialRef' : '#writeMaterialRef1';
  async function render(page: any, typ = ' Karikatur\u200B ') {
    await page.addInitScript(() => {
      sessionStorage.setItem('access', '1');
      sessionStorage.setItem('free_access', '1');
      sessionStorage.setItem('student_name', 'regressionstest');
      sessionStorage.setItem('access_token', 'regressionstest-token');
      sessionStorage.setItem('student_id', 'regressionstest');
    });
    await page.goto(`/${path}.html`);
    await page.evaluate(({ prompt, typ }: any) => {
      const data = { _niveau: 'gA', task_instruction: 'Analysieren Sie M1.', aufgabenbloecke: [], materialien: [{ nr: 'M1', typ, titel: 'Karikatur', inhalt: prompt }] };
      (window as any).eval('CONFIG.storedData = ' + JSON.stringify(data));
      (window as any).renderTask(data);
      (window as any).nav('task');
    }, { prompt, typ });
  }
  test(`${path}: ein Bild, beide Ansichten und erneutes Generieren`, async ({ page }) => {
    let requests = 0;
    await page.route('**/api/generate-image', route => {
      requests++;
      expect(route.request().postDataJSON().style).toBe('karikatur');
      return route.fulfill({ json: { url: image } });
    });
    await render(page);
    await expect(page.locator(`${source} [data-image-state=ready]`)).toHaveCount(1);
    await expect(page.locator(source)).not.toContainText(prompt);
    await page.evaluate(() => (window as any).nav('write'));
    if (path === 'wr') await page.getByText('Aufgabe & Materialien anzeigen', { exact: false }).click();
    await expect(page.locator(`${mirror} img`)).toBeVisible();
    expect(requests).toBe(1);
    const ids = await page.locator('[id]').evaluateAll(els => els.map(el => el.id));
    expect(ids.filter(id => id.startsWith('img-')).length).toBe(new Set(ids.filter(id => id.startsWith('img-'))).size);
    await page.locator(`${mirror} .edu-img-regen-btn`).click();
    await expect.poll(() => requests).toBe(2);
    await expect(page.locator(`${mirror} [data-image-state=ready]`)).toHaveCount(1);
  });
  test(`${path}: fehlerhafte Bildantwort blockiert Schreiben und lässt sich wiederholen`, async ({ page }) => {
    let failedRequests = 0;
    await page.route('**/api/generate-image', route => { failedRequests++; return route.fulfill({ json: {} }); });
    await render(page, 'karikatur');
    await expect(page.locator(`${source} [data-image-state=error]`)).toHaveCount(1);
    expect(failedRequests).toBe(2);
    await page.evaluate(() => (window as any).nav('write'));
    await expect(page.locator('#sec-task')).toHaveClass(/active/);
    await page.route('**/api/generate-image', route => route.fulfill({ json: { url: image } }));
    await page.locator(`${source} .edu-img-regen-btn`).click();
    await expect(page.locator(`${source} [data-image-state=ready]`)).toHaveCount(1);
    await page.evaluate(() => (window as any).nav('write'));
    await expect(page.locator('#sec-write')).toHaveClass(/active/);
  });
  test(`${path}: defekte Bilddatei wird als Fehler erkannt`, async ({ page }) => {
    await page.route('**/api/generate-image', route => route.fulfill({ json: { url: 'https://example.test/broken.png' } }));
    await page.route('https://example.test/broken.png', route => route.fulfill({ status: 404, body: '' }));
    await render(page);
    await expect(page.locator(`${source} [data-image-state=error]`)).toHaveCount(1);
  });
}

test('WR-Abitur: beide Entwürfe zeitnah sichern und wiederherstellen', async ({ page }) => {
  await page.addInitScript(() => {
    sessionStorage.setItem('access', '1');
    sessionStorage.setItem('student_name', 'regressionstest');
    sessionStorage.setItem('free_access', '1');
  });
  await page.goto('/wr-abitur.html');
  await page.evaluate(() => {
    const data = { _niveau: 'eA', materialien: [], aufgabenbloecke: [] };
    (window as any).eval('CONFIG.storedData = ' + JSON.stringify(data));
    (window as any).renderTask(data);
    (window as any).nav('write');
  });
  await page.locator('#studentText1').fill('Mein erster Entwurf');
  await page.locator('#studentText2').fill('Mein zweiter Entwurf');
  await expect(page.locator('#draftSaveStatus')).toContainText('gespeichert');
  expect(await page.evaluate(() => {
    const event = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);
    return event.defaultPrevented;
  })).toBe(true);
  await page.reload();
  await expect(page.locator('#studentText1')).toHaveValue('Mein erster Entwurf');
  await expect(page.locator('#studentText2')).toHaveValue('Mein zweiter Entwurf');
});

test('Gymnasium: nicht verwendete Materialien werden vor der Anzeige abgelehnt', async ({ page }) => {
  await page.goto('/chemie.html');
  expect(await page.evaluate(() => {
    try {
      (window as any).gymValidateTaskPoints({
        task_instruction: 'Bearbeiten Sie die Aufgabe mithilfe von M1.',
        materialien: [{ nr: 'M1', inhalt: 'Text' }, { nr: 'M2', inhalt: 'Ungenutzter Text' }]
      });
      return false;
    } catch (error) {
      return String(error).includes('M2');
    }
  })).toBe(true);
});

test('Anmeldedialog: Fokus bleibt im Dialog, Escape kehrt zum Auslöser zurück', async ({ page }) => {
  await page.goto('/eroerterung.html');
  // Safari fokussiert Schaltflächen bei Mausklick nicht automatisch.
  // Der Tastaturtest startet deshalb mit einer echten Tastaturaktivierung.
  await page.locator('#generateBtn').focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog', { name: 'Anmeldung erforderlich' })).toBeVisible();
  await expect(page.locator('#slModalName')).toBeFocused();
  await page.getByRole('button', { name: 'Abbrechen', exact: true }).focus();
  await page.keyboard.press('Tab');
  await expect(page.locator('#slModeLogin')).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(page.getByRole('button', { name: 'Abbrechen', exact: true })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Anmeldung erforderlich' })).toBeHidden();
  await expect(page.locator('#generateBtn')).toBeFocused();
});

for (const path of ['wr', 'landing', 'agb', 'barrierefreiheit', 'dsfa', 'tom']) {
  test(`${path}: kein horizontaler Überlauf auf kleinen Handys`, async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 740 });
    await page.goto(`/${path}.html`);
    await page.waitForTimeout(500);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(321);
    if (path === 'landing') {
      const box = await page.locator('#navPrimaryCta').boundingBox();
      expect(box!.x + box!.width).toBeLessThanOrEqual(320);
      const logo = await page.locator('.lp-logo').boundingBox();
      expect(logo!.y).toBeGreaterThanOrEqual(0);
    }
  });
}

test('Einstiegslinks führen zu bestehenden Angeboten', async ({ page, request }) => {
  for (const [path, selector] of [['landing', '.lp-cta-sub + *'], ['englisch-mediation-bayern', '.hero-cta']]) {
    await page.goto(`/${path}.html`);
    const link = path === 'landing' ? page.getByRole('link', { name: 'Kolloquium ausprobieren' }) : page.locator(selector).first();
    const href = await link.getAttribute('href');
    expect((await request.get(href!)).status()).toBe(200);
  }
});
