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
// What the customer's phone would show. Read only: the customer's side is driven by demo-customer.mjs.
const VIEWER = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Customer messages</title>
<style>
:root{color-scheme:light dark;--bg:#f4f4f2;--bubble:#fff;--text:#1a1a1a;--muted:#5f5f5a}
@media(prefers-color-scheme:dark){:root{--bg:#161615;--bubble:#262624;--text:#f1f1ee;--muted:#a9a9a3}}
body{margin:0 auto;max-width:560px;padding:16px;background:var(--bg);color:var(--text);font:16px/1.45 system-ui,sans-serif}
h1{font-size:20px}h2{font-size:16px;margin:24px 0 8px;color:var(--muted)}
p.note{color:var(--muted)}
.m{background:var(--bubble);border-radius:12px;padding:10px 12px;margin:8px 0;white-space:pre-wrap;overflow-wrap:anywhere}
.m img{display:block;max-width:100%;border-radius:8px;margin-bottom:8px}
.b{display:block;color:var(--muted);margin-top:6px}
</style>
<h1>What Zukki sent the customer</h1>
<p class="note">Local stand-in for WhatsApp. Nothing here reaches a real phone.</p>
<main id="m"></main>
<script>
const main=document.getElementById('m');
function bubble(message){
  const el=document.createElement('div');el.className='m';
  const image=message.interactive?.header?.image?.link;
  if(image){const img=document.createElement('img');img.src=image;img.alt='Photo with the shut-off valve marked';el.append(img)}
  el.append(message.text?.body??message.interactive?.body?.text??'');
  for(const button of message.interactive?.action?.buttons??[]){const b=document.createElement('span');b.className='b';b.textContent=button.reply.title;el.append(b)}
  return el;
}
async function refresh(){
  const messages=await (await fetch('/sent')).json();
  const byCustomer=Map.groupBy(messages,(message)=>message.to);
  main.replaceChildren(...[...byCustomer].flatMap(([to,list])=>{const h=document.createElement('h2');h.textContent='Customer '+to;return [h,...list.map(bubble)]}));
}
refresh();setInterval(refresh,3000);
</script>`;

createServer((request, response) => {
  route(request, response).catch((error) => reply(response, 500, { error: { message: error.message } }));
}).listen(PORT, '127.0.0.1', () => console.log(`Fake WhatsApp on ${origin}, media from ${MEDIA_DIR}`));

async function route(request, response) {
  const { pathname, searchParams } = new URL(request.url, origin);
  const [first, second, third] = pathname.split('/').slice(1);
  if (request.method === 'GET' && !first) return sendViewer(response);
  if (request.method === 'GET' && first === 'sent') return reply(response, 200, sentTo(searchParams.get('to')));
  if (request.method === 'GET' && first === 'media') return sendMediaFile(response, second);
  if (request.method === 'POST' && third === 'messages') return reply(response, 200, await keepMessage(request));
  if (request.method === 'GET' && second) return reply(response, 200, await mediaInfo(second));
  return reply(response, 404, { error: { message: `no route for ${request.method} ${pathname}` } });
}

function sendViewer(response) {
  response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  response.end(VIEWER);
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
