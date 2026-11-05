'use dom';

import '@astryxdesign/core/reset.css';
import '@astryxdesign/core/astryx.css';
import '@astryxdesign/theme-neutral/theme.css';
import '../../../shared/theme/figtreeStylesheet';
import '../../../shared/theme/zukki-theme.css';

import { useState, type ReactNode } from 'react';
import type { DOMProps } from 'expo/dom';
import { Theme } from '@astryxdesign/core/theme';
import { neutralTheme } from '@astryxdesign/theme-neutral/built';
import { Button } from '@astryxdesign/core/Button';
import { IconButton } from '@astryxdesign/core/IconButton';
import { Text } from '@astryxdesign/core/Text';
import { Layout, LayoutContent, LayoutFooter } from '@astryxdesign/core/Layout';
import { ArrowLeft } from 'lucide-react';
import { onboardingCopys } from '../copys/onboardingCopys';

// Shared setup-step chrome: back row, body container and footer button. The body slot
// is composed inside the DOM tree, so nothing but data and callbacks crosses the DOM
// boundary from the native routes: screens keep passing their own props down only.
// The page is exactly one viewport tall and only the body scrolls: Expo web sets
// `overflow: hidden` on <body>, so a page taller than the window hid Continue for good.
export default function OnboardingFrame(props: {
  insets: { top: number; bottom: number };
  onBack: () => Promise<void>;
  footerLabel: string;
  onFooter: () => Promise<void>;
  isFooterDisabled?: boolean;
  children: ReactNode;
  dom?: DOMProps;
}) {
  const { insets } = props;
  // A refused save keeps the owner on the step with a message instead of a dead button.
  const [saveFailed, setSaveFailed] = useState(false);
  const submit = () => {
    setSaveFailed(false);
    return props.onFooter().catch(() => setSaveFailed(true));
  };

  return (
    <Theme theme={neutralTheme}>
      <div className="zukki-root" style={{ ...pageStyle, paddingTop: insets.top }}>
        <Layout
          height="fill"
          header={
            <div style={backRowStyle}>
              <IconButton label={onboardingCopys.backLabel} icon={<ArrowLeft size={22} />} variant="ghost" onClick={() => props.onBack()} />
            </div>
          }
          content={
            <LayoutContent isScrollable padding={0}>
              <div style={bodyStyle}>{props.children}</div>
            </LayoutContent>
          }
          footer={
            <LayoutFooter hasDivider padding={4} style={footerStyle}>
              {saveFailed && <Text style={errorStyle}>{onboardingCopys.loadError}</Text>}
              <Button
                label={props.footerLabel}
                variant="primary"
                size="lg"
                width="100%"
                isDisabled={props.isFooterDisabled ?? false}
                onClick={submit}
              />
              {/* The home-indicator inset sits inside the card-colored footer, not under it. */}
              <div style={{ height: insets.bottom }} />
            </LayoutFooter>
          }
        />
      </div>
    </Theme>
  );
}

const pageStyle = { width: "100%", height: "100dvh", boxSizing: "border-box" } as const;

const backRowStyle = { height: 52, paddingInline: 8, display: "flex", alignItems: "center" } as const;

const bodyStyle = { padding: 16, display: "flex", flexDirection: "column", gap: 12 } as const;

const footerStyle = { background: "var(--color-background-card)" } as const;

// The same error color the verify step uses for a wrong code.
const errorStyle = { color: "var(--color-error)" } as const;
