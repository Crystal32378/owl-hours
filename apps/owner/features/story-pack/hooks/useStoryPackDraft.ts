import { useRef, useState } from 'react';
import { storyPackServiceCopys as copy } from '../copys/storyPackServiceCopys.ts';
import type { StoryPack } from '../lib/storyPack.ts';
import {
  approveStoryPackDraft,
  saveStoryPackDraft,
  type StoryPackDraftDeps,
} from './storyPackDraftController.ts';

export type UseStoryPackDraftDeps = Omit<StoryPackDraftDeps, 'draft'> & {
  draft: StoryPack | null;
};

export function useStoryPackDraft(deps: UseStoryPackDraftDeps) {
  const busy = useRef(false);
  const [saving, setSaving] = useState(false);
  const [approving, setApproving] = useState(false);
  const [approvalError, setApprovalError] = useState<string | null>(null);

  async function saveDraft(): Promise<StoryPack | null> {
    const { draft } = deps;
    if (!draft || draft.status !== 'draft' || busy.current) return null;
    busy.current = true;
    setApprovalError(null);
    setSaving(true);
    try {
      return await saveStoryPackDraft({ ...deps, draft });
    } catch (error) {
      const known: string[] = Object.values(copy);
      setApprovalError(
        error instanceof Error && known.includes(error.message)
          ? error.message
          : copy.updateError,
      );
      return null;
    } finally {
      busy.current = false;
      setSaving(false);
    }
  }

  async function approveDraft(): Promise<void> {
    const { draft } = deps;
    if (!draft || draft.status !== 'draft' || busy.current) return;
    busy.current = true;
    setApproving(true);
    setSaving(true);
    setApprovalError(null);
    try {
      const { error } = await approveStoryPackDraft({ ...deps, draft });
      setApprovalError(error);
    } catch (error) {
      const known: string[] = Object.values(copy);
      setApprovalError(
        error instanceof Error && known.includes(error.message)
          ? error.message
          : copy.updateError,
      );
    } finally {
      busy.current = false;
      setSaving(false);
      setApproving(false);
    }
  }

  return {
    saving,
    approving,
    approvalError,
    saveDraft,
    approveDraft,
    clearApprovalError: () => setApprovalError(null),
  };
}
