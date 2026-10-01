import { jsonResponse } from './utils.js';

// Server-owned, per-request state. Never accept a deadline from the request body.
export const GENERATION_DEADLINE = Symbol('generationDeadline');
export const GENERATION_TIMEOUT_MS = 270000; // Nginx allows 300 seconds.
export const GENERATION_PATH = /^\/api\/(?:fos-)?generate(?:-[a-z0-9-]+)?$/;

export function resolveGenerationDeadline(env, explicitDeadline) {
  const deadlines = [env?.[GENERATION_DEADLINE], explicitDeadline].filter(Number.isFinite);
  return deadlines.length ? Math.min(...deadlines) : undefined;
}

export function generationTimeoutError() {
  const error = new Error('Die Aufgabenerstellung dauert zu lange. Bitte versuche es erneut.');
  error.code = 'GENERATION_TIMEOUT';
  return error;
}

// The outer boundary also covers preprocessing and handlers that catch errors.
export async function withGenerationRuntime(request, env, ctx, handler) {
  if (request.method !== 'POST' || !GENERATION_PATH.test(new URL(request.url).pathname)) {
    return handler(request, env, ctx);
  }
  const deadline = resolveGenerationDeadline(env, Date.now() + GENERATION_TIMEOUT_MS);
  const requestEnv = { ...env, [GENERATION_DEADLINE]: deadline, _origin: request.headers.get('Origin') };
  const timeoutResponse = () => jsonResponse({ error: generationTimeoutError().message, code: 'GENERATION_TIMEOUT' }, 503, requestEnv);
  if (deadline <= Date.now()) return timeoutResponse();
  let timer;
  try {
    const result = await Promise.race([
      Promise.resolve().then(() => handler(request, requestEnv, ctx)),
      new Promise(resolve => { timer = setTimeout(() => resolve(timeoutResponse()), deadline - Date.now()); })
    ]);
    return Date.now() >= deadline ? timeoutResponse() : result;
  } catch (error) {
    if (error.code === 'GENERATION_TIMEOUT') return timeoutResponse();
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
