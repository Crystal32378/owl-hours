'use dom';

import '@astryxdesign/core/reset.css';
import '@astryxdesign/core/astryx.css';
import '@astryxdesign/theme-neutral/theme.css';
import '../../../shared/theme/figtreeStylesheet';
import '../../../shared/theme/zukki-theme.css';
import './businessScreens.css';

import type { DOMProps } from 'expo/dom';
import { Theme } from '@astryxdesign/core/theme';
import { neutralTheme } from '@astryxdesign/theme-neutral/built';
import { VStack, HStack } from '@astryxdesign/core/Layout';
import { Card } from '@astryxdesign/core/Card';
import { Heading, Text } from '@astryxdesign/core/Text';
import { IconButton } from '@astryxdesign/core/IconButton';
import { List, ListItem } from '@astryxdesign/core/List';
import { Settings as SettingsIcon } from 'lucide-react';
import ServiceAreaMap from '../../../shared/map/ServiceAreaMap';
import { Owl } from '../../../shared/mascot/Owl';
import owlReview from '../../../shared/mascot/owl/review';
import logoNorthside from '../../../assets/img/logoNorthside';
import { businessCopys } from '../copys/businessCopys';
import type { BusinessRowValues } from '../lib/businessRows';
import { RowChevron } from './RowChevron';

export default function BusinessScreen(props: {
  name: string;
  rows: BusinessRowValues;
  insets: { top: number; bottom: number };
  onOpenPrices: () => Promise<void>;
  onOpenHours: () => Promise<void>;
  onOpenSettings: () => Promise<void>;
  onTestZukki: () => Promise<void>;
  dom?: DOMProps;
}) {
  const { insets, rows } = props;
  return (
    <Theme theme={neutralTheme}>
      <div className="zukki-root" style={{ paddingTop: insets.top, paddingBottom: insets.bottom, minHeight: '100vh', width: '100%' }}>
        <VStack gap={3} padding={4}>
          <HStack gap={3} align="center">
            <img src={logoNorthside} alt="" width={52} height={52} className="zukki-logo" />
            <VStack gap={0} className="zukki-grow">
              <Heading level={1}>{props.name}</Heading>
              <Text type="supporting">{businessCopys.businessHeading}</Text>
            </VStack>
            <IconButton label={businessCopys.settingsLabel} icon={<SettingsIcon size={22} />} variant="ghost" onClick={() => props.onOpenSettings()} />
          </HStack>
          <Card padding={4}>
            <List edge="flush">
              <ListItem
                label={businessCopys.testZukki}
                description={businessCopys.testZukkiSubtitle}
                startContent={<Owl src={owlReview} scale={0.3} clip />}
                endContent={<RowChevron />}
                onClick={() => props.onTestZukki()}
              />
            </List>
          </Card>
          <Card padding={4}>
            <List hasDividers edge="flush">
              <ListItem label={businessCopys.profileRow} description={<RowValue text={rows.profile} />} />
              <ListItem
                label={businessCopys.pricesRow}
                description={<RowValue text={rows.prices} />}
                endContent={<RowChevron />}
                onClick={() => props.onOpenPrices()}
              />
              <ListItem
                label={businessCopys.extraFeesRow}
                description={<RowValue text={rows.extraFees} />}
                endContent={<RowChevron />}
                onClick={() => props.onOpenPrices()}
              />
              <ListItem
                label={businessCopys.hoursRow}
                description={<RowValue text={rows.hours} />}
                endContent={<RowChevron />}
                onClick={() => props.onOpenHours()}
              />
              <ListItem
                label={businessCopys.serviceAreaRow}
                description={
                  <VStack gap={0}>
                    <Text type="supporting">{rows.serviceArea}</Text>
                    <ServiceAreaMap
                      center={rows.serviceAreaMap.center}
                      radiusKm={rows.serviceAreaMap.radiusKm}
                      label={businessCopys.serviceAreaMapLabel}
                      className="zukki-map-strip"
                    />
                  </VStack>
                }
              />
              <ListItem label={businessCopys.websiteRow} description={<RowValue text={rows.website} />} />
            </List>
          </Card>
          <Text type="supporting">{businessCopys.businessFootnote}</Text>
        </VStack>
      </div>
    </Theme>
  );
}

// Row values wrap (the prices value spans two lines in the design), so they
// are rich content; single-line truncation only applies to plain strings.
function RowValue(props: { text: string }) {
  return <Text type="supporting">{props.text}</Text>;
}
