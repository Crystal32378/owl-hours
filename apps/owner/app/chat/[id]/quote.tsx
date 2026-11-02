// Native wrapper: owns data, navigation and safe areas. The DOM screen only draws.
// Presented as a modal (declared in app/_layout.tsx); OwQuote.
import { useLocalSearchParams, router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import JobsLoadError from '../../../features/jobs/components/JobsLoadError';
import QuoteScreen from '../../../features/jobs/components/QuoteScreen';
import { useQuoteDraft } from '../../../features/jobs/hooks/useQuoteDraft';
import LoadingSkeleton from '../../../shared/shell/LoadingSkeleton';
import { goBackOr } from '../../../shared/lib/goBack';

export default function QuoteRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const draft = useQuoteDraft(id);
  const safeInsets = { top: insets.top, bottom: insets.bottom };

  if (draft.status === 'failed') return <JobsLoadError insets={safeInsets} onRetry={draft.retry} dom={domHost} />;
  if (draft.status !== 'ready') return <LoadingSkeleton />;

  return (
    <QuoteScreen
      title={draft.title}
      customerName={draft.customerName}
      customerFirstName={draft.customerFirstName}
      lines={draft.lines}
      arrivalText={draft.arrivalText}
      technician={draft.technician}
      note={draft.note}
      insets={safeInsets}
      onSend={async (lines) => {
        const isSent = await draft.send(lines);
        if (isSent) goBackOr(router, `/chat/${id}`);
        return isSent;
      }}
      onCancel={async () => goBackOr(router, `/chat/${id}`)}
      dom={domHost}
    />
  );
}

// Expo's DOM wrapper defaults to contentInsetAdjustmentBehavior "automatic", which adds the
// safe area on top of the insets the screens already pad, so the screens own the insets alone.
const domHost = { style: { flex: 1 }, contentInsetAdjustmentBehavior: 'never' } as const;
