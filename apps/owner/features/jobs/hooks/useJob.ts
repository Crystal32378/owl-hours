import { useCallback, useEffect, useState } from "react";
import type { ID, Job } from "../../../shared/data/types.ts";
import { afterFailedLoad } from "../../../shared/lib/loadState.ts";
import type { LoadState } from "../../../shared/lib/loadState.ts";
import { buildJobView } from "../lib/jobView.ts";
import type { JobView } from "../lib/jobView.ts";
import type { JobsService } from "../services/jobsService.ts";
import { jobsRuntime } from "./jobsRuntime.ts";

export type JobDeps = { service: JobsService };

// The serializable view for the screen, the callback that moves the job to its next status,
// and `reload`, which refetches the job without clearing the current view.
export type JobScreenView = { job: JobView; advance: () => Promise<boolean>; reload: () => void };

// "loading" also covers a job that does not exist; "failed" draws the error state and retries the load.
export type JobScreen = { status: "loading" } | { status: "failed"; retry: () => Promise<void> } | ({ status: "ready" } & JobScreenView);

// Pass a stable service (a module constant or memoized): changing it reloads the job.
export function useJob(id: ID, deps?: Partial<JobDeps>): JobScreen {
  const [defaults] = useState(createDefaultDeps);
  const service = deps?.service ?? defaults.service;
  const [job, setJob] = useState<LoadState<Job | null>>("loading");
  const [reloadToken, setReloadToken] = useState(0);
  const reload = useCallback(() => setReloadToken((token) => token + 1), []);

  useEffect(() => {
    let isCurrent = true;
    service
      .getJob(id)
      .then((loaded) => {
        if (isCurrent) setJob(loaded);
      })
      .catch(() => {
        if (isCurrent) setJob(afterFailedLoad);
      });
    return () => {
      isCurrent = false;
    };
  }, [service, id, reloadToken]);

  if (job === "failed") return { status: "failed", retry: async () => reload() };
  if (job === "loading" || job === null) return { status: "loading" };

  const view = buildJobView(job);
  return { status: "ready", job: view, advance: () => moveToNextStatus(service, job, view.action.nextStatus, setJob), reload };
}

// Refused (already moved on, or nothing to do) and failed both answer false; the screen keeps what it shows.
async function moveToNextStatus(
  service: JobsService,
  job: Job,
  nextStatus: Job["status"] | null,
  show: (job: Job) => void,
): Promise<boolean> {
  if (!nextStatus) return false;

  try {
    const moved = await service.updateJobStatus(job.id, nextStatus);
    if (moved) show(moved);
    return moved !== null;
  } catch {
    return false;
  }
}

// The live API when configured, the demo otherwise (S7).
function createDefaultDeps(): JobDeps {
  return { service: jobsRuntime().service };
}
