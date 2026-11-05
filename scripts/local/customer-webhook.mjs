// One customer's message as the Cloud API delivers it: a signed webhook to the Zukki API.
// Kinds and args: text <body> | button <id> <title> | list <id> <title> | location <lat> <lng> [address]
//                 | image <mediaId> [caption] | video <mediaId> [caption]
import { createHmac, randomUUID } from 'node:crypto';

const BUILDERS = {
  text: ([body]) => ({ type: 'text', text: { body } }),
  button: ([id, title]) => ({ type: 'interactive', interactive: { type: 'button_reply', button_reply: { id, title: title ?? id } } }),
  list: ([id, title]) => ({ type: 'interactive', interactive: { type: 'list_reply', list_reply: { id, title: title ?? id } } }),
  location: ([lat, lng, address]) => ({ type: 'location', location: { latitude: Number(lat), longitude: Number(lng), address } }),
  image: ([id, caption]) => ({ type: 'image', image: mediaOf(id, 'image/jpeg', caption) }),
  video: ([id, caption]) => ({ type: 'video', video: mediaOf(id, 'video/mp4', caption) }),
};

export function isCustomerMessageKind(kind) {
  return Object.hasOwn(BUILDERS, kind);
}

export function deliverCustomerMessage({ apiUrl, secret, phoneNumberId, waId, name, kind, args }) {
  const body = webhookBody({ phoneNumberId, waId, name, kind, args });
  const signature = `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;
  return fetch(`${apiUrl}/webhooks/whatsapp`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-hub-signature-256': signature },
    body,
  });
}

function webhookBody({ phoneNumberId, waId, name, kind, args }) {
  if (!isCustomerMessageKind(kind)) throw new Error(`unknown kind ${kind}`);
  const message = {
    from: waId,
    id: `wamid.e2e-${randomUUID()}`,
    timestamp: String(Math.floor(Date.now() / 1000)),
    ...BUILDERS[kind](args),
  };
  return JSON.stringify({ object: 'whatsapp_business_account', entry: [{ id: 'e2e', changes: [{ field: 'messages', value: {
    messaging_product: 'whatsapp', metadata: { display_phone_number: 'e2e', phone_number_id: phoneNumberId },
    contacts: [{ wa_id: waId, profile: { name } }], messages: [message] } }] }] });
}

function mediaOf(id, mimeType, caption) {
  return { id, mime_type: mimeType, ...(caption ? { caption } : {}) };
}
