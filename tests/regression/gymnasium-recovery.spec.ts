import { test, expect } from '@playwright/test';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '../..');
const pages = readdirSync(root).filter(file => file.endsWith('.html') && readFileSync(resolve(root, file), 'utf8').includes('src="gymnasium-recovery.js'));
const pixel = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
const result = { scores: { verstehen: 10, darstellung: 12, total: 11 }, feedback: 'Dauerhaft gespeicherte **Rückmeldung**.', korrektur_text: 'Ein korrigierter Satz.', fehlende_aspekte: [] };

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    for (const [key, value] of Object.entries({ access: '1', free_access: '1', student_name: 'Fachtest', student_id: 'fachtest', access_token: 'test-token' })) sessionStorage.setItem(key, value);
  });
  await page.route('**/api/**', route => route.fulfill({ json: { status: 'active', plan: 'monthly' } }));
});

for (const file of pages) {
  test(`${file}: Wiederherstellung eingebunden, keine Skriptfehler oder Prüfungsunterbrechung`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('/' + file);
    expect(await page.evaluate(() => typeof (window as any).gymRestoreFeedback)).toBe('function');
    await page.clock.install();
    await page.evaluate(() => { localStorage.removeItem('feedback_nudge_last'); (window as any).initFeedbackNudge(); });
    await page.clock.fastForward(31_000);
    await expect(page.locator('.feedback-nudge-overlay')).toHaveCount(0);
    expect(errors).toEqual([]);
  });
}

async function setup(page: any, path: string, image = false) {
  await page.goto('/' + path + '.html');
  await page.evaluate(image => {
    (window as any).eval('CONFIG.storedData = ' + JSON.stringify({ task_instruction: 'Analysieren Sie das Material.', primary_text: 'Eine Textquelle.', materials: image ? [{ type: 'karikatur', title: 'Karikatur', content: 'Create an editorial cartoon about school.' }] : [], teilaufgaben: [], gesamt_be: 10 }));
    (window as any).eval('renderTask(CONFIG.storedData)');
    (window as any).nav('task');
  }, image);
}

for (const path of ['ethik', 'politik', 'geographie', 'kunst', 'religion', 'katholisch']) {
  test(`${path}: große Karikatur und Entwurf überstehen Neuladen`, async ({ page }) => {
    const large = 'data:image/png;base64,' + Buffer.concat([Buffer.from(pixel.split(',')[1], 'base64'), Buffer.alloc(4 * 1024 * 1024)]).toString('base64');
    let calls = 0;
    await page.route('**/api/generate-image', route => { calls++; return route.fulfill({ json: { url: large } }); });
    await setup(page, path, true);
    await expect(page.locator('#sec-task [data-image-state=ready]')).toHaveCount(1);
    await page.evaluate(() => { (document.getElementById('studentText') as HTMLTextAreaElement).value = 'Mein gesicherter Entwurf.'; (window as any).saveSession(); });
    expect(await page.evaluate(() => Object.keys(localStorage).filter(k => k.includes('_session_')).reduce((n, k) => n + localStorage.getItem(k)!.length, 0))).toBeLessThan(10000);
    await page.reload();
    await expect(page.locator('#sec-task [data-image-state=ready]')).toHaveCount(1);
    await expect(page.locator('#studentText')).toHaveValue('Mein gesicherter Entwurf.');
    expect(calls).toBe(1);
  });

  test(`${path}: laufender Auftrag und fertiges Feedback ohne zweite Abgabe`, async ({ page }) => {
    let calls = 0;
    await page.route('**/api/grade-submit', route => { calls++; return route.fulfill({ json: { job_id: 'fach-job' } }); });
    await page.route('**/api/grade-status/fach-job', route => route.fulfill({ json: { status: 'completed', result } }));
    await setup(page, path);
    await page.evaluate(() => {
      (window as any).apiCallAsync('grade-ethik', { student_text: 'Meine Probeantwort', rubric_prompt: 'Test' }).catch(() => {});
    });
    await expect.poll(() => calls).toBe(1);
    await expect.poll(() => page.evaluate(async () => (window as any).eval('gymStore(gymRecoveryKey(CONFIG.storedData)).then(r => r?.jobId)'))).toBe('fach-job');
    await page.reload();
    await page.evaluate(() => (window as any).nav('feedback'));
    await expect(page.locator('#feedbackBody')).toContainText('Dauerhaft gespeicherte Rückmeldung.');
    await expect(page.locator('#scoreTotal')).toHaveText('11');
    expect(calls).toBe(1);
    await page.reload();
    await page.evaluate(() => (window as any).nav('feedback'));
    await expect(page.locator('#feedbackBody')).toContainText('Dauerhaft gespeicherte Rückmeldung.');
    expect(calls).toBe(1);
  });
}

test('Gespeichertes Feedback wird bereinigt, keine fremden Skripte', async ({ page }) => {
  await setup(page, 'ethik');
  await page.evaluate(() => (window as any).gymDisplayFeedback({ result: { feedback: '<img src=x onerror="window.unwanted=true">Rückmeldung' }, view: { body: '<svg onload="window.unwanted=true"></svg>Gesichert', scores: {} } }));
  await expect(page.locator('#feedbackBody [onload], #feedbackBody [onerror]')).toHaveCount(0);
});

test('Tatsächliche Abgabe: Punkteansicht und vollständiges Feedback bleiben identisch', async ({ page }) => {
  await page.route('**/api/grade-submit', route => route.fulfill({ json: { job_id: 'vollstaendig' } }));
  await page.route('**/api/grade-status/vollstaendig', route => route.fulfill({ json: { status: 'completed', result } }));
  await setup(page, 'ethik');
  await page.evaluate(() => (window as any).nav('write'));
  await page.locator('#studentText').fill('Dies ist eine ausführliche Antwort zum Thema. '.repeat(35));
  await page.locator('#submitBtn').click();
  await expect(page.locator('#scoreTotal')).toHaveText('11');
  await expect.poll(() => page.evaluate(() => (window as any).eval('gymStore(gymRecoveryKey(CONFIG.storedData)).then(r => !!r?.view)'))).toBe(true);
  const before = await page.locator('#feedbackContent').innerText();
  await page.reload();
  await page.evaluate(() => (window as any).nav('feedback'));
  await expect(page.locator('#scoreTotal')).toHaveText('11');
  await expect.poll(() => page.locator('#feedbackContent').innerText()).toBe(before);
});

for (const path of ['listening', 'francais-listening', 'italiano-listening', 'spanisch-listening']) {
  test(`${path}: Hörverstehens-Korrektur nach Neuladen`, async ({ page }) => {
    await page.goto('/' + path + '.html');
    const listeningResult = { total_points: 1, max_points: 1, percentage: 100, notenpunkte: 15, results: [{ id: 1, type: 'mc', question: 'Testfrage', student_answer: 'A', correct_answer: 'A', points_awarded: 1, max_points: 1, is_correct: true }] };
    let calls = 0;
    await page.route('**/api/grade-submit', route => { calls++; return route.fulfill({ json: { job_id: 'hoeren' } }); });
    await page.route('**/api/grade-status/hoeren', route => route.fulfill({ json: { status: 'completed', result: listeningResult } }));
    await page.evaluate(() => {
      (window as any).eval('listeningData = {title:"Test",transcript:"Testtranskript",questions:[{id:1,type:"mc",question:"Testfrage",options:["A Richtig","B Falsch"],correct:"A",points:1}]}; CONFIG.storedData=listeningData; studentAnswers={1:"A"}; renderListenStep(); renderQuestions(); submitAnswers();');
    });
    await expect.poll(() => calls).toBe(1);
    await expect.poll(() => page.evaluate(() => (window as any).eval('gymStore(gymRecoveryKey(CONFIG.storedData)).then(r => r?.jobId)'))).toBe('hoeren');
    await page.reload();
    await page.evaluate(() => (window as any).nav('feedback'));
    await expect(page.locator('#feedbackQuestions')).toContainText('Richtig');
    await expect(page.locator('#transcriptBody')).toHaveText('Testtranskript');
    expect(calls).toBe(1);
  });
}

test('Fachwechsel überschreibt keinen Sprachentwurf', async ({ page }) => {
  for (const path of ['francais-schreiben', 'italiano-schreiben', 'spanisch-schreiben']) {
    await page.goto('/' + path + '.html');
    await page.evaluate(path => {
      (window as any).eval('CONFIG.storedData = ' + JSON.stringify({ article_text: 'Artikel ' + path, headline: path, task_instruction: 'Aufgabe' }));
      (document.getElementById('studentText') as HTMLTextAreaElement).value = 'Antwort ' + path;
      (window as any).saveSession();
    }, path);
  }
  await page.goto('/francais-schreiben.html');
  await expect(page.locator('#studentText')).toHaveValue('Antwort francais-schreiben');
});

test('Falsche Punktesumme wird blockiert, Wahlaufgaben werden nicht zusammengezählt', async ({ page }) => {
  await page.goto('/chemie.html');
  expect(await page.evaluate(() => {
    try { (window as any).gymValidateTaskPoints({ gesamt_be: 60, teilaufgaben: [{ be: 24 }, { be: 22 }, { be: 18 }] }); return false; } catch { return true; }
  })).toBe(true);
  expect(await page.evaluate(() => (window as any).gymValidateTaskPoints({ gesamt_be: 90, aufgaben: [1, 2, 3, 4].map(() => ({ gesamt_be: 30, teilaufgaben: [{ be: 30 }] })) }).gesamt_be)).toBe(90);
});

test('Fehlgeschlagener Auftrag kann bewusst erneut abgegeben werden', async ({ page }) => {
  await setup(page, 'ethik');
  await page.route('**/api/grade-submit', route => route.fulfill({ json: { job_id: 'fehlgeschlagen' } }));
  await page.route('**/api/grade-status/fehlgeschlagen', route => route.fulfill({ json: { status: 'failed', error: 'Testfehler' } }));
  expect(await page.evaluate(async () => {
    try { await (window as any).apiCallAsync('grade-ethik', { student_text: 'Antwort' }, { pollInterval: 10 }); } catch {}
    return (window as any).eval('gymStore(gymRecoveryKey(CONFIG.storedData)).then(r => !!r.jobId)');
  })).toBe(false);
});

test('Wiederherstellung erhält die Anzeigeelemente für die nächste Abgabe', async ({ page }) => {
  await setup(page, 'ethik');
  await page.evaluate(result => (window as any).gymDisplayFeedback({ result }), result);
  await page.route('**/api/grade-submit', route => route.fulfill({ json: { job_id: 'zweite' } }));
  await page.route('**/api/grade-status/zweite', route => route.fulfill({ json: { status: 'completed', result: { ...result, scores: { verstehen: 12, darstellung: 12, total: 12 } } } }));
  await page.evaluate(() => (window as any).nav('write'));
  await page.locator('#studentText').fill('Eine verbesserte und ausführliche Antwort zum Thema. '.repeat(35));
  await page.locator('#submitBtn').click();
  await expect(page.locator('#scoreTotal')).toHaveText('12');
});

test('Kunst zeigt Kunstthemen, keine kopierten Ethikthemen', async ({ page }) => {
  await page.goto('/kunst.html');
  await expect(page.locator('#sec-setup')).toContainText('Objekt');
  await expect(page.locator('#sec-setup')).not.toContainText('Pflichtkunst');
  await expect(page.locator('#sec-setup')).not.toContainText('Gerechtigkeit');
});
