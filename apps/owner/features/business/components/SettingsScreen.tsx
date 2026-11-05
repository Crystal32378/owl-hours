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
import { Switch } from '@astryxdesign/core/Switch';
import { List, ListItem } from '@astryxdesign/core/List';
import { Divider } from '@astryxdesign/core/Divider';
import { ArrowLeft } from 'lucide-react';
import { businessCopys } from '../copys/businessCopys';
import { settingsCopys } from '../copys/settingsCopys';
import type { SettingKey } from '../hooks/useSettings';
import type { BusinessSettings } from '../services/businessService';
import { RowChevron } from './RowChevron';

export default function SettingsScreen(props: {
  settings: BusinessSettings;
  acceptWindowValue: string;
  acceptWindowDetail: string;
  linkedAccountsValue: string;
  insets: { top: number; bottom: number };
  onBack: () => Promise<void>;
  onToggleSetting: (key: SettingKey, checked: boolean) => Promise<void>;
  onOpenAccounts: () => Promise<void>;
  onSignOut: () => Promise<void>;
  dom?: DOMProps;
}) {
  const { insets, settings } = props;
  return (
    <Theme theme={neutralTheme}>
      <div className="zukki-root" style={{ paddingTop: insets.top, paddingBottom: insets.bottom, minHeight: '100vh', width: '100%' }}>
        <VStack gap={3} padding={4}>
          <HStack gap={1} align="center">
            <IconButton label={settingsCopys.backLabel} icon={<ArrowLeft size={22} />} variant="ghost" onClick={() => props.onBack()} />
            <Heading level={1}>{settingsCopys.settingsTitle}</Heading>
          </HStack>
          <Text type="label">{settingsCopys.requestsSection}</Text>
          <Card padding={4}>
            <VStack gap={2}>
              <Switch
                label={businessCopys.takingRequestsNow}
                description={settingsCopys.takingRequestsDesc}
                value={settings.takingRequests}
                changeAction={(checked) => props.onToggleSetting("takingRequests", checked)}
              />
              <Divider />
              <HStack gap={3} align="center">
                <VStack gap={0} className="zukki-grow">
                  <Text type="label">{settingsCopys.timeToAccept}</Text>
                  <Text type="supporting">{props.acceptWindowDetail}</Text>
                </VStack>
                <Text type="body" className="zukki-setting-value">{props.acceptWindowValue}</Text>
              </HStack>
            </VStack>
          </Card>
          {hasNotificationSwitches(settings) && (
            <>
              <Text type="label">{settingsCopys.notificationsSection}</Text>
              <Card padding={4}>
                <VStack gap={2}>
                  {settings.urgentRequests !== undefined && (
                    <Switch
                      label={businessCopys.urgentRequests}
                      description={settingsCopys.urgentRequestsDesc}
                      value={settings.urgentRequests}
                      changeAction={(checked) => props.onToggleSetting("urgentRequests", checked)}
                    />
                  )}
                  {settings.urgentRequests !== undefined && settings.ringOnSilentAtNight !== undefined && <Divider />}
                  {settings.ringOnSilentAtNight !== undefined && (
                    <Switch
                      label={businessCopys.ringOnSilentAtNight}
                      description={settingsCopys.ringOnSilentDesc}
                      value={settings.ringOnSilentAtNight}
                      changeAction={(checked) => props.onToggleSetting("ringOnSilentAtNight", checked)}
                    />
                  )}
                </VStack>
              </Card>
            </>
          )}
          {settings.polishByDefault !== undefined && (
            <>
              <Text type="label">{settingsCopys.messagesSection}</Text>
              <Card padding={4}>
                <Switch
                  label={businessCopys.polishByDefault}
                  description={settingsCopys.polishDesc}
                  value={settings.polishByDefault}
                  changeAction={(checked) => props.onToggleSetting("polishByDefault", checked)}
                />
              </Card>
            </>
          )}
          <Card padding={4}>
            <List hasDividers edge="flush">
              <ListItem
                label={settingsCopys.linkedAccounts}
                endContent={
                  <HStack gap={1} align="center">
                    <Text type="supporting">{props.linkedAccountsValue}</Text>
                    <RowChevron />
                  </HStack>
                }
                onClick={() => props.onOpenAccounts()}
              />
              <ListItem
                label={<Text className="zukki-sign-out">{businessCopys.signOut}</Text>}
                onClick={() => props.onSignOut()}
              />
            </List>
          </Card>
        </VStack>
      </div>
    </Theme>
  );
}

// Live mode has no stored value for the notification switches, so their section is hidden.
function hasNotificationSwitches(settings: BusinessSettings): boolean {
  return settings.urgentRequests !== undefined || settings.ringOnSilentAtNight !== undefined;
}
