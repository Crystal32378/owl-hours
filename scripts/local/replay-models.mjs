#!/usr/bin/env node
// Stands in for the Meta Model API so the demo runs without a key. Point the API at it with
// META_MODEL_BASE_URL. Every answer was recorded from the real models; a request with no recording
// gets an error rather than a made-up answer, so other media simply get no reading.
// To record again: REPLAY_MODE=record, with the API using a real key. Requests are forwarded to Meta
// and only the answers are stored.
// env: REPLAY_MODE (replay | record), REPLAY_PORT (default 4011), REPLAY_FILE
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { join } from 'node:path';

const META_URL = 'https://api.meta.ai/v1';
const MODE = process.env.REPLAY_MODE ?? 'replay';
const PORT = Number(process.env.REPLAY_PORT ?? 4011);
const FILE = process.env.REPLAY_FILE ?? join(import.meta.dirname, 'recordings', 'demo.json');
const recordings = MODE === 'record' ? {} : JSON.parse(readFileSync(FILE, 'utf8'));
const served = new Map();

createServer((request, response) => {
  answer(request, response).catch((error) => send(response, 502, 'application/json', errorBody(error.message)));
}).listen(PORT, '127.0.0.1', () => {
  console.log(`Meta models ${MODE === 'record' ? 'recording to' : 'replayed from'} ${FILE} on http://127.0.0.1:${PORT}/v1`);
});

async function answer(request, response) {
  const body = await readBody(request);
  const path = new URL(request.url, 'http://local').pathname.replace(/^\/v1/, '');
  const key = requestKey(path, body);
  if (MODE === 'record') return forwardAndKeep(request, response, path, body, key);
  const recording = nextRecording(key);
  if (!recording) {
    console.warn(`no recording for ${path}: refusing to invent an answer`);
    return send(response, 503, 'application/json', errorBody('No recorded answer for this request. Set META_MODEL_API_KEY to call the real models.'));
  }
  return send(response, recording.status, recording.contentType, recording.body);
}

// Ids, times and coordinates change between runs and a video frame's bytes can change between ffmpeg
// builds, so they leave the key. The customer's own media stays in it: a different photo or video
// must not get this one's reading.
function requestKey(path, body) {
  const text = body.toString('utf8');
  const media = /"name":"media_triage"/.test(text) ? hashOf(text.match(/data:[^"]+/)?.[0] ?? '') : '';
  const stable = text
    .replace(/data:[^"]+/g, '<media>')
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, '<id>')
    .replace(/\d+/g, '#');
  return `${path} ${media} ${hashOf(stable)}`;
}

function nextRecording(key) {
  const answers = recordings[key];
  if (!answers) return undefined;
  const turn = served.get(key) ?? 0;
  served.set(key, turn + 1);
  // In a cycle, so every customer of a run gets the same answers as the first.
  return answers[turn % answers.length];
}

async function forwardAndKeep(request, response, path, body, key) {
  const upstream = await fetch(`${META_URL}${path}`, {
    method: request.method,
    headers: {
      authorization: request.headers.authorization,
      ...(request.headers['content-type'] ? { 'content-type': request.headers['content-type'] } : {}),
      ...(request.headers.accept ? { accept: request.headers.accept } : {}),
    },
    ...(request.method === 'POST' ? { body } : {}),
  });
  const text = await upstream.text();
  const contentType = upstream.headers.get('content-type') ?? 'application/json';
  (recordings[key] ??= []).push({ status: upstream.status, contentType, body: text });
  writeFileSync(FILE, `${JSON.stringify(recordings)}\n`);
  send(response, upstream.status, contentType, text);
}

function hashOf(text) {
  return createHash('sha256').update(text).digest('hex').slice(0, 16);
}

function errorBody(message) {
  return JSON.stringify({ error: { type: 'no_recording', message } });
}

async function readBody(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  return Buffer.concat(chunks);
}

function send(response, status, contentType, body) {
  response.writeHead(status, { 'content-type': contentType });
  response.end(body);
}
