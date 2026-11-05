import { getOwnerLiveApi } from "../../../shared/infra/ownerApiRuntime.ts";
import { contentRootFor } from "./contentRoot.ts";
import type { ContentRoot } from "./contentRoot.ts";

// Composition root of the content hooks, kept apart from contentRoot so node tests never load the
// session runtime. Built once, so the Content list and post review share the same service.
export function contentRuntime(): ContentRoot {
  if (!root) root = contentRootFor(getOwnerLiveApi());
  return root;
}

let root: ContentRoot | null = null;
