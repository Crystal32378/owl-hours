// Which onboarding service the screens use: the live one when the owner auth runtime is
// configured (its emailed-code send/verify injected, and the steps saved through the
// live owner API), the demo fake otherwise.
import { useOwnerAuth } from "../../auth/hooks/useOwnerAuth.tsx";
import { getOwnerLiveApi } from "../../../shared/infra/ownerApiRuntime.ts";
import type { OwnerEditApi } from "../../../shared/infra/ownerApi.ts";
import { onboardingServiceFor } from "../services/onboardingService.ts";
import type { OnboardingService } from "../services/onboardingService.ts";

export function useOnboardingService(): OnboardingService {
  return onboardingServiceFor(useOwnerAuth().codeAuth, liveApi());
}

// Built once, so every step shares one API client and session.
function liveApi(): OwnerEditApi | null {
  if (api === undefined) api = getOwnerLiveApi();
  return api;
}

let api: OwnerEditApi | null | undefined;
