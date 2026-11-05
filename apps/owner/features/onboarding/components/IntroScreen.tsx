'use dom';

import '@astryxdesign/core/reset.css';
import '@astryxdesign/core/astryx.css';
import '@astryxdesign/theme-neutral/theme.css';
import '../../../shared/theme/figtreeStylesheet';
import '../../../shared/theme/zukki-theme.css';
import './introScreen.css';

import { useRef, useState } from 'react';
import type { DOMProps } from 'expo/dom';
import { Theme } from '@astryxdesign/core/theme';
import { neutralTheme } from '@astryxdesign/theme-neutral/built';
import { VStack } from '@astryxdesign/core/Layout';
import { Heading, Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { Owl } from '../../../shared/mascot/Owl';
import owlWaving from '../../../shared/mascot/owl/waving';
import owlRunningRight from '../../../shared/mascot/owl/running-right';
import owlReview from '../../../shared/mascot/owl/review';
import { onboardingCopys } from '../copys/onboardingCopys';
import { pagerLabel } from '../lib/introSlides';
import type { IntroSlide } from '../lib/introSlides';

// One DOM screen with a swipe pager inside: the owl at 1.3, PagerDots, title, lead and buttons.
// "Skip" on slides 1-2; slide 3 has "Create my account" + "I already have an account".
export default function IntroScreen(props: {
  slides: IntroSlide[];
  insets: { top: number; bottom: number };
  onSkip: () => Promise<void>;
  onCreateAccount: () => Promise<void>;
  onHasAccount: () => Promise<void>;
  dom?: DOMProps;
}) {
  const { slides, insets } = props;
  const trackRef = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const slide = slides[index] ?? slides[0];

  return (
    <Theme theme={neutralTheme}>
      <div className="zukki-root" style={{ ...pageStyle, paddingTop: insets.top, paddingBottom: insets.bottom }}>
        <div style={topBarStyle}>
          {slide?.showSkip && (
            <Button label={onboardingCopys.introSkip} variant="ghost" onClick={() => props.onSkip()} />
          )}
        </div>
        <div ref={trackRef} className="zukki-pager-track" onScroll={syncIndex}>
          {slides.map((entry, entryIndex) => (
            <div key={entry.title} className="zukki-pager-page">
              <SlideBody entry={entry} entryIndex={entryIndex} total={slides.length} owlSrc={owlBySlide[entryIndex]} />
            </div>
          ))}
        </div>
        <VStack gap={2} padding={4}>
          <Button label={slide?.primaryAction ?? ""} variant="primary" size="lg" width="100%" onClick={() => advance()} />
          {slide?.secondaryAction && (
            <Button label={slide.secondaryAction} variant="secondary" size="lg" width="100%" onClick={() => props.onHasAccount()} />
          )}
        </VStack>
      </div>
    </Theme>
  );

  function syncIndex() {
    const track = trackRef.current;
    if (!track || track.clientWidth === 0) return;
    const next = Math.round(track.scrollLeft / track.clientWidth);
    setIndex(Math.min(slides.length - 1, Math.max(0, next)));
  }

  function advance() {
    if (index >= slides.length - 1) {
      void props.onCreateAccount();
      return;
    }
    const track = trackRef.current;
    track?.scrollTo({ left: (index + 1) * track.clientWidth, behavior: scrollBehavior() });
  }
}

const owlBySlide = [owlWaving, owlRunningRight, owlReview];

function SlideBody(props: { entry: IntroSlide; entryIndex: number; total: number; owlSrc: string | undefined }) {
  return (
    <>
      <div style={owlStyle}>
        {props.owlSrc && <Owl src={props.owlSrc} scale={1.3} />}
      </div>
      <div style={copyStyle}>
        <PagerDots active={props.entryIndex} total={props.total} />
        <Heading level={1}>{props.entry.title}</Heading>
        <Text type="supporting">{props.entry.lead}</Text>
      </div>
    </>
  );
}

function PagerDots(props: { active: number; total: number }) {
  return (
    <div aria-label={pagerLabel(props.active + 1, props.total)} style={dotsStyle}>
      {Array.from({ length: props.total }, (_, dot) => (
        <span key={dot} style={dot === props.active ? { ...dotStyle, ...activeDotStyle } : dotStyle} />
      ))}
    </div>
  );
}

function scrollBehavior(): ScrollBehavior {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
}

const pageStyle = { display: "flex", flexDirection: "column", width: "100%", height: "100dvh" } as const;

const topBarStyle = { height: 52, paddingInline: 12, display: "flex", alignItems: "center", justifyContent: "flex-end" } as const;

const owlStyle = { flex: 1, display: "flex", alignItems: "flex-end", justifyContent: "center", paddingBottom: 8 } as const;

const copyStyle = { padding: "8px 24px 0", display: "flex", flexDirection: "column", gap: 12, minHeight: 196 } as const;

const dotsStyle = { display: "flex", gap: 6 } as const;

const dotStyle = { width: 8, height: 8, borderRadius: 4, background: "var(--color-border-emphasized)" } as const;

const activeDotStyle = { width: 20, background: "var(--color-text-primary)" } as const;
