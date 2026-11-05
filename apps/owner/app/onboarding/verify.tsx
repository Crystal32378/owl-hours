// Thin route adapter: the verify screen owns the code entry, the route owns navigation.
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import OnboardingLoadError from '../../features/onboarding/components/OnboardingLoadError';
import VerifyScreen from '../../features/onboarding/components/VerifyScreen';
import { useVerify } from '../../features/onboarding/hooks/useVerify';
import { resolveNext } from '../../features/onboarding/lib/setupSteps';
import LoadingSkeleton from '../../shared/shell/LoadingSkeleton';

export default function VerifyRoute() {
  const insets = useSafeAreaInsets();
  const verification = useVerify();
  const safeInsets = { top: insets.top, bottom: insets.bottom };

  if (verification.status === 'failed') {
    return <OnboardingLoadError insets={safeInsets} onRetry={verification.retry} dom={domHost} />;
  }
  if (verification.status !== 'ready') return <LoadingSkeleton />;

  const { view } = verification;
  return (
    <VerifyScreen
      email={view.email}
      resend={view.resend}
      insets={safeInsets}
      onVerify={async (code) => {
        const outcome = await view.verify(code);
        if (outcome.kind === 'verified') router.push(resolveNext('/onboarding/verify', 'next'));
        return outcome;
      }}
      onResend={view.resendCode}
      onChangeEmail={async () => { router.back(); }}
      onBack={async () => { router.back(); }}
      dom={domHost}
    />
  );
}

const domHost = { style: { flex: 1 }, contentInsetAdjustmentBehavior: 'never' } as const;
