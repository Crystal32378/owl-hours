// Native wrapper: owns data, navigation and safe areas. The DOM screen only draws. OwJobDone.
import { useLocalSearchParams, router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import FinishScreen from '../../../features/jobs/components/FinishScreen';
import { useFinishJob } from '../../../features/jobs/hooks/useFinishJob';
import LoadingSkeleton from '../../../shared/shell/LoadingSkeleton';
import { goBackOr } from '../../../shared/lib/goBack';

export default function JobFinishRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const finish = useFinishJob(id);
  if (!finish) return <LoadingSkeleton />;

  return (
    <FinishScreen
      title={finish.title}
      customerName={finish.customerName}
      customerFirstName={finish.customerFirstName}
      lines={finish.lines}
      estimate={finish.estimate}
      photos={finish.photos}
      insets={{ top: insets.top, bottom: insets.bottom }}
      onFinish={async (input) => {
        const isFinished = await finish.finish(input);
        if (isFinished) router.dismissTo('/(tabs)/jobs');
        return isFinished;
      }}
      onBack={async () => goBackOr(router, `/job/${id}`)}
      dom={domHost}
    />
  );
}

// Expo's DOM wrapper defaults to contentInsetAdjustmentBehavior "automatic", which adds the
// safe area on top of the insets the screens already pad, so the screens own the insets alone.
const domHost = { style: { flex: 1 }, contentInsetAdjustmentBehavior: 'never' } as const;
