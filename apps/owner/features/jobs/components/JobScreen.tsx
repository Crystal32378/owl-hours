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
import { Heading, Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { IconButton } from '@astryxdesign/core/IconButton';
import { Avatar } from '@astryxdesign/core/Avatar';
import { MetadataList, MetadataListItem } from '@astryxdesign/core/MetadataList';
import { ArrowLeft, CircleCheck, MapPin } from 'lucide-react';
import { jobsCopys } from '../copys/jobsCopys';
import type { JobView } from '../lib/jobView.ts';
import { JobTimeline } from './JobTimeline';
import './jobsScreen.css';

export default function JobScreen(props: {
  job: JobView;
  insets: { top: number; bottom: number };
  onAdvance: () => Promise<boolean>;
  onOpenFinish: () => Promise<void>;
  onBack: () => Promise<void>;
  dom?: DOMProps;
}) {
  const { job, insets } = props;
  return (
    <Theme theme={neutralTheme}>
      <div className="zukki-root" style={{ paddingTop: insets.top, paddingBottom: insets.bottom, minHeight: '100vh', width: '100%' }}>
        <VStack gap={3} padding={4}>
          <HStack gap={1} align="center">
            <IconButton label={jobsCopys.backLabel} icon={<ArrowLeft size={22} />} variant="ghost" onClick={() => props.onBack()} />
            <VStack>
              <Heading level={1}>{jobsCopys.jobTitleBar}</Heading>
              <Text type="supporting">{job.customerName} · {jobsCopys.viaZukki}</Text>
            </VStack>
          </HStack>
          <VStack gap={0.5}>
            <Heading level={2}>{job.title}</Heading>
            {job.approvalLine && (
              <HStack gap={0.5} align="center" className="zukki-success">
                <CircleCheck size={16} aria-hidden />
                <Text type="label" color="inherit">{job.approvalLine}</Text>
              </HStack>
            )}
          </VStack>
          <Card padding={4}>
            <VStack gap={2}>
              {job.address && <AddressRow address={job.address} sharedNote={jobsCopys.sharedAfterApproved(job.customerFirstName, job.distanceKm ?? undefined)} />}
              <HStack justify="between" align="center">
                <HStack gap={1} align="center">
                  <Avatar size="sm" name={job.technician} />
                  <Text>{job.technician}</Text>
                </HStack>
                <Button label={jobsCopys.change} variant="ghost" size="lg" onClick={() => undefined} />
              </HStack>
            </VStack>
          </Card>
          <Card padding={4}>
            <MetadataList columns="single">
              <MetadataListItem label={jobsCopys.quoteLabel}>{job.quoteText}</MetadataListItem>
              <MetadataListItem label={jobsCopys.arrival}>{job.arrivalText}</MetadataListItem>
            </MetadataList>
          </Card>
          <Card padding={4}>
            <JobTimeline events={job.timeline} pendingSteps={job.pendingSteps} />
          </Card>
          {job.isFooterVisible && <StatusFooter action={job.action} canFinish={job.canFinish} onAdvance={props.onAdvance} onOpenFinish={props.onOpenFinish} />}
        </VStack>
      </div>
    </Theme>
  );
}

// The street address exists only from customer_approved on; the map is static for now (T5.1+).
function AddressRow(props: { address: string; sharedNote: string }) {
  return (
    <HStack justify="between" align="center" gap={2}>
      <HStack gap={1} align="start">
        <MapPin size={20} aria-hidden />
        <VStack>
          <Text type="label">{props.address}</Text>
          <Text type="supporting">{props.sharedNote}</Text>
        </VStack>
      </HStack>
      <Button label={jobsCopys.map} variant="secondary" size="lg" onClick={() => undefined} />
    </HStack>
  );
}

function StatusFooter(props: { action: JobView['action']; canFinish: boolean; onAdvance: () => Promise<boolean>; onOpenFinish: () => Promise<void> }) {
  const [isAdvancing, setIsAdvancing] = useState(false);

  // One move at a time: a second tap while the first is in flight must not ask for the same step twice.
  // On site the button leaves the status flow and opens the finish screen instead.
  async function press() {
    if (props.canFinish) {
      await props.onOpenFinish();
      return;
    }
    if (isAdvancing) return;
    setIsAdvancing(true);
    await props.onAdvance();
    setIsAdvancing(false);
  }

  return (
    <div className="zukki-jobs-footer zukki-jobs-footer-single">
      <Button label={props.action.label} variant="primary" size="lg" width="100%" isDisabled={props.action.isDisabled || isAdvancing} onClick={press} />
    </div>
  );
}
