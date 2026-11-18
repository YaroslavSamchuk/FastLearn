/**
 * Cloudflare Pages Functions - Antigravity Reverse Proxy & Healthcheck
 * Intercepts /v1internal requests at Cloudflare Edge and injects required User-Agent.
 */

interface Env {}

const ANTIGRAVITY_UPSTREAM = 'https://daily-cloudcode-pa.googleapis.com';
const ANTIGRAVITY_USER_AGENT =
  'antigravity/cli/1.4.12 (aidev_client; os_type=windows; arch=amd64; cl=1010700967; auth_method=consumer)';

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS, PUT, DELETE',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Max-Age': '86400',
};

export const onRequest: PagesFunction<Env> = async (context) => {
  const request = context.request;
  const url = new URL(request.url);

  // Handle CORS preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  // Health check
  if (url.pathname === '/health' || url.pathname === '/healthz') {
    return new Response(
      JSON.stringify({ status: 'ok', app: 'FastLearn', runtime: 'cloudflare-pages' }),
      {
        status: 200,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      }
    );
  }

  // Antigravity proxy: intercepts /v1internal... (e.g. /v1internal:generateContent)
  if (url.pathname.startsWith('/v1internal')) {
    const targetUrl = new URL(url.pathname + url.search, ANTIGRAVITY_UPSTREAM);

    const headers = new Headers(request.headers);
    headers.set('User-Agent', ANTIGRAVITY_USER_AGENT);
    headers.delete('Host');

    try {
      const upstreamRes = await fetch(targetUrl.toString(), {
        method: request.method,
        headers,
        body: request.body,
        redirect: 'follow',
      });

      const responseHeaders = new Headers(upstreamRes.headers);
      for (const [key, val] of Object.entries(CORS_HEADERS)) {
        responseHeaders.set(key, val);
      }

      // Ensure SSE buffering is disabled for streaming
      if (responseHeaders.get('content-type')?.includes('text/event-stream')) {
        responseHeaders.set('Cache-Control', 'no-cache');
        responseHeaders.set('X-Accel-Buffering', 'no');
      }

      return new Response(upstreamRes.body, {
        status: upstreamRes.status,
        headers: responseHeaders,
      });
    } catch (err: any) {
      return new Response(
        JSON.stringify({
          error: {
            code: 502,
            message: `Cloudflare Antigravity Proxy Error: ${err?.message || 'Upstream connection failed'}`,
          },
        }),
        {
          status: 502,
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        }
      );
    }
  }

  // Pass through all other requests to static assets in dist/
  return context.next();
};
