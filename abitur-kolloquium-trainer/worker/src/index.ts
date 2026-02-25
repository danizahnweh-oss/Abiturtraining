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
