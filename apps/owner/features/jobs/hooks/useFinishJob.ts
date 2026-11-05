import { useEffect, useState } from "react";
import type { ID, Job, MoneyRange, QuoteLine } from "../../../shared/data/types.ts";
import { firstName } from "../../../shared/lib/firstName.ts";
import type { FinishJobInput, JobsService } from "../services/jobsService.ts";
import { jobsRuntime } from "./jobsRuntime.ts";

export type FinishJobDeps = { service: JobsService };

// Serializable by design: it crosses into the DOM component as props. The screen edits the final
// amounts itself and hands them back through `finish` together with the reason and the photo switch.
export type FinishJobView = {
  jobId: string;
  title: string;
  customerName: string;
  customerFirstName: string;
  lines: QuoteLine[];
  estimate: MoneyRange;
  finish: (input: FinishJobInput) => Promise<boolean>;
  photos: { before: string | null; after: string | null };
};

// Returns null while the job loads, or when it does not exist.
// Pass a stable service (a module constant or memoized): changing it reloads the job.
export function useFinishJob(id: ID, deps?: Partial<FinishJobDeps>): FinishJobView | null {
  const [defaults] = useState(createDefaultDeps);
  const service = deps?.service ?? defaults.service;
  const [job, setJob] = useState<Job | null>(null);

  useEffect(() => {
    let isCurrent = true;
    service
      .getJob(id)
      .then((loaded) => {
        if (isCurrent) setJob(loaded);
      })
      .catch(() => {
        // A rejected load keeps the current view (null while loading): no error state yet (D22).
      });
    return () => {
      isCurrent = false;
    };
  }, [service, id]);

  if (!job) return null;

  return {
    jobId: job.id,
    title: job.title,
    customerName: job.customerName,
    customerFirstName: firstName(job.customerName),
    lines: job.quote.lines,
    estimate: job.quote.total,
    finish: (input) => finishJob(service, job.id, input),
    photos: { before: job.photos.before ?? null, after: job.photos.after ?? null },
  };
}

// A refusal and a failure both mean the job was not finished: the owner keeps the screen and can retry.
async function finishJob(service: JobsService, id: ID, input: FinishJobInput): Promise<boolean> {
  try {
    return (await service.finishJob(id, input)) !== null;
  } catch {
    return false;
  }
}

// The live API when configured, the demo otherwise (S7).
function createDefaultDeps(): FinishJobDeps {
  return { service: jobsRuntime().service };
}
