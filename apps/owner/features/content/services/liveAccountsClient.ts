import type { OwnerApi } from "../../../shared/infra/ownerApi.ts";
import type { LinkedAccount } from "../../../shared/data/types.ts";
import type { AccountsClient } from "./accountsService.ts";

// AccountsClient over GET /linked-accounts and GET /meta/connect-url. Every row the API returns is a linked account,
// so each one shows as connected; a platform with no row is simply not listed.
export function createLiveAccountsClient(api: OwnerApi): AccountsClient {
  return {
    listAccounts: async () => {
      const rows = await api.get("/linked-accounts");
      if (!Array.isArray(rows)) throw new Error("The owner API answered linked accounts without a list.");
      return rows.map(toLinkedAccount);
    },
    connectUrl: async () => toLoginDialogUrl(await api.get("/meta/connect-url")),
  };
}

// Only Facebook's own login dialog is opened, whatever the API answers.
function toLoginDialogUrl(data: unknown): string {
  const url = typeof data === "object" && data !== null ? (data as Record<string, unknown>).url : undefined;
  if (typeof url !== "string" || !url.startsWith("https://www.facebook.com/")) {
    throw new Error("The owner API answered a connect link that is not Facebook Login.");
  }
  return url;
}

function toLinkedAccount(row: unknown): LinkedAccount {
  if (!isLinkedAccountRow(row)) throw new Error("The owner API answered a linked account this app cannot read.");
  return { kind: row.platform, name: row.displayName ?? "", status: "connected" };
}

type LinkedAccountRow = { platform: LinkedAccount["kind"]; displayName: string | null };

function isLinkedAccountRow(row: unknown): row is LinkedAccountRow {
  if (typeof row !== "object" || row === null) return false;
  const { platform, displayName } = row as Record<string, unknown>;
  const isPlatform = platform === "facebook_page" || platform === "instagram";
  return isPlatform && (displayName === null || typeof displayName === "string");
}
