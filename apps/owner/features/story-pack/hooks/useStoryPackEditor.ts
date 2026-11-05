import { useEffect, useRef, useState, type SetStateAction } from 'react';
import type { StoryPack } from '../lib/storyPack.ts';
import {
  acceptEditorSave,
  applyEditorSave,
  editorIsDirty,
  editorMatchesSubmission,
  reconcileEditor,
  type StoryPackEditorState,
} from '../lib/storyPackEditor.ts';

export function useStoryPackEditor(selected: StoryPack | null) {
  const [editor, setEditor] = useState(() => acceptEditorSave(selected));
  const latest = useRef(editor);
  const selection = useRef(selected);
  const observedVersion = selected?.updatedAt;
  selection.current = selected;
  function commit(next: StoryPackEditorState) {
    latest.current = next;
    setEditor(next);
  }
  useEffect(() => {
    commit(reconcileEditor(latest.current, selected));
  }, [selected]);
  function setDraft(value: SetStateAction<StoryPack | null>) {
    const current = latest.current;
    commit({
      ...current,
      draft: typeof value === 'function' ? value(current.draft) : value,
    });
  }
  function acceptSaved(saved: StoryPack, submitted: StoryPack): boolean {
    if (selection.current?.id !== submitted.id) return false;
    const observed = selection.current;
    if (
      observed.updatedAt !== observedVersion &&
      observed.updatedAt !== submitted.updatedAt &&
      observed.updatedAt !== saved.updatedAt
    ) {
      commit(reconcileEditor(latest.current, observed));
      return false;
    }
    const matches = editorMatchesSubmission(latest.current, submitted);
    commit(applyEditorSave(latest.current, submitted, saved));
    return matches;
  }
  const dirty = editorIsDirty(editor);
  return {
    draft: editor.draft,
    dirty,
    setDraft,
    acceptSaved,
    expectedUpdatedAt: editor.writeVersion ?? editor.saved?.updatedAt,
    canExport:
      !dirty && editor.draft?.status === 'approved' && editor.draft.canHandoff,
    discardChanges() {
      const saved = latest.current.saved;
      commit(acceptEditorSave(saved?.id === selection.current?.id ? saved : selection.current));
    },
  };
}
