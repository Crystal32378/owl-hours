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
import { Button } from '@astryxdesign/core/Button';
import { Switch } from '@astryxdesign/core/Switch';
import { StatusDot } from '@astryxdesign/core/StatusDot';
import { List, ListItem } from '@astryxdesign/core/List';
import { EmptyState } from '@astryxdesign/core/EmptyState';
import { Thumbnail } from '@astryxdesign/core/Thumbnail';
import bathLeak from '../../../assets/img/bathLeak';
import { Owl } from '../../../shared/mascot/Owl';
import owlWaiting from '../../../shared/mascot/owl/waiting';
import { requestsListCopys } from '../copys/requestsListCopys';
import type { EarlierRequestRow, RequestsEmptyState, RequestsListView, WaitingRequestCard } from '../lib/requestsList.ts';
import { mediaFrameSource } from '../lib/mediaFrameSource';
import './requestScreen.css';

// Until the backend serves real URLs, the demo media ids resolve to the embedded frames.
const demoFrames: Record<string, string> = { 'bath-leak': bathLeak };

// OwRequests. The "Taking requests" switch saves the business setting.
export default function RequestsScreen(props: {
  requests: RequestsListView;
  insets: { top: number; bottom: number };
  onOpenRequest: (id: string) => Promise<void>;
  onToggleTakingRequests: (takingRequests: boolean) => Promise<void>;
  refreshFailed: boolean;
  onRetry: () => Promise<void>;
  dom?: DOMProps;
}) {
  const { requests, insets } = props;

  return (
    <Theme theme={neutralTheme}>
      <div className="zukki-root" style={{ paddingTop: insets.top, paddingBottom: insets.bottom, minHeight: '100vh', width: '100%' }}>
        <VStack gap={3} padding={4}>
          <HStack justify="between" align="center">
            <Heading level={1}>{requestsListCopys.title}</Heading>
            {requests.isTakingRequests !== null && (
              <Switch
                label={requestsListCopys.takingRequests}
                value={requests.isTakingRequests}
                changeAction={(checked) => props.onToggleTakingRequests(checked)}
              />
            )}
          </HStack>
          {props.refreshFailed && <RefreshNotice onRetry={props.onRetry} />}
          {requests.emptyState ? (
            <RequestsEmpty state={requests.emptyState} />
          ) : (
            <RequestsLists requests={requests} onOpenRequest={props.onOpenRequest} />
          )}
        </VStack>
      </div>
    </Theme>
  );
}

function RefreshNotice(props: { onRetry: () => Promise<void> }) {
  return (
    <Card padding={3}>
      <HStack justify="between" align="center" gap={2}>
        <Text type="supporting">{requestsListCopys.refreshFailedNotice}</Text>
        <Button label={requestsListCopys.tryAgain} variant="secondary" size="md" onClick={() => props.onRetry()} />
      </HStack>
    </Card>
  );
}

function RequestsEmpty(props: { state: RequestsEmptyState }) {
  const isNotTaking = props.state === 'not-taking';
  return (
    <EmptyState
      title={isNotTaking ? requestsListCopys.notTakingTitle : requestsListCopys.noRequestsTitle}
      description={isNotTaking ? requestsListCopys.notTakingBody : requestsListCopys.noRequestsBody}
      icon={<Owl src={owlWaiting} scale={0.6} clip />}
    />
  );
}

function RequestsLists(props: { requests: RequestsListView; onOpenRequest: (id: string) => Promise<void> }) {
  const { waiting, earlier } = props.requests;
  return (
    <>
      {waiting.length > 0 && (
        <VStack gap={2}>
          <Text type="label">{requestsListCopys.waitingForYou}</Text>
          {waiting.map((card) => (
            <WaitingCard key={card.id} card={card} onReview={() => props.onOpenRequest(card.id)} />
          ))}
        </VStack>
      )}
      {earlier.length > 0 && <EarlierList rows={earlier} />}
      <Text type="supporting">{requestsListCopys.footnote}</Text>
    </>
  );
}

// The design's whole card is the link; here the one control is the Review request button,
// so the card never nests one interactive element inside another.
function WaitingCard(props: { card: WaitingRequestCard; onReview: () => Promise<void> }) {
  const { card } = props;
  const frame = card.thumbUrl ? mediaFrameSource(card.thumbUrl, demoFrames) : null;
  return (
    <Card padding={4} elevation="med">
      <VStack gap={3}>
        <HStack justify="between" align="center">
          <OfferUrgency card={card} />
          <Text type="label" className="zukki-tabular">{card.timeLeftText}</Text>
        </HStack>
        <HStack gap={3} align="center">
          {frame && <Thumbnail className="zukki-request-thumb" src={frame} alt="" />}
          <VStack gap={0.5}>
            <Text type="label">{card.title}</Text>
            <Text type="supporting">{card.subtitle}</Text>
          </VStack>
        </HStack>
        <Button label={requestsListCopys.reviewRequest} variant="primary" size="lg" width="100%" onClick={() => props.onReview()} />
      </VStack>
    </Card>
  );
}

function OfferUrgency(props: { card: WaitingRequestCard }) {
  const { distanceText } = props.card;
  if (!props.card.isUrgent) return distanceText ? <Text type="supporting">{distanceText}</Text> : null;

  return (
    <HStack gap={1} align="center">
      <StatusDot variant="error" label={requestsListCopys.urgent} />
      <Text type="supporting">{distanceText ? `${requestsListCopys.urgent} · ${distanceText}` : requestsListCopys.urgent}</Text>
    </HStack>
  );
}

function EarlierList(props: { rows: EarlierRequestRow[] }) {
  return (
    <VStack gap={2}>
      <Text type="label">{requestsListCopys.earlierTonight}</Text>
      <Card padding={0}>
        <List hasDividers>
          {props.rows.map((row) => (
            <ListItem key={row.id} label={row.title} description={row.subtitle} endContent={<Text type="supporting">{row.statusText}</Text>} />
          ))}
        </List>
      </Card>
    </VStack>
  );
}
