// Thin route adapter: the area screen owns the draft, the route owns navigation and
// the device location (expo-location is native, so the DOM screen only gets its result).
import * as Location from 'expo-location';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AreaScreen from '../../features/onboarding/components/AreaScreen';
import OnboardingLoadError from '../../features/onboarding/components/OnboardingLoadError';
import { useArea } from '../../features/onboarding/hooks/useArea';
import {
  canFinishArea,
  locateDevice,
  locationMessage,
  offersLocationAction,
} from '../../features/onboarding/lib/areaLocation';
import { mapCenter } from '../../features/onboarding/lib/areaMap';
import { resolveNext } from '../../features/onboarding/lib/setupSteps';
import LoadingSkeleton from '../../shared/shell/LoadingSkeleton';

export default function AreaRoute() {
  const insets = useSafeAreaInsets();
  const area = useArea(locateWithExpo);
  const safeInsets = { top: insets.top, bottom: insets.bottom };

  if (area.status === 'failed') {
    return <OnboardingLoadError insets={safeInsets} onRetry={area.retry} dom={domHost} />;
  }
  if (area.status !== 'ready') return <LoadingSkeleton />;

  const { view } = area;
  return (
    <AreaScreen
      radiusKm={view.radiusKm}
      nightUrgent={view.nightUrgent}
      hoursSummary={view.hoursSummary}
      mapCenter={mapCenter(view.location.status, view.center)}
      offersLocation={offersLocationAction(view.location.status)}
      locationMessage={locationMessage(view.location)}
      isFinishDisabled={view.isLocating || !canFinishArea(view.location.status)}
      onUseLocation={view.saveDeviceLocation}
      onMoveLocation={view.moveLocation}
      insets={safeInsets}
      onFinish={async (radiusKm, nightUrgent) => {
        await view.finish(radiusKm, nightUrgent);
        router.push(resolveNext('/onboarding/area', 'next'));
      }}
      onBack={async () => { router.back(); }}
      dom={domHost}
    />
  );
}

// Foreground permission and one position read (https://docs.expo.dev/versions/latest/sdk/location/).
function locateWithExpo() {
  return locateDevice({
    requestPermission: Location.requestForegroundPermissionsAsync,
    currentPosition: Location.getCurrentPositionAsync,
  });
}

const domHost = { style: { flex: 1 }, contentInsetAdjustmentBehavior: 'never' } as const;
