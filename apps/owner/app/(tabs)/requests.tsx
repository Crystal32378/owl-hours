// Thin route adapter: the Requests module owns the screen. OwRequests.
import { useCallback } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import RequestsLoadError from '../../features/requests/components/RequestsLoadError';
import RequestsScreen from '../../features/requests/components/RequestsScreen';
import { useRequests } from '../../features/requests/hooks/useRequests';
import LoadingSkeleton from '../../shared/shell/LoadingSkeleton';

export default function RequestsRoute() {
  const insets = useSafeAreaInsets();
  const { requests, reload } = useRequests();
  useFocusEffect(useCallback(() => { reload(); }, [reload]));
  const safeInsets = { top: insets.top, bottom: insets.bottom };

  if (requests.status === 'failed') return <RequestsLoadError insets={safeInsets} onRetry={requests.retry} dom={domHost} />;
  if (requests.status !== 'ready') return <LoadingSkeleton />;

  return (
    <RequestsScreen
      requests={requests.view}
      insets={safeInsets}
      onOpenRequest={async (id) => router.push(`/request/${id}`)}
      onToggleTakingRequests={requests.setTakingRequests}
      refreshFailed={requests.refreshFailed}
      onRetry={requests.retry}
      dom={domHost}
    />
  );
}

// Expo's DOM wrapper defaults to contentInsetAdjustmentBehavior "automatic", which adds the
// safe area on top of the insets the screens already pad, so the screens own the insets alone.
const domHost = { style: { flex: 1 }, contentInsetAdjustmentBehavior: 'never' } as const;
