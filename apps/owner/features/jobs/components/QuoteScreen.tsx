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
import { MetadataList, MetadataListItem } from '@astryxdesign/core/MetadataList';
import { ArrowLeft, Sparkles } from 'lucide-react';
import type { QuoteLine } from '../../../shared/data/types.ts';
import { moneyRangeText } from '../../../shared/lib/moneyText.ts';
import { jobsCopys } from '../copys/jobsCopys';
import { canSendQuote } from '../lib/lineValidation.ts';
import { withLineAmount } from '../lib/quoteEditing.ts';
import { quoteTotal } from '../lib/quoteTotal.ts';
import { QuoteLineFields } from './QuoteLineFields';
import './jobsScreen.css';

export default function QuoteScreen(props: {
  title: string;
  customerName: string;
  customerFirstName: string;
  lines: QuoteLine[];
  arrivalText: string;
  technician: string;
  note: string | null;
  insets: { top: number; bottom: number };
  onSend: (lines: QuoteLine[]) => Promise<boolean>;
  onCancel: () => Promise<void>;
  dom?: DOMProps;
}) {
  const { insets } = props;
  const [lines, setLines] = useState(props.lines);
  const [isSending, setIsSending] = useState(false);
  const [sendFailed, setSendFailed] = useState(false);
  const canSend = canSendQuote(lines) && !isSending;

  // One send at a time: a second tap while the first is in flight would send the quote twice.
  async function send() {
    if (!canSend) return;
    setIsSending(true);
    setSendFailed(!(await props.onSend(lines)));
    setIsSending(false);
  }

  return (
    <Theme theme={neutralTheme}>
      <div className="zukki-root" style={{ paddingTop: insets.top, paddingBottom: insets.bottom, minHeight: '100vh', width: '100%' }}>
        <VStack gap={3} padding={4}>
          <HStack gap={1} align="center">
            <IconButton label={jobsCopys.backLabel} icon={<ArrowLeft size={22} />} variant="ghost" onClick={() => props.onCancel()} />
            <Heading level={1}>{jobsCopys.sendAQuote}</Heading>
          </HStack>
          <HStack gap={1} align="center">
            <Sparkles size={16} aria-hidden />
            <Text type="supporting">{jobsCopys.filledInByZukki}</Text>
          </HStack>
          <Card padding={4}>
            <VStack gap={1}>
              <Heading level={2}>{props.title} · {props.customerName}</Heading>
              {lines.map((line, index) => (
                <QuoteLineFields key={line.label} line={line} onChange={(amount) => setLines(withLineAmount(lines, index, amount))} />
              ))}
              {!canSendQuote(lines) && <Text type="supporting" style={{ color: 'var(--color-error)' }}>{jobsCopys.invalidAmountHint}</Text>}
              <HStack justify="between" align="center">
                <Text type="label">{jobsCopys.estimatedTotal}</Text>
                <Text type="large" className="zukki-tabular" aria-live="polite">{moneyRangeText(quoteTotal(lines))}</Text>
              </HStack>
            </VStack>
          </Card>
          <Card padding={4}>
            <MetadataList columns="single">
              <MetadataListItem label={jobsCopys.arrival}>{props.arrivalText}</MetadataListItem>
              <MetadataListItem label={jobsCopys.technician}>{props.technician}</MetadataListItem>
              {props.note && <MetadataListItem label={jobsCopys.note}>{props.note}</MetadataListItem>}
            </MetadataList>
          </Card>
          <Text type="supporting">{jobsCopys.approvalNotice(props.customerFirstName)}</Text>
          {sendFailed && <Text style={{ color: 'var(--color-error)' }}>{jobsCopys.somethingWentWrong}</Text>}
          <div className="zukki-actions zukki-jobs-footer">
            <Button label={jobsCopys.cancel} variant="secondary" size="lg" width="100%" onClick={() => props.onCancel()} />
            <Button label={jobsCopys.sendQuote} variant="primary" size="lg" width="100%" isDisabled={!canSend} onClick={send} />
          </div>
        </VStack>
      </div>
    </Theme>
  );
}
