// Visible text of the quote and job screens. Sources: handoff-ui/owner-app/design/html/OwQuote.dc.html,
// OwJob.dc.html and HANDOFF-RN-UI.md section 8. Copy that names the customer is a function of the
// customer's first name (and the distance), so no demo name is hardcoded.
const copys = {
  // shared
  backLabel: "Back",
  somethingWentWrong: "Something went wrong.", // HANDOFF-RN-UI.md section 8, "Every screen also needs"
  tryAgain: "Try again",
  // quote modal
  sendAQuote: "Send a quote",
  filledInByZukki: "Filled in by Zukki from your prices. Change anything.",
  estimatedTotal: "Estimated total",
  arrival: "Arrival",
  technician: "Technician",
  note: "Note",
  invalidAmountHint: "Use whole numbers above 0. The first number can't be higher than the second.",
  cancel: "Cancel",
  sendQuote: "Send quote",
  minimum: "minimum",
  maximum: "maximum",
  approvalNotice: (firstName: string) => `${firstName} approves it in WhatsApp. Nothing is booked until they do.`,
  // job detail
  jobTitleBar: "Job",
  viaZukki: "via Zukki",
  approvedBy: "Approved by",
  atTime: "at",
  map: "Map",
  change: "Change",
  quoteLabel: "Quote",
  startTrip: "Start trip",
  imHere: "I'm here",
  finish: "Finish",
  sharedAfterApproved: (firstName: string, distanceKm?: number) =>
    distanceKm === undefined ? `Shared after ${firstName} approved` : `Shared after ${firstName} approved · ${distanceKm} km`,
  // timeline rows already reached on the live API (wording of the demo seed, shared/data/mock.ts)
  youAcceptedTheRequest: "You accepted the request",
  quoteSentAndApproved: "Quote sent and approved",
  // timeline rows still ahead
  onTheWay: "On the way",
  timelineDone: "Done",
  // jobs list
  jobsTitle: "Jobs",
  tonight: "Tonight",
  upcoming: "Upcoming",
  done: "Done",
  tomorrow: "Tomorrow",
  // finish
  finishTheJob: "Finish the job",
  photos: "Photos",
  before: "Before",
  after: "After",
  addPhoto: "Add",
  total: "Total",
  sharePhotosHint: "For posts. Only used if they say yes.",
  markAsDone: "Mark as done",
  confirmFinalPrice: (firstName: string) =>
    `Confirm the final price. Zukki sends ${firstName} the receipt and asks for a review on WhatsApp.`,
  askToSharePhotos: (firstName: string) => `Ask ${firstName} to share the photos`,
  outsideEstimate: (estimate: string, firstName?: string) =>
    firstName ? `Outside the ${estimate} estimate. Tell ${firstName} why.` : `Outside the ${estimate} estimate.`,
  reasonLabel: "Why is the price different?",
  emptyTonight: "No jobs tonight.",
  emptyUpcoming: "No upcoming jobs.",
  emptyDone: "No finished jobs yet.",
  // job cards
  waitingForApproval: (firstName: string) => `Waiting for ${firstName} to approve`,
  approvedArrive: (arrival: string) => `Approved · arrive ${arrival}`,
  withinEstimate: (estimate: string) => `Within the ${estimate} estimate`,
  onSite: "On site",
};

// The index signature lets tests and tooling walk the copys by key name.
export const jobsCopys: Readonly<Record<string, string | ((...args: never[]) => string)>> & typeof copys = copys;
