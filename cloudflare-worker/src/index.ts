/**
 * FastLearn Antigravity Reverse Proxy - Standalone Cloudflare Worker
 * Free tier: 100,000 requests/day
 *
 * Use this worker if you host your FastLearn frontend on GitHub Pages
 * and need a fast, zero-cost Edge proxy to connect to Google Antigravity.
 */

const ANTIGRAVITY_UPSTREAM = 'https://daily-cloudcode-pa.googleapis.com';
const ANTIGRAVITY_USER_AGENT =
  'antigravity/cli/1.4.12 (aidev_client; os_type=windows; arch=amd64; cl=1010700967; auth_method=consumer)';

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS, PUT, DELETE',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Max-Age': '86400',
};

export default {
  async fetch(request: Request): Promise<Response> {
    // 1. CORS Preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const url = new URL(request.url);

    // 2. Healthcheck & Root status
    if (url.pathname === '/health' || url.pathname === '/') {
      return new Response(
        JSON.stringify({
          status: 'ok',
          service: 'fastlearn-antigravity-proxy',
          provider: 'cloudflare-worker',
          upstream: ANTIGRAVITY_UPSTREAM,
        }),
        {
          status: 200,
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        }
      );
    }

    // 3. Antigravity Proxy: Intercepts /v1internal...
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

        // Disable buffering for Server-Sent Events (SSE) streaming
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
              message: `Cloudflare Worker Proxy Error: ${err?.message || 'Upstream connection failed'}`,
            },
          }),
          {
            status: 502,
            headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
          }
        );
      }
    }

    return new Response(
      JSON.stringify({
        error: {
          code: 404,
          message: 'Route not found. Valid endpoints: /health, /v1internal:*',
        },
      }),
      {
        status: 404,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      }
    );
  },
};
