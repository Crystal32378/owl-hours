import type { StoryPackApprovalSnapshot } from '@owl-hours/shared';
import type { StoryPackPatch } from '../services/storyPackService.ts';
import {
  buildApprovalMediaSnapshot,
  type StoryPack,
  type StorySource,
} from '../lib/storyPack.ts';
import { storyPackServiceCopys as copy } from '../copys/storyPackServiceCopys.ts';

export type StoryPackDraftDeps = {
  draft: StoryPack;
  sources: StorySource[];
  expectedUpdatedAt?: string | undefined;
  updateDraft: (patch: StoryPackPatch) => Promise<StoryPack | null>;
  approve: (snapshot: StoryPackApprovalSnapshot) => Promise<StoryPack | null>;
  // Returns false when the editor changed after the submission, so the save is stale.
  acceptSaved: (saved: StoryPack, submitted: StoryPack) => boolean;
};

export async function saveStoryPackDraft(
  deps: StoryPackDraftDeps,
): Promise<StoryPack | null> {
  const saved = await deps.updateDraft(
    editableFields(deps.draft, deps.expectedUpdatedAt),
  );
  if (saved) deps.acceptSaved(saved, deps.draft);
  return saved;
}

export async function approveStoryPackDraft(
  deps: StoryPackDraftDeps,
): Promise<{ error: string | null }> {
  const expectedMedia = reviewedMedia(deps);
  if (!expectedMedia) return { error: copy.changedSinceReview };

  const saved = await deps.updateDraft(
    editableFields(deps.draft, deps.expectedUpdatedAt),
  );
  if (!saved) return { error: null };
  if (!deps.acceptSaved(saved, deps.draft))
    return { error: copy.changedSinceReview };

  const approved = await deps.approve({
    expectedUpdatedAt: saved.updatedAt,
    expectedMedia,
  });
  if (approved) deps.acceptSaved(approved, saved);
  return { error: null };
}

function reviewedMedia({ draft, sources }: StoryPackDraftDeps) {
  const source = sources.find(
    (candidate) => candidate.id === draft.sourceJobId,
  );
  return source ? buildApprovalMediaSnapshot(source, draft) : null;
}

function editableFields(
  { caption, slides, platforms, updatedAt }: StoryPack,
  expectedUpdatedAt?: string,
): StoryPackPatch {
  return {
    caption,
    slides,
    platforms,
    expectedUpdatedAt: expectedUpdatedAt ?? updatedAt,
  };
}
