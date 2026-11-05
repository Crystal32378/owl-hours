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
import { Switch } from '@astryxdesign/core/Switch';
import { TextInput } from '@astryxdesign/core/TextInput';
import { Thumbnail } from '@astryxdesign/core/Thumbnail';
import { ArrowLeft, Camera } from 'lucide-react';
import type { Money, MoneyRange, QuoteLine } from '../../../shared/data/types.ts';
import { moneyRangeText } from '../../../shared/lib/moneyText.ts';
import bathLeak from '../../../assets/img/bathLeak';
import { jobsCopys } from '../copys/jobsCopys';
import { estimateCheck } from '../lib/estimateCheck.ts';
import { finalTotal, initialFinalAmounts } from '../lib/finalAmounts.ts';
import { canMarkAsDone } from '../lib/finishValidation.ts';
import { isValidAmount } from '../lib/lineValidation.ts';
import type { FinishJobInput } from '../services/jobsService.ts';
import { AmountField } from './QuoteLineFields';
import './jobsScreen.css';

// Until the backend serves real URLs, the demo photo ids resolve to the embedded frames.
const demoFrames: Record<string, string> = { 'bath-leak': bathLeak };

export default function FinishScreen(props: {
  title: string;
  customerName: string;
  customerFirstName: string;
  lines: QuoteLine[];
  estimate: MoneyRange;
  photos: { before: string | null; after: string | null };
  insets: { top: number; bottom: number };
  onFinish: (input: FinishJobInput) => Promise<boolean>;
  onBack: () => Promise<void>;
  dom?: DOMProps;
}) {
  const { insets } = props;
  const [amounts, setAmounts] = useState<Money[]>(() => initialFinalAmounts(props.lines));
  const [reason, setReason] = useState('');
  const [asksToSharePhotos, setAsksToSharePhotos] = useState(true);
  const [isFinishing, setIsFinishing] = useState(false);
  const [finishFailed, setFinishFailed] = useState(false);
  const canFinish = canMarkAsDone({ amounts, estimate: props.estimate, reason }) && !isFinishing;

  // One finish at a time: a second tap while the first is in flight must not finish twice.
  async function finish() {
    if (!canFinish) return;
    setIsFinishing(true);
    setFinishFailed(!(await props.onFinish({ amounts, reason, asksToSharePhotos })));
    setIsFinishing(false);
  }

  return (
    <Theme theme={neutralTheme}>
      <div className="zukki-root" style={{ paddingTop: insets.top, paddingBottom: insets.bottom, minHeight: '100vh', width: '100%' }}>
        <VStack gap={3} padding={4}>
          <HStack gap={1} align="center">
            <IconButton label={jobsCopys.backLabel} icon={<ArrowLeft size={22} />} variant="ghost" onClick={() => props.onBack()} />
            <VStack>
              <Heading level={1}>{jobsCopys.finishTheJob}</Heading>
              <Text type="supporting">{props.title} · {props.customerName}</Text>
            </VStack>
          </HStack>
          <Text type="supporting">{jobsCopys.confirmFinalPrice(props.customerFirstName)}</Text>
          <Card padding={4}>
            <VStack gap={1}>
              {props.lines.map((line, index) => (
                <FinalLineAmount
                  key={line.label}
                  line={line}
                  amount={amounts[index] ?? Number.NaN}
                  onChange={(amount) => setAmounts(withAmount(amounts, index, amount))}
                />
              ))}
              <HStack justify="between" align="center">
                <Text type="label">{jobsCopys.total}</Text>
                <Text type="large" className="zukki-tabular" aria-live="polite">${finalTotal(amounts)}</Text>
              </HStack>
              <EstimateLine
                amounts={amounts}
                estimate={props.estimate}
                customerFirstName={props.customerFirstName}
                reason={reason}
                onReasonChange={setReason}
              />
            </VStack>
          </Card>
          <VStack gap={1}>
            <Text type="label">{jobsCopys.photos}</Text>
            <div className="zukki-photo-grid">
              <PhotoTile label={jobsCopys.before} photoId={props.photos.before} />
              <PhotoTile label={jobsCopys.after} photoId={props.photos.after} />
              <button type="button" aria-label={jobsCopys.addPhoto} className="zukki-photo-tile zukki-photo-add" onClick={() => undefined}>
                <Camera size={22} aria-hidden />
                <span>{jobsCopys.addPhoto}</span>
              </button>
            </div>
          </VStack>
          <Card padding={4}>
            <HStack gap={3} align="center">
              <VStack gap={0.5}>
                <Text>{jobsCopys.askToSharePhotos(props.customerFirstName)}</Text>
                <Text type="supporting">{jobsCopys.sharePhotosHint}</Text>
              </VStack>
              <Switch
                label={jobsCopys.askToSharePhotos(props.customerFirstName)}
                isLabelHidden
                value={asksToSharePhotos}
                onChange={setAsksToSharePhotos}
              />
            </HStack>
          </Card>
          {finishFailed && <Text style={{ color: 'var(--color-error)' }}>{jobsCopys.somethingWentWrong}</Text>}
          <div className="zukki-jobs-footer zukki-jobs-footer-single">
            <Button label={jobsCopys.markAsDone} variant="primary" size="lg" width="100%" isDisabled={!canFinish} onClick={finish} />
          </div>
        </VStack>
      </div>
    </Theme>
  );
}

function withAmount(amounts: Money[], index: number, amount: Money): Money[] {
  return amounts.map((current, at) => (at === index ? amount : current));
}

function FinalLineAmount(props: { line: QuoteLine; amount: Money; onChange: (amount: Money) => void }) {
  return (
    <div className="zukki-quote-line">
      <Text>{props.line.label}</Text>
      <AmountField label={props.line.label} amount={props.amount} isInvalid={!isValidAmount(props.amount)} onChange={props.onChange} />
    </div>
  );
}

// The estimate line only reads while every amount is valid; an emptied field hides it instead of
// claiming the total is within the estimate.
function EstimateLine(props: {
  amounts: Money[];
  estimate: MoneyRange;
  customerFirstName: string;
  reason: string;
  onReasonChange: (reason: string) => void;
}) {
  const { amounts, estimate } = props;
  if (!amounts.every(isValidAmount)) return null;

  const estimateText = moneyRangeText(estimate);
  if (estimateCheck(finalTotal(amounts), estimate) === 'within') {
    return <Text type="supporting" style={{ color: 'var(--color-success)', fontWeight: 600 }}>{jobsCopys.withinEstimate(estimateText)}</Text>;
  }
  return (
    <VStack gap={1}>
      <Text type="supporting" style={{ color: 'var(--color-error)', fontWeight: 600 }}>{jobsCopys.outsideEstimate(estimateText, props.customerFirstName)}</Text>
      <TextInput label={jobsCopys.reasonLabel} value={props.reason} onChange={props.onReasonChange} />
    </VStack>
  );
}

// A static tile: the frame when it resolves, otherwise the label alone. Adding is a no-op in T5.1.
function PhotoTile(props: { label: string; photoId: string | null }) {
  const frame = props.photoId ? demoFrames[props.photoId] : undefined;
  if (!frame) return <span className="zukki-photo-tile">{props.label}</span>;
  return <Thumbnail className="zukki-photo-tile" src={frame} alt={props.label} />;
}
