// Reads the newest sign-in code from the local Supabase Mailpit into output.code. The email can land a
// moment after "Send code", so an empty inbox leaves output.code unset and sign-in.yaml retries.
const list = json(http.get(`${MAILPIT_URL}/api/v1/messages`).body);
const newest = list.messages[0];
output.code = newest ? json(http.get(`${MAILPIT_URL}/api/v1/message/${newest.ID}`).body).Text.match(/\b(\d{6})\b/)[1] : "";
