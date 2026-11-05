'use dom';

import '@astryxdesign/core/reset.css';
import '@astryxdesign/core/astryx.css';
import '@astryxdesign/theme-neutral/theme.css';
import '../../../shared/theme/figtreeStylesheet';
import '../../../shared/theme/zukki-theme.css';

import { useState } from 'react';
import type { DOMProps } from 'expo/dom';
import { Theme } from '@astryxdesign/core/theme';
import { neutralTheme } from '@astryxdesign/theme-neutral/built';
import { VStack, HStack } from '@astryxdesign/core/Layout';
import { Card } from '@astryxdesign/core/Card';
import { ClickableCard } from '@astryxdesign/core/ClickableCard';
import { Heading, Text } from '@astryxdesign/core/Text';
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl';
import { EmptyState } from '@astryxdesign/core/EmptyState';
import { Thumbnail } from '@astryxdesign/core/Thumbnail';
import { CircleCheck, ChevronRight } from 'lucide-react';
import bathLeak from '../../../assets/img/bathLeak';
import { Owl } from '../../../shared/mascot/Owl';
import owlWaiting from '../../../shared/mascot/owl/waiting';
import { jobsCopys } from '../copys/jobsCopys';
import type { JobSegment } from '../lib/jobSegment.ts';
import type { JobCardView, JobsListView } from '../hooks/useJobs.ts';
import { jobCardLabel } from '../lib/jobCardLabel.ts';
import './jobsScreen.css';

// Until the backend serves real URLs, the demo photo ids resolve to the embedded frames.
const demoFrames: Record<string, string> = { 'bath-leak': bathLeak };

export default function JobsScreen(props: {
  jobs: JobsListView;
  insets: { top: number; bottom: number };
  onOpenJob: (id: string) => Promise<void>;
  dom?: DOMProps;
}) {
  const { jobs, insets } = props;
  const [segment, setSegment] = useState<JobSegment>('tonight');
  const cards = segment === 'tonight' ? jobs.tonight : segment === 'upcoming' ? jobs.upcoming : jobs.done;

  return (
    <Theme theme={neutralTheme}>
      <div className="zukki-root" style={{ paddingTop: insets.top, paddingBottom: insets.bottom, minHeight: '100vh', width: '100%' }}>
        <VStack gap={3} padding={4}>
          <Heading level={1}>{jobsCopys.jobsTitle}</Heading>
          <SegmentedControl className="zukki-jobs-segments" label={jobsCopys.jobsTitle} layout="fill" value={segment} onChange={(value) => setSegment(value as JobSegment)}>
            {jobs.tabs.map((tab) => (
              <SegmentedControlItem key={tab.segment} value={tab.segment} label={tab.label} />
            ))}
          </SegmentedControl>
          {cards.length === 0 ? (
            <EmptyState title={emptyTitle(segment)} icon={<Owl src={owlWaiting} scale={0.6} clip />} />
          ) : (
            <VStack gap={2}>
              {cards.map((card) => (
                <JobCard key={card.id} card={card} onOpen={() => props.onOpenJob(card.id)} />
              ))}
            </VStack>
          )}
          {segment === 'tonight' && jobs.tomorrowLines.length > 0 && (
            <Card padding={4}>
              <VStack gap={1}>
                <Text type="label">{jobsCopys.tomorrow}</Text>
                {jobs.tomorrowLines.map((line) => (
                  <Text key={line} type="supporting">{line}</Text>
                ))}
              </VStack>
            </Card>
          )}
        </VStack>
      </div>
    </Theme>
  );
}

function emptyTitle(segment: JobSegment): string {
  if (segment === 'upcoming') return jobsCopys.emptyUpcoming;
  if (segment === 'done') return jobsCopys.emptyDone;
  return jobsCopys.emptyTonight;
}

function JobCard(props: { card: JobCardView; onOpen: () => void }) {
  const { card } = props;
  const frame = card.photo ? demoFrames[card.photo] : undefined;
  return (
    <ClickableCard label={jobCardLabel(card)} onClick={() => props.onOpen()}>
      <HStack gap={3} align="center">
        {frame ? <Thumbnail src={frame} alt="" /> : <WaitingTile />}
        <VStack gap={0.5}>
          <Text type="label">{card.title}</Text>
          <Text type="supporting">{card.subtitle}</Text>
          <JobStatusLine text={card.statusText} tone={card.statusTone} />
        </VStack>
        <ChevronRight size={18} aria-hidden />
      </HStack>
    </ClickableCard>
  );
}

function JobStatusLine(props: { text: string; tone: 'success' | 'secondary' }) {
  if (props.tone === 'success') {
    return (
      <HStack gap={0.5} align="center" className="zukki-success">
        <CircleCheck size={16} aria-hidden />
        <Text type="label" color="inherit">{props.text}</Text>
      </HStack>
    );
  }
  return <Text type="supporting">{props.text}</Text>;
}

// The design's waiting-owl tile: the waiting owl clipped to the tile, on the muted background.
function WaitingTile() {
  return (
    <span className="zukki-waiting-tile" aria-hidden>
      <Owl src={owlWaiting} scale={69 / 192} clip />
    </span>
  );
}
