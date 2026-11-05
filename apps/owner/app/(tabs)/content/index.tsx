// Thin route adapter: Content module owns the screen.
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ContentLoadError from '../../../features/content/components/ContentLoadError';
import ContentScreen from '../../../features/content/components/ContentScreen';
import { useContent } from '../../../features/content/hooks/useContent';
import LoadingSkeleton from '../../../shared/shell/LoadingSkeleton';

export default function ContentRoute() {
  const insets = useSafeAreaInsets();
  const content = useContent();
  const safeInsets = { top: insets.top, bottom: insets.bottom };

  if (content.status === 'error') {
    return <ContentLoadError insets={safeInsets} onRetry={content.retry} dom={domHost} />;
  }

  if (content.status !== 'ready') {
    return <LoadingSkeleton />;
  }

  const { view } = content;

  return (
    <ContentScreen
      accountsSummary={view.accountsSummary}
      drafts={view.drafts}
      published={view.published}
      insets={safeInsets}
      onManageAccounts={async () => {
        router.push('/(tabs)/content/accounts');
      }}
      onReviewDraft={async (id: string) => {
        router.push({ pathname: '/post/[id]', params: { id } });
      }}
      dom={domHost}
    />
  );
}

const domHost = { style: { flex: 1 }, contentInsetAdjustmentBehavior: 'never' } as const;
