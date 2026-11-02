// Hook for OwAccounts screen: loads linked social accounts and the Facebook Login link.
import { useCallback, useEffect, useState } from "react";
import type { LinkedAccount } from "../../../shared/data/types.ts";
import type { AccountsService } from "../services/accountsService.ts";
import { contentCopys } from "../copys/contentCopys.ts";
import { contentRuntime } from "./contentRuntime.ts";

export type LinkedAccountsView = {
  accounts: LinkedAccount[];
  // Live mode only: the demo links nothing.
  canConnect: boolean;
  connectError: string | null;
  // The Facebook Login URL to open, or null when it could not be read (connectError says why).
  connect: () => Promise<string | null>;
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
  const [connectError, setConnectError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const accounts = await service.getAccounts();
      setState({ status: "ready", accounts });
    } catch {
      setState({ status: "error", retry: load });
    }
  }, [service]);

  const connect = useCallback(async () => {
    setConnectError(null);
    try {
      return await service.getConnectUrl();
    } catch (error) {
      setConnectError(error instanceof Error ? error.message : contentCopys.linkNotices.failed);
      return null;
    }
  }, [service]);

  useEffect(() => {
    void load();
  }, [load]);

  if (state.status !== "ready") return state;
  return { status: "ready", view: { accounts: state.accounts, canConnect: service.canConnect, connectError, connect } };
}

type LoadState =
  | { status: "loading" }
  | { status: "error"; retry: () => Promise<void> }
  | { status: "ready"; accounts: LinkedAccount[] };

function createDefaultDeps(): LinkedAccountsDeps {
  return { service: contentRuntime().accountsService };
}
