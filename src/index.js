/* ================= myAbiFlow API Router ================= */
/* Schlanker Einstiegspunkt — importiert alle Handler aus Modulen */

// Basis-Module
import { jsonResponse, corsHeaders, getAllowedOrigins, isOriginAllowed, checkBodySize, truncate } from './utils.js';
import { MAX_BODY_SIZE, MAX_REQUESTS_PER_WINDOW, MAX_LOGIN_ATTEMPTS } from './config.js';
import {
  checkAuth, checkSubscriptionAccess, getSubjectFromPathname, checkRateLimit, cleanupRateLimitMaps,
  rateLimitMap, loginRateLimitMap, ensureMigrations
} from './auth.js';

// Feedback Rate Limiting (eigene Map, max 5 pro Minute)
const feedbackRateLimitMap = new Map();

// Handler
import { handleLogin, handleCheckStudent, handleGetPreferences, handleSavePreferences, handleCheckReminders, handleChangePassword, handleUpdateProfile } from './handlers/student.js';
import { handleTeacherRegister, handleTeacherAuthLogin, handleTeacherCodes, handleLinkStudentCode, handleTeacherResults, handleStudentCodes, handleTeacherApprove } from './handlers/teacher.js';
import { handleTeacherProfile, handleTeacherTasks, handleTeacherTaskResults, handleGetSharedTask, handleSubmitSharedTask, handleGenerateFromMaterials } from './handlers/teacher-tasks.js';
import { handleTeacherLogin, handleGetResults, handleDeleteResult, handleGetStudents, handleDeleteStudent, handleClassPasswords, handleSubjectLicenses, handleGetFeedback, handleToggleFeedbackValuable, handleGetTeachers, handleApproveTeacher, handleDeleteTeacher, handleActivityFeed } from './handlers/dashboard.js';
import { handleSendMessage, handleListMessages, handleDeleteMessage, handleStudentMessages, handleMarkMessageRead, handleReplyMessage } from './handlers/messages.js';
import { handleStudentResults, handleCompetencyProfile, handleLearningPlan } from './handlers/analytics.js';
import { setGradeHandlerMap, setFOSRouteHandler, handleGradeSubmit, handleGradeStatus, executeGradeHandler, cleanupOldGradingJobs, tryDeductTeacherCredit } from './handlers/grading.js';
import { handleTeacherCreditBalance, handleTeacherCreditHistory } from './handlers/teacher-credits.js';
import { handleGenerateImage, handleFetchUnsplash, handleSubmitResult } from './handlers/media.js';
import { handleDetailFeedback, handleRewrite } from './handlers/features.js';
import { handleUnsubscribe, sendReminderEmails } from './handlers/email.js';
import { handleCreateCheckout, handleStripeWebhook, handleSubscriptionStatus, handleCustomerPortal, handleStartTrial, handleRedeemLicense } from './handlers/stripe.js';

// Fach-Handler: Englisch
import {
  handleGenerate, handleGrade, handleOCR, handleOCRBWR, handleParseTask, handleModelAnswer,
  handleGenerateFromTextWriting, handleGenerateFromTextMediation, handleOCRText,
  handleGenerateListening, handleGradeListening
} from './subjects/englisch.js';

// Fach-Handler: Deutsch
import {
  handleParseTaskDeutsch, handleGenerateGeschichte, handleGradeGeschichte,
  handleGenerateDeutsch, handleGradeDeutsch, handleGradeDeutschStream, handleModelAnswerDeutsch
} from './subjects/deutsch.js';

// Fach-Handler: Politik & Gesellschaft
import {
  handleParseTaskPuG, handleGeneratePuG, handleGradePuG, handleModelAnswerPuG,
  handleGenerateAbiturPuG, handleGradeAbiturPuG, handleModelAnswerAbiturPuG
} from './subjects/pug.js';

// Fach-Handler: Wirtschaft & Recht
import {
  handleGenerateWR, handleGradeWR, handleModelAnswerWR,
  handleGradeAbitur13BWR, handleModelAnswerAbitur13BWR,
  handleGradeAbiturBWR, handleModelAnswerAbiturBWR,
  handleParseTaskWR, handleParseTaskAbitur,
  handleGenerateAbiturWR, handleGradeAbiturWR, handleModelAnswerAbiturWR
} from './subjects/wr.js';

// Fach-Handler: Geschichte
import {
  handleGenerateAbiturGeschichte, handleGradeAbiturGeschichte, handleModelAnswerAbiturGeschichte
} from './subjects/geschichte.js';

// Fach-Handler: Französisch
import {
  handleParseTaskFrench, handleModelAnswerFrench, handleModelAnswerFrenchWriting, handleGradeFrench
} from './subjects/franzoesisch.js';

// Fach-Handler: Italienisch
import {
  handleParseTaskItalian, handleModelAnswerItalian, handleModelAnswerItalianWriting, handleGradeItalian
} from './subjects/italienisch.js';

// Fach-Handler: Ethik
import {
  handleParseTaskEthik, handleGenerateEthik, handleGradeEthik, handleModelAnswerEthik,
  handleGenerateAbiturEthik, handleGradeAbiturEthik, handleModelAnswerAbiturEthik
} from './subjects/ethik.js';

// Fach-Handler: Ev. Religion
import {
  handleParseTaskReligion, handleGenerateReligion, handleGradeReligion, handleModelAnswerReligion,
  handleGenerateAbiturReligion, handleGradeAbiturReligion, handleModelAnswerAbiturReligion
} from './subjects/religion.js';

// Fach-Handler: Kath. Religion
import {
  handleParseTaskKatholisch, handleGenerateKatholisch, handleGradeKatholisch, handleModelAnswerKatholisch,
  handleGenerateAbiturKatholisch, handleGradeAbiturKatholisch, handleModelAnswerAbiturKatholisch
} from './subjects/katholisch.js';

// Fach-Handler: Geographie
import {
  handleParseTaskGeographie, handleGenerateGeographie, handleGradeGeographie, handleModelAnswerGeographie,
  handleGenerateAbiturGeographie, handleGradeAbiturGeographie, handleModelAnswerAbiturGeographie
} from './subjects/geographie.js';

// Fach-Handler: Latein
import {
  handleParseTaskLatein, handleGenerateLatein, handleGradeLatein, handleModelAnswerLatein,
  handleGenerateAbiturLatein, handleGradeAbiturLatein, handleModelAnswerAbiturLatein
} from './subjects/latein.js';

// Fach-Handler: Mathematik
import {
  handleGenerateMathe, handleGradeMathe, handleModelAnswerMathe, handleParseTaskMathe,
  handleGenerateAbiturMathe, handleGradeAbiturMathe, handleModelAnswerAbiturMathe
} from './subjects/mathe.js';

// Fach-Handler: Chemie
import {
  handleGenerateChemie, handleGradeChemie, handleModelAnswerChemie, handleParseTaskChemie,
  handleGenerateAbiturChemie, handleGradeAbiturChemie, handleModelAnswerAbiturChemie
} from './subjects/chemie.js';

// Fach-Handler: Physik
import {
  handleGeneratePhysik, handleGradePhysik, handleModelAnswerPhysik, handleParseTaskPhysik,
  handleGenerateAbiturPhysik, handleGradeAbiturPhysik, handleModelAnswerAbiturPhysik
} from './subjects/physik.js';

// Fach-Handler: Biologie
import {
  handleGenerateBio, handleGradeBio, handleModelAnswerBio, handleParseTaskBio,
  handleGenerateAbiturBiologie, handleGradeAbiturBiologie, handleModelAnswerAbiturBiologie
} from './subjects/biologie.js';

// Fach-Handler: Sport
import {
  handleGenerateSport, handleGradeSport, handleModelAnswerSport, handleParseTaskSport,
  handleGenerateAbiturSport, handleGradeAbiturSport, handleModelAnswerAbiturSport
} from './subjects/sport.js';

// Fach-Handler: Informatik
import {
  handleGenerateInformatik, handleGradeInformatik, handleModelAnswerInformatik, handleParseTaskInformatik,
  handleGenerateAbiturInformatik, handleGradeAbiturInformatik, handleModelAnswerAbiturInformatik
} from './subjects/informatik.js';

// Fach-Handler: Kunst
import {
  handleParseTaskKunst,
  handleGenerateAbiturKunst, handleGradeAbiturKunst, handleModelAnswerAbiturKunst
} from './subjects/kunst.js';

// FOS-System
import { handleFOSRoute } from './fos/index.js';

/* ================= GRADE-HANDLER-MAP AUFBAUEN ================= */
setGradeHandlerMap({
  "grade": handleGrade,
  "grade-deutsch": handleGradeDeutsch,
  "grade-pug": handleGradePuG,
  "grade-abitur-pug": handleGradeAbiturPuG,
  "grade-geschichte": handleGradeGeschichte,
  "grade-abitur-geschichte": handleGradeAbiturGeschichte,
  "grade-french": handleGradeFrench,
  "grade-italian": handleGradeItalian,
  "grade-abitur-wr": handleGradeAbiturWR,
  "grade-wr": handleGradeWR,
  "grade-ethik": handleGradeEthik,
  "grade-abitur-ethik": handleGradeAbiturEthik,
  "grade-religion": handleGradeReligion,
  "grade-abitur-religion": handleGradeAbiturReligion,
  "grade-katholisch": handleGradeKatholisch,
  "grade-abitur-katholisch": handleGradeAbiturKatholisch,
  "grade-geographie": handleGradeGeographie,
  "grade-abitur-geographie": handleGradeAbiturGeographie,
  "grade-latein": handleGradeLatein,
  "grade-abitur-latein": handleGradeAbiturLatein,
  "grade-mathe": handleGradeMathe,
  "grade-abitur-mathe": handleGradeAbiturMathe,
  "grade-chemie": handleGradeChemie,
  "grade-physik": handleGradePhysik,
  "grade-bio": handleGradeBio,
  "grade-sport": handleGradeSport,
  "grade-abitur-sport": handleGradeAbiturSport,
  "grade-informatik": handleGradeInformatik,
  "grade-abitur-chemie": handleGradeAbiturChemie,
  "grade-abitur-physik": handleGradeAbiturPhysik,
  "grade-abitur-biologie": handleGradeAbiturBiologie,
  "grade-abitur-informatik": handleGradeAbiturInformatik,
  "grade-abitur-kunst": handleGradeAbiturKunst,
});

/* FOS-Handler für Grading registrieren */
const fosRouteWrapper = (pathname, request, env) => handleFOSRoute(pathname, request, env, {
  handleGenerate, handleGrade, handleModelAnswer, handleParseTask,
  handleGradeMathe, handleModelAnswerMathe, handleParseTaskMathe,
  handleGradeAbiturMathe, handleModelAnswerAbiturMathe,
  handleGradeAbiturBWR, handleModelAnswerAbiturBWR,
  handleGradeAbitur13BWR, handleModelAnswerAbitur13BWR,
  handleGradeWR, handleModelAnswerWR, handleParseTaskWR,
  handleParseTaskAbitur,
});
setFOSRouteHandler(fosRouteWrapper);

/* ================= MAIN HANDLER ================= */
export default {
  async fetch(request, env, ctx) {
    const { pathname } = new URL(request.url);

    // Origin auf env speichern (Race-Condition vermeiden)
    env._origin = request.headers.get("Origin");

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders(env, env._origin) });
    }

    try {
      // Auto-Migration (nur beim ersten Request)
      await ensureMigrations(env);

      // Origin-Validierung (CSRF-Schutz)
      const origin = env._origin;
      if (origin && !isOriginAllowed(origin, env)) {
        return jsonResponse({ error: "Forbidden" }, 403, env);
      }

      // Body-Größe prüfen
      const sizeError = checkBodySize(request, env, MAX_BODY_SIZE);
      if (sizeError) return sizeError;

      // ===== TEMPORÄRER DEBUG ENDPOINT =====
      if (pathname === "/api/debug-license" && request.method === "POST") {
        try {
          const { name } = await request.json();
          const nameLower = (name || "").trim().toLowerCase();
          const student = await env.DB.prepare("SELECT id, subscription_status, subscription_plan, class_group FROM students WHERE name_lower = ?").bind(nameLower).first();
          if (!student) return jsonResponse({ error: "nicht gefunden" }, 404, env);
          let freeAccess = false;
          let effectiveStatus = student.subscription_status || "none";
          const cp = await env.DB.prepare("SELECT free_access FROM class_passwords WHERE label = ? AND active = 1").bind(student.class_group).first();
          freeAccess = cp?.free_access === 1;
          if (!freeAccess && student.subscription_plan === 'school') effectiveStatus = "none";
          return jsonResponse({ student, cp, freeAccess, effectiveStatus }, 200, env);
        } catch(e) { return jsonResponse({ error: e.message, stack: e.stack }, 500, env); }
      }

      // ===== LOGIN ENDPOINTS (Rate-Limited) =====
      if (pathname === "/api/login" && request.method === "POST") {
        const loginLimit = checkRateLimit(request, loginRateLimitMap, MAX_LOGIN_ATTEMPTS, env);
        if (loginLimit) return loginLimit;
        cleanupRateLimitMaps();
        return await handleLogin(request, env);
      }
      if (pathname === "/api/check-student" && request.method === "POST") {
        const loginLimit = checkRateLimit(request, loginRateLimitMap, MAX_LOGIN_ATTEMPTS, env);
        if (loginLimit) return loginLimit;
        cleanupRateLimitMaps();
        return await handleCheckStudent(request, env);
      }

      // ===== DASHBOARD ENDPOINTS (Token-basiert) =====
      if (pathname === "/api/teacher-login" && request.method === "POST") {
        const loginLimit = checkRateLimit(request, loginRateLimitMap, MAX_LOGIN_ATTEMPTS, env);
        if (loginLimit) return loginLimit;
        cleanupRateLimitMaps();
        return await handleTeacherLogin(request, env);
      }
      if (pathname === "/api/results" && request.method === "POST") {
        const rl = checkRateLimit(request, rateLimitMap, MAX_REQUESTS_PER_WINDOW, env);
        if (rl) return rl;
        cleanupRateLimitMaps();
        return await handleGetResults(request, env);
      }
      if (pathname === "/api/delete-result" && request.method === "POST") {
        const rl = checkRateLimit(request, rateLimitMap, MAX_REQUESTS_PER_WINDOW, env);
        if (rl) return rl;
        cleanupRateLimitMaps();
        return await handleDeleteResult(request, env);
      }
      if (pathname === "/api/students" && request.method === "POST") {
        const rl = checkRateLimit(request, rateLimitMap, MAX_REQUESTS_PER_WINDOW, env);
        if (rl) return rl;
        cleanupRateLimitMaps();
        return await handleGetStudents(request, env);
      }
      if (pathname === "/api/delete-student" && request.method === "POST") {
        const rl = checkRateLimit(request, rateLimitMap, MAX_REQUESTS_PER_WINDOW, env);
        if (rl) return rl;
        cleanupRateLimitMaps();
        return await handleDeleteStudent(request, env);
      }
      if (pathname === "/api/class-passwords" && request.method === "POST") {
        const rl = checkRateLimit(request, rateLimitMap, MAX_REQUESTS_PER_WINDOW, env);
        if (rl) return rl;
        cleanupRateLimitMaps();
        return await handleClassPasswords(request, env);
      }
      if (pathname === "/api/subject-licenses" && request.method === "POST") {
        const rl = checkRateLimit(request, rateLimitMap, MAX_REQUESTS_PER_WINDOW, env);
        if (rl) return rl;
        cleanupRateLimitMaps();
        return await handleSubjectLicenses(request, env);
      }

      // ===== LEHRER-LISTE (Dashboard) =====
      if (pathname === "/api/dashboard-teachers" && request.method === "POST") {
        const rl = checkRateLimit(request, rateLimitMap, MAX_REQUESTS_PER_WINDOW, env);
        if (rl) return rl;
        cleanupRateLimitMaps();
        return await handleGetTeachers(request, env);
      }

      // ===== LEHRER FREISCHALTEN (Dashboard) =====
      if (pathname === "/api/dashboard-approve-teacher" && request.method === "POST") {
        const rl = checkRateLimit(request, rateLimitMap, MAX_REQUESTS_PER_WINDOW, env);
        if (rl) return rl;
        cleanupRateLimitMaps();
        return await handleApproveTeacher(request, env);
      }

      // ===== LEHRER ENTFERNEN (Dashboard) =====
      if (pathname === "/api/dashboard-delete-teacher" && request.method === "POST") {
        const rl = checkRateLimit(request, rateLimitMap, MAX_REQUESTS_PER_WINDOW, env);
        if (rl) return rl;
        cleanupRateLimitMaps();
        return await handleDeleteTeacher(request, env);
      }

      // ===== ACTIVITY FEED (Dashboard) =====
      if (pathname === "/api/activity-feed" && request.method === "POST") {
        const rl = checkRateLimit(request, rateLimitMap, MAX_REQUESTS_PER_WINDOW, env);
        if (rl) return rl;
        cleanupRateLimitMaps();
        return await handleActivityFeed(request, env);
      }

      // ===== FEEDBACK (Dashboard) =====
      if (pathname === "/api/feedback-list" && request.method === "POST") {
        const rl = checkRateLimit(request, rateLimitMap, MAX_REQUESTS_PER_WINDOW, env);
        if (rl) return rl;
        cleanupRateLimitMaps();
        return await handleGetFeedback(request, env);
      }
      if (pathname === "/api/feedback-valuable" && request.method === "POST") {
        const rl = checkRateLimit(request, rateLimitMap, MAX_REQUESTS_PER_WINDOW, env);
        if (rl) return rl;
        cleanupRateLimitMaps();
        return await handleToggleFeedbackValuable(request, env);
      }

      // ===== NACHRICHTEN (Dashboard → Schüler) =====
      if (pathname === "/api/messages/send" && request.method === "POST") {
        const rl = checkRateLimit(request, rateLimitMap, MAX_REQUESTS_PER_WINDOW, env);
        if (rl) return rl;
        cleanupRateLimitMaps();
        return await handleSendMessage(request, env);
      }
      if (pathname === "/api/messages/list" && request.method === "POST") {
        const rl = checkRateLimit(request, rateLimitMap, MAX_REQUESTS_PER_WINDOW, env);
        if (rl) return rl;
        cleanupRateLimitMaps();
        return await handleListMessages(request, env);
      }
      if (pathname === "/api/messages/delete" && request.method === "POST") {
        const rl = checkRateLimit(request, rateLimitMap, MAX_REQUESTS_PER_WINDOW, env);
        if (rl) return rl;
        cleanupRateLimitMaps();
        return await handleDeleteMessage(request, env);
      }

      // ===== LEHRER-CODE-SYSTEM (eigene Auth) =====
      if (pathname === "/api/teacher-approve" && request.method === "GET") {
        return await handleTeacherApprove(request, env);
      }
      if (pathname === "/api/teacher-register" && request.method === "POST") {
        const loginLimit = checkRateLimit(request, loginRateLimitMap, MAX_LOGIN_ATTEMPTS, env);
        if (loginLimit) return loginLimit;
        cleanupRateLimitMaps();
        return await handleTeacherRegister(request, env);
      }
      if (pathname === "/api/teacher-auth-login" && request.method === "POST") {
        const loginLimit = checkRateLimit(request, loginRateLimitMap, MAX_LOGIN_ATTEMPTS, env);
        if (loginLimit) return loginLimit;
        cleanupRateLimitMaps();
        return await handleTeacherAuthLogin(request, env);
      }
      if (pathname === "/api/teacher-codes" && request.method === "POST") {
        const rl = checkRateLimit(request, rateLimitMap, MAX_REQUESTS_PER_WINDOW, env);
        if (rl) return rl;
        cleanupRateLimitMaps();
        return await handleTeacherCodes(request, env);
      }
      if (pathname === "/api/teacher-results" && request.method === "POST") {
        const rl = checkRateLimit(request, rateLimitMap, MAX_REQUESTS_PER_WINDOW, env);
        if (rl) return rl;
        cleanupRateLimitMaps();
        return await handleTeacherResults(request, env);
      }
      if (pathname === "/api/teacher-profile" && request.method === "POST") {
        const rl = checkRateLimit(request, rateLimitMap, MAX_REQUESTS_PER_WINDOW, env);
        if (rl) return rl;
        cleanupRateLimitMaps();
        return await handleTeacherProfile(request, env);
      }
      // Lehrer-Korrekturguthaben (20 Gratis pro Monat)
      if (pathname === "/api/teacher/credit-balance" && request.method === "POST") {
        const rl = checkRateLimit(request, rateLimitMap, MAX_REQUESTS_PER_WINDOW, env);
        if (rl) return rl;
        cleanupRateLimitMaps();
        return await handleTeacherCreditBalance(request, env);
      }
      if (pathname === "/api/teacher/credit-history" && request.method === "POST") {
        const rl = checkRateLimit(request, rateLimitMap, MAX_REQUESTS_PER_WINDOW, env);
        if (rl) return rl;
        cleanupRateLimitMaps();
        return await handleTeacherCreditHistory(request, env);
      }

      if (pathname === "/api/teacher-tasks" && request.method === "POST") {
        const rl = checkRateLimit(request, rateLimitMap, MAX_REQUESTS_PER_WINDOW, env);
        if (rl) return rl;
        cleanupRateLimitMaps();
        return await handleTeacherTasks(request, env);
      }
      if (pathname === "/api/teacher-task-results" && request.method === "POST") {
        const rl = checkRateLimit(request, rateLimitMap, MAX_REQUESTS_PER_WINDOW, env);
        if (rl) return rl;
        cleanupRateLimitMaps();
        return await handleTeacherTaskResults(request, env);
      }
      if (pathname === "/api/generate-from-materials" && request.method === "POST") {
        const rl = checkRateLimit(request, rateLimitMap, MAX_REQUESTS_PER_WINDOW, env);
        if (rl) return rl;
        cleanupRateLimitMaps();
        return await handleGenerateFromMaterials(request, env);
      }

      // ===== STRIPE WEBHOOK (vor Auth-Check, eigene Signatur-Prüfung) =====
      if (pathname === "/api/stripe/webhook" && request.method === "POST") {
        return await handleStripeWebhook(request, env);
      }

      // ===== ASYNC GRADING: STATUS (vor Auth-Check) =====
      if (pathname.startsWith("/api/grade-status/") && request.method === "GET") {
        const authError = await checkAuth(request, env);
        if (authError) return authError;
        const jobId = pathname.replace("/api/grade-status/", "");
        return await handleGradeStatus(jobId, env);
      }

      // ===== FEEDBACK (kein Auth nötig, eigenes Rate Limit) =====
      if (pathname === "/api/feedback" && request.method === "POST") {
        const feedbackLimit = checkRateLimit(request, feedbackRateLimitMap, 5, env);
        if (feedbackLimit) return feedbackLimit;
        cleanupRateLimitMaps();
        try {
          const body = await request.json();
          const rating = parseInt(body.rating);
          if (!rating || rating < 1 || rating > 4) {
            return jsonResponse({ error: "Bewertung (1-4) ist erforderlich." }, 400, env);
          }
          const category = body.category || null;
          const message = body.message ? String(body.message).slice(0, 2000) : null;
          const page = body.page ? String(body.page).slice(0, 200) : null;
          const studentName = body.studentName ? String(body.studentName).slice(0, 100) : null;
          // Foto: base64 JPEG, max ~500KB base64 (~375KB Bild)
          const photo = (body.photo && typeof body.photo === "string" && body.photo.length < 700000)
            ? body.photo : null;
          await env.DB.prepare(
            "INSERT INTO feedback (rating, category, message, page, student_name) VALUES (?, ?, ?, ?, ?)"
          ).bind(rating, category, message, page, studentName).run();

          // Email-Benachrichtigung an Admin
          if (env.RESEND_API_KEY) {
            const catLabel = { bug: "🐛 Problem", wunsch: "💡 Wunsch", lob: "👍 Lob" }[category] || "Feedback";
            const ratingStars = "⭐".repeat(rating);
            fetch("https://api.resend.com/emails", {
              method: "POST",
              headers: { "Authorization": "Bearer " + env.RESEND_API_KEY, "Content-Type": "application/json" },
              body: JSON.stringify({
                from: "myAbiFlow <noreply@myabiflow.de>",
                to: ["info@myabiflow.de"],
                subject: "Neues Feedback: " + catLabel + " " + ratingStars,
                html: `<div style="font-family:system-ui,sans-serif;max-width:500px;margin:0 auto;padding:20px">
<h2 style="color:#2563eb;margin-top:0">Neues Schüler-Feedback</h2>
<p><strong>Bewertung:</strong> ${ratingStars} (${rating}/4)</p>
<p><strong>Kategorie:</strong> ${catLabel}</p>
${studentName ? `<p><strong>Schüler:</strong> ${studentName}</p>` : ''}
${page ? `<p><strong>Seite:</strong> ${page}</p>` : ''}
${message ? `<div style="background:#f8f9fa;padding:12px;border-radius:8px;margin:12px 0;white-space:pre-wrap">${message}</div>` : '<p style="color:#888">Keine Nachricht</p>'}
${photo ? `<div style="margin:12px 0"><p style="font-weight:600;margin-bottom:6px">📷 Foto:</p><img src="data:image/jpeg;base64,${photo}" style="max-width:480px;border-radius:8px;display:block" alt="Feedback-Foto"></div>` : ''}
<p style="margin-top:16px"><a href="https://myabiflow.de/dashboard.html" style="background:#2563eb;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:600">Im Dashboard ansehen →</a></p>
</div>`
              })
            }).catch(e => console.error("Feedback-Email Fehler:", e.message));
          }

          return jsonResponse({ success: true }, 200, env);
        } catch (e) {
          console.error("Feedback-Fehler:", e.message);
          return jsonResponse({ error: "Feedback konnte nicht gespeichert werden." }, 500, env);
        }
      }

      // ===== SHARED TASK (kein Auth noetig – Schueler geben nur einen Code ein) =====
      if (pathname === "/api/get-shared-task" && request.method === "POST") return await handleGetSharedTask(request, env);

      // ===== AUTH CHECK für restliche /api/ Endpoints =====
      if (pathname.startsWith("/api/")) {
        // Lehrer-Token: kein Abo-Check nötig
        const isTeacherRequest = !!request.headers.get("X-Teacher-Auth-Token");
        const authError = await checkAuth(request, env);
        if (authError) return authError;
        const rateLimitError = checkRateLimit(request, rateLimitMap, MAX_REQUESTS_PER_WINDOW, env);
        if (rateLimitError) return rateLimitError;
        cleanupRateLimitMaps();

        // Abo-Check für generate/grade Endpoints (nicht für Lehrer)
        if (!isTeacherRequest && /^\/(api)\/(fos-)?(generate|grade)/.test(pathname) && request.method === "POST") {
          const cloned = request.clone();
          let body;
          try { body = await cloned.json(); } catch (e) { /* Body-Parse fehlgeschlagen → Handler kümmert sich */ }
          if (body) {
            const headerName = request.headers.get("X-Student-Name");
            const studentName = body.student_name || (headerName ? decodeURIComponent(headerName) : "");
            const isGrade = /grade/.test(pathname);
            const subject = getSubjectFromPathname(pathname);
            const subError = await checkSubscriptionAccess(studentName, env, isGrade, subject);
            if (subError) return subError;
          }
        }
      }

      // ===== LEHRER-CODE (Schüler-Seite) =====
      if (pathname === "/api/link-student-code" && request.method === "POST") return await handleLinkStudentCode(request, env);
      if (pathname === "/api/student-codes" && request.method === "POST") return await handleStudentCodes(request, env);
      if (pathname === "/api/submit-shared-task" && request.method === "POST") return await handleSubmitSharedTask(request, env);

      // ===== SCHÜLER-NACHRICHTEN =====
      if (pathname === "/api/messages/inbox" && request.method === "POST") return await handleStudentMessages(request, env);
      if (pathname === "/api/messages/mark-read" && request.method === "POST") return await handleMarkMessageRead(request, env);
      if (pathname === "/api/messages/reply" && request.method === "POST") return await handleReplyMessage(request, env);

      // ===== STUDENT RESULTS =====
      if (pathname === "/api/student-results" && request.method === "POST") return await handleStudentResults(request, env);
      if (pathname === "/api/competency-profile" && request.method === "POST") return await handleCompetencyProfile(request, env);
      if (pathname === "/api/learning-plan" && request.method === "POST") return await handleLearningPlan(request, env);

      // ===== ENGLISCH =====
      if (pathname === "/api/generate" && request.method === "POST") return await handleGenerate(request, env);
      if (pathname === "/api/grade" && request.method === "POST") return await handleGrade(request, env);
      if (pathname === "/api/ocr" && request.method === "POST") return await handleOCR(request, env);
      if (pathname === "/api/ocr-bwr" && request.method === "POST") return await handleOCRBWR(request, env);
      if (pathname === "/api/parse-task" && request.method === "POST") return await handleParseTask(request, env);
      if (pathname === "/api/model-answer" && request.method === "POST") return await handleModelAnswer(request, env);
      if (pathname === "/api/generate-from-text-writing" && request.method === "POST") return await handleGenerateFromTextWriting(request, env);
      if (pathname === "/api/generate-from-text-mediation" && request.method === "POST") return await handleGenerateFromTextMediation(request, env);
      if (pathname === "/api/ocr-text" && request.method === "POST") return await handleOCRText(request, env);

      // ===== LISTENING =====
      if (pathname === "/api/generate-listening" && request.method === "POST") return await handleGenerateListening(request, env);
      if (pathname === "/api/grade-listening" && request.method === "POST") return await handleGradeListening(request, env);

      // ===== GESCHICHTE =====
      if (pathname === "/api/generate-geschichte" && request.method === "POST") return await handleGenerateGeschichte(request, env);
      if (pathname === "/api/grade-geschichte" && request.method === "POST") return await handleGradeGeschichte(request, env);

      // ===== DEUTSCH =====
      if (pathname === "/api/generate-deutsch" && request.method === "POST") return await handleGenerateDeutsch(request, env);
      if (pathname === "/api/grade-deutsch" && request.method === "POST") return await handleGradeDeutsch(request, env);
      if (pathname === "/api/grade-deutsch-stream" && request.method === "POST") return await handleGradeDeutschStream(request, env);
      if (pathname === "/api/model-answer-deutsch" && request.method === "POST") return await handleModelAnswerDeutsch(request, env);
      if (pathname === "/api/parse-task-deutsch" && request.method === "POST") return await handleParseTaskDeutsch(request, env);

      // ===== POLITIK UND GESELLSCHAFT =====
      if (pathname === "/api/generate-pug" && request.method === "POST") return await handleGeneratePuG(request, env);
      if (pathname === "/api/grade-pug" && request.method === "POST") return await handleGradePuG(request, env);
      if (pathname === "/api/model-answer-pug" && request.method === "POST") return await handleModelAnswerPuG(request, env);
      if (pathname === "/api/parse-task-pug" && request.method === "POST") return await handleParseTaskPuG(request, env);

      // ===== PUG ABITUR =====
      if (pathname === "/api/generate-abitur-pug" && request.method === "POST") return await handleGenerateAbiturPuG(request, env);
      if (pathname === "/api/grade-abitur-pug" && request.method === "POST") return await handleGradeAbiturPuG(request, env);
      if (pathname === "/api/model-answer-abitur-pug" && request.method === "POST") return await handleModelAnswerAbiturPuG(request, env);

      // ===== GESCHICHTE ABITUR =====
      if (pathname === "/api/generate-abitur-geschichte" && request.method === "POST") return await handleGenerateAbiturGeschichte(request, env);
      if (pathname === "/api/grade-abitur-geschichte" && request.method === "POST") return await handleGradeAbiturGeschichte(request, env);
      if (pathname === "/api/model-answer-abitur-geschichte" && request.method === "POST") return await handleModelAnswerAbiturGeschichte(request, env);

      // ===== WR ABITUR =====
      if (pathname === "/api/generate-abitur-wr" && request.method === "POST") return await handleGenerateAbiturWR(request, env);
      if (pathname === "/api/grade-abitur-wr" && request.method === "POST") return await handleGradeAbiturWR(request, env);
      if (pathname === "/api/model-answer-abitur-wr" && request.method === "POST") return await handleModelAnswerAbiturWR(request, env);

      // ===== WIRTSCHAFT UND RECHT =====
      if (pathname === "/api/generate-wr" && request.method === "POST") return await handleGenerateWR(request, env);
      if (pathname === "/api/grade-wr" && request.method === "POST") return await handleGradeWR(request, env);
      if (pathname === "/api/model-answer-wr" && request.method === "POST") return await handleModelAnswerWR(request, env);
      if (pathname === "/api/parse-task-wr" && request.method === "POST") return await handleParseTaskWR(request, env);

      // ===== FRANZÖSISCH =====
      if (pathname === "/api/model-answer-french" && request.method === "POST") return await handleModelAnswerFrench(request, env);
      if (pathname === "/api/model-answer-french-writing" && request.method === "POST") return await handleModelAnswerFrenchWriting(request, env);
      if (pathname === "/api/parse-task-french" && request.method === "POST") return await handleParseTaskFrench(request, env);
      if (pathname === "/api/grade-french" && request.method === "POST") return await handleGradeFrench(request, env);

      // ===== ITALIENISCH =====
      if (pathname === "/api/model-answer-italian" && request.method === "POST") return await handleModelAnswerItalian(request, env);
      if (pathname === "/api/model-answer-italian-writing" && request.method === "POST") return await handleModelAnswerItalianWriting(request, env);
      if (pathname === "/api/parse-task-italian" && request.method === "POST") return await handleParseTaskItalian(request, env);
      if (pathname === "/api/grade-italian" && request.method === "POST") return await handleGradeItalian(request, env);

      // ===== ETHIK =====
      if (pathname === "/api/generate-ethik" && request.method === "POST") return await handleGenerateEthik(request, env);
      if (pathname === "/api/grade-ethik" && request.method === "POST") return await handleGradeEthik(request, env);
      if (pathname === "/api/model-answer-ethik" && request.method === "POST") return await handleModelAnswerEthik(request, env);
      if (pathname === "/api/parse-task-ethik" && request.method === "POST") return await handleParseTaskEthik(request, env);

      // ===== ETHIK ABITUR =====
      if (pathname === "/api/generate-abitur-ethik" && request.method === "POST") return await handleGenerateAbiturEthik(request, env);
      if (pathname === "/api/grade-abitur-ethik" && request.method === "POST") return await handleGradeAbiturEthik(request, env);
      if (pathname === "/api/model-answer-abitur-ethik" && request.method === "POST") return await handleModelAnswerAbiturEthik(request, env);

      // ===== EV. RELIGION =====
      if (pathname === "/api/generate-religion" && request.method === "POST") return await handleGenerateReligion(request, env);
      if (pathname === "/api/grade-religion" && request.method === "POST") return await handleGradeReligion(request, env);
      if (pathname === "/api/model-answer-religion" && request.method === "POST") return await handleModelAnswerReligion(request, env);
      if (pathname === "/api/parse-task-religion" && request.method === "POST") return await handleParseTaskReligion(request, env);

      // ===== EV. RELIGION ABITUR =====
      if (pathname === "/api/generate-abitur-religion" && request.method === "POST") return await handleGenerateAbiturReligion(request, env);
      if (pathname === "/api/grade-abitur-religion" && request.method === "POST") return await handleGradeAbiturReligion(request, env);
      if (pathname === "/api/model-answer-abitur-religion" && request.method === "POST") return await handleModelAnswerAbiturReligion(request, env);

      // ===== KATH. RELIGION =====
      if (pathname === "/api/generate-katholisch" && request.method === "POST") return await handleGenerateKatholisch(request, env);
      if (pathname === "/api/grade-katholisch" && request.method === "POST") return await handleGradeKatholisch(request, env);
      if (pathname === "/api/model-answer-katholisch" && request.method === "POST") return await handleModelAnswerKatholisch(request, env);
      if (pathname === "/api/parse-task-katholisch" && request.method === "POST") return await handleParseTaskKatholisch(request, env);

      // ===== KATH. RELIGION ABITUR =====
      if (pathname === "/api/generate-abitur-katholisch" && request.method === "POST") return await handleGenerateAbiturKatholisch(request, env);
      if (pathname === "/api/grade-abitur-katholisch" && request.method === "POST") return await handleGradeAbiturKatholisch(request, env);
      if (pathname === "/api/model-answer-abitur-katholisch" && request.method === "POST") return await handleModelAnswerAbiturKatholisch(request, env);

      // ===== GEOGRAPHIE =====
      if (pathname === "/api/generate-geographie" && request.method === "POST") return await handleGenerateGeographie(request, env);
      if (pathname === "/api/grade-geographie" && request.method === "POST") return await handleGradeGeographie(request, env);
      if (pathname === "/api/model-answer-geographie" && request.method === "POST") return await handleModelAnswerGeographie(request, env);
      if (pathname === "/api/parse-task-geographie" && request.method === "POST") return await handleParseTaskGeographie(request, env);

      // ===== GEOGRAPHIE ABITUR =====
      if (pathname === "/api/generate-abitur-geographie" && request.method === "POST") return await handleGenerateAbiturGeographie(request, env);
      if (pathname === "/api/grade-abitur-geographie" && request.method === "POST") return await handleGradeAbiturGeographie(request, env);
      if (pathname === "/api/model-answer-abitur-geographie" && request.method === "POST") return await handleModelAnswerAbiturGeographie(request, env);

      // ===== LATEIN =====
      if (pathname === "/api/generate-latein" && request.method === "POST") return await handleGenerateLatein(request, env);
      if (pathname === "/api/grade-latein" && request.method === "POST") return await handleGradeLatein(request, env);
      if (pathname === "/api/model-answer-latein" && request.method === "POST") return await handleModelAnswerLatein(request, env);
      if (pathname === "/api/parse-task-latein" && request.method === "POST") return await handleParseTaskLatein(request, env);

      // ===== LATEIN ABITUR =====
      if (pathname === "/api/generate-abitur-latein" && request.method === "POST") return await handleGenerateAbiturLatein(request, env);
      if (pathname === "/api/grade-abitur-latein" && request.method === "POST") return await handleGradeAbiturLatein(request, env);
      if (pathname === "/api/model-answer-abitur-latein" && request.method === "POST") return await handleModelAnswerAbiturLatein(request, env);

      // ===== MATHEMATIK =====
      if (pathname === "/api/generate-mathe" && request.method === "POST") { console.log('[ROUTE-HIT] generate-mathe aufgerufen'); return await handleGenerateMathe(request, env); }
      if (pathname === "/api/grade-mathe" && request.method === "POST") return await handleGradeMathe(request, env);
      if (pathname === "/api/model-answer-mathe" && request.method === "POST") return await handleModelAnswerMathe(request, env);
      if (pathname === "/api/parse-task-mathe" && request.method === "POST") return await handleParseTaskMathe(request, env);

      // ===== MATHEMATIK ABITUR =====
      if (pathname === "/api/generate-abitur-mathe" && request.method === "POST") return await handleGenerateAbiturMathe(request, env);
      if (pathname === "/api/grade-abitur-mathe" && request.method === "POST") return await handleGradeAbiturMathe(request, env);
      if (pathname === "/api/model-answer-abitur-mathe" && request.method === "POST") return await handleModelAnswerAbiturMathe(request, env);

      // ===== CHEMIE =====
      if (pathname === "/api/generate-chemie" && request.method === "POST") return await handleGenerateChemie(request, env);
      if (pathname === "/api/grade-chemie" && request.method === "POST") return await handleGradeChemie(request, env);
      if (pathname === "/api/model-answer-chemie" && request.method === "POST") return await handleModelAnswerChemie(request, env);
      if (pathname === "/api/parse-task-chemie" && request.method === "POST") return await handleParseTaskChemie(request, env);

      // ===== PHYSIK =====
      if (pathname === "/api/generate-physik" && request.method === "POST") return await handleGeneratePhysik(request, env);
      if (pathname === "/api/grade-physik" && request.method === "POST") return await handleGradePhysik(request, env);
      if (pathname === "/api/model-answer-physik" && request.method === "POST") return await handleModelAnswerPhysik(request, env);
      if (pathname === "/api/parse-task-physik" && request.method === "POST") return await handleParseTaskPhysik(request, env);

      // ===== BIOLOGIE =====
      if (pathname === "/api/generate-bio" && request.method === "POST") return await handleGenerateBio(request, env);
      if (pathname === "/api/grade-bio" && request.method === "POST") return await handleGradeBio(request, env);
      if (pathname === "/api/model-answer-bio" && request.method === "POST") return await handleModelAnswerBio(request, env);
      if (pathname === "/api/parse-task-bio" && request.method === "POST") return await handleParseTaskBio(request, env);

      // ===== SPORT =====
      if (pathname === "/api/generate-sport" && request.method === "POST") return await handleGenerateSport(request, env);
      if (pathname === "/api/grade-sport" && request.method === "POST") return await handleGradeSport(request, env);
      if (pathname === "/api/model-answer-sport" && request.method === "POST") return await handleModelAnswerSport(request, env);
      if (pathname === "/api/parse-task-sport" && request.method === "POST") return await handleParseTaskSport(request, env);

      // ===== SPORT ABITUR =====
      if (pathname === "/api/generate-abitur-sport" && request.method === "POST") return await handleGenerateAbiturSport(request, env);
      if (pathname === "/api/grade-abitur-sport" && request.method === "POST") return await handleGradeAbiturSport(request, env);
      if (pathname === "/api/model-answer-abitur-sport" && request.method === "POST") return await handleModelAnswerAbiturSport(request, env);

      // ===== INFORMATIK =====
      if (pathname === "/api/generate-informatik" && request.method === "POST") return await handleGenerateInformatik(request, env);
      if (pathname === "/api/grade-informatik" && request.method === "POST") return await handleGradeInformatik(request, env);
      if (pathname === "/api/model-answer-informatik" && request.method === "POST") return await handleModelAnswerInformatik(request, env);
      if (pathname === "/api/parse-task-informatik" && request.method === "POST") return await handleParseTaskInformatik(request, env);

      // ===== CHEMIE ABITUR =====
      if (pathname === "/api/generate-abitur-chemie" && request.method === "POST") return await handleGenerateAbiturChemie(request, env);
      if (pathname === "/api/grade-abitur-chemie" && request.method === "POST") return await handleGradeAbiturChemie(request, env);
      if (pathname === "/api/model-answer-abitur-chemie" && request.method === "POST") return await handleModelAnswerAbiturChemie(request, env);

      // ===== PHYSIK ABITUR =====
      if (pathname === "/api/generate-abitur-physik" && request.method === "POST") return await handleGenerateAbiturPhysik(request, env);
      if (pathname === "/api/grade-abitur-physik" && request.method === "POST") return await handleGradeAbiturPhysik(request, env);
      if (pathname === "/api/model-answer-abitur-physik" && request.method === "POST") return await handleModelAnswerAbiturPhysik(request, env);

      // ===== BIOLOGIE ABITUR =====
      if (pathname === "/api/generate-abitur-biologie" && request.method === "POST") return await handleGenerateAbiturBiologie(request, env);
      if (pathname === "/api/grade-abitur-biologie" && request.method === "POST") return await handleGradeAbiturBiologie(request, env);
      if (pathname === "/api/model-answer-abitur-biologie" && request.method === "POST") return await handleModelAnswerAbiturBiologie(request, env);

      // ===== INFORMATIK ABITUR =====
      if (pathname === "/api/generate-abitur-informatik" && request.method === "POST") return await handleGenerateAbiturInformatik(request, env);
      if (pathname === "/api/grade-abitur-informatik" && request.method === "POST") return await handleGradeAbiturInformatik(request, env);
      if (pathname === "/api/model-answer-abitur-informatik" && request.method === "POST") return await handleModelAnswerAbiturInformatik(request, env);

      // ===== KUNST ABITUR =====
      if (pathname === "/api/generate-abitur-kunst" && request.method === "POST") return await handleGenerateAbiturKunst(request, env);
      if (pathname === "/api/grade-abitur-kunst" && request.method === "POST") return await handleGradeAbiturKunst(request, env);
      if (pathname === "/api/model-answer-abitur-kunst" && request.method === "POST") return await handleModelAnswerAbiturKunst(request, env);
      if (pathname === "/api/parse-task-kunst" && request.method === "POST") return await handleParseTaskKunst(request, env);

      // ===== FOS ENDPOINTS =====
      if (pathname.startsWith("/api/fos-") && request.method === "POST") {
        return await fosRouteWrapper(pathname, request, env);
      }

      // ===== IMAGE GENERATION =====
      if (pathname === "/api/generate-image" && request.method === "POST") return await handleGenerateImage(request, env);
      if (pathname === "/api/fetch-unsplash" && request.method === "POST") return await handleFetchUnsplash(request, env);

      // ===== SUBMIT RESULT =====
      if (pathname === "/api/submit-result" && request.method === "POST") return await handleSubmitResult(request, env);

      // ===== ASYNC GRADING: SUBMIT =====
      if (pathname === "/api/grade-submit" && request.method === "POST") return await handleGradeSubmit(request, env, ctx);

      // ===== STUDENT PREFERENCES & PROFIL =====
      if (pathname === "/api/get-preferences" && request.method === "POST") return await handleGetPreferences(request, env);
      if (pathname === "/api/save-preferences" && request.method === "POST") return await handleSavePreferences(request, env);
      if (pathname === "/api/check-reminders" && request.method === "POST") return await handleCheckReminders(request, env);
      if (pathname === "/api/change-password" && request.method === "POST") {
        const loginLimit = checkRateLimit(request, loginRateLimitMap, MAX_LOGIN_ATTEMPTS, env);
        if (loginLimit) return loginLimit;
        cleanupRateLimitMaps();
        return await handleChangePassword(request, env);
      }
      if (pathname === "/api/update-profile" && request.method === "POST") return await handleUpdateProfile(request, env);

      // ===== DETAIL-FEEDBACK =====
      if (pathname === "/api/detail-feedback" && request.method === "POST") return await handleDetailFeedback(request, env);

      // ===== REWRITE =====
      if (pathname === "/api/rewrite" && request.method === "POST") return await handleRewrite(request, env);

      // ===== STRIPE (authentifiziert) =====
      if (pathname === "/api/stripe/create-checkout" && request.method === "POST") return await handleCreateCheckout(request, env);
      if (pathname === "/api/stripe/subscription-status" && request.method === "POST") return await handleSubscriptionStatus(request, env);
      if (pathname === "/api/stripe/customer-portal" && request.method === "POST") return await handleCustomerPortal(request, env);
      if (pathname === "/api/stripe/start-trial" && request.method === "POST") return await handleStartTrial(request, env);
      if (pathname === "/api/stripe/redeem-license" && request.method === "POST") return await handleRedeemLicense(request, env);

      // ===== UNSUBSCRIBE =====
      if (pathname === "/api/unsubscribe" && request.method === "GET") return await handleUnsubscribe(request, env);

      return new Response("Not Found", { status: 404 });
    } catch (err) {
      console.error("Unhandled error:", err.message);
      const msg = err.message || "Interner Fehler.";
      const isUnsafe = msg.length > 200 || /api[_-]?key|token|secret|stack|\.js:/i.test(msg);
      return jsonResponse({ error: isUnsafe ? "Interner Fehler." : msg }, 500, env);
    }
  },

  // Täglicher Cron-Job
  async scheduled(event, env, ctx) {
    ctx.waitUntil(sendReminderEmails(env));
    ctx.waitUntil(cleanupOldGradingJobs(env));
  },

  // Queue-Consumer für asynchrone KI-Korrekturen
  async queue(batch, env) {
    if (batch.queue === "grading-dlq") {
      for (const message of batch.messages) {
        console.warn("DLQ: Job endgültig fehlgeschlagen:", message.body.jobId);
        message.ack();
      }
      return;
    }

    for (const message of batch.messages) {
      const { jobId, endpoint } = message.body;

      try {
        await env.DB.prepare(
          "UPDATE grading_jobs SET status = 'processing', attempts = attempts + 1, updated_at = ? WHERE id = ?"
        ).bind(new Date().toISOString(), jobId).run();

        const job = await env.DB.prepare(
          "SELECT input_data, endpoint FROM grading_jobs WHERE id = ?"
        ).bind(jobId).first();

        if (!job) {
          console.error("Grading Job nicht gefunden:", jobId);
          message.ack();
          continue;
        }

        const inputData = JSON.parse(job.input_data);
        const result = await executeGradeHandler(job.endpoint, inputData, env);

        await env.DB.prepare(
          "UPDATE grading_jobs SET status = 'completed', result_data = ?, updated_at = ? WHERE id = ?"
        ).bind(JSON.stringify(result), new Date().toISOString(), jobId).run();

        // Lehrer-Credit abbuchen (wenn Schüler kein eigenes Abo hat)
        await tryDeductTeacherCredit(jobId, endpoint, env);

        message.ack();
      } catch (err) {
        console.error("Grading Job " + jobId + " fehlgeschlagen:", err.message);
        const safeMsg = truncate(err.message || "Unbekannter Fehler", 500);
        const isUnsafe = /api[_-]?key|token|secret|stack|\.js:/i.test(safeMsg);
        await env.DB.prepare(
          "UPDATE grading_jobs SET status = 'failed', error_msg = ?, updated_at = ? WHERE id = ?"
        ).bind(isUnsafe ? "Interner Fehler." : safeMsg, new Date().toISOString(), jobId).run();
        message.retry();
      }
    }
  }
};
