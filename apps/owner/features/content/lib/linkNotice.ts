// The line the Linked accounts screen shows when Facebook Login sends the owner back to
// /content/accounts?meta=linked or ?meta=error&reason=<LinkFailure> (apps/api services/owner-meta.ts).
import { contentCopys } from "../copys/contentCopys.ts";

export type LinkNotice = { tone: "success" | "error"; text: string };

// What expo-web-browser's openAuthSessionAsync resolves with: the deep link it returned to on
// success, or only "cancel" / "dismiss" when the owner closed the login.
export type LoginSessionResult = { type: string; url?: string };

const FAILURES = new Map<string, string>([
  ["denied", contentCopys.linkNotices.denied],
  ["no_pages", contentCopys.linkNotices.no_pages],
  ["forbidden", contentCopys.linkNotices.forbidden],
  ["invalid_state", contentCopys.linkNotices.invalid_state],
]);

export function linkNotice(meta: string | undefined, reason: string | undefined): LinkNotice | null {
  if (meta === "linked") return { tone: "success", text: contentCopys.linkNotices.linked };
  if (meta !== "error") return null;
  return { tone: "error", text: FAILURES.get(reason ?? "") ?? contentCopys.linkNotices.failed };
}

// The native app's login returns to zukki-owner://content/accounts?meta=...&reason=...
export function loginSessionNotice(result: LoginSessionResult): LinkNotice | null {
  if (result.type !== "success" || !result.url) return null;
  const query = new URL(result.url).searchParams;
  return linkNotice(query.get("meta") ?? undefined, query.get("reason") ?? undefined);
}
