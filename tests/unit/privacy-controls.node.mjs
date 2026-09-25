import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL('../../' + path, import.meta.url), 'utf8');

test('freiwillige Lern-E-Mails brauchen eine ausdrückliche Einwilligung', () => {
  const student = read('src/handlers/student.js');
  const email = read('src/handlers/email.js');
  assert.match(student, /email_updates_optin === true/);
  assert.match(student, /Bitte stimme Lern-E-Mails ausdrücklich zu/);
  assert.match(email, /email_updates_optin = 1 AND retention_optout = 0/);
});

test('Kolloquium verlangt die Volljährigkeitsbestätigung im Frontend und Backend', () => {
  assert.match(read('abitur-kolloquium-trainer/src/App.tsx'), /Kolloquium erst ab 18 Jahren/);
  assert.match(read('src/handlers/colloquium.js'), /age_confirmed === true/);
});

test('Datenexport, Selbstlöschung und anonyme Feedbackspeicherung sind verdrahtet', () => {
  const router = read('src/index.js');
  assert.match(router, /\/api\/account\/export/);
  assert.match(router, /\/api\/account\/delete/);
  assert.match(router, /VALUES \(\?, \?, \?, \?, NULL\)/);
  assert.doesNotMatch(read('shared.js'), /studentName: sessionStorage\.getItem\("student_name"\)/);
});

test('Tutor übermittelt keinen Kontonamen und entfernt direkte Kontaktdaten', () => {
  assert.doesNotMatch(read('ai-tutor.js'), /studentName: sName/);
  const tutor = read('hetzner-backend/tutor/server.js');
  assert.match(tutor, /removeDirectIdentifiers/);
  assert.match(tutor, /\[E-Mail entfernt\]/);
});
