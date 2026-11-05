'use dom';

import '@astryxdesign/core/reset.css';
import '@astryxdesign/core/astryx.css';
import '@astryxdesign/theme-neutral/theme.css';
import '../../../shared/theme/figtreeStylesheet';
import '../../../shared/theme/zukki-theme.css';

import type { DOMProps } from 'expo/dom';
import { Theme } from '@astryxdesign/core/theme';
import { neutralTheme } from '@astryxdesign/theme-neutral/built';
import { useState } from 'react';
import { VStack, HStack } from '@astryxdesign/core/Layout';
import { Card } from '@astryxdesign/core/Card';
import { Heading, Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { ProgressBar } from '@astryxdesign/core/ProgressBar';
import { StatusDot } from '@astryxdesign/core/StatusDot';
import { Avatar } from '@astryxdesign/core/Avatar';
import { Divider } from '@astryxdesign/core/Divider';
import { BottomSheet } from '@astryxdesign/core/BottomSheet';
import { RadioList, RadioListItem } from '@astryxdesign/core/RadioList';
import { Owl } from '../../../shared/mascot/Owl';
import owlRunningRight from '../../../shared/mascot/owl/running-right';
import owlFailed from '../../../shared/mascot/owl/failed';
import owlStatic from '../../../shared/mascot/owl/static';
import type { DeclineReason } from '../../../shared/data/types.ts';
import { sentTimeText } from '../lib/sentTimeText';
import { customerLine } from '../lib/customerLine';
import { DECLINE_REASONS, canSubmitDecline } from '../lib/declineSheet';
import { requestsCopys } from '../copys/requestsCopys';
import { declineCopys } from '../copys/declineCopys';
import type { RequestOfferDetails } from '../hooks/useRequestOffer';
import { CustomerMedia } from './CustomerMedia';
import { PossibleFaults } from './PossibleFaults';

export default function RequestScreen(props: {
  offer: RequestOfferDetails;
  countdownText: string;
  secondsLeft: number;
  maxSeconds: number;
  isExpired: boolean;
  insets: { top: number; bottom: number };
  startDeclineOpen: boolean;
  onAccept: () => Promise<void>;
  onDecline: (reason: DeclineReason) => Promise<void>;
  dom?: DOMProps;
}) {
  const { offer, insets, isExpired } = props;
  const [isDeclineOpen, setIsDeclineOpen] = useState(props.startDeclineOpen);
  const firstMedia = offer.media[0];
  return (
    <Theme theme={neutralTheme}>
      <div className="zukki-root" style={{ paddingTop: insets.top, paddingBottom: insets.bottom, minHeight: '100vh', width: '100%' }}>
        <VStack gap={3} padding={4}>
          <VStack>
            <Heading level={1}>{requestsCopys.newRequest}</Heading>
            <Text type="supporting">{sentLine(offer.offeredAt)}</Text>
          </VStack>
          <Card padding={4}>
            <HStack gap={2} align="center">
              <Owl src={owlRunningRight} scale={0.42} clip />
              <VStack gap={2} className="zukki-grow">
                <HStack justify="between">
                  <Text type="label">{requestsCopys.acceptWithin}</Text>
                  <Text type="large" className="zukki-tabular">{props.countdownText}</Text>
                </HStack>
                <ProgressBar label={requestsCopys.countdownLabel} isLabelHidden value={props.secondsLeft} max={props.maxSeconds} variant="neutral" />
                <Text type="supporting">{requestsCopys.ignoredNotice}</Text>
              </VStack>
            </HStack>
          </Card>
          <Card padding={4}>
            <VStack gap={2}>
              <HStack gap={1} align="center">
                <StatusDot variant="error" label={requestsCopys.urgent} />
                <Text type="supporting">{customerLine(offer)}</Text>
              </HStack>
              <Heading level={1} accessibilityLevel={2}>{offer.title}</Heading>
              {firstMedia && <CustomerMedia media={firstMedia} />}
              {offer.customerQuote && <Text color="secondary" style={{ fontStyle: 'italic' }}>"{offer.customerQuote}"</Text>}
              <Divider />
              <HStack gap={1} align="center">
                <Avatar size="xsm" src={owlStatic} alt="" />
                <Text type="label">{requestsCopys.zukkiName}</Text>
              </HStack>
              <Text>{offer.zukkiSummary}</Text>
              <PossibleFaults faults={offer.possibleFaults} />
            </VStack>
          </Card>
          <div className="zukki-actions zukki-request-footer">
            <Button label={requestsCopys.decline} variant="secondary" size="lg" width="100%" isDisabled={isExpired} onClick={async () => setIsDeclineOpen(true)} />
            <Button label={requestsCopys.acceptAndChat} variant="primary" size="lg" width="100%" isDisabled={isExpired} onClick={() => props.onAccept()} />
          </div>
          <DeclineSheet isOpen={isDeclineOpen} onOpenChange={setIsDeclineOpen} onDecline={props.onDecline} />
        </VStack>
      </div>
    </Theme>
  );
}

// The decline sheet: the four design reasons, the reassurance note, and
// Cancel + "Decline request" (destructive). Closing it any other way clears
// the choice, so a later confirm submits nothing.
function DeclineSheet(props: {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onDecline: (reason: DeclineReason) => Promise<void>;
}) {
  const [selection, setSelection] = useState<DeclineReason | null>(null);

  function close() {
    props.onOpenChange(false);
    setSelection(null);
  }

  function choose(value: string) {
    const reason = DECLINE_REASONS.find((option) => option.id === value)?.id ?? null;
    setSelection(reason);
  }

  return (
    <BottomSheet label={declineCopys.title} isOpen={props.isOpen} onOpenChange={(open) => { if (!open) close(); }}>
      <VStack gap={3}>
        <HStack gap={2} align="center">
          <Owl src={owlFailed} scale={0.4} clip />
          <Heading level={2}>{declineCopys.title}</Heading>
        </HStack>
        <RadioList label={declineCopys.title} isLabelHidden value={selection ?? ''} onChange={choose}>
          {DECLINE_REASONS.map((option) => (
            <RadioListItem key={option.id} label={option.label} value={option.id} />
          ))}
        </RadioList>
        <Text type="supporting">{declineCopys.note}</Text>
        <div style={declineActionsStyle}>
          <Button label={declineCopys.cancel} variant="secondary" size="lg" width="100%" onClick={async () => close()} />
          <Button
            label={declineCopys.declineRequest}
            variant="destructive"
            size="lg"
            width="100%"
            isDisabled={!canSubmitDecline(selection)}
            onClick={async () => { if (selection) await props.onDecline(selection); }}
          />
        </div>
      </VStack>
    </BottomSheet>
  );
}

const declineActionsStyle = { display: 'grid', gridTemplateColumns: '1fr 1.4fr', gap: 8 } as const;

// Local clock time of an ISO instant, e.g. "12:05 AM" (device-local, like the chat; D7).
// "Sent by Zukki · 12:05 AM"; without a readable time, just "Sent by Zukki".
function sentLine(offeredAt: string) {
  const time = sentTimeText(offeredAt);
  return time ? `${requestsCopys.sentByZukki} · ${time}` : requestsCopys.sentByZukki;
}
