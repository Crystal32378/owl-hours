// Hook for OwPostReview screen: manages post draft state, targets, caption editing, and approval.
import { useCallback, useEffect, useState } from "react";
import type { ID, PostDraft } from "../../../shared/data/types.ts";
import { contentCopys } from "../copys/contentCopys.ts";
import { resolveJobPhotos, type JobPhotoSource } from "../lib/jobPhotos.ts";
import type { ResolvedJobPhotos } from "../lib/jobPhotos.ts";
import { canApprovePost } from "../lib/postApproval.ts";
import { postWhenText } from "../lib/postWhenText.ts";
import { sourceLine } from "../lib/sourceLine.ts";
import type { PostsService } from "../services/postsService.ts";
import { contentRuntime } from "./contentRuntime.ts";

export type PostReviewView = {
  draft: PostDraft;
  draftSubtitle: string;
  businessName: string;
  caption: string;
  isEditingCaption: boolean;
  targets: { facebook: boolean; instagram: boolean };
  scheduledWhenText: string | null;
  jobPhotos: ResolvedJobPhotos | null;
  canApprove: boolean;
  canRegenerate: boolean;
  // While the API reviews and posts; a second tap would post twice.
  isPosting: boolean;
  // The API's message when posting failed; the post then stays approved and Approve and post retries.
  approveError: string | null;
  onSetCaption: (caption: string) => Promise<void>;
  onToggleTarget: (target: "facebook" | "instagram") => Promise<void>;
  onToggleEditCaption: () => Promise<void>;
  onApprove: () => Promise<PostDraft | null>;
  onRegenerate: () => Promise<PostDraft | null>;
};

export type PostReviewState =
  | { status: "loading" }
  | { status: "error"; retry: () => Promise<void> }
  | { status: "ready"; view: PostReviewView };

export type PostReviewDeps = {
  service: PostsService;
  clock: () => string;
};

export function usePostReview(
  id: ID,
  deps?: Partial<PostReviewDeps>,
): PostReviewState {
  const [defaultDeps] = useState(createDefaultDeps);
  const service = deps?.service ?? defaultDeps.service;
  const clock = deps?.clock ?? defaultDeps.clock;

  const [draft, setDraft] = useState<PostDraft | null>(null);
  const [job, setJob] = useState<JobPhotoSource | null>(null);
  const [businessName, setBusinessName] = useState("");
  const [allDraftsCount, setAllDraftsCount] = useState(0);
  const [draftIndex, setDraftIndex] = useState(1);
  const [caption, setCaption] = useState("");
  const [isEditingCaption, setIsEditingCaption] = useState(false);
  const [targets, setTargets] = useState<{ facebook: boolean; instagram: boolean }>({
    facebook: true,
    instagram: true,
  });
  const [status, setStatus] = useState<"loading" | "error" | "ready">("loading");
  const [isPosting, setIsPosting] = useState(false);
  const [approveError, setApproveError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [loadedDraft, allDrafts, name] = await Promise.all([
        service.getDraft(id),
        service.getDrafts(),
        service.getBusinessName(),
      ]);

      if (!loadedDraft) {
        setStatus("error");
        return;
      }

      let loadedJob: JobPhotoSource | null = null;
      if (loadedDraft.sourceJobId) {
        loadedJob = await service.getJob(loadedDraft.sourceJobId);
      }

      setDraft(loadedDraft);
      setJob(loadedJob);
      setBusinessName(name);
      setCaption(loadedDraft.caption);
      setTargets(structuredClone(loadedDraft.targets));

      const count = allDrafts.length;
      const index = allDrafts.findIndex((d) => d.id === id);
      setAllDraftsCount(count);
      setDraftIndex(index >= 0 ? index + 1 : 1);

      setStatus("ready");
    } catch {
      setStatus("error");
    }
  }, [service, id]);

  useEffect(() => {
    void load();
  }, [load]);

  if (status === "loading") {
    return { status: "loading" };
  }

  if (status === "error" || !draft) {
    return { status: "error", retry: load };
  }

  const jobPhotos = resolveJobPhotos(draft, job);
  const scheduledWhenText = postWhenText(draft.scheduledFor, clock());
  const canApprove = canApprovePost(targets);

  const draftSourceLine = sourceLine(draft);
  const draftSubtitle = contentCopys.draftSubtitle(
    draftIndex,
    allDraftsCount,
    draftSourceLine,
  );

  const view: PostReviewView = {
    draft,
    draftSubtitle,
    businessName,
    caption,
    isEditingCaption,
    targets,
    scheduledWhenText,
    jobPhotos,
    canApprove: canApprove && !isPosting,
    canRegenerate: service.canRegenerate,
    isPosting,
    approveError,
    onSetCaption: async (newCaption: string) => {
      setCaption(newCaption);
    },
    onToggleTarget: async (target: "facebook" | "instagram") => {
      setTargets((prev) => ({
        ...prev,
        [target]: !prev[target],
      }));
    },
    onToggleEditCaption: async () => {
      setIsEditingCaption((prev) => !prev);
    },
    onApprove: async () => {
      setIsPosting(true);
      setApproveError(null);
      try {
        return await service.approve(draft.id, { caption, targets });
      } catch (error) {
        setApproveError(error instanceof Error ? error.message : contentCopys.postFailed);
        return null;
      } finally {
        setIsPosting(false);
      }
    },
    onRegenerate: async () => {
      const result = await service.regenerate(draft.id);
      if (result) {
        setCaption(result.caption);
      }
      return result;
    },
  };

  return { status: "ready", view };
}

function createDefaultDeps(): PostReviewDeps {
  const root = contentRuntime();
  return { service: root.postsService, clock: root.now };
}
