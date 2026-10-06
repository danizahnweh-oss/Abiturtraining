import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { deleteStudentRecords, studentDeletionStatements, deleteStripeCustomer } from '../../src/account-deletion.js';

// Der Adapter wird mit einem kontrollierten Verbindungspool geprüft; keine echte
// Datenbank und keine Kundendaten. Der pg-Treiber wird hier nicht benötigt.
const source = readFileSync(new URL('../../hetzner-backend/src/db-adapter.js', import.meta.url), 'utf8').replace("import pg from 'pg';", 'const pg = {};');
const { createD1Adapter } = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
const student = { id: 7, name: 'Alice', name_lower: 'alice' };
function setup(failAt = -1) {
  const statements = [];
  let released = false;
  let changes = [];
  const client = {
    async query(sql, args) {
      statements.push({ sql, args });
      if (sql === 'ROLLBACK') changes = [];
      if (sql.startsWith('SELECT')) return { rows: [{ id: 7 }] };
      if (sql.startsWith('DELETE')) {
        if (changes.length === failAt) throw new Error('simulated database failure');
        changes.push(sql);
        return { rowCount: 1 };
      }
      return { rows: [] };
    },
    release() { released = true; },
  };
  const env = { DB: createD1Adapter({ async connect() { return client; } }) };
  return { env, statements, get changes() { return changes; }, get released() { return released; } };
}
test('deletion uses one connection and commits account last', async () => {
  const state = setup();
  assert.equal(await deleteStudentRecords(state.env, student), true);
  assert.equal(state.statements[0].sql, 'BEGIN');
  assert.equal(state.statements.at(-1).sql, 'COMMIT');
  assert.match(state.changes.at(-1), /DELETE FROM students WHERE id = \$1 AND name_lower = \$2/);
  assert.equal(state.changes.length, 17);
  assert.equal(state.released, true);
});
test('failure midway rolls back all database changes and never commits', async () => {
  const state = setup(4);
  await assert.rejects(deleteStudentRecords(state.env, student), /simulated database failure/);
  assert.equal(state.statements.at(-1).sql, 'ROLLBACK');
  assert.equal(state.statements.some(s => s.sql === 'COMMIT'), false);
  assert.equal(state.changes.length, 0);
  assert.equal(state.released, true);
});
test('no transaction support fails closed before deleting', async () => {
  await assert.rejects(deleteStudentRecords({ DB: {} }, student), /Transactional/);
});
test('grading jobs use existing ownership column and old colloquium usage is included', () => {
  const statements = studentDeletionStatements(student);
  const job = statements.find(([sql]) => sql.includes('DELETE FROM grading_jobs'));
  assert.match(job[0], /student_name/);
  assert.doesNotMatch(job[0], /result_id/);
  assert.ok(statements.some(([sql]) => sql.includes('DELETE FROM kolloquium_usage')));
});
test('missing payment configuration cannot silently confirm external deletion', async () => {
  await assert.rejects(deleteStripeCustomer('cus_test_only', {}), /Zahlungsprofil/);
  await deleteStripeCustomer(null, {});
});
