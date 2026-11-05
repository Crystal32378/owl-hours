# Owner authentication

This is app-wide infrastructure, independent of Story Pack. The owner signs in
with the handoff onboarding flow `OwSignUp` → `OwVerify`: the owner's email and a
6-digit code sent by email. There is no SMS provider and no magic-link screen.

The shared Supabase singleton lives in `apps/owner/shared/infra/`. The auth
feature owns the root provider (`OwnerAuthProvider`), the auth gate and the
foreground refresh adapter. The provider hands the emailed-code send/verify to onboarding
(`useOnboardingService`), and feature services reuse the singleton's `restore`,
`subscribe`, `signOut` and `getAccessToken` methods.

## Sign-in flow

- **Send:** `sendCode(email)` calls `supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: true } })`.
  The email is trimmed and lowercased first, so ` Daniel@Example.COM ` is sent as `daniel@example.com`.
  Sign-up creates the owner's auth user on the first code.
- **Verify:** `verifyCode(email, code)` calls `supabase.auth.verifyOtp({ email, token: code, type: 'email' })`.
  The SDK stores the returned session through the owner storage below and emits it;
  the auth controller keeps it.
- **Gate:** in live mode, a signed-out owner on any route other than the sign-in steps
  (`/onboarding/intro`, `/onboarding/sign-up`, `/onboarding/verify`) is sent to
  `/onboarding/sign-up` once the stored session has been restored. The setup steps
  (business, prices, area, live) need the session, so the owner is sent back before
  entering data, not after the last step. "Continue with Facebook" shows only in demo
  mode: live mode has no Facebook sign-in.
- **Demo mode:** without `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY`
  there is no auth runtime: onboarding keeps the in-memory fake (`DEMO_CODE`), the
  demo owner name and demo email are prefilled on sign-up, and nothing is gated.

## Configuration and deployment acceptance

Set `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` in the owner
build environment. The public anon/publishable key is not a service-role key.

Before live acceptance, the operator must enable the Supabase **Email** provider
(Authentication → Providers → Email) with "Confirm email" on, and check the OTP
expiry and email rate limits. The **Magic Link** email template must include
`{{ .Token }}` so the email carries the 6-digit code; without it Supabase sends
a link with no code ([passwordless email](https://supabase.com/docs/guides/auth/auth-email-passwordless)).
The docs do not say whether a brand-new owner gets **Confirm sign up** instead,
so add `{{ .Token }}` to that template too and check which one arrives on the
first live sign-up ([email templates](https://supabase.com/docs/guides/auth/auth-email-templates)). These hosted settings have **not** been changed by this PR.
No redirect allow-list is needed: email OTP sign-in never returns through a URL.

Foreground AppState (native) or page visibility (web) starts token refresh;
background and unmount stop it.

## Session persistence

Native persistence uses SecureStore for every part of the session. Unicode-aware
chunks stay at or below 1,800 UTF-8 bytes, including large JWT/user objects; no
plaintext fallback is used. A small manifest is committed after all parts are
written. A rejected replacement retains the prior complete session and reports
an error. Sign-out removes the manifest before deleting chunks so a cleanup
failure cannot revive a session; failures are surfaced. Incomplete manifests
fail closed. OS storage errors still require owner attention. Browser persistence
uses origin-local storage through the SDK adapter.

## API browser origins

`OWNER_APP_ORIGINS` is a comma-separated list of exact HTTPS browser origins;
localhost HTTP is permitted for development. Set `OWNER_PUBLIC_ORIGIN` to the
single external HTTPS API origin when TLS terminates at a proxy. This explicit
trusted value fixes public same-origin requests whose internal URL is HTTP.
Arbitrary `Forwarded` / `X-Forwarded-*` headers are deliberately ignored.
Owner CORS only covers `/v1/owner/*`, allows GET/POST/PATCH and Authorization /
Content-Type, and does not bypass bearer authentication. Native requests without
an Origin header retain their existing authentication behavior.

## Verification boundary

Automated coverage includes the exact `signInWithOtp` and `verifyOtp` payloads,
SDK `/otp` and `/verify` requests with the verified session written to the given
storage, the controller keeping the emitted session, the live/demo onboarding
service selection, the gate decision, foreground refresh cleanup, persisted SDK
session restore/sign-out, Unicode chunking, storage write and sign-out cleanup
failures, and proxy-origin CORS spoofing. These are synthetic tests; no email is sent.

Live acceptance remains: enable the Email provider with the `{{ .Token }}`
template; sign up from the installed Android build with a real address; enter
the code; relaunch and verify the same session; background/foreground and
refresh; sign out/relaunch and verify the gate returns to sign-up.

## Follow-ups

- A failed email send is silent: "Send code" stays on sign-up with no message,
  because the handoff has no copy for it.
- Every verify failure (wrong or expired code, network error) shows the handoff
  "That code didn't work. Try again."
- In live mode the onboarding drafts (name, profile, prices, area) stay in memory;
  they are not saved to Supabase yet.
- A protected screen renders for one frame before the gate redirects. Hold a splash until
  the stored session is restored.

References: [Supabase email OTP](https://supabase.com/docs/guides/auth/auth-email-passwordless),
[Supabase React Native sessions](https://supabase.com/docs/guides/auth/quickstarts/react-native),
[Expo SecureStore](https://docs.expo.dev/versions/latest/sdk/securestore/).
