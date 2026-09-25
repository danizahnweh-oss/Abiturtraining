// Automatische Datenschutz-Bereinigung fuer Daten ohne dauerhaften Lernzweck.
// Jede Anweisung ist fehlertolerant, damit eine optionale Alt-Tabelle den Cron nicht stoppt.
export async function cleanupExpiredPrivacyData(env) {
  const statements = [
    "DELETE FROM password_reset_tokens WHERE created_at < (NOW() - INTERVAL '24 hours')",
    "DELETE FROM email_verification_tokens WHERE used_at IS NOT NULL OR created_at < (NOW() - INTERVAL '7 days')",
    "DELETE FROM learning_plans WHERE expires_at IS NOT NULL AND expires_at::timestamptz < NOW()",
    "DELETE FROM colloquium_sessions WHERE started_at::timestamptz < (NOW() - INTERVAL '30 days')",
    "DELETE FROM analytics_events WHERE created_at::timestamptz < (NOW() - INTERVAL '180 days')",
    "DELETE FROM messages WHERE created_at::timestamptz < (NOW() - INTERVAL '365 days')",
    "DELETE FROM feedback WHERE created_at::timestamptz < (NOW() - INTERVAL '365 days')",
  ];

  let completed = 0;
  for (const sql of statements) {
    try {
      await env.DB.prepare(sql).run();
      completed++;
    } catch {
      // Tabellen koennen in alten Installationen fehlen; beim naechsten Lauf erneut versuchen.
    }
  }
  console.log(`Datenschutz-Bereinigung abgeschlossen (${completed}/${statements.length})`);
}
