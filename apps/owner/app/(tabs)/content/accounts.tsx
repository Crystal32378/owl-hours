// Thin route adapter: Linked accounts screen. It opens Facebook Login and reads the
// ?meta=linked|error&reason=... the API's callback sends the owner back with.
import { useState } from 'react';
import { Platform } from 'react-native';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ContentLoadError from '../../../features/content/components/ContentLoadError';
import AccountsScreen from '../../../features/content/components/AccountsScreen';
import { useLinkedAccounts, type LinkedAccountsView } from '../../../features/content/hooks/useLinkedAccounts';
import { linkNotice, loginSessionNotice, type LinkNotice } from '../../../features/content/lib/linkNotice';
import LoadingSkeleton from '../../../shared/shell/LoadingSkeleton';
import { goBackOr } from '../../../shared/lib/goBack';

export default function AccountsRoute() {
  const insets = useSafeAreaInsets();
  const linked = useLinkedAccounts();
  const { meta, reason } = useLocalSearchParams<{ meta?: string; reason?: string }>();
  // What the native login session returned; the web app gets it as route params instead.
  const [sessionNotice, setSessionNotice] = useState<LinkNotice | null>(null);
  const safeInsets = { top: insets.top, bottom: insets.bottom };

  if (linked.status === 'error') {
    return <ContentLoadError insets={safeInsets} onRetry={linked.retry} dom={domHost} />;
  }

  if (linked.status !== 'ready') {
    return <LoadingSkeleton />;
  }

  const { view } = linked;
  const actionNotice: LinkNotice | null = view.actionError ? { tone: 'error', text: view.actionError } : null;

  return (
    <AccountsScreen
      accounts={view.accounts}
      canConnect={view.canConnect}
      canUnlink={view.canUnlink}
      notice={actionNotice ?? sessionNotice ?? linkNotice(meta, reason)}
      insets={safeInsets}
      onBack={async () => {
        goBackOr(router, '/(tabs)/content');
      }}
      onConnect={async () => {
        const notice = await connectWithFacebook(view);
        if (!notice) return;
        setSessionNotice(notice);
        await view.refresh();
      }}
      onUnlink={async (id) => {
        setSessionNotice(null);
        await view.unlink(id);
      }}
      onSeeDrafts={async () => {
        goBackOr(router, '/(tabs)/content');
      }}
      dom={domHost}
    />
  );
}

// The web app leaves for Facebook in the same tab and comes back to this route with route params.
// Native opens an auth session that resolves once the callback redirects to this screen's deep
// link (https://docs.expo.dev/versions/latest/sdk/webbrowser/#webbrowseropenauthsessionasyncurl-redirecturl-options);
// closing it answers cancel or dismiss, which shows nothing.
async function connectWithFacebook(view: LinkedAccountsView): Promise<LinkNotice | null> {
  if (Platform.OS === 'web') {
    const url = await view.connect('web');
    if (url) window.location.assign(url);
    return null;
  }
  const url = await view.connect('app');
  if (!url) return null;
  const result = await WebBrowser.openAuthSessionAsync(url, Linking.createURL('content/accounts'));
  return loginSessionNotice(result);
}

const domHost = { style: { flex: 1 }, contentInsetAdjustmentBehavior: 'never' } as const;
