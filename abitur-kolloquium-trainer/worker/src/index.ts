/**
 * Cloudflare Worker – Gemini API Proxy
 * Hält den API Key als Secret und leitet Anfragen (REST + WebSocket) an Gemini weiter.
 */

interface Env {
  GEMINI_API_KEY: string;
  ALLOWED_ORIGIN?: string;
}

const GEMINI_HOST = 'generativelanguage.googleapis.com';

function corsHeaders(env: Env): Record<string, string> {
  const allowed = env.ALLOWED_ORIGIN || '*';
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, x-goog-api-client, x-goog-api-key, User-Agent',
    'Access-Control-Max-Age': '86400',
  };
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

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const cors = corsHeaders(env);

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }

    const url = new URL(request.url);
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

      const upstream = (upstreamResp as any).webSocket as WebSocket | null;
      if (!upstream) {
        return new Response('WebSocket upgrade to upstream failed', { status: 502 });
      }

      // Create a pair: client ↔ server
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);

      // Accept both sides
      upstream.accept();
      server.accept();

      // Bidirectional message forwarding
      server.addEventListener('message', (event) => {
        try { upstream.send(event.data); } catch { server.close(); }
      });
      upstream.addEventListener('message', (event) => {
        try { server.send(event.data); } catch { upstream.close(); }
      });

      // Close forwarding
      server.addEventListener('close', (event) => {
        try { upstream.close(event.code, event.reason); } catch {}
      });
      upstream.addEventListener('close', (event) => {
        try { server.close(event.code, event.reason); } catch {}
      });

      // Error handling
      server.addEventListener('error', () => {
        try { upstream.close(); } catch {}
      });
      upstream.addEventListener('error', () => {
        try { server.close(); } catch {}
      });

      return new Response(null, {
        status: 101,
        webSocket: client,
      });
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
