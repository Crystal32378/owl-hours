// Thin route adapter: the Business module owns the screen.
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import PricesScreen from "../../features/business/components/PricesScreen";
import BusinessLoadError from "../../features/business/components/BusinessLoadError";
import { usePrices } from "../../features/business/hooks/usePrices";
import LoadingSkeleton from '../../shared/shell/LoadingSkeleton';
import { goBackOr } from '../../shared/lib/goBack';

export default function PricesRoute() {
  const insets = useSafeAreaInsets();
  const prices = usePrices();
  const safeInsets = { top: insets.top, bottom: insets.bottom };

  if (prices.status === 'failed') {
    return <BusinessLoadError insets={safeInsets} onRetry={prices.retry} dom={domHost} />;
  }
  if (prices.status !== 'ready') return <LoadingSkeleton />;

  const { view } = prices;
  return (
    <PricesScreen
      prices={view.prices}
      fees={view.fees}
      insets={safeInsets}
      onBack={async () => goBackOr(router, '/(tabs)/business')}
      onSave={async (updatedPrices, updatedFees) => {
        if (!(await view.savePrices(updatedPrices))) return false;
        if (!(await view.saveFees(updatedFees))) return false;
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
