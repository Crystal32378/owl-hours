// Thin route adapter: the Business module owns the screen.
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import SettingsScreen from "../features/business/components/SettingsScreen";
import BusinessLoadError from "../features/business/components/BusinessLoadError";
import { useSettings } from "../features/business/hooks/useSettings";
import { useOwnerAuth } from "../features/auth/hooks/useOwnerAuth";
import LoadingSkeleton from '../shared/shell/LoadingSkeleton';
import { goBackOr } from '../shared/lib/goBack';

export default function SettingsRoute() {
  const insets = useSafeAreaInsets();
  const settings = useSettings();
  const auth = useOwnerAuth();
  const safeInsets = { top: insets.top, bottom: insets.bottom };

  if (settings.status === 'failed') {
    return <BusinessLoadError insets={safeInsets} onRetry={settings.retry} dom={domHost} />;
  }
  if (settings.status !== 'ready') return <LoadingSkeleton />;

  const { view } = settings;
  return (
    <SettingsScreen
      settings={view.settings}
      acceptWindowValue={view.acceptWindowValue}
      acceptWindowDetail={view.acceptWindowDetail}
      linkedAccountsValue={view.linkedAccountsValue}
      insets={safeInsets}
      onBack={async () => goBackOr(router, '/(tabs)/requests')}
      onToggleSetting={view.toggleSetting}
      onOpenAccounts={async () => router.push('/content/accounts')} // owned by the content slice
      // Live: the session ends and the auth gate opens sign-up; the demo has no session and goes to the intro.
      // A failed sign-out keeps the owner here, still signed in; the controller holds the error.
      onSignOut={async () => {
        await auth.signOut().catch(() => {});
        if (!auth.configured) router.replace('/onboarding/intro');
      }}
      dom={domHost}
    />
  );
}

// Expo's DOM wrapper defaults to contentInsetAdjustmentBehavior "automatic", which adds the
// safe area on top of the insets the screens already pad, so the screens own the insets alone.
const domHost = { style: { flex: 1 }, contentInsetAdjustmentBehavior: 'never' } as const;
