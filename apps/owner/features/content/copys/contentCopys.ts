// Visible text of the Content screens (OwContent, OwPostReview, OwAccounts).
// Sources: handoff-ui/owner-app/design/html/{OwContent,OwPostReview,OwAccounts}.dc.html

export const contentCopys = {
  // Verbatim strings required by tests and screens
  madeFromJobsAndPrices: "Made from your jobs and prices",
  approveAndPost: "Approve and post",
  postFailed: "The post could not be published. Try again.",
  regenerate: "Regenerate",
  edit: "Edit",
  seeTodaysDrafts: "See today's drafts",
  whatZukkiCanDo: "What Zukki can do",
  somethingWentWrong: "Something went wrong.",
  tryAgain: "Try again",
  when: "When",

  // Content screen (OwContent)
  contentTitle: "Content",
  accountsCardTitle: "Facebook Page and Instagram",
  connected: "Connected",
  manage: "Manage",
  review: "Review",
  published: "Published",
  emptyDrafts: "No drafts for you right now.",
  priceTileLeak: "Leak",
  priceTileFrom60: "from $60",

  // Post review screen (OwPostReview)
  reviewPost: "Review post",
  backLabel: "Back",
  preview: "Preview",
  facebookPage: "Facebook Page",
  instagramProfessional: "Instagram (professional)",
  before: "Before",
  after: "After",

  // Linked accounts screen (OwAccounts)
  linkedAccounts: "Linked accounts",
  linkedAccountsSubtitle: "For the posts Zukki drafts",
  instagram: "Instagram",
  canDoDrafts: "Draft posts from your finished jobs and your prices",
  canDoTiming: "Suggest the best day and time to post",
  cannotPublish: "Publish anything without your approval",
  connectFacebookInstagram: "Connect Facebook and Instagram",
  noLinkedAccounts: "No Facebook Page or Instagram account is connected yet.",
  linkNotices: {
    linked: "Facebook and Instagram are connected.",
    denied: "Facebook Login was cancelled. Nothing was connected.",
    no_pages: "No Facebook Page was shared. Connect again and choose your business Page.",
    forbidden: "Only the business owner can connect accounts.",
    invalid_state: "The connection expired. Try again.",
    failed: "Facebook could not connect. Try again.",
  },

  // Account kinds map
  accountLabels: {
    facebook_page: "Facebook Page",
    instagram: "Instagram",
  } as const,

  // Templates
  draftsForYou: (count: number) => `Drafts for you · ${count}`,
  draftSubtitle: (index: number, total: number = index, source: string = "") =>
    source ? `Draft ${index} of ${total} · ${source}` : `Draft ${index} of ${total}`,
  jobDraftSubtitle: (firstName: string | number) =>
    `Made from last night's job · ${firstName} agreed to share`,
  theCustomer: "The customer",
  photoConsentLine: (firstName: string | number) =>
    `Image made from your job photos. ${firstName} agreed to share them.`,

  // Source lines
  sourceLine: {
    job: "made from last night's job",
    prices: "From your price list",
    reminder: "Reminder of your night service and fee",
  },
};
