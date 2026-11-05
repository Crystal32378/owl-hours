// Native wrapper: owns data, navigation, haptics and safe areas. The DOM screen draws.
import { useLocalSearchParams, router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import RequestScreen from '../../features/requests/components/RequestScreen';
import RequestsLoadError from '../../features/requests/components/RequestsLoadError';
import { destinationAfterAccept } from '../../features/requests/lib/acceptOutcome';
import { shouldOpenDeclineSheet } from '../../features/requests/lib/declineSheet';
import { useRequestOffer } from '../../features/requests/hooks/useRequestOffer';
import LoadingSkeleton from '../../shared/shell/LoadingSkeleton';
import { goBackOr } from '../../shared/lib/goBack';

export default function RequestRoute() {
  const { id, decline } = useLocalSearchParams<{ id: string; decline?: string | string[] }>();
  const insets = useSafeAreaInsets();
  const screen = useRequestOffer(id);
  const safeInsets = { top: insets.top, bottom: insets.bottom };
  if (screen.status === 'failed') return <RequestsLoadError insets={safeInsets} onRetry={screen.retry} dom={domHost} />;
  if (screen.status !== 'ready') return <LoadingSkeleton />;

  const request = screen.view;

  return (
    <RequestScreen
      offer={request.offer}
      countdownText={request.countdownText}
      secondsLeft={request.secondsLeft}
      maxSeconds={request.maxSeconds}
      isExpired={request.isExpired}
      insets={safeInsets}
      startDeclineOpen={shouldOpenDeclineSheet(decline)}
      onAccept={async () => {
        const destination = destinationAfterAccept(await request.accept());
        if (destination.kind === 'stay') return;
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        if (destination.kind === 'chat') router.replace({ pathname: '/chat/[id]', params: { id: destination.chatId } });
        else router.replace('/chats');
      }}
      onDecline={async (reason) => {
        if (!(await request.decline(reason))) return;
        await Haptics.selectionAsync();
        goBackOr(router, '/(tabs)/requests');
      }}
      dom={domHost}
    />
  );
}

// Expo's DOM wrapper defaults to contentInsetAdjustmentBehavior "automatic", which adds the
// safe area on top of the insets the screens already pad, so the screens own the insets alone.
const domHost = { style: { flex: 1 }, contentInsetAdjustmentBehavior: 'never' } as const;
