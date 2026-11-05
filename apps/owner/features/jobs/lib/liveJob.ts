import type { ISODate, Job, JobStatus, MoneyRange, Quote, QuoteLine, TimelineEvent } from "../../../shared/data/types.ts";
import { jobsCopys } from "../copys/jobsCopys.ts";
import { localIsoString } from "../../../shared/lib/localIsoString.ts";
import { arrivalInstants, localClockText } from "./localTime.ts";

// One `owner_jobs` item (supabase/migrations/20261028121212_api_layer.sql), as GET /jobs answers it.
export type ApiJobState =
  | "requested" | "triaged" | "proposed" | "owner_confirmed" | "customer_approved"
  | "en_route" | "on_site" | "done" | "declined" | "cancelled";
export type ApiQuoteLine = { label: string; min: number; max: number };
export type ApiJob = {
  id: string;
  conversationId: string;
  title: string;
  state: ApiJobState;
  customerName: string | null;
  technician: string | null;
  total: MoneyRange | null; // the offer's suggested range until a quote is sent
  finalTotal: number | null;
  location: { address: string | null } | null;
  quote: { lines: ApiQuoteLine[]; total: MoneyRange; arrivalFrom: ISODate; arrivalTo: ISODate; note: string | null } | null;
  shareConsent: Job["shareConsent"];
  timeline: Array<{ at: ISODate; to: ApiJobState }>;
};

// POST /jobs/:id/quote (apps/api/src/routes/v1-owner.ts quoteBody); the server fills the technician.
export type ApiQuoteBody = { lines: ApiQuoteLine[]; arrivalFrom: ISODate; arrivalTo: ISODate; note?: string };

// The owner only works jobs from proposal to done. Earlier states are still Zukki's, and declined or
// cancelled jobs have no screen in the app, so those answer null and stay out of the lists.
const MINUTE_MS = 60_000;
const QUARTER_HOUR_MS = 15 * MINUTE_MS;

const STATUS_BY_STATE: Partial<Record<ApiJobState, JobStatus>> = {
  proposed: "quoted",
  owner_confirmed: "owner_confirmed",
  customer_approved: "customer_approved",
  en_route: "en_route",
  on_site: "on_site",
  done: "done",
};

// The timeline rows the app writes for the states a job has reached; the other moves are not shown.
const TIMELINE_TEXT_BY_STATE: Partial<Record<ApiJobState, string>> = {
  proposed: jobsCopys.youAcceptedTheRequest,
  customer_approved: jobsCopys.quoteSentAndApproved,
  en_route: jobsCopys.onTheWay,
  done: jobsCopys.timelineDone,
};

// `now` places the arrival window of a draft seeded for a job without a quote.
export function jobFromApi(apiJob: ApiJob, now: Date): Job | null {
  const status = STATUS_BY_STATE[apiJob.state];
  if (!status) return null;

  const technician = apiJob.technician ?? "";
  const address = apiJob.location?.address;
  const approvedAt = apiJob.timeline.find((event) => event.to === "customer_approved")?.at;
  return {
    id: apiJob.id,
    conversationId: apiJob.conversationId,
    title: apiJob.title,
    customerName: apiJob.customerName ?? "",
    technician,
    ...(address ? { address } : {}),
    ...(approvedAt ? { approvedAt: localIsoString(new Date(approvedAt)) } : {}),
    quote: apiJob.quote ? quoteFromApi(apiJob.quote, technician) : seededQuote(apiJob, technician, now),
    ...(apiJob.finalTotal === null ? {} : { finalTotal: apiJob.finalTotal }),
    status,
    timeline: timelineFromApi(apiJob.timeline),
    photos: { extra: [] },
    shareConsent: apiJob.shareConsent,
  };
}

// The quote the app sends; null when the arrival window is not two display times.
export function quoteBodyFor(quote: Quote, day: Date): ApiQuoteBody | null {
  const arrival = arrivalInstants(quote.arrival, day);
  if (!arrival) return null;

  return {
    lines: quote.lines.map(apiLineFor),
    arrivalFrom: arrival.from,
    arrivalTo: arrival.to,
    ...(quote.note ? { note: quote.note } : {}),
  };
}

// The audit reason the API requires on every owner move; finishing keeps the final price and its reason,
// which the API has no other field for.
export function transitionReasonFor(job: Job): string {
  if (job.status !== "done" || job.finalTotal === undefined) return `Owner moved the job to ${job.status} in the app`;

  const finished = `Finished at $${job.finalTotal}`;
  return job.finalPriceReason ? `${finished}: ${job.finalPriceReason}` : finished;
}

function quoteFromApi(quote: NonNullable<ApiJob["quote"]>, technician: string): Quote {
  return {
    lines: quote.lines.map(lineFromApi),
    total: quote.total,
    arrival: { from: localClockText(quote.arrivalFrom) ?? "", to: localClockText(quote.arrivalTo) ?? "" },
    technician,
    ...(quote.note ? { note: quote.note } : {}),
  };
}

// A job just accepted has no quote yet: the draft is one line named after the job at the offer's
// suggested range (zero when there is none, which the owner must fill in before sending).
function seededQuote(apiJob: ApiJob, technician: string, now: Date): Quote {
  const range = apiJob.total ?? { min: 0, max: 0 };
  return { lines: [{ label: apiJob.title, amount: range }], total: range, arrival: defaultArrival(now), technician };
}

// From the first quarter hour at least 30 minutes away, for one hour, as the screen's display times.
function defaultArrival(now: Date): Quote["arrival"] {
  const earliest = now.getTime() + 30 * MINUTE_MS;
  const from = Math.ceil(earliest / QUARTER_HOUR_MS) * QUARTER_HOUR_MS;
  const to = from + 60 * MINUTE_MS;
  return { from: localClockText(new Date(from).toISOString()) ?? "", to: localClockText(new Date(to).toISOString()) ?? "" };
}

function lineFromApi({ label, min, max }: ApiQuoteLine): QuoteLine {
  return { label, amount: min === max ? min : { min, max } };
}

function apiLineFor({ label, amount }: QuoteLine): ApiQuoteLine {
  return typeof amount === "number" ? { label, min: amount, max: amount } : { label, min: amount.min, max: amount.max };
}

function timelineFromApi(events: ApiJob["timeline"]): TimelineEvent[] {
  return events.flatMap(({ at, to }) => {
    const text = TIMELINE_TEXT_BY_STATE[to];
    return text ? [{ at: localIsoString(new Date(at)), text }] : [];
  });
}
