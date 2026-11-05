// Auth gate (HANDOFF-RN-UI section 7): in live mode a signed-out owner starts at sign-up.
// Only the steps that sign the owner in stay open; the setup steps after verify need the
// session, so an owner without one is sent back before entering data, not after the
// last step. Demo mode never gates.
export type OwnerAuthGateInput = {
  configured: boolean;
  loading: boolean;
  signedIn: boolean;
  pathname: string;
};

export const SIGN_UP_ROUTE = '/onboarding/sign-up';
const SIGN_IN_ROUTES = ['/onboarding/intro', SIGN_UP_ROUTE, '/onboarding/verify'];

export function ownerAuthRedirect(input: OwnerAuthGateInput): string | null {
  if (!mustSignIn(input)) return null;
  if (SIGN_IN_ROUTES.includes(input.pathname)) return null;

  return SIGN_UP_ROUTE;
}

function mustSignIn({ configured, loading, signedIn }: OwnerAuthGateInput): boolean {
  return configured && !loading && !signedIn;
}
