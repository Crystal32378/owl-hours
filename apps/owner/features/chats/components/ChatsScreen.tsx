'use dom';

import '@astryxdesign/core/reset.css';
import '@astryxdesign/core/astryx.css';
import '@astryxdesign/theme-neutral/theme.css';
import '../../../shared/theme/figtreeStylesheet';
import '../../../shared/theme/zukki-theme.css';

import { useState } from 'react';
import type { DOMProps } from 'expo/dom';
import { Theme } from '@astryxdesign/core/theme';
import { neutralTheme } from '@astryxdesign/theme-neutral/built';
import { VStack, HStack } from '@astryxdesign/core/Layout';
import { Card } from '@astryxdesign/core/Card';
import { Heading, Text } from '@astryxdesign/core/Text';
import { TextInput } from '@astryxdesign/core/TextInput';
import { List, ListItem } from '@astryxdesign/core/List';
import { Avatar } from '@astryxdesign/core/Avatar';
import { Badge } from '@astryxdesign/core/Badge';
import { EmptyState } from '@astryxdesign/core/EmptyState';
import { Owl } from '../../../shared/mascot/Owl';
import owlWaiting from '../../../shared/mascot/owl/waiting';
import { chatsListCopys } from '../copys/chatsListCopys';
import { filterChatRows } from '../lib/chatRow.ts';
import type { ChatRowView } from '../lib/chatRow.ts';

// OwChats: search, then one row per conversation, then the footnote. The DOM screen only draws.
export default function ChatsScreen(props: {
  rows: ChatRowView[];
  insets: { top: number; bottom: number };
  onOpenChat: (id: string) => Promise<void>;
  dom?: DOMProps;
}) {
  const { rows, insets } = props;
  const [query, setQuery] = useState('');
  const shownRows = filterChatRows(rows, query);

  return (
    <Theme theme={neutralTheme}>
      <div className="zukki-root" style={{ paddingTop: insets.top, paddingBottom: insets.bottom, minHeight: '100vh', width: '100%' }}>
        <VStack gap={3} padding={4}>
          <Heading level={1}>{chatsListCopys.chatsTitle}</Heading>
          <TextInput
            label={chatsListCopys.searchChats}
            isLabelHidden
            size="lg"
            value={query}
            onChange={setQuery}
            placeholder={chatsListCopys.searchChats}
          />
          {rows.length === 0 ? (
            <EmptyState title={chatsListCopys.emptyChats} icon={<Owl src={owlWaiting} scale={0.6} clip />} />
          ) : (
            <Card padding={4}>
              <List hasDividers>
                {shownRows.map((row) => (
                  <ChatRow key={row.id} row={row} onOpen={() => props.onOpenChat(row.id)} />
                ))}
              </List>
            </Card>
          )}
          <Text type="supporting">{chatsListCopys.footnote}</Text>
        </VStack>
      </div>
    </Theme>
  );
}

// Name and time on top, the last message (bold with a count while unread), then "job · status".
function ChatRow(props: { row: ChatRowView; onOpen: () => void }) {
  const { row } = props;
  const isUnread = row.unread > 0;
  return (
    <ListItem
      startContent={<Avatar name={row.name} size="lg" tooltip={false} />}
      onClick={() => props.onOpen()}
      label={
        <HStack gap={2} justify="between">
          <Text type="label">{row.name}</Text>
          <Text type="supporting">{row.timestamp}</Text>
        </HStack>
      }
      description={
        <VStack gap={0.5}>
          <HStack gap={2} justify="between" align="center">
            <Text type="body" weight={isUnread ? 'bold' : 'normal'} maxLines={1}>{row.preview}</Text>
            {isUnread && <span style={badgeSlotStyle}><Badge variant="info" label={String(row.unread)} /></span>}
          </HStack>
          <Text type="supporting">{row.jobLine}</Text>
        </VStack>
      }
    />
  );
}

// A long preview is cut with an ellipsis; without this the row squeezed the count to an empty dot.
const badgeSlotStyle = { flexShrink: 0 } as const;
