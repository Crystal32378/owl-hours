'use dom';

import '@astryxdesign/core/reset.css';
import '@astryxdesign/core/astryx.css';
import '@astryxdesign/theme-neutral/theme.css';
import '../../../shared/theme/figtreeStylesheet';
import '../../../shared/theme/zukki-theme.css';

import type { DOMProps } from 'expo/dom';
import { Theme } from '@astryxdesign/core/theme';
import { neutralTheme } from '@astryxdesign/theme-neutral/built';
import { Button } from '@astryxdesign/core/Button';
import { EmptyState } from '@astryxdesign/core/EmptyState';
import { Owl } from '../../../shared/mascot/Owl';
import owlFailed from '../../../shared/mascot/owl/failed';
import { onboardingCopys } from '../copys/onboardingCopys';

// Error state of every onboarding load: the owl, one fixed sentence and a retry. Never the raw error.
export default function OnboardingLoadError(props: {
  insets: { top: number; bottom: number };
  onRetry: () => Promise<void>;
  dom?: DOMProps;
}) {
  const { insets } = props;
  return (
    <Theme theme={neutralTheme}>
      <div className="zukki-root" style={{ ...pageStyle, paddingTop: insets.top, paddingBottom: insets.bottom }}>
        <EmptyState
          title={onboardingCopys.loadError}
          icon={<Owl src={owlFailed} scale={0.6} clip />}
          actions={<Button label={onboardingCopys.retry} variant="primary" size="lg" onClick={() => props.onRetry()} />}
        />
      </div>
    </Theme>
  );
}

// The DOM host shrinks the root to its content width, so the root claims the full width
// to center the error state (same cause as ChatScreen's pageStyle).
const pageStyle = { display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100dvh', boxSizing: 'border-box' } as const;
