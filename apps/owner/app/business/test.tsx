// Thin route adapter: the Business module owns the screen.
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import TestZukkiScreen from "../../features/business/components/TestZukkiScreen";
import { useTestZukki } from "../../features/business/hooks/useTestZukki";
import { goBackOr } from '../../shared/lib/goBack';

export default function TestZukkiRoute() {
  const insets = useSafeAreaInsets();
  const testZukki = useTestZukki();
  const safeInsets = { top: insets.top, bottom: insets.bottom };

  return (
    <TestZukkiScreen
      turns={testZukki.turns}
      hasError={testZukki.hasError}
      isAsking={testZukki.isAsking}
      insets={safeInsets}
      onBack={async () => goBackOr(router, '/(tabs)/business')}
      onAsk={async (question) => testZukki.sendQuestion(question)}
      onOpenPrices={async () => router.push('/business/prices')}
      dom={domHost}
    />
  );
}

// Expo's DOM wrapper defaults to contentInsetAdjustmentBehavior "automatic", which adds the
// safe area on top of the insets the screens already pad, so the screens own the insets alone.
const domHost = { style: { flex: 1 }, contentInsetAdjustmentBehavior: 'never' } as const;
