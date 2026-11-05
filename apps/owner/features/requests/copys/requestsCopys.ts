// Visible text of the request detail screen. Source: handoff-ui/owner-app/design/html/OwRequest.dc.html
// except the possible-faults section and "Photo", which the handoff does not cover (user-approved, L27).
export const requestsCopys = {
  acceptWithin: "Accept within",
  countdownLabel: "Time left to accept",
  ignoredNotice: "If you don't answer, Zukki offers the job to the next business.",
  urgent: "Urgent",
  approximateDistance: "km, approximate",
  decline: "Decline",
  acceptAndChat: "Accept and chat",
  newRequest: "New request",
  requestWord: "request", // "Plumbing request", the title of a request the customer has not described yet
  serviceRequest: "Service request",
  sentByZukki: "Sent by Zukki",
  videoFrameAlt: "Frame from the customer's video",
  photoAlt: "Photo from the customer",
  videoLabel: "Video",
  photoLabel: "Photo",
  zukkiName: "Zukki",
  possibleFaultsHeading: "Possible faults",
  likelihoodLikely: "Likely",
  likelihoodPossible: "Possible",
} as const;
