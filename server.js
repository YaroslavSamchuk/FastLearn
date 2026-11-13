/**
 * FastLearn — Production HTTP Server & Antigravity Reverse Proxy
 * Designed for Koyeb, Docker, and Node.js environments.
 * 
 * Features:
 *  - Serves compiled React SPA from frontend/dist
 *  - Reverse-proxies /v1internal to Google Antigravity backend with required User-Agent
 *  - SPA fallback routing (serves index.html for client-side navigation)
 *  - Zero external production dependencies (uses Node.js native standard library)
 */

import http from 'node:http';
import https from 'node:https';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Port configured for Koyeb (injects process.env.PORT)
const PORT = parseInt(process.env.PORT || '8000', 10);
const HOST = '0.0.0.0';

const DIST_DIR = path.join(__dirname, 'frontend', 'dist');

// Upstream Google Antigravity PA API endpoint
const ANTIGRAVITY_UPSTREAM = 'https://daily-cloudcode-pa.googleapis.com';
const ANTIGRAVITY_USER_AGENT =
  'antigravity/cli/1.4.12 (aidev_client; os_type=windows; arch=amd64; cl=1010700967; auth_method=consumer)';

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
};

/**
 * Reverse proxy for Google Antigravity backend requests.
 * Injects required User-Agent and streams Server-Sent Events (SSE).
 */
function handleProxy(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, DELETE');
  res.setHeader('Access-Control-Allow-Headers', '*');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const targetUrl = new URL(req.url, ANTIGRAVITY_UPSTREAM);

  const headers = { ...req.headers };
  delete headers['host'];
  headers['user-agent'] = ANTIGRAVITY_USER_AGENT;

  const options = {
    hostname: targetUrl.hostname,
    port: 443,
    path: targetUrl.pathname + targetUrl.search,
    method: req.method,
    headers: headers,
  };

  const proxyReq = https.request(options, (proxyRes) => {
    // Forward status & headers, disable buffering for SSE
    const respHeaders = { ...proxyRes.headers };
    respHeaders['Access-Control-Allow-Origin'] = '*';
    if (respHeaders['content-type']?.includes('text/event-stream')) {
      respHeaders['Cache-Control'] = 'no-cache';
      respHeaders['X-Accel-Buffering'] = 'no';
    }

    res.writeHead(proxyRes.statusCode || 500, respHeaders);
    proxyRes.pipe(res);
  });

  proxyReq.on('error', (err) => {
    console.error('[Antigravity Proxy Error]:', err.message);
    if (!res.headersSent) {
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          error: {
            code: 502,
            message: `Antigravity Upstream Proxy Error: ${err.message}`,
          },
        })
      );
    }
  });

  req.pipe(proxyReq);
}

/**
 * Serves static files from frontend/dist with SPA fallback.
 */
function serveStatic(req, res) {
  let reqPath = new URL(req.url, 'http://localhost').pathname;
  if (reqPath === '/') {
    reqPath = '/index.html';
  }

  // Prevent path traversal
  const safePath = path.normalize(reqPath).replace(/^(\.\.[\/\\])+/, '');
  const filePath = path.join(DIST_DIR, safePath);

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      // SPA Fallback: serve index.html for React Router / client routes
      const indexPath = path.join(DIST_DIR, 'index.html');
      fs.readFile(indexPath, (indexErr, data) => {
        if (indexErr) {
          res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
          res.end('FastLearn: Build output not found. Please build the frontend first (npm run build).');
          return;
        }
        res.writeHead(200, {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-cache',
        });
        res.end(data);
      });
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    const isImmutable = safePath.includes('/assets/') || safePath.includes('\\assets\\');

    res.writeHead(200, {
      'Content-Type': contentType,
      'Content-Length': stats.size,
      'Cache-Control': isImmutable ? 'public, max-age=31536000, immutable' : 'no-cache',
    });

    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
  });
}

// Create HTTP server
const server = http.createServer((req, res) => {
  // Health check endpoint (for Koyeb health checks)
  if (req.url === '/health' || req.url === '/healthz') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', app: 'FastLearn', uptime: Math.round(process.uptime()) }));
    return;
  }

  // Antigravity proxy endpoint
  if (req.url.startsWith('/v1internal')) {
    handleProxy(req, res);
    return;
  }

  // Static files and SPA fallback
  serveStatic(req, res);
});

server.listen(PORT, HOST, () => {
  console.log(`=======================================================`);
  console.log(`🇩🇰 FastLearn Production Server running`);
  console.log(`🚀 Host: http://${HOST}:${PORT}`);
  console.log(`📁 Static files: ${DIST_DIR}`);
  console.log(`⚡ Proxy route: /v1internal -> ${ANTIGRAVITY_UPSTREAM}`);
  console.log(`=======================================================`);
});
