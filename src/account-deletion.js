// Löschung im aktiven PostgreSQL-Datenbestand. Externe Dienste, Sicherungen
// und bereits laufende KI-Anfragen benötigen einen eigenen Nachlaufprozess.
export function studentDeletionStatements(student) {
  const id = student.id;
  const name = student.name_lower;
  const displayName = String(student.name || '').trim().toLowerCase();
  return [
    ['DELETE FROM teacher_credit_usage WHERE student_name_lower = ?', [name]],
    ['DELETE FROM task_submissions WHERE student_name_lower = ?', [name]],
    ['DELETE FROM grading_jobs WHERE LOWER(TRIM(student_name)) IN (?, ?)', [name, displayName]],
    ['DELETE FROM result_details WHERE result_id IN (SELECT id FROM results WHERE student_id = ? OR LOWER(TRIM(student_name)) IN (?, ?))', [id, name, displayName]],
    ['DELETE FROM results WHERE student_id = ? OR LOWER(TRIM(student_name)) IN (?, ?)', [id, name, displayName]],
    ['DELETE FROM learning_plans WHERE student_name_lower = ?', [name]],
    ['DELETE FROM password_reset_tokens WHERE name_lower = ?', [name]],
    ['DELETE FROM email_verification_tokens WHERE name_lower = ?', [name]],
    ['DELETE FROM messages WHERE recipient_name_lower = ?', [name]],
    ['DELETE FROM feedback WHERE LOWER(TRIM(student_name)) IN (?, ?)', [name, displayName]],
    ['DELETE FROM analytics_events WHERE student_id = ? OR LOWER(TRIM(student_name)) IN (?, ?)', [id, name, displayName]],
    ['DELETE FROM colloquium_sessions WHERE student_id = ?', [id]],
    ['DELETE FROM kolloquium_usage WHERE student_id = ?', [id]],
    ['DELETE FROM student_teacher_links WHERE student_name_lower = ?', [name]],
    ['DELETE FROM student_subject_licenses WHERE student_id = ?', [id]],
    ['DELETE FROM subscriptions WHERE student_id = ?', [id]],
    ['DELETE FROM students WHERE id = ? AND name_lower = ?', [id, name]],
  ];
}

export async function deleteStudentRecords(env, student) {
  if (typeof env.DB.transaction !== 'function') throw new Error('Transactional database required');
  return env.DB.transaction(async db => {
    const current = await db.prepare('SELECT id FROM students WHERE id = ? AND name_lower = ? FOR UPDATE')
      .bind(student.id, student.name_lower).first();
    if (!current) return false;
    let result;
    for (const [sql, args] of studentDeletionStatements(student)) {
      // Fehler werden nicht übergangen: alle Änderungen werden zurückgerollt.
      result = await db.prepare(sql).bind(...args).run();
    }
    if (result?.meta?.changes !== 1) throw new Error('Account deletion not confirmed');
    return true;
  });
}

export async function deleteStripeCustomer(customerId, env) {
  if (!customerId) return;
  if (!env.STRIPE_SECRET_KEY) throw new Error("Das Zahlungsprofil kann derzeit nicht gelöscht werden. Bitte kontaktiere info@myabiflow.de.");
  const response = await fetch(`https://api.stripe.com/v1/customers/${encodeURIComponent(customerId)}`, {
    method: "DELETE",
    headers: { "Authorization": `Bearer ${env.STRIPE_SECRET_KEY}` },
  });
  if (!response.ok && response.status !== 404) {
    throw new Error("Das Zahlungsprofil konnte nicht gelöscht werden.");
  }
}

