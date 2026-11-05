import { useCallback, useEffect, useState } from "react";
import type { ID, QuoteLine } from "../../../shared/data/types.ts";
import { arrivalWindowText } from "../../../shared/lib/arrivalWindow.ts";
import { firstName } from "../../../shared/lib/firstName.ts";
import { afterFailedLoad } from "../../../shared/lib/loadState.ts";
import type { LoadState } from "../../../shared/lib/loadState.ts";
import { buildQuote } from "../lib/quoteEditing.ts";
import type { JobsService, QuoteDraft } from "../services/jobsService.ts";
import { jobsRuntime } from "./jobsRuntime.ts";

export type QuoteDraftDeps = { service: JobsService };

// Serializable by design: it crosses into the DOM component as props. The screen edits the lines
// itself (recalculating the total live) and hands the edited lines back through `send`.
export type QuoteDraftView = {
  title: string;
  customerName: string;
  customerFirstName: string;
  lines: QuoteLine[];
  arrivalText: string;
  technician: string;
  note: string | null;
  send: (lines: QuoteLine[]) => Promise<boolean>;
};

// "loading" also covers a conversation with no job to quote; "failed" draws the error state and retries.
export type QuoteDraftScreen = { status: "loading" } | { status: "failed"; retry: () => Promise<void> } | ({ status: "ready" } & QuoteDraftView);

// Pass a stable service (a module constant or memoized): changing it reloads the draft.
export function useQuoteDraft(conversationId: ID, deps?: Partial<QuoteDraftDeps>): QuoteDraftScreen {
  const [defaults] = useState(createDefaultDeps);
  const service = deps?.service ?? defaults.service;
  const [draft, setDraft] = useState<LoadState<QuoteDraft | null>>("loading");
  const [reloadToken, setReloadToken] = useState(0);
  const reload = useCallback(() => setReloadToken((token) => token + 1), []);

  useEffect(() => {
    let isCurrent = true;
    service
      .getQuoteDraft(conversationId)
      .then((loaded) => {
        if (isCurrent) setDraft(loaded);
      })
      .catch(() => {
        if (isCurrent) setDraft(afterFailedLoad);
      });
    return () => {
      isCurrent = false;
    };
  }, [service, conversationId, reloadToken]);

  if (draft === "failed") return { status: "failed", retry: async () => reload() };
  if (draft === "loading" || draft === null) return { status: "loading" };

  return {
    status: "ready",
    title: draft.title,
    customerName: draft.customerName,
    customerFirstName: firstName(draft.customerName),
    lines: draft.quote.lines,
    arrivalText: arrivalWindowText(draft.quote.arrival),
    technician: draft.quote.technician,
    note: draft.quote.note ?? null,
    send: (lines) => sendQuote(service, conversationId, draft, lines),
  };
}

// A refusal and a failure both mean the quote did not go out: the owner keeps the screen and can retry.
async function sendQuote(service: JobsService, conversationId: ID, draft: QuoteDraft, lines: QuoteLine[]): Promise<boolean> {
  try {
    return (await service.sendQuote(conversationId, buildQuote(draft.quote, lines))) !== null;
  } catch {
    return false;
  }
}

// The live API when configured, the demo otherwise (S7).
function createDefaultDeps(): QuoteDraftDeps {
  return { service: jobsRuntime().service };
}
