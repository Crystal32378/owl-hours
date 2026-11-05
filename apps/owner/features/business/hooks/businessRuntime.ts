import { getOwnerLiveOptions } from "../../../shared/infra/ownerApiRuntime.ts";
import { businessRootFor } from "./businessRoot.ts";
import type { BusinessRoot } from "./businessRoot.ts";

// Composition root of the business hooks, kept apart from businessRoot so node tests never load the
// session runtime. Built once, so a price saved in Prices shows on the Business tab.
export function businessRuntime(): BusinessRoot {
  if (!root) root = businessRootFor(getOwnerLiveOptions());
  return root;
}

let root: BusinessRoot | null = null;
