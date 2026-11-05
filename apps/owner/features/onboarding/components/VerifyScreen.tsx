'use dom';

import '@astryxdesign/core/reset.css';
import '@astryxdesign/core/astryx.css';
import '@astryxdesign/theme-neutral/theme.css';
import '../../../shared/theme/figtreeStylesheet';
import '../../../shared/theme/zukki-theme.css';
import './verifyScreen.css';

import { useRef, useState } from 'react';
import type { DOMProps } from 'expo/dom';
import { Theme } from '@astryxdesign/core/theme';
import { neutralTheme } from '@astryxdesign/theme-neutral/built';
import { Heading, Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { IconButton } from '@astryxdesign/core/IconButton';
import { ArrowLeft } from 'lucide-react';
import { Owl } from '../../../shared/mascot/Owl';
import owlWaiting from '../../../shared/mascot/owl/waiting';
import { onboardingCopys } from '../copys/onboardingCopys';
import { CODE_LENGTH } from '../lib/codeEntry';
import type { ResendState } from '../lib/codeEntry';
import type { VerifyOutcome } from '../hooks/useVerify';

// Owl waiting, "Enter the code", then CodeInput: six boxes over one hidden numeric input.
// Auto-submits on the 6th digit; a wrong code shows the error copy and shakes the boxes,
// unless reduced motion is on. The resend countdown lives in the hook and arrives as data.
export default function VerifyScreen(props: {
  email: string;
  resend: ResendState;
  insets: { top: number; bottom: number };
  onVerify: (code: string) => Promise<VerifyOutcome>;
  onResend: () => Promise<void>;
  onChangeEmail: () => Promise<void>;
  onBack: () => Promise<void>;
  dom?: DOMProps;
}) {
  const { insets } = props;
  const [code, setCode] = useState("");
  const [codeError, setCodeError] = useState(false);
  const boxesRef = useRef<HTMLDivElement>(null);
  const submittingRef = useRef(false);

  const resend = props.resend;
  const digits = code.padEnd(CODE_LENGTH, " ").split("");

  return (
    <Theme theme={neutralTheme}>
      <div className="zukki-root" style={{ ...pageStyle, paddingTop: insets.top, paddingBottom: insets.bottom }}>
        <div style={backRowStyle}>
          <IconButton label={onboardingCopys.backLabel} icon={<ArrowLeft size={22} />} variant="ghost" onClick={() => props.onBack()} />
        </div>
        <div style={bodyStyle}>
          <div style={owlStyle}>
            <Owl src={owlWaiting} scale={0.8} />
          </div>
          <Heading level={1}>{onboardingCopys.verifyTitle}</Heading>
          <Text type="supporting">
            {onboardingCopys.verifySentPrefix} <strong style={emailStyle}>{props.email}</strong>
            {onboardingCopys.verifySentSuffix}
          </Text>
          <div className="onk-code-wrap">
            <div ref={boxesRef} role="group" aria-label={onboardingCopys.verifyCodeLabel} className="onk-code-boxes">
              {digits.map((digit, position) => (
                <span key={position} className={codeError ? "onk-code-box onk-code-box-error" : "onk-code-box"}>
                  {digit}
                </span>
              ))}
            </div>
            <input
              className="onk-hidden-input"
              aria-label={onboardingCopys.verifyCodeLabel}
              inputMode="numeric"
              autoComplete="one-time-code"
              autoFocus
              value={code}
              onChange={(event) => typeCode(event.target.value)}
            />
          </div>
          {codeError && <Text style={errorStyle}>{onboardingCopys.codeError}</Text>}
          {resend.kind === "countdown" ? (
            <Text type="supporting">{resend.text}</Text>
          ) : (
            <Button label={onboardingCopys.resendLink} variant="ghost" onClick={() => props.onResend()} />
          )}
          <Button label={onboardingCopys.changeEmail} variant="ghost" onClick={() => props.onChangeEmail()} />
        </div>
        <div style={footerStyle}>
          <Button label={onboardingCopys.verifyButton} variant="primary" size="lg" width="100%" onClick={() => submit(code)} />
        </div>
      </div>
    </Theme>
  );

  function typeCode(raw: string) {
    const next = raw.replace(/\D/g, "").slice(0, CODE_LENGTH);
    setCode(next);
    setCodeError(false);
    if (next.length === CODE_LENGTH) void submit(next);
  }

  async function submit(next: string) {
    if (submittingRef.current || next.length !== CODE_LENGTH) return;
    submittingRef.current = true;
    try {
      const outcome = await props.onVerify(next);
      if (outcome.kind === "wrong_code") {
        setCodeError(true);
        shakeBoxes();
      }
    } finally {
      submittingRef.current = false;
    }
  }

  function shakeBoxes() {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const boxes = boxesRef.current;
    if (!boxes) return;
    boxes.classList.remove("onk-shake");
    void boxes.offsetWidth;
    boxes.classList.add("onk-shake");
  }
}

// One viewport tall with a scrolling body, so the footer button stays reachable on short
// windows: Expo web sets `overflow: hidden` on <body>.
const pageStyle = { display: "flex", flexDirection: "column", width: "100%", height: "100dvh" } as const;

const backRowStyle = { height: 52, paddingInline: 8, display: "flex", alignItems: "center" } as const;

const bodyStyle = { flex: 1, minHeight: 0, overflowY: "auto", paddingInline: 24, display: "flex", flexDirection: "column", gap: 18 } as const;

const owlStyle = { display: "flex", justifyContent: "center" } as const;

const emailStyle = { color: "var(--color-text-primary)" } as const;

const errorStyle = { color: "var(--color-error)" } as const;

const footerStyle = { padding: "12px 24px 16px" } as const;
