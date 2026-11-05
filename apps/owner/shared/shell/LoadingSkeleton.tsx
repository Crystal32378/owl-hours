// Native loading placeholder for routes whose DOM screen is waiting on the API.
// Native on purpose: a 'use dom' placeholder would boot its own WebView and appear about
// when the data does. Static blocks, no shimmer, and nothing for the first 300 ms so a
// fast load never flashes (design rule: Skeleton without shimmer, or nothing under 300 ms).
import { useEffect, useState } from 'react';
import { StyleSheet, View, useColorScheme } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { nativeColors } from './native-tokens';

const SHOW_AFTER_MS = 300;
const ROWS = 4;
const LOADING_LABEL = 'Loading';

export default function LoadingSkeleton() {
  const insets = useSafeAreaInsets();
  const isVisible = useVisibleAfter(SHOW_AFTER_MS);
  const colors = nativeColors(useColorScheme());
  const block = { backgroundColor: colors.border };

  return (
    <View
      style={[styles.page, { paddingTop: insets.top + 16, paddingBottom: insets.bottom, backgroundColor: colors.bgBody }]}
      accessibilityRole="progressbar"
      accessibilityLabel={LOADING_LABEL}
    >
      {isVisible && (
        <>
          <View style={[styles.block, block, styles.title]} />
          <View style={[styles.card, { backgroundColor: colors.bgCard }]}>
            {Array.from({ length: ROWS }, (_, row) => (
              <View key={row} style={styles.row}>
                <View style={[styles.block, block, styles.rowLine]} />
                <View style={[styles.block, block, styles.rowLineShort]} />
              </View>
            ))}
          </View>
        </>
      )}
    </View>
  );
}

function useVisibleAfter(delayMs: number): boolean {
  const [isVisible, setVisible] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setVisible(true), delayMs);
    return () => clearTimeout(timer);
  }, [delayMs]);

  return isVisible;
}

const styles = StyleSheet.create({
  page: { flex: 1, paddingHorizontal: 16, gap: 16 },
  block: { borderRadius: 8 },
  title: { height: 28, width: '55%' },
  card: { borderRadius: 12, paddingHorizontal: 16 },
  row: { paddingVertical: 16, gap: 8 },
  rowLine: { height: 16, width: '70%' },
  rowLineShort: { height: 12, width: '40%' },
});
