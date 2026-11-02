// Demo data. These numbers appear in the pitch video and the designs: keep them identical.
import type { Business, Conversation, Job, LinkedAccount, Owner, PostDraft, RequestOffer } from "./types";

// Fixed "now" for the demo so countdowns and times match the designs (12:05 AM, 4:32 left).
export const DEMO_NOW = "2026-10-28T00:05:28-05:00";

export const owner: Owner = { id: "own_1", name: "Daniel Ruiz", phone: "+1 555 014 2290" };

export const business: Business = {
  id: "biz_northside",
  name: "Northside Plumbing",
  category: "plumbing",
  logoUrl: "logo-northside",
  website: "northside-plumbing.example",
  rating: { value: 4.9, count: 128 },
  technicians: 2,
  prices: [
    { id: "p1", label: "Visit", amount: 45, from: false },
    { id: "p2", label: "Leak repair", amount: 60, from: true },
    { id: "p3", label: "Unclog a drain", amount: 80, from: true },
    { id: "p4", label: "Water heater install", amount: 350, from: true },
  ],
  fees: [
    { id: "f1", label: "Night", amount: 25, window: "10 PM–7 AM" },
    { id: "f2", label: "Weekend", amount: 15 },
    { id: "f3", label: "Parts", amount: "at_cost" },
  ],
  hours: { summary: "Mon–Sat, 8 AM–8 PM", nightUrgent: true },
  area: { center: { lat: 0, lng: 0 }, radiusKm: 5 },
  takingRequests: true,
  acceptWindowMin: { urgent: 5, other: 30 },
};

export const offers: RequestOffer[] = [
  {
    id: "req_ana",
    customerName: "Ana L.",
    title: "Leaking toilet, water reaching the hallway",
    urgent: true,
    distanceKm: 1.2,
    approxLocation: "1.2 km, approximate",
    media: [{ kind: "video", url: "bath-leak-video", thumbUrl: "bath-leak", durationS: 14 }],
    customerQuote: "The toilet won't stop running and water is reaching the hallway.",
    zukkiSummary: "Valve closed, no cables near the water. Likely a worn fill valve. From your prices: $130–160.",
    possibleFaults: [
      { label: "Worn fill valve", likelihood: "likely" },
      { label: "Flapper not sealing", likelihood: "possible" },
      { label: "Float set too high", likelihood: "possible" },
    ],
    suggestedQuote: { min: 130, max: 160 },
    offeredAt: "2026-10-28T00:05:00-05:00",
    expiresAt: "2026-10-28T00:10:00-05:00",
    status: "offered",
  },
  { id: "req_carlos", customerName: "Carlos M.", title: "Kitchen sink clogged", urgent: false, distanceKm: 2.0, approxLocation: "2.0 km", media: [], zukkiSummary: "", suggestedQuote: { min: 80, max: 110 }, offeredAt: "2026-10-27T21:40:00-05:00", expiresAt: "2026-10-27T21:45:00-05:00", status: "accepted" },
  { id: "req_grace", customerName: "Grace K.", title: "Water heater quote", urgent: false, distanceKm: 3.1, approxLocation: "3.1 km", media: [], zukkiSummary: "", suggestedQuote: { min: 350, max: 420 }, offeredAt: "2026-10-27T20:10:00-05:00", expiresAt: "2026-10-27T20:15:00-05:00", status: "expired" },
  { id: "req_tom", customerName: "Tom B.", title: "Shower leak", urgent: false, distanceKm: 6.4, approxLocation: "6.4 km", media: [], zukkiSummary: "", suggestedQuote: { min: 60, max: 90 }, offeredAt: "2026-10-27T19:30:00-05:00", expiresAt: "2026-10-27T19:35:00-05:00", status: "declined" },
];

// Owner chat: option A (as written) vs option B (polished by Zukki)
export const OWNER_TEXT = "ok mario there 12:55, bringing the valve. 45 visit + 25 night, repair 60-90";
export const POLISHED_TEXT =
  "Hi Ana, Mario can be there at 12:55 AM and he's bringing a new fill valve. The visit is $45 plus a $25 night fee, and the repair should be $60–90.";

export const conversations: Conversation[] = [
  { id: "c_ana", offerId: "req_ana", customerName: "Ana L.", jobTitle: "Leaking toilet", statusLine: "visit 12:55 AM", unread: 0,
    lastMessage: { id: "m5", from: "customer", text: "Perfect, thank you!", sentAt: "2026-10-28T00:07:00-05:00" } },
  { id: "c_carlos", offerId: "req_carlos", customerName: "Carlos M.", jobTitle: "Kitchen sink", statusLine: "waiting for you", unread: 2,
    lastMessage: { id: "m9", from: "customer", text: "Can you come Thursday instead?", sentAt: "2026-10-27T21:48:00-05:00" } },
  { id: "c_lucia", offerId: "req_lucia", customerName: "Lucía R.", jobTitle: "Water heater", statusLine: "quote sent", unread: 0,
    lastMessage: { id: "m12", from: "customer", text: "Thanks for the quote, I'll let you know", sentAt: "2026-10-26T18:00:00-05:00" } },
  { id: "c_grace", offerId: "req_grace2", customerName: "Grace K.", jobTitle: "Shower valve", statusLine: "done", unread: 0,
    lastMessage: { id: "m20", from: "owner", text: "Mario can come at 10 AM", sentAt: "2026-10-26T09:00:00-05:00", delivery: "as_written" } },
];

export const anaMessages = [
  { id: "m1", from: "zukki", text: "Leaking toilet · valve closed · likely fill valve · suggested quote $130–160", sentAt: "2026-10-28T00:05:00-05:00" },
  { id: "m2", from: "customer", text: "Hi, is someone coming tonight?", sentAt: "2026-10-28T00:06:00-05:00" },
] as const;

export const anaJob: Job = {
  id: "job_ana",
  conversationId: "c_ana",
  title: "Leaking toilet",
  customerName: "Ana L.",
  technician: "Mario R.",
  address: "128 Palm Ave, apt 4",
  distanceKm: 1.2,
  approvedAt: "2026-10-28T00:07:00-05:00",
  quote: {
    lines: [
      { label: "Visit", amount: 45 },
      { label: "Night fee", amount: 25 },
      { label: "Fill valve repair", amount: { min: 60, max: 90 } },
    ],
    total: { min: 130, max: 160 },
    arrival: { from: "12:55 AM", to: "1:25 AM" },
    technician: "Mario R.",
    note: "Excludes floor damage",
  },
  finalTotal: 145,
  status: "customer_approved",
  timeline: [
    { at: "2026-10-28T00:04:00-05:00", text: "Ana asked Zukki for help" },
    { at: "2026-10-28T00:05:00-05:00", text: "You accepted the request" },
    { at: "2026-10-28T00:07:00-05:00", text: "Quote sent and approved" },
  ],
  photos: { before: "bath-leak", after: "bath-fixed", extra: [] },
  shareConsent: "yes",
};

// The design's other jobs (OwJobs): Carlos waits to approve, Lucía and Grace are booked for tomorrow.
export const carlosJob: Job = {
  id: "job_carlos",
  conversationId: "c_carlos",
  title: "Kitchen sink clogged",
  customerName: "Carlos M.",
  technician: "Mario R.",
  distanceKm: 2.0,
  quote: {
    lines: [
      { label: "Unclog a drain", amount: { min: 80, max: 110 } },
    ],
    total: { min: 80, max: 110 },
    arrival: { from: "12:40 AM", to: "1:10 AM" },
    technician: "Mario R.",
  },
  status: "quoted",
  timeline: [
    { at: "2026-10-27T21:40:00-05:00", text: "Carlos asked Zukki for help" },
    { at: "2026-10-27T21:44:00-05:00", text: "You accepted the request" },
    { at: "2026-10-27T21:46:00-05:00", text: "Quote sent" },
  ],
  photos: { extra: [] },
  shareConsent: "not_asked",
};

export const luciaJob: Job = {
  id: "job_lucia",
  conversationId: "c_lucia",
  title: "Water heater install",
  customerName: "Lucía R.",
  technician: "Mario R.",
  address: "42 Palm Ave, house",
  distanceKm: 3.4,
  approvedAt: "2026-10-26T18:20:00-05:00",
  scheduledFor: "2026-10-29T10:00:00-05:00",
  quote: {
    lines: [
      { label: "Water heater install", amount: { min: 350, max: 420 } },
    ],
    total: { min: 350, max: 420 },
    arrival: { from: "10:00 AM", to: "10:30 AM" },
    technician: "Mario R.",
  },
  status: "customer_approved",
  timeline: [
    { at: "2026-10-26T17:40:00-05:00", text: "Lucía asked Zukki for help" },
    { at: "2026-10-26T17:52:00-05:00", text: "You accepted the request" },
    { at: "2026-10-26T18:20:00-05:00", text: "Quote sent and approved" },
  ],
  photos: { extra: [] },
  shareConsent: "not_asked",
};

export const graceJob: Job = {
  id: "job_grace",
  conversationId: "c_grace",
  title: "Shower valve check",
  customerName: "Grace K.",
  technician: "Mario R.",
  address: "9 Palm Ave, apt 1",
  distanceKm: 3.1,
  approvedAt: "2026-10-26T09:20:00-05:00",
  scheduledFor: "2026-10-29T14:30:00-05:00",
  quote: {
    lines: [
      { label: "Shower valve check", amount: { min: 60, max: 90 } },
    ],
    total: { min: 60, max: 90 },
    arrival: { from: "2:30 PM", to: "3:00 PM" },
    technician: "Mario R.",
  },
  status: "customer_approved",
  timeline: [
    { at: "2026-10-26T08:40:00-05:00", text: "Grace asked Zukki for help" },
    { at: "2026-10-26T08:55:00-05:00", text: "You accepted the request" },
    { at: "2026-10-26T09:20:00-05:00", text: "Quote sent and approved" },
  ],
  photos: { extra: [] },
  shareConsent: "not_asked",
};

// What Regenerate offers in the demo, by draft.
export const regeneratedCaptions: Record<string, string> = {
  post_91: "Fixed in 91 minutes, in the middle of the night. If water reaches your floor, message us through Zukki.",
  post_night: "Plumbing problems don't wait for morning. Message Northside Plumbing through Zukki, day or night.",
  post_price: "Dripping pipe? Northside Plumbing fixes leaks from $60. Send a photo through Zukki and get a quote.",
};

export const drafts: PostDraft[] = [
  { id: "post_91", title: "Fixed in 91 minutes", source: "job", sourceJobId: "job_ana", imageUrl: "before-after",
    caption: "Water on the floor at midnight? Message us through Zukki. We reply in minutes and come the same night.",
    targets: { facebook: true, instagram: true }, scheduledFor: "2026-10-28T18:00:00-05:00", status: "draft" },
  { id: "post_night", title: "We answer at night", source: "reminder", caption: "Pipe burst at 2 AM? Northside Plumbing answers at night through Zukki. The night fee is $25, and you see the price before we come.", targets: { facebook: true, instagram: true }, status: "draft" },
  { id: "post_price", title: "Leak repair from $60", source: "prices", caption: "A small leak gets expensive fast. Leak repair starts at $60, with a clear quote before we begin.", targets: { facebook: true, instagram: false }, status: "draft" },
];

export const accounts: LinkedAccount[] = [
  { kind: "facebook_page", name: "Northside Plumbing", status: "connected" },
  { kind: "instagram", name: "@northsideplumbing (professional)", status: "connected" },
];
