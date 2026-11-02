// The Facebook Login `state` parameter. Meta returns it unchanged to the
// callback (https://developers.facebook.com/docs/facebook-login/guides/advanced/manual-flow),
// which has no owner session, so the state itself says which business and
// user started the link: "v1.<payload>.<HMAC-SHA256 signature>", base64url,
// valid for ten minutes. The key is derived from ZUKKI_SERVER_KEY, so a
// state cannot be forged or moved to another business without it.
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { z } from "zod";

export type OAuthOwner = { tenantId: string; userId: string };

const VERSION = "v1";
const LIFETIME_MS = 10 * 60_000;
const payloadSchema = z.object({ t: z.string().uuid(), u: z.string().uuid(), e: z.number().int(), n: z.string() }).strict();

export function signOAuthState(owner: OAuthOwner, serverKey: string, now: number): string {
  const payload = { t: owner.tenantId, u: owner.userId, e: now + LIFETIME_MS, n: randomBytes(16).toString("base64url") };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${VERSION}.${encoded}.${signatureOf(encoded, serverKey).toString("base64url")}`;
}

// The owner the state was signed for, or null when it is forged, altered or expired.
export function readOAuthState(state: string, serverKey: string, now: number): OAuthOwner | null {
  const [version, encoded, signature, ...rest] = state.split(".");
  if (version !== VERSION || !encoded || !signature || rest.length > 0) return null;
  if (!hasSignature(encoded, signature, serverKey)) return null;
  const payload = payloadSchema.safeParse(parseJson(Buffer.from(encoded, "base64url").toString()));
  if (!payload.success || payload.data.e < now) return null;
  return { tenantId: payload.data.t, userId: payload.data.u };
}

function hasSignature(encoded: string, signature: string, serverKey: string): boolean {
  const given = Buffer.from(signature, "base64url");
  const expected = signatureOf(encoded, serverKey);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

function signatureOf(encoded: string, serverKey: string): Buffer {
  return createHmac("sha256", stateKey(serverKey)).update(`${VERSION}.${encoded}`).digest();
}

// One key per purpose: the raw server key also authenticates internal calls.
function stateKey(serverKey: string): Buffer {
  return createHmac("sha256", serverKey).update("meta-oauth-state").digest();
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
