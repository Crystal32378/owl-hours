// API settings from the environment, checked once at startup. Errors name
// the variables that are wrong and never echo their values.
import { z } from "zod";

const LOOPBACK_HOSTNAMES = ["127.0.0.1", "localhost"];

// A stand-in for a Meta service, for local runs. Limited to this machine because the access token
// travels with every request.
const loopbackUrl = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.string().url().refine(isPlainLoopbackUrl).optional(),
);

function isPlainLoopbackUrl(url: string): boolean {
  if (!URL.canParse(url)) return false;
  const { protocol, hostname, username, password } = new URL(url);
  return ["http:", "https:"].includes(protocol) && LOOPBACK_HOSTNAMES.includes(hostname) && !username && !password;
}

const envSchema = z.object({
  META_MODEL_API_KEY: z.string().min(1),
  META_MODEL_BASE_URL: loopbackUrl,
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(30),
  SUPABASE_ANON_KEY: z.string().min(30),
  ZUKKI_SERVER_KEY: z.string().min(32),
});

export type ApiConfig = {
  metaModelApiKey: string;
  metaModelBaseUrl: string | undefined;
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
  supabaseAnonKey: string;
  serverKey: string;
};

// WhatsApp Cloud API settings (Meta app dashboard > WhatsApp > API Setup).
// Optional as a group: without them the webhook answers 503 and nothing is
// sent, but the owner API still works.
const blankIsUnset = (value: unknown) => (value === "" ? undefined : value);
const whatsappSchema = z.object({
  WHATSAPP_ACCESS_TOKEN: z.string().min(20),
  WHATSAPP_PHONE_NUMBER_ID: z.string().regex(/^[0-9]{5,30}$/),
  WHATSAPP_VERIFY_TOKEN: z.string().min(16),
  META_APP_SECRET: z.string().min(16),
  WHATSAPP_GRAPH_VERSION: z.preprocess(blankIsUnset, z.string().regex(/^v[0-9]{1,3}\.[0-9]$/).optional()),
  WHATSAPP_GRAPH_HOST: loopbackUrl,
});

export type WhatsAppConfig = {
  accessToken: string;
  phoneNumberId: string;
  verifyToken: string;
  appSecret: string;
  graphVersion: string | undefined;
  graphHost: string | undefined;
};

export function loadWhatsAppConfig(env: Record<string, string | undefined> = process.env): WhatsAppConfig {
  const parsed = whatsappSchema.safeParse(env);
  if (!parsed.success) {
    const names = [...new Set(parsed.error.issues.map((issue) => issue.path.join(".")))];
    throw new Error(`WhatsApp is not configured: ${names.join(", ")} missing or invalid (see apps/api/.env.example)`);
  }
  return {
    accessToken: parsed.data.WHATSAPP_ACCESS_TOKEN,
    phoneNumberId: parsed.data.WHATSAPP_PHONE_NUMBER_ID,
    verifyToken: parsed.data.WHATSAPP_VERIFY_TOKEN,
    appSecret: parsed.data.META_APP_SECRET,
    graphVersion: parsed.data.WHATSAPP_GRAPH_VERSION,
    graphHost: parsed.data.WHATSAPP_GRAPH_HOST && withoutTrailingSlash(parsed.data.WHATSAPP_GRAPH_HOST),
  };
}

// Facebook Login and publishing to Pages and Instagram (Meta app dashboard >
// App settings > Basic). Optional as a group: without them linking and
// posting answer 503, and everything else works.
// Current Graph API version: https://developers.facebook.com/docs/graph-api/changelog
const DEFAULT_META_GRAPH_VERSION = "v26.0";
const httpsUrl = z.string().url().regex(/^https:\/\//, "must be https");
const metaSchema = z.object({
  META_APP_ID: z.string().regex(/^[0-9]{5,32}$/),
  META_APP_SECRET: z.string().min(16),
  // The API's public origin; Meta redirects to <API_PUBLIC_URL>/v1/meta/callback.
  API_PUBLIC_URL: httpsUrl,
  // The owner web app; the callback returns the owner to <OWNER_WEB_URL>/content/accounts.
  OWNER_WEB_URL: httpsUrl,
  META_GRAPH_VERSION: z.preprocess(blankIsUnset, z.string().regex(/^v[0-9]{1,3}\.[0-9]$/).optional()),
  // Facebook Login for Business configuration; without it the dialog asks for scopes.
  META_LOGIN_CONFIG_ID: z.preprocess(blankIsUnset, z.string().regex(/^[0-9]{5,32}$/).optional()),
});

export type MetaConfig = {
  appId: string;
  appSecret: string;
  graphVersion: string;
  redirectUri: string;
  ownerReturnUrl: string;
  loginConfigId: string | undefined;
};

export function loadMetaConfig(env: Record<string, string | undefined> = process.env): MetaConfig {
  const parsed = metaSchema.safeParse(env);
  if (!parsed.success) {
    const names = [...new Set(parsed.error.issues.map((issue) => issue.path.join(".")))];
    throw new Error(`Facebook and Instagram are not configured: ${names.join(", ")} missing or invalid (see apps/api/.env.example)`);
  }
  return {
    appId: parsed.data.META_APP_ID,
    appSecret: parsed.data.META_APP_SECRET,
    graphVersion: parsed.data.META_GRAPH_VERSION ?? DEFAULT_META_GRAPH_VERSION,
    redirectUri: `${withoutTrailingSlash(parsed.data.API_PUBLIC_URL)}/v1/meta/callback`,
    ownerReturnUrl: `${withoutTrailingSlash(parsed.data.OWNER_WEB_URL)}/content/accounts`,
    loginConfigId: parsed.data.META_LOGIN_CONFIG_ID,
  };
}

function withoutTrailingSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

export function loadConfig(env: Record<string, string | undefined> = process.env): ApiConfig {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const names = [...new Set(parsed.error.issues.map((issue) => issue.path.join(".")))];
    throw new Error(`Missing or invalid environment variables: ${names.join(", ")} (see apps/api/.env.example)`);
  }
  return {
    metaModelApiKey: parsed.data.META_MODEL_API_KEY,
    metaModelBaseUrl: parsed.data.META_MODEL_BASE_URL && withoutTrailingSlash(parsed.data.META_MODEL_BASE_URL),
    supabaseUrl: parsed.data.SUPABASE_URL,
    supabaseServiceRoleKey: parsed.data.SUPABASE_SERVICE_ROLE_KEY,
    supabaseAnonKey: parsed.data.SUPABASE_ANON_KEY,
    serverKey: parsed.data.ZUKKI_SERVER_KEY,
  };
}

export function metaClientOptions(config: ApiConfig): { apiKey: string; baseUrl?: string } {
  return { apiKey: config.metaModelApiKey, ...(config.metaModelBaseUrl ? { baseUrl: config.metaModelBaseUrl } : {}) };
}
