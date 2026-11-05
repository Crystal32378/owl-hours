'use dom';

import '@astryxdesign/core/reset.css';
import '@astryxdesign/core/astryx.css';
import '@astryxdesign/theme-neutral/theme.css';
import '../../../shared/theme/figtreeStylesheet';
import '../../../shared/theme/zukki-theme.css';

import type { DOMProps } from 'expo/dom';
import { Theme } from '@astryxdesign/core/theme';
import { neutralTheme } from '@astryxdesign/theme-neutral/built';
import { VStack, HStack } from '@astryxdesign/core/Layout';
import { Card } from '@astryxdesign/core/Card';
import { Heading, Text } from '@astryxdesign/core/Text';
import { EmptyState } from '@astryxdesign/core/EmptyState';
import { Owl } from '../../../shared/mascot/Owl';
import owlReview from '../../../shared/mascot/owl/review';
import owlIdle from '../../../shared/mascot/owl/idle';
import { contentCopys } from '../copys/contentCopys';
import type {
  ContentAccountsSummary,
  ContentDraftRow,
  ContentPublishedRow,
} from '../hooks/useContent';
import { contentImages } from './contentImages';

export default function ContentScreen(props: {
  accountsSummary: ContentAccountsSummary;
  drafts: ContentDraftRow[];
  published: ContentPublishedRow[];
  insets: { top: number; bottom: number };
  onManageAccounts: () => Promise<void>;
  onReviewDraft: (id: string) => Promise<void>;
  dom?: DOMProps;
}) {
  const { insets, accountsSummary, drafts, published } = props;

  return (
    <Theme theme={neutralTheme}>
      <div
        className="zukki-root"
        style={{
          paddingTop: insets.top,
          paddingBottom: insets.bottom,
          minHeight: '100vh',
          width: '100%',
          background: 'var(--color-background-body)',
        }}
      >
        <div style={{ background: 'var(--color-background-card)', padding: '12px 16px' }}>
          <Heading level={1}>{contentCopys.contentTitle}</Heading>
        </div>

        <VStack gap={3} padding={4}>
          {/* Accounts summary card */}
          <Card padding={4}>
            <button
              type="button"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                width: '100%',
                cursor: 'pointer',
                background: 'transparent',
                border: 'none',
                padding: 0,
                textAlign: 'left',
                fontFamily: 'inherit',
              }}
              onClick={() => void props.onManageAccounts()}
            >
              <VStack gap={1}>
                <Text type="large" style={{ fontWeight: 600 }}>
                  {accountsSummary.title}
                </Text>
                {accountsSummary.status && (
                  <Text style={{ color: 'var(--color-success)', fontWeight: 600 }}>
                    {accountsSummary.status}
                  </Text>
                )}
              </VStack>
              <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-accent)' }}>
                {contentCopys.manage}
              </span>
            </button>
          </Card>

          {/* Drafts card */}
          <Card padding={4}>
            <VStack gap={2}>
              <HStack justify="between" align="center">
                <VStack gap={1}>
                  <Text type="large" style={{ fontWeight: 700 }}>
                    {contentCopys.draftsForYou(drafts.length)}
                  </Text>
                  <Text type="supporting">
                    {contentCopys.madeFromJobsAndPrices}
                  </Text>
                </VStack>
                <Owl src={owlReview} scale={0.36} clip />
              </HStack>

              {drafts.length === 0 ? (
                <EmptyState
                  title={contentCopys.emptyDrafts}
                  icon={<Owl src={owlIdle} scale={0.45} clip />}
                />
              ) : (
                drafts.map((draft) => (
                  <button
                    key={draft.id}
                    type="button"
                    style={{
                      display: 'flex',
                      gap: 12,
                      alignItems: 'center',
                      padding: '12px 0',
                      borderTop: '1px solid var(--color-border)',
                      cursor: 'pointer',
                      background: 'transparent',
                      borderLeft: 'none',
                      borderRight: 'none',
                      borderBottom: 'none',
                      width: '100%',
                      textAlign: 'left',
                      fontFamily: 'inherit',
                    }}
                    onClick={() => void props.onReviewDraft(draft.id)}
                  >
                    <DraftThumbnail thumbnail={draft.thumbnail} />
                    <VStack gap={1} className="zukki-grow" style={{ flex: 1, minWidth: 0 }}>
                      <Text style={{ fontWeight: 700 }}>{draft.title}</Text>
                      <Text type="supporting">{draft.subtitle}</Text>
                    </VStack>
                    <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-accent)' }}>
                      {contentCopys.review}
                    </span>
                  </button>
                ))
              )}
            </VStack>
          </Card>

          {/* Published card: hidden until something is published, never a heading over nothing */}
          {published.length > 0 && (
            <Card padding={4}>
              <VStack gap={2}>
                <Text type="large" style={{ fontWeight: 700 }}>
                  {contentCopys.published}
                </Text>
                {published.map((item) => (
                  <div
                    key={item.id}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      padding: '12px 0',
                      borderTop: '1px solid var(--color-border)',
                      fontSize: 15,
                    }}
                  >
                    <Text>{item.title}</Text>
                    <Text type="supporting">{item.publishedDateText}</Text>
                  </div>
                ))}
              </VStack>
            </Card>
          )}
        </VStack>
      </div>
    </Theme>
  );
}

function DraftThumbnail({ thumbnail }: { thumbnail: 'beforeAfter' | 'night' | 'priceTile' }) {
  if (thumbnail === 'beforeAfter') {
    return (
      <span
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          width: 72,
          height: 72,
          flexShrink: 0,
          borderRadius: 10,
          overflow: 'hidden',
        }}
      >
        <img
          src={contentImages.bathLeak}
          alt=""
          width={36}
          height={72}
          style={{ width: 36, height: 72, objectFit: 'cover' }}
        />
        <img
          src={contentImages.bathFixed}
          alt=""
          width={36}
          height={72}
          style={{ width: 36, height: 72, objectFit: 'cover' }}
        />
      </span>
    );
  }

  if (thumbnail === 'night') {
    return (
      <img
        src={contentImages.heroNight}
        alt=""
        width={72}
        height={72}
        style={{
          width: 72,
          height: 72,
          objectFit: 'cover',
          borderRadius: 10,
          flexShrink: 0,
        }}
      />
    );
  }

  return (
    <span
      style={{
        width: 72,
        height: 72,
        flexShrink: 0,
        borderRadius: 10,
        background: 'var(--color-background-muted)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 13,
        fontWeight: 700,
        textAlign: 'center',
        lineHeight: 1.2,
      }}
    >
      {contentCopys.priceTileLeak}
      <br />
      {contentCopys.priceTileFrom60}
    </span>
  );
}
