// Visible text of the settings screen. Source:
// handoff-ui/owner-app/design/html/OwSettings.dc.html. The switch labels,
// sign out and error pair live in copys/businessCopys.ts; the time-to-accept
// and linked-accounts values are composed in lib/settingsText.ts from the
// glue words below (that file's own wording), so the composed lines stay
// byte-identical.
export const settingsCopys = {
  backLabel: "Back",
  settingsTitle: "Settings",
  requestsSection: "Requests",
  takingRequestsDesc: "Turn off when you can't take new jobs",
  // "Urgent: 5 min · other requests: 30 min. Then Zukki asks another business."
  // composed in lib/settingsText.ts around the business's own windows.
  urgentWindowWord: "Urgent:",
  otherWindowWord: "other requests:",
  afterWindowSentence: "Then Zukki asks another business.",
  notificationsSection: "Notifications",
  urgentRequestsDesc: "Loud sound and vibration",
  ringOnSilentDesc: "Only for urgent requests, 10 PM–7 AM",
  messagesSection: "Messages",
  polishDesc: "You always see and pick the version to send",
  timeToAccept: "Time to accept",
  linkedAccounts: "Linked accounts",
  minuteUnit: "min",
  connectedWord: "connected",
} as const;
