// Sends one signed WhatsApp Cloud API webhook to a Zukki API, as the customer.
// usage: node wa-customer.mjs <apiUrl> text "hi" | button <id> <title> | list <id> <title> | location <lat> <lng> [address]
//        | image <mediaId> [caption] | video <mediaId> [caption]
import { deliverCustomerMessage } from '../local/customer-webhook.mjs';

const [apiUrl, kind, ...args] = process.argv.slice(2);
const response = await deliverCustomerMessage({
  apiUrl,
  secret: process.env.META_APP_SECRET,
  phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID ?? 'e2e',
  waId: process.env.CUSTOMER_WA_ID ?? '5215550000001',
  name: process.env.CUSTOMER_NAME ?? 'Carlos',
  kind,
  args,
});
console.log(response.status, await response.text());
