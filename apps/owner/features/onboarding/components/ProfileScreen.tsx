'use dom';

import '@astryxdesign/core/reset.css';
import '@astryxdesign/core/astryx.css';
import '@astryxdesign/theme-neutral/theme.css';
import '../../../shared/theme/figtreeStylesheet';
import '../../../shared/theme/zukki-theme.css';

import { useRef, useState } from 'react';
import type { DOMProps } from 'expo/dom';
import { HStack, VStack } from '@astryxdesign/core/Layout';
import { Card } from '@astryxdesign/core/Card';
import { Heading, Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { TextInput } from '@astryxdesign/core/TextInput';
import { Owl } from '../../../shared/mascot/Owl';
import owlRunning from '../../../shared/mascot/owl/running';
import logoNorthside from '../../../assets/img/logoNorthside';
import { onboardingCopys } from '../copys/onboardingCopys';
import OnboardingFrame from './OnboardingFrame';
import SetupStepHeader from './SetupStepHeader';
import type { OnboardingProfile, WebsiteImport } from '../hooks/useProfile';

// Setup step 1: logo, business name, category, website. After the website is entered the
// screen reads it (owl running), then shows the imported-services note (success + check).
// The fields stay DOM-local; Continue persists the profile.
export default function ProfileScreen(props: {
  profile: OnboardingProfile;
  insets: { top: number; bottom: number };
  onImportWebsite: (website: string) => Promise<WebsiteImport>;
  onSave: (profile: OnboardingProfile) => Promise<void>;
  onBack: () => Promise<void>;
  dom?: DOMProps;
}) {
  const { insets } = props;
  const [name, setName] = useState(props.profile.name);
  const [category, setCategory] = useState(displayCategory(props.profile.category));
  const [website, setWebsite] = useState(props.profile.website);
  const [importStatus, setImportStatus] = useState<"idle" | "reading" | "imported">("idle");
  const [logoSrc, setLogoSrc] = useState(logoNorthside);
  const fileRef = useRef<HTMLInputElement>(null);
  const previousUrlRef = useRef<string | null>(null);

  return (
    <OnboardingFrame
      insets={insets}
      onBack={() => props.onBack()}
      footerLabel={onboardingCopys.continueButton}
      onFooter={() => props.onSave({ name, category, website })}
      isFooterDisabled={name.trim() === "" || category.trim() === ""}
    >
      <SetupStepHeader step={1} />
      <Heading level={1}>{onboardingCopys.profileTitle}</Heading>
      <Card padding={4}>
        <HStack gap={3} align="center">
          <img src={logoSrc} alt="" width={56} height={56} style={logoStyle} />
          <VStack gap={0} className="zukki-grow">
            <Text type="label">{onboardingCopys.logoLabel}</Text>
            <Text type="supporting">{onboardingCopys.logoCaption}</Text>
          </VStack>
          <Button label={onboardingCopys.logoChange} variant="secondary" onClick={() => fileRef.current?.click()} />
        </HStack>
        <input ref={fileRef} type="file" accept="image/*" style={hiddenInputStyle} onChange={pickLogo} />
      </Card>
      <Card padding={4}>
        <VStack gap={3}>
          <TextInput label={onboardingCopys.businessNameLabel} size="lg" value={name} onChange={setName} />
          <TextInput label={onboardingCopys.categoryLabel} size="lg" value={category} onChange={setCategory} />
          <VStack gap={1}>
            <TextInput
              label={onboardingCopys.websiteLabel}
              size="lg"
              value={website}
              onChange={setWebsite}
              onBlur={() => readWebsite()}
            />
            <WebsiteStatus status={importStatus} />
          </VStack>
        </VStack>
      </Card>
    </OnboardingFrame>
  );

  async function readWebsite() {
    if (website.trim() === "" || importStatus !== "idle") return;
    setImportStatus("reading");
    const imported = await props.onImportWebsite(website);
    // Nothing imported (live mode): no imported note, the field reads as before.
    setImportStatus(imported.services > 0 ? "imported" : "idle");
  }

  function pickLogo(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (previousUrlRef.current !== null) URL.revokeObjectURL(previousUrlRef.current);
    const nextUrl = URL.createObjectURL(file);
    previousUrlRef.current = nextUrl;
    setLogoSrc(nextUrl);
  }
}

// The website status line: nothing before entry, the running owl while reading,
// the check + imported note once the website has been read.
function WebsiteStatus(props: { status: "idle" | "reading" | "imported" }) {
  if (props.status === "reading") {
    return (
      <HStack gap={1} align="center">
        <Owl src={owlRunning} scale={0.18} clip />
        <Text type="supporting">{onboardingCopys.websiteReading}</Text>
      </HStack>
    );
  }
  if (props.status === "imported") {
    return (
      <span style={importedStyle}>
        <CheckIcon />
        {onboardingCopys.websiteImported}
      </span>
    );
  }
  return null;
}

// The success check from the handoff (OwProfileSetup.dc.html), drawn inline.
function CheckIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-success)" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 6L9 17l-5-5" />
    </svg>
  );
}

// The profile stores the category key ("water_heaters"); the field shows it as words ("Water heaters").
function displayCategory(category: string): string {
  const words = category.replaceAll("_", " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

const logoStyle = { borderRadius: "var(--radius-container)" } as const;

const hiddenInputStyle = { display: "none" } as const;

const importedStyle = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  fontSize: 14,
  color: "var(--color-success)",
  fontWeight: 600,
} as const;
