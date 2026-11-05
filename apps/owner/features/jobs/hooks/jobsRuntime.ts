import { getOwnerLiveApi } from "../../../shared/infra/ownerApiRuntime.ts";
import { jobsRootFor } from "./jobsRoot.ts";
import type { JobsRoot } from "./jobsRoot.ts";

// Composition root of the jobs hooks, kept apart from jobsRoot so node tests never load the session
// runtime. Built once, so every jobs screen shares the same service and sees the others' changes.
export function jobsRuntime(): JobsRoot {
  if (!root) root = jobsRootFor(getOwnerLiveApi());
  return root;
}

let root: JobsRoot | null = null;
