#!/usr/bin/env node
// A customer's photos and video through the signed webhook, against a running API and fake WhatsApp
// (scripts/local/fake-whatsapp.mjs). Proves the replies come from the models: different media get
// different readings. With EXPECT_NO_READING=1 it proves the reverse: a rejected key gets no reading.
// usage: META_APP_SECRET=... node media-flow.mjs [apiUrl] [fakeWhatsAppUrl]
// env: VIDEO, VIDEO_CAPTION, SECOND_IMAGE, SECOND_CAPTION (media ids in the fake's folder)
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join } from 'node:path';

const [apiUrl = 'http://localhost:3000', fakeUrl = 'http://127.0.0.1:4010'] = process.argv.slice(2);
const VIDEO = process.env.VIDEO ?? 'under-sink-leak.mp4';
const VIDEO_CAPTION = process.env.VIDEO_CAPTION ?? 'Se está saliendo el agua del lavabo y ya está llegando al piso';
const SECOND_IMAGE = process.env.SECOND_IMAGE ?? 'burnt-outlet.jpg';
const SECOND_CAPTION = process.env.SECOND_CAPTION ?? 'Este contacto huele a quemado';
const READING_TIMEOUT_MS = 150_000;
const POLL_MS = 2_000;
// The reading is queued first; the marked frame and the next question follow within seconds.
const AFTER_REPLY_MS = 8_000;
// Zukki says this before the models answer; the reading is the first text after it.
const LOOKING = /looking at what you sent/i;
const FAILED = /something went wrong/i;
const run = promisify(execFile);

await assertFakeServes(VIDEO);
await assertFakeServes(SECOND_IMAGE);
const first = await customerSends('video', VIDEO, VIDEO_CAPTION);
if (process.env.EXPECT_NO_READING) {
  assert.equal(first.reading, undefined, `expected no reading with a rejected key, got: ${first.reading}`);
  console.log('PASS no reading with a rejected key; last reply:', first.last);
  process.exit(0);
}
assert.ok(first.reading, `the video got no reading. Replies: ${first.bodies.join(' | ')}`);
const second = await customerSends('image', SECOND_IMAGE, SECOND_CAPTION);
assert.ok(second.reading, `the photo got no reading. Replies: ${second.bodies.join(' | ')}`);
assert.notEqual(first.reading, second.reading, 'two different media got the same reading');
console.log('PASS video reading:', first.reading);
console.log('PASS photo reading:', second.reading);
console.log(first.markedFrame ? `PASS marked frame sent: ${first.markedFrame.slice(0, 80)}...` : 'NOTE no valve marked on the video');

// Missing media also gets no reading, which would prove nothing.
async function assertFakeServes(mediaId) {
  const response = await fetch(`${fakeUrl}/v23.0/${mediaId}`);
  assert.equal(response.status, 200, `the fake WhatsApp cannot serve ${mediaId}`);
}

async function customerSends(kind, mediaId, caption) {
  const waId = `5215550${String(Math.floor(Math.random() * 1e6)).padStart(6, '0')}`;
  await webhook(waId, 'text', 'hola');
  await waitFor(waId, (messages) => messages.length > 0);
  await webhook(waId, kind, mediaId, caption);
  const settled = await waitForReading(waId);
  return describe(settled);
}

async function webhook(waId, ...args) {
  const script = join(import.meta.dirname, 'wa-customer.mjs');
  const { stdout } = await run('node', [script, apiUrl, ...args], { env: { ...process.env, CUSTOMER_WA_ID: waId } });
  assert.match(stdout, /^200/, `webhook answered: ${stdout}`);
}

async function waitForReading(waId) {
  const start = Date.now();
  while (Date.now() - start < READING_TIMEOUT_MS) {
    if (afterLooking(await sentTo(waId)).length > 0) {
      await sleep(AFTER_REPLY_MS);
      return sentTo(waId);
    }
    await sleep(POLL_MS);
  }
  return sentTo(waId);
}

async function waitFor(waId, isDone) {
  const start = Date.now();
  while (Date.now() - start < READING_TIMEOUT_MS) {
    const messages = await sentTo(waId);
    if (isDone(messages)) return messages;
    await sleep(POLL_MS);
  }
  throw new Error(`timed out waiting for replies to ${waId}`);
}

async function sentTo(waId) {
  const response = await fetch(`${fakeUrl}/sent?to=${waId}`);
  return response.json();
}

function describe(messages) {
  const bodies = bodiesOf(messages);
  const answer = afterLooking(messages).find((m) => m.type === 'text')?.text.body;
  const reading = answer && !FAILED.test(answer) ? answer : undefined;
  const markedFrame = messages.map((m) => m.interactive?.header?.image?.link).find(Boolean);
  return { bodies, reading, markedFrame, last: bodies.at(-1) };
}

function afterLooking(messages) {
  const looking = messages.findIndex((m) => LOOKING.test(m.text?.body ?? ''));
  return looking < 0 ? [] : messages.slice(looking + 1);
}

function bodiesOf(messages) {
  return messages.map((m) => m.text?.body ?? m.interactive?.body?.text ?? '').filter(Boolean);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
