/**
 * Cloudflare Worker – Gemini API Proxy
 * Hält den API Key als Secret und leitet Anfragen (REST + WebSocket) an Gemini weiter.
 * Session-basierte Routes delegieren an das ColloquiumSession Durable Object.
 */

export { ColloquiumSession } from './session-do';

interface Env {
  GEMINI_API_KEY: string;
  ALLOWED_ORIGIN?: string;
  COLLOQUIUM_SESSION: DurableObjectNamespace;
}

const GEMINI_HOST = 'generativelanguage.googleapis.com';
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const MAX_SESSION_CREATES_PER_WINDOW = 5;
const MIN_ACCESS_TOKEN_LENGTH = 16;

interface SessionCreateRequestBody {
  student_id?: string;
  [key: string]: unknown;
}

type SessionCreateRateLimitStore = Map<string, number[]>;

function getSessionCreateRateLimitStore(): SessionCreateRateLimitStore {
  const rateLimitState = globalThis as typeof globalThis & {
    __sessionCreateRateLimit?: SessionCreateRateLimitStore;
  };
  if (!rateLimitState.__sessionCreateRateLimit) {
    rateLimitState.__sessionCreateRateLimit = new Map<string, number[]>();
  }
  return rateLimitState.__sessionCreateRateLimit;
}

function corsHeaders(env: Env): Record<string, string> {
  const allowed = env.ALLOWED_ORIGIN || 'https://myabiflow.de';
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Access-Token, x-goog-api-client, x-goog-api-key, User-Agent',
    'Access-Control-Max-Age': '86400',
  };
}

function isAllowedOrigin(request: Request, env: Env): boolean {
  const allowedOrigin = env.ALLOWED_ORIGIN || 'https://myabiflow.de';
  return request.headers.get('Origin') === allowedOrigin;
}

function isPlausibleAccessToken(token: string | null): token is string {
  return typeof token === 'string' && token.trim().length >= MIN_ACCESS_TOKEN_LENGTH;
}

function enforceSessionCreateRateLimit(studentId: string): boolean {
  const now = Date.now();
  const rateLimitStore = getSessionCreateRateLimitStore();
  const timestamps = rateLimitStore.get(studentId) || [];
  const recentTimestamps = timestamps.filter((timestamp) => now - timestamp < RATE_LIMIT_WINDOW_MS);

  if (recentTimestamps.length >= MAX_SESSION_CREATES_PER_WINDOW) {
    rateLimitStore.set(studentId, recentTimestamps);
    return false;
  }

  recentTimestamps.push(now);
  rateLimitStore.set(studentId, recentTimestamps);
  return true;
}

function buildUpstreamUrl(requestUrl: URL, realKey: string): URL {
  const out = new URL(requestUrl.toString());
  // Replace any dummy key with the real one
  if (out.searchParams.has('key')) {
    out.searchParams.set('key', realKey);
  }
  out.hostname = GEMINI_HOST;
  out.port = '';
  out.protocol = 'https:';
  return out;
}

function addCors(response: Response, cors: Record<string, string>): Response {
  const newResp = new Response(response.body, response);
  for (const [k, v] of Object.entries(cors)) {
    newResp.headers.set(k, v);
  }
  return newResp;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const cors = corsHeaders(env);

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }

    if (!isAllowedOrigin(request, env)) {
      return new Response('Forbidden', { status: 403, headers: cors });
    }

    const url = new URL(request.url);

    // ── Session-basierte Routes (Durable Objects) ──
    if (url.pathname.startsWith('/session/')) {
      const response = await handleSessionRoute(request, url, env);
      return addCors(response, cors);
    }

    const targetUrl = buildUpstreamUrl(url, env.GEMINI_API_KEY);

    // ── WebSocket proxy (for Live API) ──
    if (request.headers.get('Upgrade')?.toLowerCase() === 'websocket') {
      // Build upstream headers – copy originals but fix host
      const upstreamHeaders = new Headers(request.headers);
      upstreamHeaders.set('Host', GEMINI_HOST);

      // Cloudflare fetch() with Upgrade: websocket returns a response with .webSocket
      const upstreamResp = await fetch(targetUrl.toString(), {
        headers: upstreamHeaders,
      });

      // Cloudflare WebSocket-Upgrade typing quirk.
      const upstream = (upstreamResp as any).webSocket as WebSocket | null;
      if (!upstream) {
        return new Response('WebSocket upgrade to upstream failed', { status: 502 });
      }

      // Create a pair: client ↔ server
      const pair = new WebSocketPair();
      // Cloudflare WebSocketPair typing quirk.
      const [client, server] = Object.values(pair) as [WebSocket, WebSocket];

      // Accept both sides
      upstream.accept();
      server.accept();

      let serverClosed = false;
      let upstreamClosed = false;

      // Bidirektionale Nachrichtenweiterleitung
      server.addEventListener('message', (event) => {
        if (upstreamClosed) return;
        try {
          upstream.send(event.data);
        } catch (err) {
          console.error('Fehler beim Senden an Upstream:', err);
          // Nicht sofort schließen – einzelner Sendefehler ist kein Grund aufzugeben
        }
      });
      upstream.addEventListener('message', (event) => {
        if (serverClosed) return;
        try {
          server.send(event.data);
        } catch (err) {
          console.error('Fehler beim Senden an Client:', err);
        }
      });

      // Close-Events mit Code und Reason weiterleiten
      server.addEventListener('close', (event) => {
        serverClosed = true;
        console.log(`Client WebSocket geschlossen: code=${event.code} reason=${event.reason || '(leer)'}`);
        if (!upstreamClosed) {
          try { upstream.close(event.code, event.reason); } catch {}
        }
      });
      upstream.addEventListener('close', (event) => {
        upstreamClosed = true;
        console.log(`Upstream WebSocket geschlossen: code=${event.code} reason=${event.reason || '(leer)'}`);
        if (!serverClosed) {
          // 1000 = normal close, damit der Client sauber reconnecten kann
          try { server.close(event.code || 1000, event.reason || 'upstream closed'); } catch {}
        }
      });

      // Error-Handling
      server.addEventListener('error', (event) => {
        console.error('Client WebSocket Fehler:', event);
        if (!upstreamClosed) {
          try { upstream.close(1011, 'client error'); } catch {}
        }
      });
      upstream.addEventListener('error', (event) => {
        console.error('Upstream WebSocket Fehler:', event);
        if (!serverClosed) {
          try { server.close(1011, 'upstream error'); } catch {}
        }
      });

      return new Response(null, {
        status: 101,
        // Cloudflare WebSocket-Upgrade typing quirk.
        webSocket: client,
      } as ResponseInit & { webSocket: WebSocket });
    }

    // ── Regular HTTP proxy (for text generation, feedback etc.) ──
    const headers = new Headers(request.headers);
    headers.set('x-goog-api-key', env.GEMINI_API_KEY);
    headers.delete('host');

    const proxyResponse = await fetch(targetUrl.toString(), {
      method: request.method,
      headers,
      body: request.body,
    });

    // Attach CORS headers to response
    const response = new Response(proxyResponse.body, {
      status: proxyResponse.status,
      statusText: proxyResponse.statusText,
      headers: proxyResponse.headers,
    });
    for (const [k, v] of Object.entries(cors)) {
      response.headers.set(k, v);
    }

    return response;
  },
};

// ── Session-Routing zu Durable Objects ──
async function handleSessionRoute(request: Request, url: URL, env: Env): Promise<Response> {
  // POST /session/create
  if (url.pathname === '/session/create' && request.method === 'POST') {
    const accessToken = request.headers.get('X-Access-Token');
    if (!isPlausibleAccessToken(accessToken)) {
      return new Response('Unauthorized', { status: 401 });
    }

    const requestBody = await request.json() as SessionCreateRequestBody;
    const studentId = typeof requestBody.student_id === 'string' ? requestBody.student_id.trim() : '';
    if (!studentId) {
      return new Response('student_id fehlt', { status: 401 });
    }

    // TODO: Vollwertigen Token-Verify gegen das Backend ergänzen.
    if (!enforceSessionCreateRateLimit(studentId)) {
      return new Response('Too Many Requests', { status: 429 });
    }

    const id = env.COLLOQUIUM_SESSION.newUniqueId();
    const stub = env.COLLOQUIUM_SESSION.get(id);

    const response = await stub.fetch(new Request('https://do/create', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Access-Token': accessToken,
        'X-Student-Id': studentId,
      },
      body: JSON.stringify(requestBody),
    }));

    const data = await response.json() as Record<string, unknown>;
    return new Response(JSON.stringify({
      sessionId: id.toString(),
      ...data,
    }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // /session/{id}/ws  oder  /session/{id}/status  oder  /session/{id}/transcript
  const match = url.pathname.match(/^\/session\/([a-f0-9]+)\/(ws|status|transcript)$/);
  if (match) {
    const [, sessionIdHex, action] = match;
    // WebSockets im Browser können keine Custom-Header senden -> Token kommt
    // entweder im X-Access-Token Header (HTTP) oder im Sec-WebSocket-Protocol als "bearer.<token>".
    let accessToken: string | null = request.headers.get('X-Access-Token');
    if (!accessToken && action === 'ws') {
      const proto = request.headers.get('Sec-WebSocket-Protocol') || '';
      const bearer = proto.split(',').map(s => s.trim()).find(s => s.startsWith('bearer.'));
      if (bearer) accessToken = bearer.slice('bearer.'.length);
    }
    if (!isPlausibleAccessToken(accessToken)) {
      return new Response('Unauthorized', { status: 401 });
    }

    let id: DurableObjectId;
    try {
      id = env.COLLOQUIUM_SESSION.idFromString(sessionIdHex);
    } catch {
      return new Response('Ungültige Session-ID', { status: 400 });
    }

    const stub = env.COLLOQUIUM_SESSION.get(id);

    // WebSocket-Upgrade direkt an DO weiterleiten. Token liegt entweder im
    // X-Access-Token-Header (vom Outer Worker geprüft) oder im Subprotocol — der DO
    // macht den gleichen Doppelpfad-Check noch einmal.
    if (action === 'ws') {
      return stub.fetch(request);
    }

    // REST-Endpoints
    return stub.fetch(new Request(`https://do/${action}`, {
      method: request.method,
      headers: request.headers,
    }));
  }

  return new Response('Not Found', { status: 404 });
}
