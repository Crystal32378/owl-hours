// The content composition root: live mode reads accounts from the API and offers no Regenerate;
// the demo keeps its fake accounts and its Regenerate.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { accounts as mockAccounts } from "../../../shared/data/mock.ts";
import type { OwnerEditApi } from "../../../shared/infra/ownerApi.ts";
import { contentRootFor } from "./contentRoot.ts";

function recordingApi(answers: Record<string, unknown>) {
  const calls: string[] = [];
  const api: OwnerEditApi = {
    get: async (path) => {
      calls.push(`GET ${path}`);
      return answers[path];
    },
    post: async (path) => {
      calls.push(`POST ${path}`);
      return undefined;
    },
    patch: async (path) => {
      calls.push(`PATCH ${path}`);
      return undefined;
    },
    put: async (path) => {
      calls.push(`PUT ${path}`);
      return undefined;
    },
  };
  return { api, calls };
}

describe("contentRootFor live", () => {
  it("reads linked accounts from GET /linked-accounts", async () => {
    const { api, calls } = recordingApi({
      "/linked-accounts": [{ id: "a0000000-0000-4000-8000-000000000001", platform: "instagram", displayName: "@northside", mode: "live" }],
    });

    const accounts = await contentRootFor(api).accountsService.getAccounts();

    assert.deepEqual(accounts, [{ kind: "instagram", name: "@northside", status: "connected" }]);
    assert.deepEqual(calls, ["GET /linked-accounts"]);
  });

  it("offers Connect Facebook and Instagram", () => {
    const { api } = recordingApi({});

    assert.equal(contentRootFor(api).accountsService.canConnect, true);
  });

  it("does not offer Regenerate", () => {
    const { api } = recordingApi({});

    assert.equal(contentRootFor(api).postsService.canRegenerate, false);
  });
});

describe("contentRootFor demo", () => {
  it("keeps the demo accounts and Regenerate", async () => {
    const root = contentRootFor(null);

    assert.deepEqual(await root.accountsService.getAccounts(), mockAccounts);
    assert.equal(root.accountsService.canConnect, false);
    assert.equal(root.postsService.canRegenerate, true);
  });
});
