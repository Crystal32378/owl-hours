import { Button } from '@astryxdesign/core/Button';
import type { StoryPack } from '../lib/storyPack.ts';
import { contentCopys as copy } from '../copys/contentCopys.ts';

export type StoryPackEditorActionsProps = {
  draft: StoryPack;
  onSave: () => Promise<StoryPack | null>;
  onApprove: () => Promise<void>;
  onPrepare: () => Promise<void>;
  exporting: boolean;
  saving: boolean;
  approving: boolean;
  dirty: boolean;
  canExport: boolean;
  onDiscard: () => void;
};

// Bottom-bar actions: the screen's one primary button is Approve, or Download once approved.
export function StoryPackEditorActions({
  draft,
  onSave,
  onApprove,
  onPrepare,
  exporting,
  saving,
  approving,
  dirty,
  canExport,
  onDiscard,
}: StoryPackEditorActionsProps) {
  if (draft.status === 'draft') {
    const hasFormat = draft.platforms.facebook || draft.platforms.instagram;
    return (
      <div className="zukki-actions">
        {dirty && (
          <Button
            label={copy.discardChanges}
            variant="secondary"
            size="lg"
            isDisabled={saving || approving}
            onClick={onDiscard}
          />
        )}
        <Button
          label={copy.save}
          variant="secondary"
          size="lg"
          isDisabled={saving}
          onClick={() => {
            void onSave();
          }}
        />
        <Button
          label={copy.approve}
          variant="primary"
          size="lg"
          isLoading={saving || approving}
          isDisabled={draft.slides.length !== 3 || !hasFormat}
          onClick={() => {
            void onApprove();
          }}
        />
      </div>
    );
  }

  if (draft.status === 'approved') {
    return (
      <div className="zukki-actions">
        {dirty && (
          <Button
            label={copy.discardChanges}
            variant="secondary"
            size="lg"
            isDisabled={saving || exporting}
            onClick={onDiscard}
          />
        )}
        <Button
          label={copy.downloadLabel}
          variant="primary"
          size="lg"
          width="100%"
          isLoading={exporting}
          isDisabled={!canExport}
          onClick={() => {
            void onPrepare();
          }}
        />
      </div>
    );
  }

  return null;
}
