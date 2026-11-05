// Thin route adapter: the Chats module owns the screen. OwChats.
import { useCallback } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ChatLoadError from '../../features/chats/components/ChatLoadError';
import ChatsScreen from '../../features/chats/components/ChatsScreen';
import { useChats } from '../../features/chats/hooks/useChats';
import LoadingSkeleton from '../../shared/shell/LoadingSkeleton';

export default function ChatsRoute() {
  const insets = useSafeAreaInsets();
  const { chats, reload } = useChats();
  useFocusEffect(useCallback(() => { reload(); }, [reload]));
  const safeInsets = { top: insets.top, bottom: insets.bottom };

  if (chats.status === 'failed') return <ChatLoadError insets={safeInsets} onRetry={chats.retry} dom={domHost} />;
  if (chats.status !== 'ready') return <LoadingSkeleton />;

  return (
    <ChatsScreen
      rows={chats.rows}
      insets={safeInsets}
      onOpenChat={async (id) => router.push({ pathname: '/chat/[id]', params: { id } })}
      dom={domHost}
    />
  );
}

// Expo's DOM wrapper defaults to contentInsetAdjustmentBehavior "automatic", which adds the
// safe area on top of the insets the screens already pad, so the screens own the insets alone.
const domHost = { style: { flex: 1 }, contentInsetAdjustmentBehavior: 'never' } as const;
