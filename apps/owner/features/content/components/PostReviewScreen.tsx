'use dom';

import '@astryxdesign/core/reset.css';
import '@astryxdesign/core/astryx.css';
import '@astryxdesign/theme-neutral/theme.css';
import '../../../shared/theme/figtreeStylesheet';
import '../../../shared/theme/zukki-theme.css';

import type { DOMProps } from 'expo/dom';
import { Theme } from '@astryxdesign/core/theme';
import { neutralTheme } from '@astryxdesign/theme-neutral/built';
import { VStack } from '@astryxdesign/core/Layout';
import { Card } from '@astryxdesign/core/Card';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { contentCopys } from '../copys/contentCopys';
import { photoSource, type ResolvedJobPhotos } from '../lib/jobPhotos';
import type { PostDraft } from '../../../shared/data/types';
import { contentImages } from './contentImages';
import ContentTopBar from './ContentTopBar';

const TARGET_ITEMS = [
  { key: 'facebook', label: contentCopys.facebookPage },
  { key: 'instagram', label: contentCopys.instagramProfessional },
] as const;

export default function PostReviewScreen(props: {
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
  isPosting: boolean;
  approveError: string | null;
  insets: { top: number; bottom: number };
  onBack: () => Promise<void>;
  onEditToggle: () => Promise<void>;
  onCaptionChange: (caption: string) => Promise<void>;
  onTargetToggle: (target: 'facebook' | 'instagram') => Promise<void>;
  onApprove: () => Promise<void>;
  onRegenerate: () => Promise<void>;
  dom?: DOMProps;
}) {
  const {
    insets,
    draft,
    draftSubtitle,
    businessName,
    caption,
    isEditingCaption,
    targets,
    scheduledWhenText,
    jobPhotos,
    canApprove,
    canRegenerate,
    isPosting,
    approveError,
  } = props;

  const beforeSrc = photoSource(jobPhotos?.photos.before, contentImages.photoMap, contentImages.bathLeak);
  const afterSrc = photoSource(jobPhotos?.photos.after, contentImages.photoMap, contentImages.bathFixed);

  return (
    <Theme theme={neutralTheme}>
      <div
        className="zukki-root"
        style={{
          paddingTop: insets.top,
          paddingBottom: insets.bottom,
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--color-background-body)',
        }}
      >
        <ContentTopBar
          title={contentCopys.reviewPost}
          subtitle={draftSubtitle}
          onBack={props.onBack}
          actionLabel={contentCopys.edit}
          onAction={props.onEditToggle}
        />

        {/* Content body */}
        <div style={{ flex: 1, padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Social preview card */}
          <Card padding={0} style={{ overflow: 'hidden' }}>
            <div style={{ padding: 12, display: 'flex', gap: 10, alignItems: 'center' }}>
              <img
                src={contentImages.logoNorthside}
                alt=""
                width={36}
                height={36}
                style={{ borderRadius: '50%' }}
              />
              <VStack gap={0}>
                <Text style={{ fontSize: 15, fontWeight: 700 }}>{businessName}</Text>
                <Text type="supporting" style={{ fontSize: 13 }}>
                  {contentCopys.preview}
                </Text>
              </VStack>
            </div>

            <div style={{ padding: '0 12px 10px' }}>
              {isEditingCaption ? (
                <textarea
                  value={caption}
                  onChange={(e) => void props.onCaptionChange(e.target.value)}
                  style={{
                    width: '100%',
                    minHeight: 70,
                    padding: 8,
                    fontSize: 15,
                    lineHeight: 1.4,
                    borderRadius: 8,
                    border: '1px solid var(--color-border-emphasized)',
                    fontFamily: 'inherit',
                  }}
                />
              ) : (
                <Text style={{ fontSize: 15, lineHeight: 1.4 }}>{caption}</Text>
              )}
            </div>

            {/* Media preview */}
            {jobPhotos ? (
              <>
                <div style={{ position: 'relative', display: 'grid', gridTemplateColumns: '1fr 1fr', height: 164 }}>
                  <div style={{ overflow: 'hidden' }}>
                    <img
                      src={beforeSrc}
                      alt={contentCopys.before}
                      width={179}
                      height={164}
                      style={{ display: 'block', width: '100%', height: 164, objectFit: 'cover' }}
                    />
                  </div>
                  <div style={{ overflow: 'hidden', borderLeft: '3px solid var(--color-background-card)' }}>
                    <img
                      src={afterSrc}
                      alt={contentCopys.after}
                      width={179}
                      height={164}
                      style={{ display: 'block', width: '100%', height: 164, objectFit: 'cover' }}
                    />
                  </div>
                  <span
                    style={{
                      position: 'absolute',
                      left: '50%',
                      bottom: 12,
                      transform: 'translateX(-50%)',
                      fontSize: 14,
                      fontWeight: 800,
                      color: 'var(--color-on-info-muted)',
                      background: 'var(--color-background-card)',
                      padding: '6px 12px',
                      borderRadius: 'var(--radius-full, 9999px)',
                      boxShadow: 'var(--shadow-med, 0 2px 4px rgba(0,0,0,0.1))',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {draft.title}
                  </span>
                </div>
                <div style={{ padding: '8px 12px' }}>
                  <Text type="supporting" style={{ fontSize: 13 }}>
                    {jobPhotos.consentLine}
                  </Text>
                </div>
              </>
            ) : draft.source === 'reminder' ? (
              <div style={{ height: 164, overflow: 'hidden' }}>
                <img
                  src={contentImages.heroNight}
                  alt=""
                  style={{ display: 'block', width: '100%', height: 164, objectFit: 'cover' }}
                />
              </div>
            ) : null}
          </Card>

          {/* Targets and timing card */}
          <Card padding={4}>
            <VStack gap={0}>
              {TARGET_ITEMS.map((item) => (
                <label
                  key={item.key}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    minHeight: 46,
                    borderBottom: '1px solid var(--color-border)',
                    fontSize: 16,
                    cursor: 'pointer',
                  }}
                >
                  <span>{item.label}</span>
                  <input
                    type="checkbox"
                    checked={targets[item.key]}
                    onChange={() => void props.onTargetToggle(item.key)}
                    style={{ width: 22, height: 22, margin: 0, accentColor: 'var(--color-accent)' }}
                  />
                </label>
              ))}

              {scheduledWhenText && (
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    minHeight: 46,
                    fontSize: 16,
                  }}
                >
                  <span>{contentCopys.when}</span>
                  <span style={{ fontWeight: 600 }}>{scheduledWhenText}</span>
                </div>
              )}
            </VStack>
          </Card>
        </div>

        {approveError && (
          <Text style={{ fontSize: 15, color: 'var(--color-error)', padding: '0 16px 12px' }}>{approveError}</Text>
        )}

        {/* Footer actions */}
        <div
          style={{
            background: 'var(--color-background-card)',
            borderTop: '1px solid var(--color-border)',
            padding: '12px 16px',
            display: 'grid',
            gridTemplateColumns: canRegenerate ? '1fr 2fr' : '1fr',
            gap: 8,
          }}
        >
          {/* Hidden where nothing can write new copy (live API), never a fake redraft */}
          {canRegenerate && (
            <Button
              label={contentCopys.regenerate}
              variant="secondary"
              size="lg"
              onClick={() => void props.onRegenerate()}
            />
          )}
          <Button
            label={contentCopys.approveAndPost}
            variant="primary"
            size="lg"
            isDisabled={!canApprove}
            isLoading={isPosting}
            onClick={() => void props.onApprove()}
          />
        </div>
      </div>
    </Theme>
  );
}
