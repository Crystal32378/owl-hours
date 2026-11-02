// Sends one signed WhatsApp Cloud API webhook to a Zukki API, as the customer.
// usage: node wa-customer.mjs <apiUrl> text "hi" | button <id> <title> | list <id> <title> | location <lat> <lng> [address]
//        | image <mediaId> [caption] | video <mediaId> [caption]
import { createHmac, randomUUID } from 'node:crypto';

const [apiUrl, kind, ...args] = process.argv.slice(2);
const waId = process.env.CUSTOMER_WA_ID ?? '5215550000001';
const message = { from: waId, id: `wamid.e2e-${randomUUID()}`, timestamp: String(Math.floor(Date.now() / 1000)) };
if (kind === 'text') Object.assign(message, { type: 'text', text: { body: args[0] } });
else if (kind === 'button') Object.assign(message, { type: 'interactive', interactive: { type: 'button_reply', button_reply: { id: args[0], title: args[1] ?? args[0] } } });
else if (kind === 'list') Object.assign(message, { type: 'interactive', interactive: { type: 'list_reply', list_reply: { id: args[0], title: args[1] ?? args[0] } } });
else if (kind === 'location') Object.assign(message, { type: 'location', location: { latitude: Number(args[0]), longitude: Number(args[1]), address: args[2] } });
else if (kind === 'image' || kind === 'video') Object.assign(message, { type: kind, [kind]: { id: args[0], mime_type: kind === 'video' ? 'video/mp4' : 'image/jpeg', ...(args[1] ? { caption: args[1] } : {}) } });
else throw new Error(`unknown kind ${kind}`);

const body = JSON.stringify({ object: 'whatsapp_business_account', entry: [{ id: 'e2e', changes: [{ field: 'messages', value: {
  messaging_product: 'whatsapp', metadata: { display_phone_number: 'e2e', phone_number_id: process.env.WHATSAPP_PHONE_NUMBER_ID ?? 'e2e' },
  contacts: [{ wa_id: waId, profile: { name: process.env.CUSTOMER_NAME ?? 'Carlos' } }], messages: [message] } }] }] });
const signature = 'sha256=' + createHmac('sha256', process.env.META_APP_SECRET).update(body).digest('hex');
const response = await fetch(`${apiUrl}/webhooks/whatsapp`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-hub-signature-256': signature }, body });
console.log(response.status, await response.text());
