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
import { TextInput } from '@astryxdesign/core/TextInput';
import { Avatar } from '@astryxdesign/core/Avatar';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { Owl } from '../../../shared/mascot/Owl';
import owlIdle from '../../../shared/mascot/owl/idle';
import owlFailed from '../../../shared/mascot/owl/failed';
import owlStatic from '../../../shared/mascot/owl/static';
import type { TestZukkiTurn } from '../services/testZukkiService.ts';
import { testZukkiSourceLine } from '../lib/testZukkiSourceLine';
import { businessCopys } from '../copys/businessCopys';
import { pricesCopys } from '../copys/pricesCopys';
import { testZukkiCopys } from '../copys/testZukkiCopys';

export default function TestZukkiScreen(props: {
  turns: TestZukkiTurn[];
  hasError: boolean;
  isAsking: boolean;
  insets: { top: number; bottom: number };
  onBack: () => Promise<void>;
  onAsk: (question: string) => Promise<boolean>;
  onOpenPrices: () => Promise<void>;
  dom?: DOMProps;
}) {
  const { insets } = props;
  const [draft, setDraft] = useState('');

  async function submit() {
    const question = draft.trim();
    if (question === '' || props.isAsking) return;
    if (await props.onAsk(question)) setDraft('');
  }

  return (
    <Theme theme={neutralTheme}>
      <div className="zukki-root" style={{ paddingTop: insets.top, paddingBottom: insets.bottom, minHeight: '100vh', width: '100%' }}>
        <VStack gap={3} padding={4}>
          <HStack gap={1} align="center">
            <IconButton label={pricesCopys.backLabel} icon={<ArrowLeft size={22} />} variant="ghost" size="md" onClick={() => props.onBack()} />
            <VStack>
              <Heading level={1}>{testZukkiCopys.title}</Heading>
              <Text type="supporting">{testZukkiCopys.subtitle}</Text>
            </VStack>
          </HStack>
          <HStack gap={2} align="start">
            <Owl src={owlIdle} scale={0.36} clip />
            <Text type="supporting">{testZukkiCopys.intro}</Text>
          </HStack>
          {props.turns.map((turn, index) => (
            <TurnEntry key={index} turn={turn} onOpenPrices={props.onOpenPrices} />
          ))}
          {props.hasError && (
            <HStack gap={2} align="center">
              <Owl src={owlFailed} scale={0.36} clip />
              <VStack gap={1}>
                <Text>{businessCopys.errorTitle}</Text>
                <Button label={businessCopys.errorRetry} variant="secondary" size="lg" onClick={submit} />
              </VStack>
            </HStack>
          )}
          <HStack gap={2} align="center">
            <div className="zukki-grow">
              <TextInput
                label={testZukkiCopys.composerLabel}
                isLabelHidden
                placeholder={testZukkiCopys.composerPlaceholder}
                value={draft}
                onChange={setDraft}
                onEnter={submit}
              />
            </div>
            <IconButton
              label={testZukkiCopys.sendLabel}
              icon={<ArrowRight size={22} />}
              variant="primary"
              size="md"
              isDisabled={draft.trim() === '' || props.isAsking}
              onClick={submit}
              style={roundStyle}
            />
          </HStack>
        </VStack>
      </div>
    </Theme>
  );
}

const roundStyle = { borderRadius: 9999 } as const;

// The owner's question on the right; Zukki's answer on the left under the
// "Zukki would answer" tag, with the source line and its fix action.
function TurnEntry(props: { turn: TestZukkiTurn; onOpenPrices: () => Promise<void> }) {
  const { turn } = props;
  return (
    <>
      <div style={ownerBubbleStyle}>
        <Text style={ownerBubbleTextStyle}>{turn.question}</Text>
      </div>
      {turn.answer && <AnswerBubble text={turn.answer.text} sources={turn.answer.sources} onOpenPrices={props.onOpenPrices} />}
    </>
  );
}

function AnswerBubble(props: { text: string; sources: string[]; onOpenPrices: () => Promise<void> }) {
  const source = testZukkiSourceLine(props.sources);
  return (
    <VStack gap={1}>
      <HStack gap={1} align="center">
        <Avatar size="xsm" src={owlStatic} alt="" />
        <Text type="label">{testZukkiCopys.answerTag}</Text>
      </HStack>
      <Card padding={3}>
        <Text>{props.text}</Text>
      </Card>
      <HStack gap={2} align="center">
        <Text type="supporting">{source.line}</Text>
        <Button label={source.action} variant="ghost" size="lg" onClick={() => props.onOpenPrices()} />
      </HStack>
    </VStack>
  );
}

const ownerBubbleStyle = {
  alignSelf: 'flex-end',
  maxWidth: 280,
  background: 'var(--color-accent)',
  color: '#ffffff',
  borderRadius: '18px 18px 4px 18px',
  padding: '10px 14px',
} as const;

const ownerBubbleTextStyle = { color: '#ffffff' } as const;
