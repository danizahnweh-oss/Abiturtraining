/**
 * Queue-Adapter: Cloudflare Queues → BullMQ
 *
 * Ersetzt env.GRADING_QUEUE.send({ jobId, endpoint }) und
 * den queue(batch, env) Consumer durch BullMQ equivalente.
 *
 * Konfiguration:
 * - max_retries: 2 (wie Cloudflare Queue)
 * - Concurrency: 1 (wie max_batch_size = 1)
 * - Dead Letter Queue: Automatisch nach 2 Fehlversuchen
 */

import { Queue, Worker as BullWorker } from 'bullmq';
import Redis from 'ioredis';

let gradingQueue = null;
let gradingDLQ = null;
let redis = null;

export function initQueues(redisUrl) {
  redis = new Redis(redisUrl, { maxRetriesPerRequest: null });

  gradingQueue = new Queue('grading', {
    connection: redis,
    defaultJobOptions: {
      attempts: 3,  // 1 Versuch + 2 Retries = 3 total (wie CF: max_retries=2)
      backoff: {
        type: 'exponential',
        delay: 5000
      },
      removeOnComplete: {
        age: 30 * 24 * 3600  // 30 Tage aufbewahren
      },
      removeOnFail: false  // Fehlgeschlagene Jobs behalten (DLQ)
    }
  });

  gradingDLQ = new Queue('grading-dlq', { connection: redis });

  return createQueueAdapter();
}

/**
 * Erstellt ein Objekt das die Cloudflare Queue-API nachbildet:
 * env.GRADING_QUEUE.send({ jobId, endpoint })
 */
function createQueueAdapter() {
  return {
    async send(data) {
      await gradingQueue.add('grade', data, {
        jobId: data.jobId  // Deduplizierung
      });
    }
  };
}

/**
 * Startet den Queue-Consumer (BullMQ Worker)
 * Ruft den übergebenen Handler für jeden Job auf.
 *
 * @param {Function} executeGradeHandler - async (endpoint, inputData, env) => result
 * @param {Object} env - Environment-Objekt mit DB, API-Keys etc.
 */
export function startQueueWorker(executeGradeHandler, env) {
  const worker = new BullWorker('grading', async (job) => {
    const { jobId, endpoint } = job.data;

    console.log(`Queue: Verarbeite Job ${jobId} (${endpoint}), Versuch ${job.attemptsMade + 1}/3`);

    // Status auf "processing" setzen
    await env.DB.prepare(
      "UPDATE grading_jobs SET status = 'processing', attempts = attempts + 1, updated_at = ? WHERE id = ?"
    ).bind(new Date().toISOString(), jobId).run();

    // Input-Daten aus DB laden
    const dbJob = await env.DB.prepare(
      "SELECT input_data, endpoint FROM grading_jobs WHERE id = ?"
    ).bind(jobId).first();

    if (!dbJob) {
      console.error(`Queue: Job ${jobId} nicht in DB gefunden`);
      return;  // Job als erledigt markieren (kein Retry)
    }

    const inputData = JSON.parse(dbJob.input_data);

    // Grade-Handler ausführen
    const result = await executeGradeHandler(dbJob.endpoint, inputData, env);

    // Ergebnis speichern
    await env.DB.prepare(
      "UPDATE grading_jobs SET status = 'completed', result_data = ?, updated_at = ? WHERE id = ?"
    ).bind(JSON.stringify(result), new Date().toISOString(), jobId).run();

    console.log(`Queue: Job ${jobId} erfolgreich abgeschlossen`);
  }, {
    connection: redis,
    concurrency: 4  // parallele Text-Korrekturen (Workshop-Last 2026-06-22). OpenAI verträgt parallele Calls.
  });

  // Fehler-Handling
  worker.on('failed', async (job, err) => {
    const jobId = job?.data?.jobId || 'unbekannt';
    console.error(`Queue: Job ${jobId} fehlgeschlagen (Versuch ${job.attemptsMade}/3):`, err.message);

    // Fehlerstatus in DB speichern
    const safeMsg = (err.message || 'Unbekannter Fehler').substring(0, 500);
    const isUnsafe = /api[_-]?key|token|secret|stack|\.js:/i.test(safeMsg);

    try {
      await env.DB.prepare(
        "UPDATE grading_jobs SET status = 'failed', error_msg = ?, updated_at = ? WHERE id = ?"
      ).bind(
        isUnsafe ? 'Interner Fehler.' : safeMsg,
        new Date().toISOString(),
        jobId
      ).run();
    } catch (dbErr) {
      console.error('Queue: DB-Update nach Fehler fehlgeschlagen:', dbErr.message);
    }

    // Nach letztem Versuch → DLQ
    if (job.attemptsMade >= 3) {
      console.warn(`Queue: Job ${jobId} → Dead Letter Queue`);
      try {
        await gradingDLQ.add('failed-grade', job.data);
      } catch (dlqErr) {
        console.error('Queue: DLQ-Eintrag fehlgeschlagen:', dlqErr.message);
      }
    }
  });

  worker.on('completed', (job) => {
    console.log(`Queue: Job ${job.data.jobId} completed`);
  });

  worker.on('error', (err) => {
    console.error('Queue Worker Fehler:', err.message);
  });

  console.log('Queue Worker gestartet (Concurrency: 1, Max Retries: 2)');
  return worker;
}

export async function closeQueues() {
  if (gradingQueue) await gradingQueue.close();
  if (gradingDLQ) await gradingDLQ.close();
  if (redis) await redis.quit();
  console.log('Queues geschlossen.');
}

export default { initQueues, startQueueWorker, closeQueues };
