// Thin route adapter: the sign-up screen owns the form, the route owns navigation.
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import OnboardingLoadError from '../../features/onboarding/components/OnboardingLoadError';
import SignUpScreen from '../../features/onboarding/components/SignUpScreen';
import { useSignUp } from '../../features/onboarding/hooks/useSignUp';
import { useOwnerAuth } from '../../features/auth/hooks/useOwnerAuth';
import { resolveNext } from '../../features/onboarding/lib/setupSteps';
import LoadingSkeleton from '../../shared/shell/LoadingSkeleton';

export default function SignUpRoute() {
  const insets = useSafeAreaInsets();
  const signup = useSignUp();
  const { configured } = useOwnerAuth();
  const safeInsets = { top: insets.top, bottom: insets.bottom };

  if (signup.status === 'failed') {
    return <OnboardingLoadError insets={safeInsets} onRetry={signup.retry} dom={domHost} />;
  }
  if (signup.status !== 'ready') return <LoadingSkeleton />;

  const { view } = signup;
  return (
    <SignUpScreen
      defaultName={view.defaultName}
      defaultEmail={view.defaultEmail}
      insets={safeInsets}
      onSendCode={async (name, email) => {
        if (await view.submit(name, email)) router.push(resolveNext('/onboarding/sign-up', 'next'));
      }}
      onFacebook={configured ? undefined : async () => { router.push(resolveNext('/onboarding/sign-up', 'facebook')); }}
      onBack={async () => { router.back(); }}
      dom={domHost}
    />
  );
}

const domHost = { style: { flex: 1 }, contentInsetAdjustmentBehavior: 'never' } as const;
