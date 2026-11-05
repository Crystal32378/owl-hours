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
import { Heading, Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { Bell, Megaphone } from 'lucide-react';
import { Owl } from '../../../shared/mascot/Owl';
import owlJumping from '../../../shared/mascot/owl/jumping';
import { onboardingCopys } from '../copys/onboardingCopys';
import { liveSubtitleFor, liveTitleFor } from '../lib/liveText';

// Owl jumping, the live title and subtitle for the business just set up, then the
// notifications and accounts blocks. Never clip jumping: the headroom is part of the jump.
export default function LiveScreen(props: {
  businessName: string;
  category: string;
  radiusKm: number;
  insets: { top: number; bottom: number };
  onAllowNotifications: () => Promise<void>;
  onLinkAccounts: () => Promise<void>;
  dom?: DOMProps;
}) {
  const { insets } = props;

  return (
    <Theme theme={neutralTheme}>
      <div className="zukki-root" style={{ ...pageStyle, paddingTop: insets.top, paddingBottom: insets.bottom }}>
        <div style={bodyStyle}>
          <Owl src={owlJumping} scale={0.75} />
          <VStack gap={2}>
            <Heading level={1}>{liveTitleFor(props.businessName)}</Heading>
            <Text type="supporting">{liveSubtitleFor(props.category, props.radiusKm)}</Text>
          </VStack>
          <VStack gap={3} style={blockStyle}>
            <span style={rowStyle}>
              <Bell size={24} aria-hidden="true" />
              <VStack gap={1} className="zukki-grow">
                <Text type="large">{onboardingCopys.notifyTitle}</Text>
                <Text type="supporting">{onboardingCopys.notifyBody}</Text>
              </VStack>
            </span>
            <Button
              label={onboardingCopys.allowNotifications}
              variant="primary"
              size="lg"
              width="100%"
              onClick={() => props.onAllowNotifications()}
            />
          </VStack>
          <VStack gap={3} style={blockStyle}>
            <span style={rowStyle}>
              <Megaphone size={24} aria-hidden="true" />
              <VStack gap={1} className="zukki-grow">
                <Text type="large">{onboardingCopys.linkTitle}</Text>
                <Text type="supporting">{onboardingCopys.linkBody}</Text>
              </VStack>
            </span>
            <Button
              label={onboardingCopys.linkAccounts}
              variant="secondary"
              size="lg"
              width="100%"
              onClick={() => props.onLinkAccounts()}
            />
          </VStack>
        </div>
      </div>
    </Theme>
  );
}

// One viewport tall and scrolling, so "Link accounts" stays reachable on short windows:
// Expo web sets `overflow: hidden` on <body>.
const pageStyle = { display: "flex", flexDirection: "column", width: "100%", height: "100dvh", overflowY: "auto" } as const;

const bodyStyle = { flex: 1, padding: "8px 24px 16px", display: "flex", flexDirection: "column", gap: 24 } as const;

const blockStyle = { borderTop: "1px solid var(--color-border)", paddingTop: 20 } as const;

const rowStyle = { display: "flex", gap: 12, alignItems: "flex-start" } as const;
