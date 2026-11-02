// Thin route adapter: the Business module owns the screen.
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import HoursScreen from "../../features/business/components/HoursScreen";
import BusinessLoadError from "../../features/business/components/BusinessLoadError";
import { useHours } from "../../features/business/hooks/useHours";
import LoadingSkeleton from '../../shared/shell/LoadingSkeleton';
import { goBackOr } from '../../shared/lib/goBack';

export default function HoursRoute() {
  const insets = useSafeAreaInsets();
  const hours = useHours();
  const safeInsets = { top: insets.top, bottom: insets.bottom };

  if (hours.status === 'failed') {
    return <BusinessLoadError insets={safeInsets} onRetry={hours.retry} dom={domHost} />;
  }
  if (hours.status !== 'ready') return <LoadingSkeleton />;

  const { view } = hours;
  return (
    <HoursScreen
      hours={view.hours}
      insets={safeInsets}
      onBack={async () => goBackOr(router, '/(tabs)/business')}
      onSave={async (updated) => {
        if (!(await view.saveHours(updated))) return false;
        goBackOr(router, '/(tabs)/business');
        return true;
      }}
      dom={domHost}
    />
  );
}

// Expo's DOM wrapper defaults to contentInsetAdjustmentBehavior "automatic", which adds the
// safe area on top of the insets the screens already pad, so the screens own the insets alone.
const domHost = { style: { flex: 1 }, contentInsetAdjustmentBehavior: 'never' } as const;
