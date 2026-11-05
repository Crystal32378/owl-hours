// Spec: odd/tasks/owner-content.md, S3 requirement.
// Resolves job photos and consent line for post review: appears only when shareConsent is "yes",
// extracts the customer's first name, and yields null otherwise.
import type { Job, PostDraft } from "../../../shared/data/types.ts";
import { contentCopys } from "../copys/contentCopys.ts";

export type ResolvedJobPhotos = {
  photos: {
    before?: string;
    after?: string;
    extra: string[];
  };
  consentLine: string;
};

// What the review screen needs from a job: the live API's content sources carry no other job field.
export type JobPhotoSource = Pick<Job, "id" | "customerName" | "photos" | "shareConsent">;

export function resolveJobPhotos(
  draft: PostDraft,
  job?: JobPhotoSource | null,
): ResolvedJobPhotos | null {
  if (!job) {
    return null;
  }

  if (!draft.sourceJobId || draft.sourceJobId !== job.id) {
    return null;
  }

  if (job.shareConsent !== "yes") {
    return null;
  }

  const firstName = job.customerName.trim().split(/\s+/)[0] || contentCopys.theCustomer;
  const consentLine = contentCopys.photoConsentLine(firstName);

  return {
    photos: structuredClone(job.photos),
    consentLine,
  };
}

// A demo photo is a key into the bundled assets; a live photo is already a signed URL.
export function photoSource(
  photo: string | undefined,
  assets: Record<string, string>,
  fallback: string,
): string {
  if (!photo) return fallback;
  if (/^https?:\/\//.test(photo)) return photo;
  return assets[photo] ?? fallback;
}
