import type { OwnerApi } from "../../../shared/infra/ownerApi.ts";
import { OwnerApiError } from "../../../shared/infra/ownerApi.ts";
import type { ID, Job } from "../../../shared/data/types.ts";
import { jobFromApi, quoteBodyFor, transitionReasonFor } from "../lib/liveJob.ts";
import type { ApiJob } from "../lib/liveJob.ts";
import type { JobsClient } from "./jobsService.ts";

// `now` is the day a quote's display arrival times fall on, and where a seeded draft's window starts.
export type LiveJobsClientDeps = { now: () => Date };

// JobsClient over /v1/owner/jobs (S6). The service always saves the whole job, so saving reads what
// changed: a quoted job sends its quote (the API then moves it to owner_confirmed), any other status
// asks the API for that transition. The API owns the rules; a refusal rejects with OwnerApiError.
export function createLiveJobsClient(api: OwnerApi, deps: Partial<LiveJobsClientDeps> = {}): JobsClient {
  const { now } = { now: () => new Date(), ...deps };

  async function allJobs(): Promise<Job[]> {
    // The API answers owner_jobs items; the app trusts its own API's contract here.
    const apiJobs = (await api.get("/jobs")) as ApiJob[];
    return apiJobs.map((apiJob) => jobFromApi(apiJob, now())).filter((job): job is Job => job !== null);
  }

  return {
    // A job the owner accepted but has not quoted yet starts from the chat, not the Jobs list.
    listJobs: async () => (await allJobs()).filter((job) => !isUnquoted(job)),

    findJob: async (id) => {
      const apiJob = await answerOrNullWhenNotFound(api.get(jobPath(id)));
      return apiJob ? jobFromApi(apiJob as ApiJob, now()) : null;
    },

    findJobByConversationId: async (conversationId) =>
      (await allJobs()).find((job) => job.conversationId === conversationId) ?? null,

    saveJob: async (job) => {
      await (job.status === "quoted" ? sendQuote(api, job, now()) : moveToStatus(api, job));
    },
  };
}

async function sendQuote(api: OwnerApi, job: Job, day: Date): Promise<void> {
  const body = quoteBodyFor(job.quote, day);
  if (!body) throw new Error(`The quote for job ${job.id} has no valid arrival window`);

  await api.post(`${jobPath(job.id)}/quote`, body);
}

async function moveToStatus(api: OwnerApi, job: Job): Promise<void> {
  await api.post(`${jobPath(job.id)}/transition`, { to: job.status, reason: transitionReasonFor(job) });
}

function jobPath(id: ID): string {
  return `/jobs/${encodeURIComponent(id)}`;
}

async function answerOrNullWhenNotFound(answer: Promise<unknown>): Promise<unknown> {
  try {
    return await answer;
  } catch (error) {
    if (error instanceof OwnerApiError && error.status === 404) return null;
    throw error;
  }
}

// Live, `quoted` is the API's `proposed`: accepted, no quote sent yet (a sent quote is owner_confirmed).
function isUnquoted(job: Job): boolean {
  return job.status === "quoted";
}
