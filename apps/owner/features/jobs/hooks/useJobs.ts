import { useCallback, useEffect, useState } from "react";
import type { ISODate, Job } from "../../../shared/data/types.ts";
import { afterFailedLoad } from "../../../shared/lib/loadState.ts";
import type { LoadState } from "../../../shared/lib/loadState.ts";
import { jobCardSubtitle } from "../lib/jobCardSubtitle.ts";
import { jobStatusLine } from "../lib/jobStatusLine.ts";
import type { JobStatusTone } from "../lib/jobStatusLine.ts";
import { jobsInSegment } from "../lib/jobSegment.ts";
import type { JobSegment } from "../lib/jobSegment.ts";
import { scheduledJobLine } from "../lib/scheduledJobLine.ts";
import { segmentTabs } from "../lib/segmentTabs.ts";
import type { SegmentTab } from "../lib/segmentTabs.ts";
import type { JobsService } from "../services/jobsService.ts";
import { jobsRuntime } from "./jobsRuntime.ts";

export type JobsDeps = { service: JobsService; now: () => ISODate };

// One row of the list: title, customer and price, and the status line under it.
export type JobCardView = {
  id: string;
  title: string;
  subtitle: string;
  statusText: string;
  statusTone: JobStatusTone;
  photo: string | null; // the "before" photo id; null shows the waiting-owl tile
};

// Serializable by design: it crosses into the DOM component as props.
export type JobsListView = {
  tabs: SegmentTab[];
  tonight: JobCardView[];
  upcoming: JobCardView[];
  done: JobCardView[];
  tomorrowLines: string[]; // the "Tomorrow" card under the Tonight segment
};

// A rejected first load is "failed" (the error state retries with `reload`); a rejected
// reload keeps the list. `reload` refetches without clearing the current view.
export type JobsListResult =
  | { status: "loading"; reload: () => void }
  | { status: "failed"; reload: () => void }
  | { status: "ready"; jobs: JobsListView; reload: () => void };

// Pass a stable service (a module constant or memoized): changing it reloads the jobs.
export function useJobs(deps?: Partial<JobsDeps>): JobsListResult {
  const [defaults] = useState(createDefaultDeps);
  const service = deps?.service ?? defaults.service;
  const now = deps?.now ?? defaults.now;
  const [jobs, setJobs] = useState<LoadState<Job[]>>("loading");
  const [reloadToken, setReloadToken] = useState(0);
  const reload = useCallback(() => setReloadToken((token) => token + 1), []);

  useEffect(() => {
    let isCurrent = true;
    service
      .listJobs()
      .then((loaded) => {
        if (isCurrent) setJobs(loaded);
      })
      .catch(() => {
        if (isCurrent) setJobs(afterFailedLoad);
      });
    return () => {
      isCurrent = false;
    };
  }, [service, reloadToken]);

  if (jobs === "loading" || jobs === "failed") return { status: jobs, reload };

  const at = now();
  return {
    status: "ready",
    jobs: {
      tabs: segmentTabs(jobs, at),
      tonight: cardsIn(jobs, "tonight", at),
      upcoming: cardsIn(jobs, "upcoming", at),
      done: cardsIn(jobs, "done", at),
      tomorrowLines: jobsInSegment(jobs, "upcoming", at).map(scheduledJobLine).filter((line): line is string => line !== null),
    },
    reload,
  };
}

function cardsIn(jobs: Job[], segment: JobSegment, now: ISODate): JobCardView[] {
  return jobsInSegment(jobs, segment, now).map((job) => {
    const status = jobStatusLine(job);
    return {
      id: job.id,
      title: job.title,
      subtitle: jobCardSubtitle(job),
      statusText: status.text,
      statusTone: status.tone,
      photo: job.photos.before ?? null,
    };
  });
}

// The live API when configured, the demo otherwise (S7).
function createDefaultDeps(): JobsDeps {
  return jobsRuntime();
}
