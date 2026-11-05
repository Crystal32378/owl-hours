#!/usr/bin/env node
// Stands in for the WhatsApp Cloud API on a local run, so nothing reaches a real phone.
// Point the API at it with WHATSAPP_GRAPH_HOST. It keeps what Zukki sends (GET /sent), serves customers'
// media from a folder (the media id is the file name), and serves a chat page where a person plays the
// customer: each message reaches the API as the same signed webhook WhatsApp would send.
// env: FAKE_WHATSAPP_PORT (default 4010), FAKE_WHATSAPP_MEDIA_DIR (default scripts/e2e/media),
//      FAKE_WHATSAPP_UPLOAD_DIR (default a temp folder), FAKE_WHATSAPP_API_URL (default http://localhost:3000),
//      META_APP_SECRET and WHATSAPP_PHONE_NUMBER_ID (must match the API's),
//      META_MODEL_BASE_URL (set on a replay run, so the page can say the answers are recorded)
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { basename, extname, join } from 'node:path';
import { deliverCustomerMessage, isCustomerMessageKind } from './customer-webhook.mjs';

const PORT = Number(process.env.FAKE_WHATSAPP_PORT ?? 4010);
const MEDIA_DIR = process.env.FAKE_WHATSAPP_MEDIA_DIR ?? join(import.meta.dirname, '..', 'e2e', 'media');
const UPLOAD_DIR = process.env.FAKE_WHATSAPP_UPLOAD_DIR ?? join(tmpdir(), 'zukki-fake-whatsapp-uploads');
const API_URL = process.env.FAKE_WHATSAPP_API_URL ?? 'http://localhost:3000';
const CHAT_PAGE = join(import.meta.dirname, 'customer-chat.html');
const MIME_TYPES = { '.mp4': 'video/mp4', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.ogg': 'audio/ogg' };
const MEDIA_KINDS = { 'video/mp4': 'video', 'image/jpeg': 'image', 'image/png': 'image', 'audio/ogg': 'audio' };
// WhatsApp caps video at 16 MB.
const MAX_UPLOAD_BYTES = 16 * 1024 * 1024;
const WA_ID = /^\d{6,15}$/;
// The recorded model answers were made with this caption and this name, and a replay must match them.
const RECORDED_CAPTIONS = { 'under-sink-leak.mp4': 'Se está saliendo el agua y ya está llegando al piso' };
const RECORDED_CUSTOMER_NAME = 'Carlos';
const origin = `http://127.0.0.1:${PORT}`;
const sent = [];
const timeline = [];

await mkdir(UPLOAD_DIR, { recursive: true });
createServer((request, response) => {
  route(request, response).catch((error) => reply(response, 500, { error: { message: error.message } }));
}).listen(PORT, '127.0.0.1', () => console.log(`Fake WhatsApp on ${origin}, media from ${MEDIA_DIR}`));

async function route(request, response) {
  const { pathname, searchParams } = new URL(request.url, origin);
  const [first, second, third] = pathname.split('/').slice(1);
  if (request.method === 'GET') return routeRead(response, { first, second, third, pathname, searchParams });
  if (request.method === 'POST' && first === 'customers' && third === 'messages') return receiveFromChat(request, response, decodeURIComponent(second));
  if (request.method === 'POST' && first === 'uploads') return receiveUpload(request, response, searchParams.get('name') ?? '');
  if (request.method === 'POST' && third === 'messages') return reply(response, 200, await keepMessage(request));
  return replyNoRoute(response, request.method, pathname);
}

function routeRead(response, { first, second, third, pathname, searchParams }) {
  if (!first) return sendChatPage(response);
  if (first === 'sent') return reply(response, 200, sentTo(searchParams.get('to')));
  if (first === 'samples') return sendSamples(response);
  if (first === 'media') return sendMediaFile(response, second);
  if (first === 'customers' && !second) return reply(response, 200, customers());
  if (first === 'customers' && third === 'conversation') return reply(response, 200, conversationOf(decodeURIComponent(second)));
  if (second) return replyMediaInfo(response, second);
  return replyNoRoute(response, 'GET', pathname);
}

async function sendChatPage(response) {
  const page = await readFile(CHAT_PAGE, 'utf8');
  response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  response.end(page.replace('{{MODELS_NOTE}}', modelsNote()));
}

// The API calls Meta unless META_MODEL_BASE_URL points it at the recordings.
function modelsNote() {
  return process.env.META_MODEL_BASE_URL
    ? 'Recorded model answers: this run does not call Meta.'
    : 'Live models: this run calls Meta.';
}

function sentTo(recipient) {
  return recipient ? sent.filter((message) => message.to === recipient) : sent;
}

function customers() {
  return [...new Set(timeline.map(({ waId }) => waId))];
}

function conversationOf(waId) {
  return timeline.filter((entry) => entry.waId === waId).map(({ from, message }) => ({ from, message }));
}

async function keepMessage(request) {
  const body = JSON.parse(await readBody(request));
  const id = `wamid.fake-${randomUUID()}`;
  if (body.to) {
    sent.push({ id, ...body });
    timeline.push({ waId: body.to, from: 'zukki', message: { id, ...body } });
  }
  return { messages: [{ id }] };
}

async function receiveFromChat(request, response, waId) {
  const { kind, args = [] } = JSON.parse(await readBody(request));
  if (!WA_ID.test(waId)) return reply(response, 400, { error: 'the customer id must be a phone number' });
  if (!isCustomerMessageKind(kind)) return reply(response, 400, { error: `unknown message kind ${kind}` });
  timeline.push({ waId, from: 'customer', message: { kind, args } });
  return reply(response, ...(await deliverToApi({ waId, kind, args })));
}

async function deliverToApi({ waId, kind, args }) {
  try {
    const delivered = await deliverCustomerMessage({
      apiUrl: API_URL,
      secret: process.env.META_APP_SECRET,
      phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID,
      waId,
      name: RECORDED_CUSTOMER_NAME,
      kind,
      args,
    });
    if (delivered.ok) return [200, { delivered: true }];
    return [502, { error: `the Zukki API answered ${delivered.status}` }];
  } catch (error) {
    return [502, { error: `could not reach the Zukki API: ${error.message}` }];
  }
}

async function receiveUpload(request, response, name) {
  const mimeType = mimeTypeOf(name);
  if (!MEDIA_KINDS[mimeType]) return reply(response, 415, { error: 'send a .mp4, .jpg, .png or .ogg file' });
  const bytes = await readBodyBytes(request);
  if (bytes.length > MAX_UPLOAD_BYTES) return reply(response, 413, { error: 'the file is over the 16 MB limit' });
  const id = `upload-${randomUUID()}${extname(name).toLowerCase()}`;
  await writeFile(join(UPLOAD_DIR, id), bytes);
  return reply(response, 200, { id, kind: MEDIA_KINDS[mimeType] });
}

async function sendSamples(response) {
  const names = (await readdir(MEDIA_DIR)).filter((name) => MEDIA_KINDS[mimeTypeOf(name)]).sort();
  reply(response, 200, names.map(sampleOf));
}

function sampleOf(id) {
  const kind = MEDIA_KINDS[mimeTypeOf(id)];
  const topic = basename(id, extname(id)).replaceAll('-', ' ');
  const caption = RECORDED_CAPTIONS[id];
  return { id, kind, label: `Sample ${kind === 'image' ? 'photo' : kind}: ${topic}`, ...(caption ? { caption } : {}) };
}

async function replyMediaInfo(response, mediaId) {
  const name = basename(decodeURIComponent(mediaId));
  const { size } = await stat(await mediaPath(name));
  reply(response, 200, { url: `${origin}/media/${encodeURIComponent(name)}`, mime_type: mimeTypeOf(name), file_size: size });
}

async function sendMediaFile(response, mediaId) {
  const name = basename(decodeURIComponent(mediaId));
  const bytes = await readFile(await mediaPath(name));
  response.writeHead(200, { 'content-type': mimeTypeOf(name) });
  response.end(bytes);
}

async function mediaPath(name) {
  const uploaded = join(UPLOAD_DIR, name);
  return (await stat(uploaded).then(() => true, () => false)) ? uploaded : join(MEDIA_DIR, name);
}

function mimeTypeOf(name) {
  return MIME_TYPES[extname(name).toLowerCase()] ?? 'application/octet-stream';
}

async function readBody(request) {
  return (await readBodyBytes(request)).toString();
}

async function readBodyBytes(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  return Buffer.concat(chunks);
}

function replyNoRoute(response, method, pathname) {
  reply(response, 404, { error: { message: `no route for ${method} ${pathname}` } });
}

function reply(response, status, body) {
  response.writeHead(status, { 'content-type': 'application/json' });
  response.end(JSON.stringify(body));
}
