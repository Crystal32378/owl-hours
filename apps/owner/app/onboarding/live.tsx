// Thin route adapter: the live screen draws the saved business, the route wires
// the notification hook and owns navigation.
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import LiveScreen from '../../features/onboarding/components/LiveScreen';
import OnboardingLoadError from '../../features/onboarding/components/OnboardingLoadError';
import { useLive } from '../../features/onboarding/hooks/useLive';
import { useAllowNotifications } from '../../features/notifications/hooks/useAllowNotifications';
import { useOwnerAuth } from '../../features/auth/hooks/useOwnerAuth';
import { resolveNext } from '../../features/onboarding/lib/setupSteps';
import LoadingSkeleton from '../../shared/shell/LoadingSkeleton';

export default function LiveRoute() {
  const insets = useSafeAreaInsets();
  const live = useLive();
  const { session, configured } = useOwnerAuth();
  const allowNotifications = useAllowNotifications({ session, configured });
  const safeInsets = { top: insets.top, bottom: insets.bottom };

  if (live.status === 'failed') {
    return <OnboardingLoadError insets={safeInsets} onRetry={live.retry} dom={domHost} />;
  }
  if (live.status !== 'ready') return <LoadingSkeleton />;

  const { view } = live;
  return (
    <LiveScreen
      businessName={view.businessName}
      category={view.category}
      radiusKm={view.radiusKm}
      insets={safeInsets}
      onAllowNotifications={async () => {
        await allowNotifications();
        router.replace(resolveNext('/onboarding/live', 'next'));
      }}
      onLinkAccounts={async () => { router.push('/content/accounts'); }}
      dom={domHost}
    />
  );
}

const domHost = { style: { flex: 1 }, contentInsetAdjustmentBehavior: 'never' } as const;
