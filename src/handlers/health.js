const HEALTH_HEADERS = {
  "Cache-Control": "no-store",
  "Content-Type": "application/json",
};

const TIMEOUT_MS = 3000;

function withTimeout(factory, timeoutMs = TIMEOUT_MS) {
  const startedAt = Date.now();
  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(() => reject(new Error("timeout")), timeoutMs);
  });

  return Promise.race([factory(), timeoutPromise]).then((value) => ({
    value,
    durationMs: Date.now() - startedAt,
  }));
}

function sanitizeErrorMessage(error, fallback) {
  const message = String(error?.message || fallback || "error");
  if (/timeout/i.test(message)) return "timeout";
  if (/ECONNREFUSED|ENOTFOUND|fetch failed|network/i.test(message)) return "unreachable";
  if (/secret|token|key|password|postgres|redis|localhost|127\.0\.0\.1|connection/i.test(message)) {
    return fallback || "error";
  }
  return message.slice(0, 120);
}

function jsonHealthResponse(body, statusCode) {
  return new Response(JSON.stringify(body), {
    status: statusCode,
    headers: HEALTH_HEADERS,
  });
}

async function runDbCheck(env) {
  const startedAt = Date.now();
  try {
    await withTimeout(() => env.DB.prepare("SELECT 1 AS ok").first());
    return { status: "ok", duration_ms: Date.now() - startedAt, error: null };
  } catch (error) {
    return {
      status: "error",
      duration_ms: Date.now() - startedAt,
      error: sanitizeErrorMessage(error, "db_check_failed"),
    };
  }
}

async function runGeminiProxyCheck() {
  const startedAt = Date.now();
  try {
    const { value: response, durationMs } = await withTimeout(() => fetch("http://localhost:3001/health"));

    if (response.status === 200) {
      return { status: "ok", duration_ms: durationMs };
    }

    if (response.status === 404 || response.status === 405) {
      return { status: "unknown", duration_ms: durationMs };
    }

    return { status: "error", duration_ms: durationMs };
  } catch (error) {
    const message = sanitizeErrorMessage(error, "gemini_proxy_unreachable");
    if (message === "unreachable" || message === "timeout") {
      return { status: "unknown", duration_ms: Date.now() - startedAt };
    }
    return { status: "error", duration_ms: Date.now() - startedAt };
  }
}

export async function handleHealth(request, env) {
  const basePayload = {
    status: "error",
    timestamp: new Date().toISOString(),
    version: env?.GIT_COMMIT_SHA || "unknown",
    checks: {
      db: { status: "error", duration_ms: 0, error: "not_run" },
      openai: { status: "missing" },
      gemini: { status: "missing" },
      stripe: { status: "missing" },
      gemini_proxy: { status: "unknown", duration_ms: 0 },
    },
  };

  try {
    if (request.method !== "GET") {
      basePayload.checks.db = { status: "error", duration_ms: 0, error: "method_not_allowed" };
      return jsonHealthResponse(basePayload, 200);
    }

    const dbPromise = runDbCheck(env).catch(() => ({
      status: "error",
      duration_ms: 0,
      error: "db_check_failed",
    }));
    const geminiProxyPromise = runGeminiProxyCheck().catch(() => ({
      status: "unknown",
      duration_ms: 0,
    }));

    const [db, geminiProxy] = await Promise.all([dbPromise, geminiProxyPromise]);

    // Fallback auf process.env, falls der Wrapper bestimmte Vars nicht durchreicht.
    const procEnv = (typeof process !== "undefined" && process.env) ? process.env : {};
    const has = (k) => !!(env?.[k] || procEnv[k]);
    const checks = {
      db,
      openai: { status: has("OPENAI_API_KEY") ? "ok" : "missing" },
      gemini: { status: has("GEMINI_API_KEY") ? "ok" : "missing" },
      stripe: { status: (has("STRIPE_SECRET_KEY") || has("STRIPE_SECRET")) ? "ok" : "missing" },
      gemini_proxy: geminiProxy,
    };

    let status = "ok";
    let statusCode = 200;

    if (checks.db.status === "error") {
      status = "error";
      statusCode = 503;
    } else if (
      checks.openai.status !== "ok" ||
      checks.gemini.status !== "ok" ||
      checks.stripe.status !== "ok" ||
      checks.gemini_proxy.status !== "ok"
    ) {
      status = "degraded";
    }

    return jsonHealthResponse(
      {
        status,
        timestamp: new Date().toISOString(),
        version: env?.GIT_COMMIT_SHA || "unknown",
        checks,
      },
      statusCode,
    );
  } catch (error) {
    return jsonHealthResponse(
      {
        ...basePayload,
        timestamp: new Date().toISOString(),
        checks: {
          ...basePayload.checks,
          db: {
            status: "error",
            duration_ms: 0,
            error: sanitizeErrorMessage(error, "health_handler_failed"),
          },
        },
      },
      200,
    );
  }
}
