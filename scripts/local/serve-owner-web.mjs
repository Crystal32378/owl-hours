#!/usr/bin/env node
// Serves the owner app's web build on a local run. Unknown paths get index.html, so reloading a
// screen works, as it does on the hosted site.
// usage: node serve-owner-web.mjs <buildFolder> [port]
import { readFile, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';

const [folder, port = '8081'] = process.argv.slice(2);
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.ttf': 'font/ttf', '.woff2': 'font/woff2',
};

createServer((request, response) => {
  send(request, response).catch(() => {
    response.writeHead(400);
    response.end();
  });
}).listen(Number(port), '127.0.0.1', () => console.log(`Owner app on http://localhost:${port}`));

async function send(request, response) {
  const file = await fileFor(new URL(request.url, 'http://local').pathname);
  const bytes = await readFile(file);
  response.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
  response.end(bytes);
}

async function fileFor(pathname) {
  const candidate = join(folder, normalize(decodeURIComponent(pathname)));
  const isFile = await stat(candidate).then((found) => found.isFile()).catch(() => false);
  return isFile ? candidate : join(folder, 'index.html');
}
