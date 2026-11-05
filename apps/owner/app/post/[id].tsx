// Native wrapper: owns data, navigation, haptics and safe areas.
import { useLocalSearchParams, router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import ContentLoadError from '../../features/content/components/ContentLoadError';
import PostReviewScreen from '../../features/content/components/PostReviewScreen';
import { usePostReview } from '../../features/content/hooks/usePostReview';
import LoadingSkeleton from '../../shared/shell/LoadingSkeleton';
import { goBackOr } from '../../shared/lib/goBack';

export default function PostReviewRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const postReview = usePostReview(id);
  const safeInsets = { top: insets.top, bottom: insets.bottom };

  if (postReview.status === 'error') {
    return <ContentLoadError insets={safeInsets} onRetry={postReview.retry} dom={domHost} />;
  }

  if (postReview.status !== 'ready') {
    return <LoadingSkeleton />;
  }

  const { view } = postReview;

  return (
    <PostReviewScreen
      draft={view.draft}
      draftSubtitle={view.draftSubtitle}
      businessName={view.businessName}
      caption={view.caption}
      isEditingCaption={view.isEditingCaption}
      targets={view.targets}
      scheduledWhenText={view.scheduledWhenText}
      jobPhotos={view.jobPhotos}
      canApprove={view.canApprove}
      canRegenerate={view.canRegenerate}
      isPosting={view.isPosting}
      approveError={view.approveError}
      insets={safeInsets}
      onBack={async () => {
        goBackOr(router, '/(tabs)/content');
      }}
      onEditToggle={view.onToggleEditCaption}
      onCaptionChange={view.onSetCaption}
      onTargetToggle={view.onToggleTarget}
      onApprove={async () => {
        // Published only after the API confirms; a failure stays here with the API's message.
        const approved = await view.onApprove();
        if (approved) {
          await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          router.replace('/(tabs)/content');
        }
      }}
      onRegenerate={async () => {
        await view.onRegenerate();
        await Haptics.selectionAsync();
      }}
      dom={domHost}
    />
  );
}

const domHost = { style: { flex: 1 }, contentInsetAdjustmentBehavior: 'never' } as const;
