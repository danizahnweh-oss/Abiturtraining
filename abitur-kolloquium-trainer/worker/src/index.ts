/**
 * Cloudflare Worker – Gemini API Proxy
 * Hält den API Key als Secret und leitet Anfragen (REST + WebSocket) an Gemini weiter.
 */

interface Env {
  GEMINI_API_KEY: string;
  ALLOWED_ORIGIN?: string; // optional: restrict CORS
}

const GEMINI_HOST = 'generativelanguage.googleapis.com';

function corsHeaders(origin: string | null, env: Env): Record<string, string> {
  const allowed = env.ALLOWED_ORIGIN || '*';
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, x-goog-api-client, x-goog-api-key, User-Agent',
    'Access-Control-Max-Age': '86400',
  };
}

function replaceKey(url: URL, realKey: string): URL {
  const out = new URL(url.toString());
  // Replace any dummy key with the real one
  if (out.searchParams.has('key')) {
    out.searchParams.set('key', realKey);
  }
  out.hostname = GEMINI_HOST;
  out.port = '';
  out.protocol = 'https:';
  return out;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const cors = corsHeaders(request.headers.get('Origin'), env);

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }

    const url = new URL(request.url);
    const targetUrl = replaceKey(url, env.GEMINI_API_KEY);

    // ── WebSocket proxy (for Live API) ──
    if (request.headers.get('Upgrade')?.toLowerCase() === 'websocket') {
      const wsTarget = new URL(targetUrl.toString());
      wsTarget.protocol = 'wss:';

      // Forward the WebSocket upgrade to Gemini
      const upstreamResponse = await fetch(wsTarget.toString(), {
        method: request.method,
        headers: request.headers,
      });

      return upstreamResponse;
    }

    // ── Regular HTTP proxy (for text generation, feedback etc.) ──
    const headers = new Headers(request.headers);
    headers.set('x-goog-api-key', env.GEMINI_API_KEY);
    // Remove host header to avoid conflicts
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
