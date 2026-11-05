// Native wrapper: owns data, navigation and safe areas. The DOM screen only draws. OwJob.
import { useCallback } from 'react';
import { useLocalSearchParams, router, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import JobScreen from '../../features/jobs/components/JobScreen';
import JobsLoadError from '../../features/jobs/components/JobsLoadError';
import { useJob } from '../../features/jobs/hooks/useJob';
import LoadingSkeleton from '../../shared/shell/LoadingSkeleton';
import { goBackOr } from '../../shared/lib/goBack';

export default function JobRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const job = useJob(id);
  const reload = job.status === 'ready' ? job.reload : undefined;
  useFocusEffect(useCallback(() => { reload?.(); }, [reload]));
  const safeInsets = { top: insets.top, bottom: insets.bottom };

  if (job.status === 'failed') return <JobsLoadError insets={safeInsets} onRetry={job.retry} dom={domHost} />;
  if (job.status !== 'ready') return <LoadingSkeleton />;

  return (
    <JobScreen
      job={job.job}
      insets={safeInsets}
      onAdvance={job.advance}
      onOpenFinish={async () => router.push(`/job/${id}/finish`)}
      onBack={async () => goBackOr(router, '/(tabs)/jobs')}
      dom={domHost}
    />
  );
}

// Expo's DOM wrapper defaults to contentInsetAdjustmentBehavior "automatic", which adds the
// safe area on top of the insets the screens already pad, so the screens own the insets alone.
const domHost = { style: { flex: 1 }, contentInsetAdjustmentBehavior: 'never' } as const;
