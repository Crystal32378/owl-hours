#!/usr/bin/env node
// Stands in for the WhatsApp Cloud API on a local run, so nothing reaches a real phone.
// Point the API at it with WHATSAPP_GRAPH_HOST. It keeps what Zukki sends (GET /sent) and serves
// customers' media from a folder: the media id is the file name.
// env: FAKE_WHATSAPP_PORT (default 4010), FAKE_WHATSAPP_MEDIA_DIR (default scripts/e2e/media)
import { randomUUID } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { basename, extname, join } from 'node:path';

const PORT = Number(process.env.FAKE_WHATSAPP_PORT ?? 4010);
const MEDIA_DIR = process.env.FAKE_WHATSAPP_MEDIA_DIR ?? join(import.meta.dirname, '..', 'e2e', 'media');
const MIME_TYPES = { '.mp4': 'video/mp4', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.ogg': 'audio/ogg' };
const origin = `http://127.0.0.1:${PORT}`;
const sent = [];

createServer((request, response) => {
  route(request, response).catch((error) => reply(response, 500, { error: { message: error.message } }));
}).listen(PORT, '127.0.0.1', () => console.log(`Fake WhatsApp on ${origin}, media from ${MEDIA_DIR}`));

async function route(request, response) {
  const { pathname, searchParams } = new URL(request.url, origin);
  const [first, second, third] = pathname.split('/').slice(1);
  if (request.method === 'GET' && first === 'sent') return reply(response, 200, sentTo(searchParams.get('to')));
  if (request.method === 'GET' && first === 'media') return sendMediaFile(response, second);
  if (request.method === 'POST' && third === 'messages') return reply(response, 200, await keepMessage(request));
  if (request.method === 'GET' && second) return reply(response, 200, await mediaInfo(second));
  return reply(response, 404, { error: { message: `no route for ${request.method} ${pathname}` } });
}

function sentTo(recipient) {
  return recipient ? sent.filter((message) => message.to === recipient) : sent;
}

async function keepMessage(request) {
  const body = JSON.parse(await readBody(request));
  const id = `wamid.fake-${randomUUID()}`;
  if (body.to) sent.push({ id, ...body });
  return { messages: [{ id }] };
}

async function mediaInfo(mediaId) {
  const name = basename(decodeURIComponent(mediaId));
  const { size } = await stat(join(MEDIA_DIR, name));
  return { url: `${origin}/media/${encodeURIComponent(name)}`, mime_type: mimeTypeOf(name), file_size: size };
}

async function sendMediaFile(response, mediaId) {
  const name = basename(decodeURIComponent(mediaId));
  response.writeHead(200, { 'content-type': mimeTypeOf(name) });
  response.end(await readFile(join(MEDIA_DIR, name)));
}

function mimeTypeOf(name) {
  return MIME_TYPES[extname(name).toLowerCase()] ?? 'application/octet-stream';
}

async function readBody(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  return Buffer.concat(chunks).toString();
}

function reply(response, status, body) {
  response.writeHead(status, { 'content-type': 'application/json' });
  response.end(JSON.stringify(body));
}
