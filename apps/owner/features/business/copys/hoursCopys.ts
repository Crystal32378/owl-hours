// Day names of the Hours row ("Mon–Sat, 8 AM–8 PM", handoff-ui/owner-app/design/html/OwBusiness.dc.html).
// Index = weekday as business_hours stores it (0 = Sunday).
export const weekdayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

// Visible text of the hours editor. The handoff has no design for it, so it follows OwPrices.
export const hoursCopys = {
  backLabel: "Back",
  title: "Hours",
  lead: "Zukki uses these to know when you're open. A shift can run past midnight.",
  closed: "Closed",
  opens: "opens",
  closes: "closes",
  invalidDay: "Opening and closing times must differ.",
  save: "Save",
  saveFailed: "Your hours weren't saved. Check your connection and try again.",
} as const;
