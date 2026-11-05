// Thin route adapter: the business screen owns the draft, the route owns navigation.
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import OnboardingLoadError from '../../features/onboarding/components/OnboardingLoadError';
import ProfileScreen from '../../features/onboarding/components/ProfileScreen';
import { useProfile } from '../../features/onboarding/hooks/useProfile';
import { resolveNext } from '../../features/onboarding/lib/setupSteps';
import LoadingSkeleton from '../../shared/shell/LoadingSkeleton';

export default function BusinessRoute() {
  const insets = useSafeAreaInsets();
  const business = useProfile();
  const safeInsets = { top: insets.top, bottom: insets.bottom };

  if (business.status === 'failed') {
    return <OnboardingLoadError insets={safeInsets} onRetry={business.retry} dom={domHost} />;
  }
  if (business.status !== 'ready') return <LoadingSkeleton />;

  const { view } = business;
  return (
    <ProfileScreen
      profile={view.profile}
      insets={safeInsets}
      onImportWebsite={view.importFromWebsite}
      onSave={async (profile) => {
        await view.saveProfile(profile);
        router.push(resolveNext('/onboarding/business', 'next'));
      }}
      onBack={async () => { router.back(); }}
      dom={domHost}
    />
  );
}

const domHost = { style: { flex: 1 }, contentInsetAdjustmentBehavior: 'never' } as const;
