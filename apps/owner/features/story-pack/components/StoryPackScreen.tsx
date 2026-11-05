'use dom';

import '@astryxdesign/core/reset.css';
import '@astryxdesign/core/astryx.css';
import '@astryxdesign/theme-neutral/theme.css';
import '../../../shared/theme/figtreeStylesheet';
import '../../../shared/theme/zukki-theme.css';

import type { DOMProps } from 'expo/dom';
import { Theme } from '@astryxdesign/core/theme';
import { neutralTheme } from '@astryxdesign/theme-neutral/built';
import {
  Layout,
  LayoutContent,
  LayoutFooter,
  VStack,
} from '@astryxdesign/core/Layout';
import { Card } from '@astryxdesign/core/Card';
import { Heading, Text } from '@astryxdesign/core/Text';
import type { StoryTargets } from '../lib/storyPack.ts';
import type { StoryPackDelivery } from '../lib/storyPackDelivery.ts';
import { isBackNavigationDisabled } from '../lib/storyPack.ts';
import type { StoryPackView } from '../hooks/useStoryPack.ts';
import { useStoryPackExport } from '../hooks/useStoryPackExport.ts';
import { useStoryPackEditor } from '../hooks/useStoryPackEditor.ts';
import { useStoryPackDraft } from '../hooks/useStoryPackDraft.ts';
import { contentCopys as copy } from '../copys/contentCopys.ts';
import { authCopys } from '../../../shared/copys/ownerAuthCopys.ts';
import { StoryPhotoAssignments } from './StoryPhotoAssignments.tsx';
import { renderStoryImages } from './renderStoryImages.ts';
import { Loading } from './Loading.tsx';
import { Overview } from './Overview.tsx';
import { StoryPackEditor } from './StoryPackEditor.tsx';
import { StoryPackEditorActions } from './StoryPackEditorActions.tsx';
import { StoryPackHeader } from './StoryPackHeader.tsx';
import { DemoBanner } from './DemoBanner.tsx';
import { WorkspaceToolbar } from './WorkspaceToolbar.tsx';
import { StatusLine } from './StatusLine.tsx';

export default function StoryPackScreen(
  props: StoryPackView & {
    insets: { top: number; bottom: number };
    dom?: DOMProps;
    deliverExport: (payload: StoryPackDelivery) => Promise<void>;
  },
) {
  const selected = props.selectedPack;
  const {
    draft,
    dirty,
    setDraft,
    acceptSaved,
    expectedUpdatedAt,
    canExport,
    discardChanges,
  } = useStoryPackEditor(selected);
  const {
    saving,
    approving,
    approvalError,
    saveDraft,
    approveDraft,
    clearApprovalError,
  } = useStoryPackDraft({
    draft,
    expectedUpdatedAt,
    sources: props.sources,
    updateDraft: props.updateDraft,
    approve: props.approve,
    acceptSaved,
  });
  const { exporting, exportError, exportPack, clearExportError } =
    useStoryPackExport({
      authorize: props.prepareHandoff,
      render: renderStoryImages,
      deliver: props.deliverExport,
      delivered: props.markHandoffDelivered,
    });

  const error = approvalError ?? exportError ?? props.error;
  const canViewWorkspace =
    props.mode === 'demo' ||
    (props.mode === 'live' && props.authStatus === 'signed_in');
  const isLiveSignedIn =
    props.mode === 'live' && props.authStatus === 'signed_in';
  const isEditing = Boolean(selected && draft) && canViewWorkspace;

  function updateSlide(index: number, field: 'title' | 'body', value: string) {
    setDraft((current) =>
      current
        ? {
            ...current,
            slides: current.slides.map((slide, slideIndex) =>
              slideIndex === index ? { ...slide, [field]: value } : slide,
            ),
          }
        : current,
    );
  }

  function updateTarget(key: keyof StoryTargets, checked: boolean) {
    setDraft((current) =>
      current
        ? { ...current, platforms: { ...current.platforms, [key]: checked } }
        : current,
    );
  }

  function renderWorkspaceView() {
    if (props.mode === 'unconfigured') {
      return (
        <Card padding={4}>
          <Heading level={2}>{copy.configurationTitle}</Heading>
          <Text>{copy.configurationNotice}</Text>
        </Card>
      );
    }

    if (props.authStatus === 'loading' || (props.loading && !draft)) {
      return <Loading />;
    }

    if (!canViewWorkspace) {
      return <Text>{authCopys.signInRequired}</Text>;
    }

    if (selected && draft) {
      const source =
        props.sources.find((candidate) => candidate.id === draft.sourceJobId) ??
        null;
      const receipt =
        props.deliveryReceipt?.packId === draft.id
          ? props.deliveryReceipt.openedAt
          : null;

      return (
        <StoryPackEditor
          draft={draft}
          source={source}
          receipt={receipt}
          onChangeCaption={(caption) =>
            setDraft((current) => (current ? { ...current, caption } : current))
          }
          onChangeSlide={updateSlide}
          onChangeTarget={updateTarget}
          approving={approving}
          dirty={dirty}
        />
      );
    }

    return (
      <VStack gap={4}>
        {props.mode === 'live' && (
          <StoryPhotoAssignments
            jobs={props.photoJobs}
            onAssign={props.assignPhotos}
          />
        )}
        <Overview
          sources={props.sources}
          packs={props.packs}
          onCreate={props.createFromJob}
          onSelect={props.selectPack}
        />
      </VStack>
    );
  }

  return (
    <Theme theme={neutralTheme} mode="light">
      <div
        className="zukki-root"
        style={{
          ...pageStyle,
          paddingTop: props.insets.top,
          paddingBottom: props.insets.bottom,
        }}
      >
        <Layout
          height="fill"
          contentWidth={1040}
          content={
            <LayoutContent isScrollable padding={4}>
              <VStack gap={5}>
                <StoryPackHeader
                  showBack={Boolean(selected)}
                  backDisabled={isBackNavigationDisabled({
                    saving,
                    exporting,
                    approving,
                  })}
                  onBack={() => {
                    clearApprovalError();
                    void props.selectPack(null);
                  }}
                />
                {props.mode === 'demo' && <DemoBanner />}
                {isLiveSignedIn && (
                  <WorkspaceToolbar
                    sessionEmail={props.sessionEmail}
                    authBusy={props.authBusy}
                    onReload={props.reload}
                    onSignOut={props.signOut}
                  />
                )}
                <StatusLine
                  error={error}
                  notice={props.notice}
                  onDismiss={() => {
                    clearApprovalError();
                    clearExportError();
                    void props.clearNotice();
                  }}
                />
                {renderWorkspaceView()}
                <Text type="supporting">{copy.metaHandoff}</Text>
                {canViewWorkspace && (
                  <Card padding={3}>
                    <VStack gap={2}>
                      <Heading level={2}>{copy.deletionScopeTitle}</Heading>
                      <Text>{copy.deletionScope}</Text>
                    </VStack>
                  </Card>
                )}
              </VStack>
            </LayoutContent>
          }
          footer={
            isEditing && draft ? (
              <LayoutFooter hasDivider padding={4}>
                <StoryPackEditorActions
                  draft={draft}
                  onSave={saveDraft}
                  onApprove={approveDraft}
                  onPrepare={async () => {
                    if (canExport) await exportPack();
                  }}
                  dirty={dirty}
                  canExport={canExport}
                  onDiscard={discardChanges}
                  exporting={exporting}
                  saving={saving}
                  approving={approving}
                />
              </LayoutFooter>
            ) : undefined
          }
        />
      </div>
    </Theme>
  );
}

const pageStyle = {
  width: '100%',
  height: '100vh',
  boxSizing: 'border-box',
  background: 'var(--color-background-body)',
} as const;
