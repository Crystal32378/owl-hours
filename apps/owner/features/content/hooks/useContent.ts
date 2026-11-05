// Hook for OwContent screen: loads accounts summary, drafts list, and published list.
import { useCallback, useState } from "react";
import { useFocusEffect } from "expo-router";
import type { ID, PostDraft } from "../../../shared/data/types.ts";
import { contentCopys } from "../copys/contentCopys.ts";
import { resolveJobPhotos } from "../lib/jobPhotos.ts";
import { postWhenText } from "../lib/postWhenText.ts";
import { sourceLine } from "../lib/sourceLine.ts";
import type { AccountsService } from "../services/accountsService.ts";
import type { PostsService } from "../services/postsService.ts";
import { contentRuntime } from "./contentRuntime.ts";

export type ContentDraftRow = {
  id: ID;
  title: string;
  subtitle: string;
  source: PostDraft["source"];
  thumbnail: "beforeAfter" | "night" | "priceTile";
};

export type ContentPublishedRow = {
  id: ID;
  title: string;
  publishedDateText: string;
};

export type ContentAccountsSummary = {
  title: string;
  status: string;
};

export type ContentView = {
  accountsSummary: ContentAccountsSummary;
  draftsCount: number;
  drafts: ContentDraftRow[];
  published: ContentPublishedRow[];
};

export type ContentState =
  | { status: "loading" }
  | { status: "error"; retry: () => Promise<void> }
  | { status: "ready"; view: ContentView };

export type ContentDeps = {
  postsService: PostsService;
  accountsService: AccountsService;
  clock: () => string;
};

export function useContent(deps?: Partial<ContentDeps>): ContentState {
  const [defaultDeps] = useState(createDefaultDeps);
  const postsService = deps?.postsService ?? defaultDeps.postsService;
  const accountsService = deps?.accountsService ?? defaultDeps.accountsService;
  const clock = deps?.clock ?? defaultDeps.clock;

  const [state, setState] = useState<ContentState>({ status: "loading" });

  const load = useCallback(async () => {
    try {
      const [accounts, drafts, scheduled, published] = await Promise.all([
        accountsService.getAccounts(),
        postsService.getDrafts(),
        postsService.getScheduled(),
        postsService.getPublished(),
      ]);

      const connectedCount = accounts.filter((a) => a.status === "connected").length;
      const accountsSummary: ContentAccountsSummary = {
        title: contentCopys.accountsCardTitle,
        status: connectedCount > 0 ? contentCopys.connected : "",
      };

      const jobs = await Promise.all(
        drafts.map((d) => (d.sourceJobId ? postsService.getJob(d.sourceJobId) : Promise.resolve(null))),
      );

      const draftRows: ContentDraftRow[] = drafts.map((d, index) => {
        const job = jobs[index];
        let thumbnail: "beforeAfter" | "night" | "priceTile" = "priceTile";
        if (d.source === "reminder") {
          thumbnail = "night";
        } else if (d.source === "prices") {
          thumbnail = "priceTile";
        } else if (d.source === "job") {
          const jobPhotos = resolveJobPhotos(d, job);
          thumbnail = jobPhotos ? "beforeAfter" : "priceTile";
        }

        return {
          id: d.id,
          title: d.title,
          subtitle: sourceLine(d, job),
          source: d.source,
          thumbnail,
        };
      });

      const scheduledRows: ContentPublishedRow[] = scheduled.map((s) => ({
        id: s.id,
        title: s.title,
        publishedDateText: postWhenText(s.scheduledFor, clock()) ?? "",
      }));

      const regularPublishedRows: ContentPublishedRow[] = published.map((p) => ({
        id: p.id,
        title: p.title,
        publishedDateText: formatPublishedDate(p.publishedAt),
      }));

      const publishedRows = [...scheduledRows, ...regularPublishedRows];

      setState({
        status: "ready",
        view: {
          accountsSummary,
          draftsCount: drafts.length,
          drafts: draftRows,
          published: publishedRows,
        },
      });
    } catch {
      setState({ status: "error", retry: load });
    }
  }, [postsService, accountsService, clock]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  return state;
}

function formatPublishedDate(publishedAt?: string): string {
  if (!publishedAt) return "";
  try {
    const date = new Date(publishedAt);
    if (Number.isNaN(date.getTime())) return "";
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    }).format(date);
  } catch {
    return "";
  }
}

function createDefaultDeps(): ContentDeps {
  const root = contentRuntime();
  return {
    postsService: root.postsService,
    accountsService: root.accountsService,
    clock: root.now,
  };
}
