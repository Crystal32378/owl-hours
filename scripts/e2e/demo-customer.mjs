#!/usr/bin/env node
// Walks one customer through the demo on a local run: a leak video, the reading and marked valve,
// the safety answer, the location and the connection to Northside Plumbing. Prints the conversation.
// usage: META_APP_SECRET=... WHATSAPP_PHONE_NUMBER_ID=... node demo-customer.mjs [apiUrl] [fakeWhatsAppUrl]
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { join } from 'node:path';
import { promisify } from 'node:util';

const [apiUrl = 'http://localhost:3000', fakeUrl = 'http://127.0.0.1:4010'] = process.argv.slice(2);
const NORTHSIDE = '10000000-0000-4000-8000-000000000001';
const REPLY_TIMEOUT_MS = 150_000;
const POLL_MS = 1_000;
// Messages that follow a reply arrive close together; a turn is over after this long without one.
const QUIET_MS = 6_000;
const run = promisify(execFile);
const waId = process.env.CUSTOMER_WA_ID ?? `5215550${String(Math.floor(Math.random() * 1e6)).padStart(6, '0')}`;

await turn('text', 'hola');
await turn('video', 'under-sink-leak.mp4', 'Se está saliendo el agua y ya está llegando al piso');
await turn('button', 'safety_done', 'Done, no cables');
await turn('location', '21.1619', '-86.8515', 'Av. Tulum, Cancún');
await connectToNorthside();

const messages = await sentTo();
for (const message of messages) console.log(`Zukki: ${textOf(message)}${imageOf(message) ? ' [marked photo]' : ''}`);
assert.ok(messages.some(imageOf), 'the valve was not marked on the video');
console.log(`\nCustomer ${waId} is connected. The request is waiting in the owner app.`);

async function connectToNorthside() {
  for (let shown = 0; shown < 3; shown += 1) {
    const offered = (await sentTo()).some((message) => JSON.stringify(message).includes(`connect:${NORTHSIDE}`));
    if (offered) return turn('button', `connect:${NORTHSIDE}`, 'Connect me');
    await turn('button', 'another_option', 'Show another option');
  }
  throw new Error('Northside Plumbing was never offered');
}

async function turn(...args) {
  const before = (await sentTo()).length;
  const { stdout } = await run('node', [join(import.meta.dirname, 'wa-customer.mjs'), apiUrl, ...args], {
    env: { ...process.env, CUSTOMER_WA_ID: waId },
  });
  assert.match(stdout, /^200/, `webhook answered: ${stdout}`);
  await waitForQuiet(before);
}

async function waitForQuiet(before) {
  const start = Date.now();
  let count = before;
  let changedAt = Date.now();
  while (Date.now() - start < REPLY_TIMEOUT_MS) {
    const now = (await sentTo()).length;
    if (now !== count) [count, changedAt] = [now, Date.now()];
    const lookingOnly = /looking at what you sent/i.test(textOf((await sentTo()).at(-1) ?? {}));
    if (count > before && !lookingOnly && Date.now() - changedAt > QUIET_MS) return;
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }
  throw new Error(`no reply within ${REPLY_TIMEOUT_MS / 1000} s`);
}

async function sentTo() {
  return (await fetch(`${fakeUrl}/sent?to=${waId}`)).json();
}

function textOf(message) {
  return message.text?.body ?? message.interactive?.body?.text ?? '';
}

function imageOf(message) {
  return message.interactive?.header?.image?.link;
}
