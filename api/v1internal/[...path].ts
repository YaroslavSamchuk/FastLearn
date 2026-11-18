/**
 * Vercel Edge Function - Antigravity Proxy
 */
export const config = {
  runtime: 'edge',
};

const ANTIGRAVITY_UPSTREAM = 'https://daily-cloudcode-pa.googleapis.com';
const ANTIGRAVITY_USER_AGENT =
  'antigravity/cli/1.4.12 (aidev_client; os_type=windows; arch=amd64; cl=1010700967; auth_method=consumer)';

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS, PUT, DELETE',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Max-Age': '86400',
};

export default async function handler(req: Request) {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  const url = new URL(req.url);
  const targetUrl = new URL(url.pathname + url.search, ANTIGRAVITY_UPSTREAM);

  const headers = new Headers(req.headers);
  headers.set('User-Agent', ANTIGRAVITY_USER_AGENT);
  headers.delete('Host');

  try {
    const upstreamRes = await fetch(targetUrl.toString(), {
      method: req.method,
      headers,
      body: req.body,
      redirect: 'follow',
    });

    const responseHeaders = new Headers(upstreamRes.headers);
    for (const [key, val] of Object.entries(CORS_HEADERS)) {
      responseHeaders.set(key, val);
    }

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
          message: `Vercel Proxy Error: ${err?.message || 'Upstream connection failed'}`,
        },
      }),
      {
        status: 502,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      }
    );
  }
}
