// Thin route adapter: Linked accounts screen. It opens Facebook Login and reads the
// ?meta=linked|error&reason=... the API's callback sends the owner back with.
import { Linking, Platform } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ContentLoadError from '../../../features/content/components/ContentLoadError';
import AccountsScreen from '../../../features/content/components/AccountsScreen';
import { useLinkedAccounts } from '../../../features/content/hooks/useLinkedAccounts';
import { linkNotice } from '../../../features/content/lib/linkNotice';
import LoadingSkeleton from '../../../shared/shell/LoadingSkeleton';

export default function AccountsRoute() {
  const insets = useSafeAreaInsets();
  const linked = useLinkedAccounts();
  const { meta, reason } = useLocalSearchParams<{ meta?: string; reason?: string }>();
  const safeInsets = { top: insets.top, bottom: insets.bottom };

  if (linked.status === 'error') {
    return <ContentLoadError insets={safeInsets} onRetry={linked.retry} dom={domHost} />;
  }

  if (linked.status !== 'ready') {
    return <LoadingSkeleton />;
  }

  const { view } = linked;

  return (
    <AccountsScreen
      accounts={view.accounts}
      canConnect={view.canConnect}
      notice={view.connectError ? { tone: 'error', text: view.connectError } : linkNotice(meta, reason)}
      insets={safeInsets}
      onBack={async () => {
        router.back();
      }}
      onConnect={async () => {
        const url = await view.connect();
        if (url) await openLogin(url);
      }}
      onSeeDrafts={async () => {
        router.back();
      }}
      dom={domHost}
    />
  );
}

// The web app leaves for Facebook in the same tab and comes back to this route; native opens the
// system browser (React Native Linking, https://reactnative.dev/docs/linking), which needs no new
// native module in the build.
async function openLogin(url: string): Promise<void> {
  if (Platform.OS === 'web') {
    window.location.assign(url);
    return;
  }
  await Linking.openURL(url);
}

const domHost = { style: { flex: 1 }, contentInsetAdjustmentBehavior: 'never' } as const;
