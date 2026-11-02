'use dom';

import '@astryxdesign/core/reset.css';
import '@astryxdesign/core/astryx.css';
import '@astryxdesign/theme-neutral/theme.css';
import '../../../shared/theme/figtreeStylesheet';
import '../../../shared/theme/zukki-theme.css';
import './businessScreens.css';

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
import { TimeInput, type ISOTimeString } from '@astryxdesign/core/TimeInput';
import { Divider } from '@astryxdesign/core/Divider';
import { ArrowLeft } from 'lucide-react';
import { hoursCopys, weekdayNames } from '../copys/hoursCopys';
import { isDayValid, toDayDrafts, toShifts, type DayDraft } from '../lib/hoursDraft';
import type { OpeningHours } from '../lib/hoursSummary';

export default function HoursScreen(props: {
  hours: OpeningHours[];
  insets: { top: number; bottom: number };
  onBack: () => Promise<void>;
  onSave: (hours: OpeningHours[]) => Promise<boolean>;
  dom?: DOMProps;
}) {
  const { insets } = props;
  const [days, setDays] = useState(() => toDayDrafts(props.hours));
  const [saveFailed, setSaveFailed] = useState(false);

  function updateDay(weekday: number, patch: Partial<DayDraft>) {
    setSaveFailed(false);
    setDays((current) => current.map((day) => (day.weekday === weekday ? { ...day, ...patch } : day)));
  }

  async function save() {
    setSaveFailed(!(await props.onSave(toShifts(days))));
  }

  return (
    <Theme theme={neutralTheme}>
      <div className="zukki-root" style={{ paddingTop: insets.top, paddingBottom: insets.bottom, minHeight: '100vh', width: '100%' }}>
        <VStack gap={3} padding={4}>
          <HStack gap={1} align="center">
            <IconButton label={hoursCopys.backLabel} icon={<ArrowLeft size={22} />} variant="ghost" onClick={() => props.onBack()} />
            <Heading level={1}>{hoursCopys.title}</Heading>
          </HStack>
          <Text type="supporting">{hoursCopys.lead}</Text>
          <Card padding={4}>
            <VStack gap={3}>
              {days.map((day, index) => (
                <VStack key={day.weekday} gap={3}>
                  {index > 0 && <Divider />}
                  <DayRow day={day} onChange={(patch) => updateDay(day.weekday, patch)} />
                </VStack>
              ))}
            </VStack>
          </Card>
          {saveFailed && <Text type="supporting" className="zukki-sign-out">{hoursCopys.saveFailed}</Text>}
          <div className="zukki-sticky-footer">
            <Button
              label={hoursCopys.save}
              variant="primary"
              size="lg"
              width="100%"
              isDisabled={!days.every(isDayValid)}
              onClick={save}
            />
          </div>
        </VStack>
      </div>
    </Theme>
  );
}

function DayRow(props: { day: DayDraft; onChange: (patch: Partial<DayDraft>) => void }) {
  const { day } = props;
  const name = weekdayNames[day.weekday];
  return (
    <VStack gap={2}>
      <Switch
        label={name}
        {...(day.isOpen ? {} : { description: hoursCopys.closed })}
        value={day.isOpen}
        changeAction={(isOpen) => props.onChange({ isOpen })}
      />
      {day.isOpen && (
        <div className="zukki-hours-times">
          <TimeInput
            label={`${name} ${hoursCopys.opens}`}
            value={day.opens as ISOTimeString}
            hourFormat="12h"
            onChange={(opens) => props.onChange({ opens: opens ?? '' })}
          />
          <TimeInput
            label={`${name} ${hoursCopys.closes}`}
            value={day.closes as ISOTimeString}
            hourFormat="12h"
            onChange={(closes) => props.onChange({ closes: closes ?? '' })}
            {...(isDayValid(day) ? {} : { status: { type: 'error', message: hoursCopys.invalidDay } as const })}
          />
        </div>
      )}
    </VStack>
  );
}
