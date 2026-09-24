import assert from 'node:assert/strict';
import { materialZeitbudget, pruefeZeitbudget } from '../../src/time-budget.js';

const BASE_URL = process.env.E2E_BASE_URL || 'https://myabiflow.de';
const USER = process.env.E2E_USER || '';
const PASS = process.env.E2E_PASS || '';

if (process.env.RUN_LIVE_AI_QUALITY !== '1') {
  console.log('Uebersprungen: RUN_LIVE_AI_QUALITY=1 fehlt.');
  process.exit(0);
}
assert.ok(USER && PASS, 'E2E_USER und E2E_PASS muessen gesetzt sein.');

const cases = [
  {
    subject: 'Politik und Gesellschaft',
    endpoint: '/api/generate-pug',
    payload: { halbjahr: '12_1', schwerpunkt: 'random', level: 'gA', be: 12, zeit: 30, anzahl: 1 }
  },
  {
    subject: 'Wirtschaft und Recht',
    endpoint: '/api/generate-wr',
    payload: { niveau: 'gA', sachgebiet: 'bwl', thema: 'random', be: 12, zeit: 30, anzahl: 1 }
  },
  {
    subject: 'Ethik',
    endpoint: '/api/generate-ethik',
    payload: { lernbereich: '12_1', schwerpunkt: 'random', level: 'gA', be: 12, zeit: 30, anzahl: 1 }
  },
  {
    subject: 'Biologie',
    endpoint: '/api/generate-bio',
    payload: { sachgebiet: 'genetik', be: 12, zeit: 30, anzahl: 1 }
  },
  {
    subject: 'Mathematik',
    endpoint: '/api/generate-mathe',
    payload: { sachgebiet: 'analysis', be: 12, zeit: 30, anzahl: 1 }
  },
  {
    subject: 'Geographie',
    endpoint: '/api/generate-geographie',
    payload: { halbjahr: '12_1', schwerpunkt: 'random', level: 'gA', be: 12, zeit: 30, anzahl: 1 }
  }
];

const loginResponse = await fetch(`${BASE_URL}/api/check-student`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ student_name: USER, personal_password: PASS, mode: 'login' })
});
const login = await loginResponse.json();
assert.equal(loginResponse.status, 200, `Login fehlgeschlagen: ${login.error || loginResponse.status}`);
assert.ok(login.token, 'Login lieferte kein Zugriffstoken.');

const headers = {
  'content-type': 'application/json',
  'x-access-token': login.token,
  'x-student-name': encodeURIComponent(USER)
};
const budget = materialZeitbudget(30);
const results = [];

for (const testCase of cases) {
  const started = Date.now();
  const response = await fetch(`${BASE_URL}${testCase.endpoint}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(testCase.payload)
  });
  const body = await response.json().catch(() => ({}));
  const durationMs = Date.now() - started;
  const budgetAnalysis = response.ok ? pruefeZeitbudget(JSON.stringify(body), budget, { includeValid: true }) : null;
  results.push({
    subject: testCase.subject,
    status: response.status,
    durationMs,
    passed: response.ok && budgetAnalysis?.valid === true,
    problems: response.ok ? (budgetAnalysis?.problems || []) : [body.error || `HTTP ${response.status}`],
    totalWords: budgetAnalysis?.totalWords ?? null,
    totalMaterials: budgetAnalysis?.totalMaterials ?? null,
    taskCount: budgetAnalysis?.taskCount ?? null
  });
}

console.log(JSON.stringify({ generatedAt: new Date().toISOString(), baseUrl: BASE_URL, budget, results }, null, 2));
const failures = results.filter(result => !result.passed);
assert.equal(failures.length, 0, `${failures.length} reale 30-Minuten-Generierungen haben die Qualitaetsgrenzen verletzt.`);
