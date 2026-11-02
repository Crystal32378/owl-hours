// Spec: odd/tasks/owner-content.md, S5 requirement.
// Service and fake adapter for linked social accounts.
import { accounts as mockAccounts } from "../../../shared/data/mock.ts";
import type { LinkedAccount } from "../../../shared/data/types.ts";

export type AccountsClient = {
  listAccounts(): Promise<LinkedAccount[]>;
  // The Facebook Login URL; absent in the demo, which links nothing.
  connectUrl?(): Promise<string>;
};

export type AccountsService = {
  canConnect: boolean;
  getAccounts(): Promise<LinkedAccount[]>;
  getConnectUrl(): Promise<string>;
};

export function createAccountsService(client: AccountsClient): AccountsService {
  return {
    canConnect: Boolean(client.connectUrl),
    getAccounts: () => client.listAccounts(),
    getConnectUrl: async () => {
      if (!client.connectUrl) throw new Error("Connecting accounts needs the live owner API.");
      return client.connectUrl();
    },
  };
}

export function createFakeAccountsClient(): AccountsClient {
  const accounts = structuredClone(mockAccounts);

  return {
    listAccounts: async () => structuredClone(accounts),
  };
}
