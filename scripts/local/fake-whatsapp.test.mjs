// The fake WhatsApp as the customer chat uses it, over HTTP, with a stub in place of the Zukki API.
// run: npm run test:local
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHmac } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, beforeEach, describe, it } from 'node:test';

const FAKE_PORT = 4910;
const FAKE_URL = `http://127.0.0.1:${FAKE_PORT}`;
const SECRET = 'test-app-secret';
const PHONE_NUMBER_ID = '100000000000001';

describe('fake WhatsApp customer chat', () => {
  const webhooks = [];
  let apiStatus = 200;
  let api;
  let fake;
  let uploadDir;

  before(async () => {
    uploadDir = await mkdtemp(join(tmpdir(), 'fake-whatsapp-test-'));
    api = createServer((request, response) => collectWebhook(request, response));
    await new Promise((resolve) => api.listen(0, '127.0.0.1', resolve));
    fake = spawn('node', [join(import.meta.dirname, 'fake-whatsapp.mjs')], {
      env: {
        ...process.env,
        FAKE_WHATSAPP_PORT: String(FAKE_PORT),
        FAKE_WHATSAPP_API_URL: `http://127.0.0.1:${api.address().port}`,
        FAKE_WHATSAPP_UPLOAD_DIR: uploadDir,
        META_APP_SECRET: SECRET,
        WHATSAPP_PHONE_NUMBER_ID: PHONE_NUMBER_ID,
        META_MODEL_BASE_URL: '',
      },
      stdio: 'ignore',
    });
    await waitUntilAnswering(FAKE_URL);
  });

  after(async () => {
    fake.kill();
    api.close();
    await rm(uploadDir, { recursive: true, force: true });
  });

  beforeEach(() => {
    webhooks.length = 0;
    apiStatus = 200;
  });

  it('serves a chat page that says it is not WhatsApp', async () => {
    const response = await fetch(FAKE_URL);
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type'), /text\/html/);
    assert.match(await response.text(), /not WhatsApp/);
  });

  it('says the answers come from the live models on a run that calls Meta', async () => {
    const page = await (await fetch(FAKE_URL)).text();
    assert.match(page, /Live models: this run calls Meta\./);
    assert.doesNotMatch(page, /Recorded model answers/);
  });

  it('says the answers are recorded on a replay run', async () => {
    const page = await chatPageOnReplayRun();
    assert.match(page, /Recorded model answers: this run does not call Meta\./);
    assert.doesNotMatch(page, /Live models/);
  });

  it('delivers a typed message to the API as a signed webhook from that customer', async () => {
    const response = await send('5215551000001', { kind: 'text', args: ['Se está saliendo el agua'] });
    assert.equal(response.status, 200);
    const [{ body, signature }] = webhooks;
    assert.equal(signature, `sha256=${createHmac('sha256', SECRET).update(body).digest('hex')}`);
    const value = JSON.parse(body).entry[0].changes[0].value;
    assert.equal(value.metadata.phone_number_id, PHONE_NUMBER_ID);
    assert.equal(value.messages[0].from, '5215551000001');
    assert.equal(value.messages[0].text.body, 'Se está saliendo el agua');
  });

  it('delivers a tapped button with its id and title', async () => {
    await send('5215551000002', { kind: 'button', args: ['safety_done', 'Done, no cables'] });
    const [message] = deliveredMessages();
    assert.deepEqual(message.interactive.button_reply, { id: 'safety_done', title: 'Done, no cables' });
  });

  it('delivers a chosen list row with its id and title', async () => {
    await send('5215551000003', { kind: 'list', args: ['cat_plumbing', 'Plumbing'] });
    const [message] = deliveredMessages();
    assert.deepEqual(message.interactive.list_reply, { id: 'cat_plumbing', title: 'Plumbing' });
  });

  it('delivers a shared location', async () => {
    await send('5215551000004', { kind: 'location', args: ['25.033', '121.5654', 'Xinyi District, Taipei'] });
    const [message] = deliveredMessages();
    assert.deepEqual(message.location, { latitude: 25.033, longitude: 121.5654, address: 'Xinyi District, Taipei' });
  });

  it('shows the conversation in the order it happened, on both sides', async () => {
    const waId = '5215551000005';
    await send(waId, { kind: 'text', args: ['hola'] });
    await zukkiSends({ to: waId, type: 'text', text: { body: 'Hi, I am Zukki' } });
    await send(waId, { kind: 'text', args: ['gracias'] });
    const conversation = await (await fetch(`${FAKE_URL}/customers/${waId}/conversation`)).json();
    assert.deepEqual(conversation.map(({ from }) => from), ['customer', 'zukki', 'customer']);
    assert.equal(conversation[1].message.text.body, 'Hi, I am Zukki');
    assert.deepEqual(conversation[2].message, { kind: 'text', args: ['gracias'] });
  });

  it('keeps each customer in their own conversation and lists them', async () => {
    await send('5215551000006', { kind: 'text', args: ['uno'] });
    await send('5215551000007', { kind: 'text', args: ['dos'] });
    const conversation = await (await fetch(`${FAKE_URL}/customers/5215551000006/conversation`)).json();
    assert.deepEqual(conversation.map(({ message }) => message.args[0]), ['uno']);
    const customers = await (await fetch(`${FAKE_URL}/customers`)).json();
    assert.ok(customers.includes('5215551000006') && customers.includes('5215551000007'));
  });

  it('still lists only what Zukki sent under /sent, for the demo customer script', async () => {
    const waId = '5215551000008';
    await send(waId, { kind: 'text', args: ['hola'] });
    await zukkiSends({ to: waId, type: 'text', text: { body: 'Hi' } });
    const sent = await (await fetch(`${FAKE_URL}/sent?to=${waId}`)).json();
    assert.equal(sent.length, 1);
    assert.equal(sent[0].text.body, 'Hi');
  });

  it('leaves read receipts and typing indicators out of the conversation', async () => {
    const waId = '5215551000009';
    await send(waId, { kind: 'text', args: ['hola'] });
    await zukkiSends({ status: 'read', message_id: 'wamid.x' });
    const conversation = await (await fetch(`${FAKE_URL}/customers/${waId}/conversation`)).json();
    assert.equal(conversation.length, 1);
  });

  it('reports when the API refuses the message', async () => {
    apiStatus = 500;
    const response = await send('5215551000010', { kind: 'text', args: ['hola'] });
    assert.equal(response.status, 502);
    assert.match((await response.json()).error, /500/);
  });

  it('refuses a message kind WhatsApp would not send', async () => {
    const response = await send('5215551000011', { kind: 'telepathy', args: [] });
    assert.equal(response.status, 400);
    assert.equal(webhooks.length, 0);
  });

  it('refuses a customer id that is not a phone number', async () => {
    const response = await send('../secrets', { kind: 'text', args: ['hola'] });
    assert.equal(response.status, 400);
    assert.equal(webhooks.length, 0);
  });

  it('lists the sample media a customer can send', async () => {
    const samples = await (await fetch(`${FAKE_URL}/samples`)).json();
    assert.deepEqual(samples, [
      { id: 'burnt-outlet.jpg', kind: 'image', label: 'Sample photo: burnt outlet' },
      { id: 'under-sink-leak.jpg', kind: 'image', label: 'Sample photo: under sink leak' },
      {
        id: 'under-sink-leak.mp4',
        kind: 'video',
        label: 'Sample video: under sink leak',
        caption: 'Se está saliendo el agua y ya está llegando al piso',
      },
    ]);
  });

  it('serves an uploaded video to Zukki the way the Cloud API serves media', async () => {
    const bytes = Buffer.from('not really a video');
    const upload = await fetch(`${FAKE_URL}/uploads?name=${encodeURIComponent('my leak.mp4')}`, { method: 'POST', body: bytes });
    assert.equal(upload.status, 200);
    const { id, kind } = await upload.json();
    assert.equal(kind, 'video');
    const info = await (await fetch(`${FAKE_URL}/v23.0/${encodeURIComponent(id)}`)).json();
    assert.equal(info.mime_type, 'video/mp4');
    assert.equal(info.file_size, bytes.length);
    assert.deepEqual(Buffer.from(await (await fetch(info.url)).arrayBuffer()), bytes);
  });

  it('refuses to upload a file type WhatsApp media does not cover', async () => {
    const upload = await fetch(`${FAKE_URL}/uploads?name=notes.exe`, { method: 'POST', body: 'x' });
    assert.equal(upload.status, 415);
  });

  it('refuses an upload over the WhatsApp video limit', async () => {
    const tooBig = Buffer.alloc(16 * 1024 * 1024 + 1);
    const upload = await fetch(`${FAKE_URL}/uploads?name=big.mp4`, { method: 'POST', body: tooBig });
    assert.equal(upload.status, 413);
  });

  function send(waId, message) {
    return fetch(`${FAKE_URL}/customers/${encodeURIComponent(waId)}/messages`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(message),
    });
  }

  function zukkiSends(message) {
    return fetch(`${FAKE_URL}/v23.0/${PHONE_NUMBER_ID}/messages`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', ...message }),
    });
  }

  function deliveredMessages() {
    return webhooks.flatMap(({ body }) => JSON.parse(body).entry[0].changes[0].value.messages);
  }

  async function collectWebhook(request, response) {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    webhooks.push({ body: Buffer.concat(chunks).toString(), signature: request.headers['x-hub-signature-256'] });
    response.writeHead(apiStatus, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ received: 1 }));
  }
});

async function chatPageOnReplayRun() {
  const port = FAKE_PORT + 1;
  const url = `http://127.0.0.1:${port}`;
  const fake = spawn('node', [join(import.meta.dirname, 'fake-whatsapp.mjs')], {
    env: { ...process.env, FAKE_WHATSAPP_PORT: String(port), META_MODEL_BASE_URL: 'http://127.0.0.1:4011/v1' },
    stdio: 'ignore',
  });
  try {
    await waitUntilAnswering(url);
    return await (await fetch(url)).text();
  } finally {
    fake.kill();
  }
}

async function waitUntilAnswering(url) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const answered = await fetch(`${url}/sent`).then((response) => response.ok, () => false);
    if (answered) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('the fake WhatsApp did not start');
}
