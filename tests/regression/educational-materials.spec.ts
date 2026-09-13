import { expect, test } from '@playwright/test';

const image = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
const prompt = 'Create an editorial cartoon in a supermarket. Show conflicting expectations.';
const subjects = ['politik', 'pug-abitur', 'geschichte', 'geschichte-abitur', 'ethik', 'ethik-abitur', 'religion', 'religion-abitur', 'katholisch', 'katholisch-abitur', 'kunst', 'kunst-abitur', 'geographie', 'geographie-abitur', 'materialgestuetzt-argumentierend', 'materialgestuetzt-informierend'];
const sciences = ['biologie', 'chemie', 'physik', 'informatik', 'sport'].flatMap(path => [path, path + '-abitur']);

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    for (const [key, value] of Object.entries({ access: '1', free_access: '1', student_name: 'Materialtest', student_id: 'materialtest', access_token: 'test-token' })) sessionStorage.setItem(key, value);
    localStorage.setItem('myabiflow_tracking_consent', 'rejected');
  });
  await page.route('**/api/**', route => route.fulfill({ json: { status: 'active', plan: 'monthly' } }));
});

async function render(page: any, path: string, type = ' Karikatur\u200B ', multi = false) {
  await page.goto(`/${path}.html`);
  await page.evaluate(({ path, type, prompt, multi }: any) => {
    const material = { type, title: 'Karikatur: Erwartungen', content: prompt, source: 'KI-generiertes Testmaterial' };
    let data: any = { task_instruction: 'Analysieren Sie das Material.', task_instruction_a: 'Analysieren Sie das Material.', task_instruction_b: 'Beurteilen Sie die Aussage.', primary_text: 'Eine Textquelle.', materials: [material], zusatz_materialien: [material] };
    if (multi) data = { tasks: [{ task_instruction: data.task_instruction, primary_text: data.primary_text, zusatz_materialien: [material] }] };
    if (path === 'writing') data = { headline: 'Cartoon test', article_text: 'A source text.', task_3_1: 'Comment on the cartoon.', cartoon_prompt: prompt, cartoon_bubbles: [{ position: 'top-left', text: 'Everything must be cheap!' }] };
    if (/^(biologie|chemie|physik|informatik|sport)/.test(path)) {
      data.material = [material];
      data.teilaufgaben = [{ id: '1', text: 'Analysieren Sie das Material.', be: 5 }];
      data.aufgaben = [{ titel: 'Testaufgabe', sachgebiet: '', materialien: [material], teilaufgaben: data.teilaufgaben, gesamt_be: 5 }];
      if (path.endsWith('-abitur')) {
        if (path !== 'sport-abitur') data.aufgaben.push(...[1, 2].map(i => ({ titel: 'Weitere Aufgabe ' + i, materialien: [], teilaufgaben: data.teilaufgaben, gesamt_be: 5 })));
        (window as any).eval('CONFIG.selectedAufgaben = new Set(' + JSON.stringify(data.aufgaben.map((_: any, i: number) => i)) + ')');
      }
    }
    (window as any).eval('CONFIG.storedData=' + JSON.stringify(data));
    if (path === 'writing') {
      (document.getElementById('doTask31') as HTMLInputElement).checked = true;
      (window as any).renderExam(data);
    } else (window as any).renderTask(data);
    (window as any).nav('task');
  }, { path, type, prompt, multi });
}

for (const path of [...subjects, ...sciences, 'writing']) {
  const task = path === 'writing' ? '#task' : '#sec-task';
  const write = path === 'writing' ? '#write' : '#sec-write';
  test(`${path}: eine Karikatur, beide Ansichten, Wiederholen`, async ({ page }) => {
    let requests = 0;
    await page.route('**/api/generate-image', route => {
      requests++;
      expect(route.request().postDataJSON().style).toBe(path === 'writing' ? 'cartoon' : 'karikatur');
      return route.fulfill({ json: { url: image } });
    });
    await render(page, path);
    await expect(page.locator(`${task} [data-image-state=ready]`)).toHaveCount(1);
    await expect(page.locator(task)).not.toContainText(prompt);
    await page.evaluate(() => (window as any).nav('write'));
    await expect(page.locator(write)).toHaveClass(/active/);
    await expect(page.locator(`${write} [data-image-state=ready]`)).toHaveCount(1);
    await expect(page.locator(write)).not.toContainText(prompt);
    if (path === 'writing') await expect(page.locator(`${write} .cartoon-bubble`)).toHaveText('Everything must be cheap!');
    expect(requests).toBe(1);
    // Referenzbereiche dürfen eingeklappt sein; der Klick prüft ihren delegierten Handler.
    await page.locator(`${write} .edu-img-regen-btn`).evaluate((button: HTMLButtonElement) => button.click());
    await expect.poll(() => requests).toBe(2);
    await expect(page.locator(`${write} [data-image-state=ready]`)).toHaveCount(1);
    const ids = await page.locator('[id^="img-"]').evaluateAll(els => els.map(el => el.id));
    expect(ids.length).toBe(new Set(ids).size);
  });

  test(`${path}: Bildfehler blockiert Schreiben und PDF, erneutes Laden hilft`, async ({ page }) => {
    await page.route('**/api/generate-image', route => route.fulfill({ json: {} }));
    await render(page, path, 'karikatur');
    await expect(page.locator(`${task} [data-image-state=error]`)).toHaveCount(1);
    await page.evaluate(() => {
      (window as any).__printCalled = false;
      (window as any).printElement = () => { (window as any).__printCalled = true; };
      (window as any).exportTaskPDF('both');
      (window as any).nav('write');
    });
    expect(await page.evaluate(() => (window as any).__printCalled)).toBe(false);
    await expect(page.locator(task)).toHaveClass(/active/);
    await page.route('**/api/generate-image', route => route.fulfill({ json: { url: image } }));
    await page.locator(`${task} details`).evaluateAll(els => els.forEach(el => { (el as HTMLDetailsElement).open = true; }));
    await page.locator(`${task} .edu-img-regen-btn`).click();
    await expect(page.locator(`${task} [data-image-state=ready]`)).toHaveCount(1);
    await page.evaluate(() => (window as any).nav('write'));
    await expect(page.locator(write)).toHaveClass(/active/);
    await expect(page.locator(`${write} [data-image-state=ready]`)).toHaveCount(1);
  });
}

test('Geschichte: Mehr-Aufgaben-Format ohne doppelte Bild-IDs', async ({ page }) => {
  await page.route('**/api/generate-image', route => route.fulfill({ json: { url: image } }));
  await render(page, 'geschichte', 'karikatur', true);
  await expect(page.locator('#sec-task [data-image-state=ready]')).toHaveCount(1);
  await page.evaluate(() => (window as any).nav('write'));
  await expect(page.locator('#sec-write [data-image-state=ready]')).toHaveCount(1);
  await expect(page.locator('[id="img-zm-0-0"]')).toHaveCount(1);
});

test('Defekte Bilddatei wird erkannt', async ({ page }) => {
  await page.route('**/api/generate-image', route => route.fulfill({ json: { url: 'https://example.test/broken.png' } }));
  await page.route('https://example.test/**', route => route.fulfill({ status: 404, body: '' }));
  await render(page, 'writing');
  await expect(page.locator('#task [data-image-state=error]')).toHaveCount(1);
  await page.evaluate(() => (window as any).nav('write'));
  await expect(page.locator('#task')).toHaveClass(/active/);
});

test('Neue Aufgabe ignoriert verspätete Bildantwort der vorherigen Aufgabe', async ({ page }) => {
  let release: () => void = () => {};
  const waiting = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/generate-image', async route => { await waiting; await route.fulfill({ json: { url: image } }); });
  await render(page, 'politik');
  await page.evaluate(() => {
    const data = { task_instruction: 'Neue Aufgabe', materials: [{ type: 'text', title: 'Text', content: 'Neues Material' }] };
    (window as any).eval('CONFIG.storedData=' + JSON.stringify(data));
    (window as any).renderTask(data);
  });
  release();
  await page.waitForTimeout(200);
  await expect(page.locator('#materialsContainer')).toContainText('Neues Material');
  await expect(page.locator('#writeMaterialsRef')).toContainText('Neues Material');
  await expect(page.locator('#writeMaterialsRef img')).toHaveCount(0);
});

test('Gespeicherte alte Bildprompts überschreiben keine reparierte Karikatur', async ({ page }) => {
  await page.route('**/api/generate-image', route => route.fulfill({ json: { url: image } }));
  await render(page, 'politik');
  await page.evaluate(prompt => {
    (window as any).restoreEducationalHighlights('materialsContainer', '<div class="material-card"><div class="material-body">' + prompt + '</div></div>');
  }, prompt);
  await expect(page.locator('#sec-task [data-image-state=ready]')).toHaveCount(1);
  await expect(page.locator('#materialsContainer')).not.toContainText(prompt);
});

test('Nicht ausgewählte Abituraufgabe mit Bildfehler blockiert nicht', async ({ page }) => {
  await page.route('**/api/generate-image', route => route.fulfill({ json: route.request().postDataJSON().prompt.includes('unselected') ? {} : { url: image } }));
  await render(page, 'biologie-abitur');
  await page.evaluate(() => {
    (window as any).eval('CONFIG.storedData.aufgaben.push({titel:"Nicht gewählt",materialien:[{type:"bild",text:"unselected image",titel:"Nicht gewählt"}],teilaufgaben:[]}); renderTask(CONFIG.storedData)');
  });
  await expect(page.locator('#sec-task [data-image-state=error]')).toHaveCount(1);
  await page.evaluate(() => (window as any).nav('write'));
  await expect(page.locator('#sec-write')).toHaveClass(/active/);
  await expect(page.locator('#writeImageMaterials [data-image-state=ready]')).toHaveCount(1);
  await expect(page.locator('#writeImageMaterials')).not.toContainText('Nicht gewählt');
});

test('Englisch: neue Aufgabe ohne Cartoon übernimmt kein altes Bild', async ({ page }) => {
  let release: () => void = () => {};
  const pending = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/generate-image', async route => { await pending; await route.fulfill({ json: { url: image } }); });
  await render(page, 'writing');
  await page.evaluate(() => {
    const data = { headline: 'Neue Aufgabe', article_text: 'Neuer Text', task_3_1: 'Discuss.' };
    (window as any).eval('CONFIG.storedData=' + JSON.stringify(data));
    (window as any).renderExam(data);
  });
  release();
  await page.waitForTimeout(150);
  await expect(page.locator('#cartoonContainer img')).toHaveCount(0);
  await expect(page.locator('#writeCartoonPreview img')).toHaveCount(0);
  await page.evaluate(() => (window as any).nav('write'));
  await expect(page.locator('#write')).toHaveClass(/active/);
});

test('Schreibreferenz schneidet die Karikatur nicht mit einer festen Höhe ab', async ({ page }) => {
  await page.route('**/api/generate-image', route => route.fulfill({ json: { url: image } }));
  await render(page, 'politik');
  await expect(page.locator('#sec-task [data-image-state=ready]')).toHaveCount(1);
  await page.evaluate(() => (window as any).nav('write'));
  const style = await page.locator('#writeMaterialsRef').evaluate(el => getComputedStyle(el.parentElement!).maxHeight);
  expect(style).toBe('none');
});

test('Englische Schreibansicht passt auf ein schmales Handy', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 900 });
  await page.route('**/api/generate-image', route => route.fulfill({ json: { url: image } }));
  await render(page, 'writing');
  await expect(page.locator('#task [data-image-state=ready]')).toHaveCount(1);
  await page.evaluate(() => (window as any).nav('write'));
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
});
