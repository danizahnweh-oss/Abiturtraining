import { test, expect, type Page } from '@playwright/test';

const subjectTasks = [
  { group: 'spanisch', name: 'Spanisch', type: 'spanisch-mediation', path: '/spanisch-mediation.html' },
  { group: 'spanisch', name: 'Spanisch', type: 'spanisch-writing', path: '/spanisch-schreiben.html' },
  { group: 'kunst', name: 'Kunst', type: 'kunst', path: '/kunst.html' },
  { group: 'kunst', name: 'Kunst', type: 'kunst-abitur', path: '/kunst-abitur.html' },
];

async function mockTeacher(page: Page, subjects = ['german']) {
  await page.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/teacher-auth-login') {
      return route.fulfill({ json: { success: true, token: 'test-token', teacher_id: 'test-teacher', teacher_name: 'Fachtest', subjects } });
    }
    if (path === '/api/teacher-results') {
      return route.fulfill({ json: {
        results: [...subjectTasks, { type: 'spanisch-listening' }].map((task, i) => ({
          id: String(i), student_name: 'Testschüler', type: task.type, total: 10, date: '2026-09-22T09:00:00Z',
        })), students: [{ name: 'Testschüler' }],
      } });
    }
    return route.fulfill({ json: { success: true, codes: [], tasks: [], credits_remaining: 20, credits_total: 20, credits_used: 0 } });
  });
  await page.goto('/lehrer.html');
  await page.locator('#teacherName').fill('Fachtest');
  await page.locator('#teacherPw').fill('test-password');
  await page.locator('#authBtn').click();
  await expect(page.locator('#app-wrapper')).toBeVisible();
}

test('Spanisch und Kunst können per Tastatur für die Registrierung ausgewählt werden', async ({ page }) => {
  let submitted: any;
  await page.route('**/api/teacher-register', route => {
    submitted = route.request().postDataJSON();
    return route.fulfill({ json: { success: true, pending: true } });
  });
  await page.goto('/lehrer.html');
  await page.locator('#modeRegister').click();
  await page.locator('#teacherName').fill('Fachtest');
  await page.locator('#teacherPw').fill('test-password');
  await page.locator('#teacherPwConfirm').fill('test-password');
  await page.locator('#teacherEmail').fill('fachtest@example.invalid');
  for (const name of ['Spanisch', 'Kunst']) {
    const chip = page.locator('#registerSubjects').getByRole('checkbox', { name, exact: true });
    await chip.focus();
    await page.keyboard.press('Space');
    await expect(chip).toHaveAttribute('aria-checked', 'true');
  }
  await page.locator('#authBtn').click();
  await expect.poll(() => submitted?.subjects).toEqual(['spanisch', 'kunst']);
  await expect(page.getByRole('heading', { name: 'Registrierung erfolgreich!' })).toBeVisible();
});

test('Profil speichert neue Fächer und zeigt die passenden Aufgabenformate', async ({ page }) => {
  await mockTeacher(page);
  let submitted: any;
  await page.route('**/api/teacher-profile', route => {
    submitted = route.request().postDataJSON();
    return route.fulfill({ json: { success: true } });
  });
  await page.getByRole('button', { name: 'Profil', exact: true }).click();
  for (const name of ['Spanisch', 'Kunst']) {
    const chip = page.locator('#profileSubjects').getByRole('checkbox', { name, exact: true });
    await chip.click();
    await expect(chip).toHaveAttribute('aria-checked', 'true');
  }
  await page.locator('.profile-overlay').getByRole('button', { name: 'Speichern', exact: true }).click();
  await expect.poll(() => submitted?.subjects).toEqual(['german', 'spanisch', 'kunst']);
  await page.locator('#mainTabNav').getByRole('tab').nth(1).click();
  for (const group of ['spanisch', 'kunst']) {
    await page.locator('#taskSubjectSelect').selectOption(group);
    const expected = subjectTasks.filter(task => task.group === group);
    for (const task of expected) {
      await page.locator('#taskTypeSelect').selectOption(task.type);
      await expect(page.locator('#taskTypeSelect option:checked')).toHaveAttribute('data-url', task.path);
    }
  }
  await page.getByRole('button', { name: 'Profil', exact: true }).click();
  for (const name of ['Spanisch', 'Kunst']) {
    await expect(page.locator('#profileSubjects').getByRole('checkbox', { name, exact: true })).toHaveAttribute('aria-checked', 'true');
  }
});

test('Spanisch- und Kunstergebnisse erscheinen in Fachübersicht und Schülerdetail', async ({ page }) => {
  await mockTeacher(page, ['spanisch', 'kunst']);
  await page.locator('#mainTabNav').getByRole('tab').nth(2).click();
  await expect(page.locator('#heatmapTable thead')).toContainText('Kunst');
  await expect(page.locator('#heatmapTable thead')).toContainText('Spanisch');
  await page.locator('#heatmapTable').getByRole('button', { name: 'Details für Testschüler' }).click();
  const cards = page.locator('.detail-subj-card');
  await expect(cards.filter({ hasText: 'Spanisch' })).toContainText('3 Ergebnisse');
  await expect(cards.filter({ hasText: 'Kunst' })).toContainText('2 Ergebnisse');
});

for (const task of subjectTasks) {
  test(`${task.type}: Aufgaben-Code führt zur richtigen Schülerseite`, async ({ page }) => {
    await page.route('**/api/**', route => route.fulfill({ json: {
      task_id: 'test-shared-task', title: 'Testaufgabe', teacher_name: 'Fachtest', subject: task.type, subject_group: task.group,
    } }));
    await page.route('**/*.html?task_id=*', route => route.fulfill({ contentType: 'text/html', body: '<title>Aufgabe</title>' }));
    await page.goto('/aufgabe.html');
    await page.locator('#shareCodeInput').fill('TEST1234');
    await page.getByRole('button', { name: 'Aufgabe laden', exact: true }).click();
    await expect(page.locator('#taskSubject')).toHaveText('Fach: ' + task.name);
    await page.getByRole('button', { name: 'Aufgabe starten', exact: true }).click();
    await expect(page).toHaveURL(new RegExp(task.path.replace('.', '\\.') + '\\?task_id=test-shared-task$'));
    expect(await page.evaluate(() => sessionStorage.getItem('_shared_task_id'))).toBe('test-shared-task');
  });
}
