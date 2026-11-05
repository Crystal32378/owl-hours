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
import { Card } from '@astryxdesign/core/Card';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { Check, X } from 'lucide-react';
import { contentCopys } from '../copys/contentCopys';
import type { ListedAccount } from '../services/accountsService';
import type { LinkNotice } from '../lib/linkNotice';
import ContentTopBar from './ContentTopBar';

const CAN_DO_ITEMS = [
  { icon: 'check', text: contentCopys.canDoDrafts, color: 'var(--color-success)' },
  { icon: 'check', text: contentCopys.canDoTiming, color: 'var(--color-success)' },
  { icon: 'x', text: contentCopys.cannotPublish, color: 'var(--color-error)' },
] as const;

export default function AccountsScreen(props: {
  accounts: ListedAccount[];
  canConnect: boolean;
  canUnlink: boolean;
  // What Facebook Login answered when it sent the owner back, or a failed connect or unlink.
  notice: LinkNotice | null;
  insets: { top: number; bottom: number };
  onBack: () => Promise<void>;
  onConnect: () => Promise<void>;
  onUnlink: (id: string) => Promise<void>;
  onSeeDrafts: () => Promise<void>;
  dom?: DOMProps;
}) {
  const { insets, accounts, canConnect, canUnlink, notice } = props;

  return (
    <Theme theme={neutralTheme}>
      <div
        className="zukki-root"
        style={{
          paddingTop: insets.top,
          paddingBottom: insets.bottom,
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--color-background-body)',
        }}
      >
        <ContentTopBar
          title={contentCopys.linkedAccounts}
          subtitle={contentCopys.linkedAccountsSubtitle}
          onBack={props.onBack}
        />

        {/* Content body */}
        <div style={{ flex: 1, padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {notice && (
            <Text style={{ fontSize: 15, color: notice.tone === 'error' ? 'var(--color-error)' : 'var(--color-success)' }}>
              {notice.text}
            </Text>
          )}

          {/* Accounts list card */}
          <Card padding={4}>
            <VStack gap={0}>
              {accounts.length === 0 && (
                <Text type="supporting" style={{ fontSize: 15, padding: '14px 0' }}>
                  {contentCopys.noLinkedAccounts}
                </Text>
              )}
              {accounts.map((account, index) => {
                const label = contentCopys.accountLabels[account.kind];
                const subtitle = account.name;
                const accountId = account.id;

                return (
                  <div
                    key={accountId ?? `${account.kind}:${account.name}`}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      padding: '14px 0',
                      borderTop: index === 0 ? 'none' : '1px solid var(--color-border)',
                    }}
                  >
                    <VStack gap={0} style={{ flex: 1 }}>
                      <Text style={{ fontSize: 16, fontWeight: 600 }}>{label}</Text>
                      <Text type="supporting" style={{ fontSize: 14 }}>
                        {subtitle}
                      </Text>
                    </VStack>
                    <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text-primary)' }}>
                      {contentCopys.connected}
                    </span>
                    {canUnlink && accountId && (
                      <Button
                        label={contentCopys.unlink}
                        variant="secondary"
                        size="md"
                        onClick={() => void props.onUnlink(accountId)}
                      />
                    )}
                  </div>
                );
              })}
            </VStack>
          </Card>

          {/* What Zukki can do */}
          <Card padding={4}>
            <VStack gap={3}>
              <Text style={{ fontSize: 17, fontWeight: 700 }}>
                {contentCopys.whatZukkiCanDo}
              </Text>
              {CAN_DO_ITEMS.map((item, index) => (
                <div
                  key={index}
                  style={{
                    display: 'flex',
                    gap: 10,
                    alignItems: 'flex-start',
                    fontSize: 15,
                    lineHeight: 1.4,
                  }}
                >
                  {item.icon === 'check' ? (
                    <Check
                      size={18}
                      color={item.color}
                      strokeWidth={2.4}
                      style={{ flexShrink: 0, marginTop: 2 }}
                    />
                  ) : (
                    <X
                      size={18}
                      color={item.color}
                      strokeWidth={2.4}
                      style={{ flexShrink: 0, marginTop: 2 }}
                    />
                  )}
                  <span>{item.text}</span>
                </div>
              ))}
            </VStack>
          </Card>

          {canConnect && (
            <Button
              label={contentCopys.connectFacebookInstagram}
              variant="secondary"
              size="lg"
              onClick={() => void props.onConnect()}
            />
          )}

          <Button
            label={contentCopys.seeTodaysDrafts}
            variant="primary"
            size="lg"
            onClick={() => void props.onSeeDrafts()}
          />
        </div>
      </div>
    </Theme>
  );
}
