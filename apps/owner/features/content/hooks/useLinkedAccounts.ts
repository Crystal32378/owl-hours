// Hook for OwAccounts screen: loads linked social accounts, the Facebook Login link and unlinking.
import { useCallback, useEffect, useState } from "react";
import type { AccountsService, ListedAccount, LoginReturn } from "../services/accountsService.ts";
import { contentCopys } from "../copys/contentCopys.ts";
import { contentRuntime } from "./contentRuntime.ts";

export type LinkedAccountsView = {
  accounts: ListedAccount[];
  // Live mode only: the demo links and unlinks nothing.
  canConnect: boolean;
  canUnlink: boolean;
  // Why the last connect or unlink failed.
  actionError: string | null;
  // The Facebook Login URL to open, or null when it could not be read (actionError says why).
  connect: (returnTo: LoginReturn) => Promise<string | null>;
  unlink: (id: string) => Promise<void>;
  refresh: () => Promise<void>;
};

export type LinkedAccountsState =
  | { status: "loading" }
  | { status: "error"; retry: () => Promise<void> }
  | { status: "ready"; view: LinkedAccountsView };

export type LinkedAccountsDeps = {
  service: AccountsService;
};

export function useLinkedAccounts(
  deps?: Partial<LinkedAccountsDeps>,
): LinkedAccountsState {
  const [defaultDeps] = useState(createDefaultDeps);
  const service = deps?.service ?? defaultDeps.service;

  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const accounts = await service.getAccounts();
      setState({ status: "ready", accounts });
    } catch {
      setState({ status: "error", retry: load });
    }
  }, [service]);

  const connect = useCallback(async (returnTo: LoginReturn) => {
    setActionError(null);
    try {
      return await service.getConnectUrl(returnTo);
    } catch (error) {
      setActionError(messageOf(error, contentCopys.linkNotices.failed));
      return null;
    }
  }, [service]);

  const unlink = useCallback(async (id: string) => {
    setActionError(null);
    try {
      await service.unlink(id);
      await load();
    } catch (error) {
      setActionError(messageOf(error, contentCopys.unlinkFailed));
    }
  }, [service, load]);

  useEffect(() => {
    void load();
  }, [load]);

  if (state.status !== "ready") return state;
  return {
    status: "ready",
    view: {
      accounts: state.accounts,
      canConnect: service.canConnect,
      canUnlink: service.canUnlink,
      actionError,
      connect,
      unlink,
      refresh: load,
    },
  };
}

type LoadState =
  | { status: "loading" }
  | { status: "error"; retry: () => Promise<void> }
  | { status: "ready"; accounts: ListedAccount[] };

function messageOf(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function createDefaultDeps(): LinkedAccountsDeps {
  return { service: contentRuntime().accountsService };
}
