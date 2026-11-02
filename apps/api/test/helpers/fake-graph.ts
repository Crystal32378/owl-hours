// A Graph API (graph.facebook.com) answered by the test, so no test calls Meta.
// Records each call's method, path, query and form body.
export type GraphCall = { method: string; path: string; params: URLSearchParams };
export type GraphReply = { status?: number; body: unknown };

export function fakeGraph(respond: (call: GraphCall) => GraphReply) {
  const calls: GraphCall[] = [];
  const fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input instanceof Request ? input.url : input));
    const params = new URLSearchParams(url.search);
    if (init?.body instanceof URLSearchParams) {
      init.body.forEach((value, key) => params.append(key, value));
    }
    const call = { method: init?.method ?? "GET", path: url.pathname, params };
    calls.push(call);
    const { status = 200, body } = respond(call);
    return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  }) as typeof globalThis.fetch;
  return { fetch, calls };
}

export const graphError = (message: string, status = 400): GraphReply => ({
  status,
  body: { error: { message, type: "OAuthException", code: 190 } },
});
