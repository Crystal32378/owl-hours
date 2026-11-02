// Spec: odd/tasks/owner-content.md, S5 requirement.
// Service and fake adapter for linked social accounts.
import { accounts as mockAccounts } from "../../../shared/data/mock.ts";
import type { LinkedAccount } from "../../../shared/data/types.ts";

// The live API names each account by id so the owner can unlink it; the demo's accounts have none.
export type ListedAccount = LinkedAccount & { id?: string };

// Where Facebook Login returns: the owner web app, or the native app's deep link.
export type LoginReturn = "web" | "app";

export type AccountsClient = {
  listAccounts(): Promise<ListedAccount[]>;
  // The Facebook Login URL; absent in the demo, which links nothing.
  connectUrl?(returnTo: LoginReturn): Promise<string>;
  // Absent in the demo, which unlinks nothing.
  unlink?(id: string): Promise<void>;
};

export type AccountsService = {
  canConnect: boolean;
  canUnlink: boolean;
  getAccounts(): Promise<ListedAccount[]>;
  getConnectUrl(returnTo: LoginReturn): Promise<string>;
  unlink(id: string): Promise<void>;
};

export function createAccountsService(client: AccountsClient): AccountsService {
  return {
    canConnect: Boolean(client.connectUrl),
    canUnlink: Boolean(client.unlink),
    getAccounts: () => client.listAccounts(),
    getConnectUrl: async (returnTo) => {
      if (!client.connectUrl) throw new Error(NEEDS_LIVE_API);
      return client.connectUrl(returnTo);
    },
    unlink: async (id) => {
      if (!client.unlink) throw new Error(NEEDS_LIVE_API);
      await client.unlink(id);
    },
  };
}

const NEEDS_LIVE_API = "Connecting accounts needs the live owner API.";

export function createFakeAccountsClient(): AccountsClient {
  const accounts = structuredClone(mockAccounts);

  return {
    listAccounts: async () => structuredClone(accounts),
  };
}
