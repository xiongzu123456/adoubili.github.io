/**
 * 本地 / VPS 版：把 worker/worker.js 跑成 HTTP 服务，同时提供静态页面。
 * 用法：node server/server.js   然后打开 http://127.0.0.1:8080
 */
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import worker from '../worker/worker.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT || 8080);
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon' };

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    if (url.pathname.startsWith('/api/')) {
      const headers = {};
      for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') headers[k.toLowerCase()] = v;
      let body;
      if (req.method === 'POST' || req.method === 'PUT') {
        const chunks = [];
        for await (const c of req) chunks.push(c);
        body = Buffer.concat(chunks).toString('utf8');
      }
      const r = await worker.fetch(new Request(`http://localhost${req.url}`, { method: req.method, headers, body, duplex: 'half' }));
      const out = {};
      r.headers.forEach((v, k) => { out[k] = v; });
      res.writeHead(r.status, out);
      res.end(await r.text());
      return;
    }
    let p = decodeURIComponent(url.pathname);
    if (p === '/' || p === '') p = '/index.html';
    const file = path.join(ROOT, path.normalize(p).replace(/^(\.\.[/\\])+/, ''));
    if (!file.startsWith(ROOT)) { res.writeHead(403); res.end('403'); return; }
    const data = await fs.readFile(file);
    res.writeHead(200, { 'content-type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream', 'cache-control': path.extname(file) === '.json' ? 'no-store' : 'public, max-age=120' });
    res.end(data);
  } catch (e) {
    if (e && e.code === 'ENOENT') { res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }); res.end('404 Not Found'); return; }
    res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('500 ' + ((e && e.message) || 'error'));
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n  马铃豆191 视频合集 · 本地服务已启动`);
  console.log(`  页面：http://127.0.0.1:${PORT}`);
  console.log(`  接口：http://127.0.0.1:${PORT}/api/ping\n`);
});
