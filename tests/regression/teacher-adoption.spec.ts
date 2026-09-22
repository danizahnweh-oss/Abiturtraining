import { test, expect, Page } from '@playwright/test';

const task = {
  headline: 'Workshop test',
  article_text: 'This is the complete source text for a classroom task.',
  task_instruction: 'Explain the main arguments in an email.',
  task_1: 'Outline the arguments.',
  task_2: 'Analyse the language.',
  task_3_1: 'Discuss the statement.',
  task_3_2: 'Write a letter.'
};

async function openTeacherTask(page: Page, type: string) {
  let saved: any;
  await page.addInitScript(() => localStorage.setItem('myabiflow_tracking_consent', 'rejected'));
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    const body = route.request().postDataJSON() || {};
    let json: any = { codes: [], results: [], students: [], tasks: [], credits_total: 20, credits_remaining: 20 };
    if (path === '/api/teacher-auth-login') json = { token: 'teacher-test-token', teacher_id: 'test', teacher_name: 'Testlehrkraft', subjects: ['english'] };
    if (path === '/api/teacher-profile') json = { name: 'Testlehrkraft', subjects: ['english'] };
    if (path === '/api/generate') {
      expect(route.request().headers()['x-teacher-auth-token']).toBe('teacher-test-token');
      json = { ...task };
    }
    if (path === '/api/teacher-tasks' && body.action === 'save') { saved = body; json = { share_code: 'TEST42' }; }
    await route.fulfill({ json });
  });
  await page.goto('/lehrer.html');
  await page.locator('#teacherName').fill('Testlehrkraft');
  await page.locator('#teacherPw').fill('Test-password');
  await page.locator('#authBtn').click();
  await page.getByRole('tab', { name: 'Aufgaben', exact: true }).click();
  await page.locator('#taskSubjectSelect').selectOption('english');
  await page.locator('#taskTypeSelect').selectOption(type);
  await page.locator('#btnOpenIframe').click();
  await expect(page.frameLocator('#taskIframe').locator('#generateBtn')).toBeVisible();
  return () => saved;
}

for (const type of ['mediation', 'writing']) {
  test(`${type}: generate, adopt from parent, save all task data, and reset`, async ({ page }) => {
    const saved = await openTeacherTask(page, type);
    const adopt = page.locator('#btnAdoptTask');
    await expect(adopt).toBeVisible();
    await expect(adopt).toBeDisabled();
    await page.frameLocator('#taskIframe').locator('#generateBtn').click();
    await expect(adopt).toBeEnabled();
    await adopt.click();
    await expect(page.locator('#taskStep3')).toBeVisible();
    await page.locator('#taskTitleInput').fill('Workshop example');
    await page.locator('#taskSaveBtn').click();
    await expect(page.locator('#taskShareCode')).toHaveText('TEST42');
    expect(saved()).toMatchObject({ subject: type, subject_group: 'english', title: 'Workshop example', task_data: task });
    await page.getByRole('button', { name: 'Weitere Aufgabe', exact: true }).click();
    await page.locator('#btnOpenIframe').click();
    await expect(adopt).toBeDisabled();
  });
}

test('same-origin messages from an unrelated window cannot supply tasks or readiness', async ({ page }) => {
  await openTeacherTask(page, 'mediation');
  await page.evaluate(() => {
    window.dispatchEvent(new MessageEvent('message', { origin: location.origin, source: window,
      data: { type: 'teacher-task-state', ready: true, message: 'Ready' } }));
    window.dispatchEvent(new MessageEvent('message', { origin: location.origin, source: window,
      data: { type: 'task-generated', data: { task_instruction: 'Unexpected task' } } }));
  });
  await expect(page.locator('#btnAdoptTask')).toBeDisabled();
  await expect(page.locator('#taskStep3')).toBeHidden();
  await expect(page.locator('#taskStep2')).toBeVisible();
});

test('required images block adoption until ready and keep tablet controls reachable', async ({ page }) => {
  await page.setViewportSize({ width: 820, height: 1180 });
  await openTeacherTask(page, 'mediation');
  await page.frameLocator('#taskIframe').locator('#generateBtn').click();
  const adopt = page.locator('#btnAdoptTask');
  await expect(adopt).toBeEnabled();
  const frame = page.frames().find(frame => frame.url().includes('/mediation.html'))!;
  await frame.evaluate(() => {
    const marker = document.createElement('div');
    marker.id = 'test-required-image';
    marker.dataset.requiredMaterial = 'true';
    marker.dataset.imageState = 'loading';
    document.getElementById('task')!.appendChild(marker);
  });
  await expect(adopt).toBeDisabled();
  await expect(page.locator('#taskAdoptStatus')).toContainText('Bilder werden noch erstellt');
  await frame.locator('#test-required-image').evaluate(el => (el as HTMLElement).dataset.imageState = 'error');
  await expect(page.locator('#taskAdoptStatus')).toContainText('Bild fehlt');
  await expect(adopt).toBeDisabled();
  await frame.locator('#test-required-image').evaluate(el => (el as HTMLElement).dataset.imageState = 'ready');
  await expect(adopt).toBeEnabled();
  await adopt.scrollIntoViewIfNeeded();
  expect(await adopt.boundingBox()).toMatchObject({ height: expect.any(Number) });
  const bounds = await adopt.boundingBox();
  expect(bounds!.height).toBeGreaterThanOrEqual(44);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(820);
  await page.screenshot({ path: '/private/tmp/teacher-adoption-tablet.png', fullPage: true });
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
  await page.screenshot({ path: '/private/tmp/teacher-adoption-tablet-dark.png', fullPage: true });
  await adopt.click();
  await expect(page.locator('#taskTitleInput')).toBeFocused();
});

test('a second generation blocks adoption and restores the previous task after a failure', async ({ page }) => {
  await openTeacherTask(page, 'mediation');
  await page.frameLocator('#taskIframe').locator('#generateBtn').click();
  const adopt = page.locator('#btnAdoptTask');
  await expect(adopt).toBeEnabled();
  let release: () => void = () => {};
  const pending = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/generate', async route => {
    await pending;
    await route.fulfill({ status: 503, json: { error: 'Temporary test error' } });
  });
  const frame = page.frames().find(frame => frame.url().includes('/mediation.html'))!;
  await frame.evaluate(() => { (window as any).generateExam(); });
  await expect(adopt).toBeDisabled();
  release();
  await expect(adopt).toBeEnabled();
  await adopt.click();
  await expect(page.locator('#taskStep3')).toBeVisible();
});
