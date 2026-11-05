import type { Job, JobStatus } from "../../../shared/data/types.ts";
import { moneyRangeText } from "../../../shared/lib/moneyText.ts";

const STATUSES_BEFORE_APPROVAL: JobStatus[] = ["quoted", "owner_confirmed"];

// "Ana L. · Mario R. · $130–160" for an approved job; the technician shows only from
// customer_approved on. A done card reads its final total instead of the quoted range.
export function jobCardSubtitle(job: Job): string {
  const price = job.status === "done" && job.finalTotal !== undefined ? `$${job.finalTotal}` : moneyRangeText(job.quote.total);
  const technician = STATUSES_BEFORE_APPROVAL.includes(job.status) ? "" : job.technician;
  return [job.customerName, technician, price].filter(Boolean).join(" · ");
}
