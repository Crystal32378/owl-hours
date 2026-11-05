import type { StoryPack } from './storyPack.ts';

export type StoryPackEditorState = {
  saved: StoryPack | null;
  draft: StoryPack | null;
  writeVersion?: string | undefined;
};

function editableCopy(pack: StoryPack | null): string | null {
  if (!pack) {
    return null;
  }
  return JSON.stringify({
    caption: pack.caption,
    slides: pack.slides,
    platforms: pack.platforms,
  });
}

export function acceptEditorSave(
  saved: StoryPack | null,
): StoryPackEditorState {
  return { saved, draft: saved, writeVersion: saved?.updatedAt };
}

export function reconcileEditor(
  state: StoryPackEditorState,
  selected: StoryPack | null,
): StoryPackEditorState {
  if (state.saved?.id !== selected?.id || !selected) {
    return acceptEditorSave(selected);
  }

  const dirty = editableCopy(state.saved) !== editableCopy(state.draft);
  if (dirty && state.draft) {
    return {
      saved: selected,
      writeVersion:
        editableCopy(state.draft) === editableCopy(selected)
          ? selected.updatedAt
          : (state.writeVersion ?? state.saved?.updatedAt),
      draft: {
        ...selected,
        caption: state.draft.caption,
        slides: state.draft.slides,
        platforms: state.draft.platforms,
      },
    };
  }

  return acceptEditorSave(selected);
}

export function editorMatchesSubmission(
  state: StoryPackEditorState,
  submitted: StoryPack,
): boolean {
  return (
    state.draft?.id === submitted.id &&
    editableCopy(state.draft) === editableCopy(submitted)
  );
}

export function applyEditorSave(
  state: StoryPackEditorState,
  submitted: StoryPack,
  saved: StoryPack,
): StoryPackEditorState {
  if (state.draft?.id !== submitted.id) {
    return state;
  }
  return {
    saved,
    writeVersion: saved.updatedAt,
    draft:
      editorMatchesSubmission(state, submitted) || !state.draft
        ? saved
        : {
            ...saved,
            caption: state.draft.caption,
            slides: state.draft.slides,
            platforms: state.draft.platforms,
          },
  };
}

export function editorIsDirty(state: StoryPackEditorState): boolean {
  return editableCopy(state.saved) !== editableCopy(state.draft);
}
