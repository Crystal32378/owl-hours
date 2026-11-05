import type { Session } from "../../../shared/infra/ownerSessionService.ts";

// Web has no push token to register (see useRequestNotifications.web.ts).
export function usePushTokenSync(_options: { session: Session | null; configured: boolean }): void {}
