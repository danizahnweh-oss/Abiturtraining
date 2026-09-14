import { test, expect } from '@playwright/test';
import { validateWRPoints, wrNotenpunkte } from '../../src/subjects/wr-points';

const image = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
const feedback = { scores: { be_erreicht: 49, be_max: 64, notenpunkte: 11, be_1: 20, be_max_1: 60, be_2: 29, be_max_2: 60, be_gesamt: 49, be_max_gesamt: 120 }, feedback: 'Gespeicherte **Rückmeldung** mit Materialbezug.', korrektur_text: 'Probeantwort', fehlende_aspekte: [] };

for (const path of ['wr', 'wr-abitur']) {
  test.describe(path, () => {
    test.beforeEach(async ({ page }) => {
      await page.addInitScript(() => {
        sessionStorage.setItem('access', '1');
        sessionStorage.setItem('student_name', 'wiederherstellungstest');
        sessionStorage.setItem('student_id', 'wiederherstellungstest');
        sessionStorage.setItem('access_token', 'test-token');
        sessionStorage.setItem('free_access', '1');
      });
      await page.route('**/api/**', r => r.fulfill({ json: { status: 'active', plan: 'monthly' } }));
      await page.goto('/' + path + '.html');
    });
    async function setup(page: any, extra = {}) {
      await page.evaluate(extra => {
        const data = { task_instruction: 'Analysieren Sie die Karikatur.', _niveau: 'gA', aufgabenbloecke: [], materialien: [{ typ: 'karikatur', inhalt: 'A supermarket cartoon', titel: 'Karikatur' }], ...extra };
        (window as any).eval('CONFIG.storedData = ' + JSON.stringify(data) + '; renderTask(CONFIG.storedData);');
        (window as any).nav('task');
      }, extra);
    }
    test('Fertiges Bild nach Neuladen ohne weitere Bildgenerierung', async ({ page }) => {
      let calls = 0;
      await page.route('**/api/generate-image', r => { calls++; return r.fulfill({ json: { url: image, credit: 'Testbild' } }); });
      await setup(page);
      await expect(page.locator('#sec-task [data-image-state=ready]')).toHaveCount(1);
      await page.reload();
      await expect(page.locator('#sec-task [data-image-state=ready]')).toHaveCount(1);
      expect(calls).toBe(1);
      await page.evaluate(() => (window as any).nav('task'));
      await page.locator('#sec-task .edu-img-regen-btn').click();
      await expect.poll(() => calls).toBe(2);
    });
    test('Vollständiges Feedback nach Neuladen ohne neue Bewertung', async ({ page }) => {
      await setup(page, { materialien: [], _wrFeedback: feedback });
      await page.evaluate(() => (window as any).saveSession());
      await page.reload();
      await page.getByRole('button', { name: '4 Feedback', exact: true }).click();
      await expect(page.locator('#feedbackBody')).toContainText('Gespeicherte Rückmeldung');
      await expect(page.locator('#scoreNP')).toHaveText('11');
    });
    test('Laufende Korrektur nach Neuladen ohne zweiten Auftrag fortsetzen', async ({ page }) => {
      let submissions = 0;
      await page.route('**/api/grade-submit', r => { submissions++; return r.fulfill({ json: { job_id: 'unerwartet' } }); });
      await page.route('**/api/grade-status/gespeicherter-job', r => r.fulfill({ json: { status: 'completed', result: feedback } }));
      await setup(page, { materialien: [], _wrPendingGrade: { jobId: 'gespeicherter-job', endpoint: 'grade-wr', body: { student_text: 'Probeantwort' } } });
      await page.evaluate(() => (window as any).saveSession());
      await page.reload();
      await page.getByRole('button', { name: '4 Feedback', exact: true }).click();
      await expect(page.locator('#feedbackBody')).toContainText('Gespeicherte Rückmeldung');
      expect(submissions).toBe(0);
      await page.reload();
      await page.getByRole('button', { name: '4 Feedback', exact: true }).click();
      await expect(page.locator('#feedbackBody')).toContainText('Gespeicherte Rückmeldung');
    });
    test('Alte Aufgabe ohne Feedback zeigt verständlichen Hinweis statt leerer Seite', async ({ page }) => {
      await setup(page, { materialien: [] });
      await page.getByRole('button', { name: '4 Feedback', exact: true }).click();
      await expect(page.locator('#feedbackBody')).toContainText('noch kein vollständiges Feedback');
    });
    test('Abgabe sichert Auftrag sofort und setzt ihn nach Neuladen fort', async ({ page }) => {
      let submissions = 0;
      await page.route('**/api/grade-submit', r => { submissions++; return r.fulfill({ json: { job_id: 'neuer-job' } }); });
      await page.route('**/api/grade-status/neuer-job', r => r.fulfill({ json: { status: 'completed', result: feedback } }));
      await setup(page, { materialien: [], gesamt_be: 60 });
      await page.getByRole('button', { name: '3 Schreiben', exact: true }).click();
      await page.locator(path === 'wr' ? '#studentText' : '#studentText1').fill('Eine ausführliche Probeantwort zum Material. '.repeat(40));
      await page.locator('#submitBtn').click();
      await expect.poll(() => submissions).toBe(1);
      await expect.poll(() => page.evaluate(() => Object.keys(localStorage).some(k => k.includes('_session_') && (localStorage.getItem(k) || '').includes('neuer-job')))).toBe(true);
      await page.reload();
      await page.getByRole('button', { name: '4 Feedback', exact: true }).click();
      await expect(page.locator('#feedbackBody')).toContainText('Gespeicherte Rückmeldung');
      expect(submissions).toBe(1);
    });
    test('Keine automatische Feedback-Abfrage während der Prüfung', async ({ page }) => {
      await page.clock.install();
      await page.evaluate(() => { localStorage.removeItem('feedback_nudge_last'); (window as any).initFeedbackNudge(); });
      await page.clock.fastForward(31_000);
      await expect(page.locator('.feedback-nudge-overlay')).toHaveCount(0);
    });
  });
}

test('64 statt 60 BE werden zurückgewiesen; korrekte Summen werden abgeleitet', () => {
  const data = { aufgabenbloecke: [{ teilaufgaben: [{ be: 24 }, { be: 22 }, { be: 18 }], be_gesamt: 60 }], gesamt_be: 60 };
  expect(() => validateWRPoints(data, { aufgabenbloecke: 60 })).toThrow('64 statt 60');
  expect(validateWRPoints(data, { aufgabenbloecke: 64 }).gesamt_be).toBe(64);
  expect(data.aufgabenbloecke[0].be_gesamt).toBe(64);
  expect(wrNotenpunkte(49, 64)).toBe(11);
  expect(wrNotenpunkte(49, 60)).toBe(12);
  expect(wrNotenpunkte(61, 60)).toBeNull();
});
