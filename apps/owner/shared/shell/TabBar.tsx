// Native tab bar. The only custom chrome in the shell: everything inside a
// screen is drawn by DOM/Astryx. Spec: handoff §8, "Tab shell".
import type { ComponentType } from "react";
import { Pressable, StyleSheet, Text, View, useColorScheme } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { BottomTabBarProps } from "expo-router/tabs";
import { Inbox, MessageCircle, Wrench, LayoutGrid, Store } from "lucide-react-native";
import { native, nativeColors } from "./native-tokens";
import type { TabBadges } from "./tabBadges";

type IconProps = { size?: number | string; color?: string };

export const TABS: { name: string; label: string; Icon: ComponentType<IconProps> }[] = [
  { name: "requests", label: "Requests", Icon: Inbox },
  { name: "chats", label: "Chats", Icon: MessageCircle },
  { name: "jobs", label: "Jobs", Icon: Wrench },
  { name: "content", label: "Content", Icon: LayoutGrid },
  { name: "business/index", label: "Business", Icon: Store },
];

export function TabBar({ state, emitter, navigateToTab, badges }: BottomTabBarProps & { badges: TabBadges }) {
  const insets = useSafeAreaInsets();
  const colors = nativeColors(useColorScheme());
  const ordered = TABS.filter((tab) => state.routes.some((route) => route.name === tab.name));
  return (
    <View style={[styles.bar, { paddingBottom: insets.bottom, backgroundColor: colors.bgCard, borderTopColor: colors.border }]}>
      {ordered.map((tab) => {
        const route = state.routes.find((candidate) => candidate.name === tab.name)!;
        const focused = state.index === state.routes.indexOf(route);
        const badge = badgeFor(tab.name, badges);
        const color = focused ? colors.accent : colors.iconSecondary;
        return (
          <Pressable
            key={tab.name}
            accessibilityRole="button"
            accessibilityState={{ selected: focused }}
            onPress={() => {
              const event = emitter.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
              if (!focused && !event.defaultPrevented) navigateToTab(route.key);
            }}
            style={styles.item}
          >
            <View>
              <tab.Icon size={native.tabBar.iconSize} color={color} />
              {badge > 0 && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{badge}</Text>
                </View>
              )}
            </View>
            <Text style={[styles.label, { color, fontWeight: focused ? "700" : "600" }]}>{tab.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function badgeFor(name: string, badges: TabBadges): number {
  if (name === "requests") return badges.requests;
  if (name === "chats") return badges.chats;
  return 0;
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    height: native.tabBar.height,
    borderTopWidth: 1,
  },
  item: { flex: 1, alignItems: "center", justifyContent: "center", gap: 2, minHeight: 44 },
  label: { fontSize: native.tabBar.labelSize, fontFamily: native.font.semibold },
  badge: {
    position: "absolute",
    top: -4,
    right: -10,
    minWidth: native.tabBar.badge.size,
    height: native.tabBar.badge.size,
    borderRadius: native.tabBar.badge.size / 2,
    backgroundColor: native.tabBar.badge.bg,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  badgeText: { color: native.tabBar.badge.text, fontSize: 11, fontWeight: "700" },
});
