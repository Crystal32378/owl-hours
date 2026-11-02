// Visible text of the business profile screen. Sources:
// handoff-ui/owner-app/design/html/OwBusiness.dc.html, except the footnote and
// the error pair, which come from handoff-ui/owner-app/HANDOFF-RN-UI.md.
// The switch labels, sign out and error pair are shared with OwSettings.
// The glue words below are that file's own wording, owned here so lib/
// (which imports this module like requests/lib/mediaAltText.ts does) holds no
// visible strings; row composition in lib/businessRows.ts stays byte-identical.
export const businessCopys = {
  businessHeading: "What Zukki knows about your business",
  businessFootnote: "Zukki uses this to answer customers. Other businesses never see your chats.",
  testZukki: "Test Zukki",
  testZukkiSubtitle: "How Zukki answers about you",
  settingsLabel: "Settings",
  profileRow: "Profile",
  pricesRow: "Prices",
  extraFeesRow: "Extra fees",
  hoursRow: "Hours",
  serviceAreaRow: "Service area",
  serviceAreaMapLabel: "Map of your service area",
  websiteRow: "Website",
  takingRequestsNow: "Taking requests now",
  urgentRequests: "Urgent requests",
  ringOnSilentAtNight: "Ring on silent at night",
  polishByDefault: "Polish with Zukki by default",
  signOut: "Sign out",
  errorTitle: "Something went wrong.",
  errorRetry: "Try again",
  ratingWord: "rating",
  techniciansWord: "technicians",
  tradePlumber: "Plumber",
  fromWord: "from",
  atCost: "at cost",
  nightUrgent: "urgent jobs at night",
  servicesImported: "services imported",
  areaAround: "km around",
} as const;
