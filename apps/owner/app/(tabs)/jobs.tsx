// Thin route adapter: the Jobs module owns the screen. OwJobs.
import { useCallback } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import JobsLoadError from '../../features/jobs/components/JobsLoadError';
import JobsScreen from '../../features/jobs/components/JobsScreen';
import { useJobs } from '../../features/jobs/hooks/useJobs';
import LoadingSkeleton from '../../shared/shell/LoadingSkeleton';

export default function JobsRoute() {
  const insets = useSafeAreaInsets();
  const jobs = useJobs();
  const { reload } = jobs;
  const safeInsets = { top: insets.top, bottom: insets.bottom };
  useFocusEffect(useCallback(() => { reload(); }, [reload]));
  if (jobs.status === 'failed') return <JobsLoadError insets={safeInsets} onRetry={async () => reload()} dom={domHost} />;
  if (jobs.status !== 'ready') return <LoadingSkeleton />;

  return (
    <JobsScreen
      jobs={jobs.jobs}
      insets={safeInsets}
      onOpenJob={async (id) => router.push(`/job/${id}`)}
      dom={domHost}
    />
  );
}

// Expo's DOM wrapper defaults to contentInsetAdjustmentBehavior "automatic", which adds the
// safe area on top of the insets the screens already pad, so the screens own the insets alone.
const domHost = { style: { flex: 1 }, contentInsetAdjustmentBehavior: 'never' } as const;
