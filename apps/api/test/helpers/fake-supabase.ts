// A Supabase client whose fetch is answered by the test. Records every call
// so tests can assert the exact PostgREST, RPC and Storage requests. An answer
// may be a promise, so a test can hold a request back to make two of them race.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export type FakeCall = { method: string; path: string; query: URLSearchParams; body: unknown; headers: Headers };
export type FakeReply = { status?: number; body: unknown };

export type FakeResponder = (call: FakeCall) => FakeReply | Promise<FakeReply>;

export function fakeFetch(respond: FakeResponder) {
  const calls: FakeCall[] = [];
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input instanceof Request ? input.url : input));
    const call: FakeCall = {
      method: init?.method ?? "GET",
      path: url.pathname,
      query: url.searchParams,
      body: typeof init?.body === "string" ? JSON.parse(init.body) : null,
      headers: new Headers(init?.headers),
    };
    calls.push(call);
    const { status = 200, body } = await respond(call);
    return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  return { fetchImpl, calls };
}

export function fakeSupabase(respond: FakeResponder): { client: SupabaseClient; calls: FakeCall[] } {
  const { fetchImpl, calls } = fakeFetch(respond);
  const client = createClient("https://example.supabase.co", "test-key-0123456789-0123456789", {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: fetchImpl },
  });
  return { client, calls };
}

export const pgError = (code: string, message: string, status = 400): FakeReply => ({
  status,
  body: { code, message, details: null, hint: null },
});
