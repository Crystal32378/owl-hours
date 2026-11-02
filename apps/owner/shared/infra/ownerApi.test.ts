import test from 'node:test';
import assert from 'node:assert/strict';
import { createOwnerApi, OwnerApiError, resolveOwnerApiConfig } from './ownerApi.ts';

type Call = { url: string; init: RequestInit };

function answering(status: number, body: unknown, calls: Call[] = []) {
  const fetch = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return Response.json(body, { status });
  }) as unknown as typeof globalThis.fetch;
  return { fetch, calls };
}

const live = { apiUrl: 'https://api.example.com/', supabaseUrl: 'https://db.example.com', anonKey: 'anon' };

test('live needs the API URL and both Supabase variables over https; anything missing is the demo', () => {
  assert.deepEqual(resolveOwnerApiConfig(live), { mode: 'live', apiUrl: 'https://api.example.com', supabaseUrl: 'https://db.example.com', anonKey: 'anon' });
  assert.deepEqual(resolveOwnerApiConfig({ ...live, apiUrl: undefined }), { mode: 'demo' });
  assert.deepEqual(resolveOwnerApiConfig({ ...live, anonKey: '' }), { mode: 'demo' });
  assert.deepEqual(resolveOwnerApiConfig({ ...live, apiUrl: 'http://api.example.com' }), { mode: 'demo' });
  assert.equal(resolveOwnerApiConfig({ ...live, apiUrl: 'http://localhost:3000' }).mode, 'live');
});

test('get sends the bearer token to /v1/owner and returns the unwrapped data', async () => {
  const { fetch, calls } = answering(200, { success: true, data: [{ id: 'o1' }] });
  const api = createOwnerApi({ apiUrl: 'https://api.example.com', getAccessToken: async () => 'tok', fetch });

  assert.deepEqual(await api.get('/offers?status=offered'), [{ id: 'o1' }]);
  assert.equal(calls[0].url, 'https://api.example.com/v1/owner/offers?status=offered');
  assert.equal(calls[0].init.method, 'GET');
  assert.deepEqual(calls[0].init.headers, { Authorization: 'Bearer tok' });
});

test('post sends a JSON body', async () => {
  const { fetch, calls } = answering(201, { success: true, data: { id: 'q1' } });
  const api = createOwnerApi({ apiUrl: 'https://api.example.com', getAccessToken: async () => 'tok', fetch });

  assert.deepEqual(await api.post('/jobs/j1/quote', { note: 'hi' }), { id: 'q1' });
  assert.equal(calls[0].init.method, 'POST');
  assert.deepEqual(calls[0].init.headers, { Authorization: 'Bearer tok', 'Content-Type': 'application/json' });
  assert.equal(calls[0].init.body, '{"note":"hi"}');
});

test('a failed answer throws OwnerApiError with the status and the API error code', async () => {
  const { fetch } = answering(409, { success: false, error: { code: 'offer_expired', message: 'This request expired before you accepted it.' } });
  const api = createOwnerApi({ apiUrl: 'https://api.example.com', getAccessToken: async () => 'tok', fetch });

  await assert.rejects(api.post('/offers/o1/accept'), (error: unknown) => {
    assert.ok(error instanceof OwnerApiError);
    assert.equal(error.status, 409);
    assert.equal(error.code, 'offer_expired');
    assert.equal(error.message, 'This request expired before you accepted it.');
    return true;
  });
});

test('an answer without data is rejected', async () => {
  const { fetch } = answering(200, { success: true });
  const api = createOwnerApi({ apiUrl: 'https://api.example.com', getAccessToken: async () => 'tok', fetch });

  await assert.rejects(api.get('/me'), OwnerApiError);
});

test('patch and put send a JSON body with their own method', async () => {
  const { fetch, calls } = answering(200, { success: true, data: { id: 'b1' } });
  const api = createOwnerApi({ apiUrl: 'https://api.example.com', getAccessToken: async () => 'tok', fetch });

  assert.deepEqual(await api.patch('/business', { takingRequests: false }), { id: 'b1' });
  assert.deepEqual(await api.put('/business/prices', { prices: [] }), { id: 'b1' });
  assert.deepEqual(calls.map(call => [call.url, call.init.method, call.init.body]), [
    ['https://api.example.com/v1/owner/business', 'PATCH', '{"takingRequests":false}'],
    ['https://api.example.com/v1/owner/business/prices', 'PUT', '{"prices":[]}'],
  ]);
});

test('delete sends no body and returns the unwrapped data', async () => {
  const { fetch, calls } = answering(200, { success: true, data: { id: 'a1' } });
  const api = createOwnerApi({ apiUrl: 'https://api.example.com', getAccessToken: async () => 'tok', fetch });

  assert.deepEqual(await api.delete('/linked-accounts/a1'), { id: 'a1' });
  assert.equal(calls[0].url, 'https://api.example.com/v1/owner/linked-accounts/a1');
  assert.equal(calls[0].init.method, 'DELETE');
  assert.deepEqual(calls[0].init.headers, { Authorization: 'Bearer tok' });
  assert.equal(calls[0].init.body, undefined);
});
