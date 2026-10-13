import http from 'node:http';
import { readFileSync } from 'node:fs';
import { solidPng } from './png.js';

export const PNGS = {
  '1600x800.png': solidPng(1600, 800, [200, 60, 60]),
  '400x200.png': solidPng(400, 200, [60, 120, 200]),
};

const SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10"/></svg>';
const PAGE = readFileSync(new URL('../fixtures/page.html', import.meta.url));

function send(res, status, type, body) {
  // Content-Length avoids chunked framing, so bytes on the wire equal the file size
  res.writeHead(status, { 'content-type': type, 'content-length': Buffer.byteLength(body), 'cache-control': 'no-store' });
  res.end(body);
}

/** Serves the fixture page and in-memory images on a random local port. */
export async function startServer() {
  const server = http.createServer((req, res) => {
    const { pathname } = new URL(req.url, 'http://localhost');
    if (pathname === '/page.html') return send(res, 200, 'text/html; charset=utf-8', PAGE);
    if (pathname === '/slow.html') return; // never answers, for the timeout test
    if (pathname === '/redirect/400x200.png') {
      res.writeHead(302, { location: '/img/400x200.png?c=redirect-target' });
      return res.end();
    }
    const name = pathname.replace(/^\/img\//, '');
    if (PNGS[name]) return send(res, 200, 'image/png', PNGS[name]);
    if (name === 'icon.svg') return send(res, 200, 'image/svg+xml', SVG);
    send(res, 404, 'text/plain', 'not found');
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  return {
    origin: `http://127.0.0.1:${port}`,
    close() {
      server.closeAllConnections();
      return new Promise((resolve) => server.close(resolve));
    },
  };
}
