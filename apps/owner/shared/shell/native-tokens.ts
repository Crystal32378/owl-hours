// Tokens for the few NATIVE parts of the app (tab bar, splash, status bar, native fallbacks).
// Everything drawn inside DOM screens uses Astryx's own tokens (CSS variables) instead; never import this there.
// Values mirror Astryx Neutral + the Zukki overrides in components/zukki-theme.css.

export const native = {
  color: {
    bgBody: "#f1f1f1",
    bgCard: "#ffffff",
    text: "#000000",
    textSecondary: "#474747",
    iconSecondary: "#6a6a6a",
    border: "rgba(0,0,0,0.08)",
    accent: "#0074e2",
    error: "#c9303a",
    night: "#0e1116",          // app icon / splash background
  },
  font: {                       // from @expo-google-fonts/figtree
    semibold: "Figtree_600SemiBold",
    bold: "Figtree_700Bold",
  },
  tabBar: {
    height: 64,
    iconSize: 24,
    labelSize: 12.5,
    badge: { size: 18, bg: "#c9303a", text: "#ffffff" },  // solid red count only, never a pastel chip
  },
} as const;

// Dark mode: the second value of each Astryx Neutral light-dark() pair; the Zukki blue stays.
const darkColor = {
  ...native.color,
  bgBody: "#1b1b1b",
  bgCard: "#1b1b1b",
  text: "#ffffff",
  textSecondary: "#9e9e9e",
  iconSecondary: "#9e9e9e",
  border: "#ffffff1A",
} as const;

export type NativeColors = { [K in keyof typeof native.color]: string };

// The scheme comes from React Native's useColorScheme(); unknown means light, the app default.
export function nativeColors(scheme: "light" | "dark" | null | undefined): NativeColors {
  return scheme === "dark" ? darkColor : native.color;
}
