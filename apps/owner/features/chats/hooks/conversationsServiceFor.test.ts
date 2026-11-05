// Spec: odd/tasks/live-owner-core.md, T3, S7: the chat hooks use the live client when the owner API is
// configured, and the shared demo service (unchanged) when it is not.
import { beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { conversations as seedConversations } from "../../../shared/data/mock.ts";
import type { OwnerApi } from "../../../shared/infra/ownerApi.ts";
import { conversationsServiceFor } from "./conversationsServiceFor.ts";
import { resetSharedDemoConversationsService, sharedDemoConversationsService } from "./demoConversationsService.ts";

describe("conversationsServiceFor", () => {
  beforeEach(() => resetSharedDemoConversationsService());

  it("is the shared demo service without a live API, listing the demo conversations as before", async () => {
    const service = conversationsServiceFor(null);

    assert.equal(service, sharedDemoConversationsService());
    assert.deepEqual(await service.getConversations(), seedConversations);
    assert.equal((await service.getConversation("c_ana"))?.customerName, "Ana L.");
  });

  it("reads the live API when there is one", async () => {
    const paths: string[] = [];
    const api: OwnerApi = {
      get: async (path) => {
        paths.push(path);
        return [];
      },
      post: async () => null,
    };

    assert.deepEqual(await conversationsServiceFor(api).getConversations(), []);
    assert.deepEqual(paths, ["/conversations"]);
  });
});
