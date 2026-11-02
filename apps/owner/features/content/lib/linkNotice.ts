// The line the Linked accounts screen shows when Facebook Login sends the owner back to
// /content/accounts?meta=linked or ?meta=error&reason=<LinkFailure> (apps/api services/owner-meta.ts).
import { contentCopys } from "../copys/contentCopys.ts";

export type LinkNotice = { tone: "success" | "error"; text: string };

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
