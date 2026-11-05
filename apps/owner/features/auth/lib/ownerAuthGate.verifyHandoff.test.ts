// Review finding R3-verify-session-race (PR #93): the verify route pushes /onboarding/business
// as soon as the code verifies. The gate must already see the session at that point, or it
// bounces the owner straight back to sign-up. Real Supabase client, fake network.
import assert from 'node:assert/strict';
import { it } from 'node:test';
import { createSupabaseOwnerSession } from '../../../shared/infra/ownerSessionClient.ts';
import { createOwnerAuthController, type OwnerAuthControllerState } from './ownerAuthController.ts';
import { ownerAuthRedirect } from './ownerAuthGate.ts';

it('a verified code leaves the gate open for the business step the verify route pushes next', async () => {
  const controller = createOwnerAuthController(supabaseRuntimeThatVerifies());
  controller.start();
  await controller.restore();
  assert.equal(businessStepRedirect(controller.getState()), '/onboarding/sign-up');

  assert.equal(await controller.verifyCode('daniel@northside-plumbing.example', '482910'), true);

  assert.equal(controller.getState().session?.access_token, 'email-session');
  assert.equal(businessStepRedirect(controller.getState()), null);
});

function businessStepRedirect({ session, loading }: OwnerAuthControllerState): string | null {
  return ownerAuthRedirect({
    configured: true,
    loading,
    signedIn: session !== null,
    pathname: '/onboarding/business',
  });
}

function supabaseRuntimeThatVerifies() {
  const values = new Map<string, string>();
  const storage = {
    getItem: async (name: string) => values.get(name) ?? null,
    setItem: async (name: string, value: string) => { values.set(name, value); },
    removeItem: async (name: string) => { values.delete(name); },
  };
  return createSupabaseOwnerSession({
    supabaseUrl: 'https://fixture.supabase.co',
    anonKey: 'public-test-key',
    storage,
    detectSessionInUrl: false,
    autoRefreshToken: false,
    fetch: verifyEndpoint,
  });
}

const owner = {
  id: '22222222-2222-4222-8222-222222222222',
  email: 'daniel@northside-plumbing.example',
  aud: 'authenticated',
  role: 'authenticated',
  app_metadata: {},
  user_metadata: {},
  created_at: '2026-10-30T00:00:00Z',
};

async function verifyEndpoint(input: RequestInfo | URL): Promise<Response> {
  const url = String(input);
  if (!url.endsWith('/auth/v1/verify')) throw new Error(`Unexpected auth request: ${url}`);
  const body = {
    access_token: 'email-session',
    refresh_token: 'email-refresh',
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    expires_in: 3600,
    token_type: 'bearer',
    user: owner,
  };
  return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
}
