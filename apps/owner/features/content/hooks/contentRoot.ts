import { DEMO_NOW } from "../../../shared/data/mock.ts";
import type { ISODate } from "../../../shared/data/types.ts";
import type { OwnerEditApi } from "../../../shared/infra/ownerApi.ts";
import { localIsoString } from "../../../shared/lib/localIsoString.ts";
import { createAccountsService, createFakeAccountsClient } from "../services/accountsService.ts";
import type { AccountsService } from "../services/accountsService.ts";
import { createLiveAccountsClient } from "../services/liveAccountsClient.ts";
import { createLivePostsClient } from "../services/livePostsClient.ts";
import { createPostsService, defaultFakePostsClient } from "../services/postsService.ts";
import type { PostsService } from "../services/postsService.ts";

// What the content hooks run on: one posts service shared by the Content list and post review,
// and the linked accounts behind the Accounts screen and the Content "Connected" line.
export type ContentRoot = { postsService: PostsService; accountsService: AccountsService; now: () => ISODate };

// Live: the owner API client on the real clock; demo: the fake clients on the designs' clock (null = demo).
// The API has no copy generator, so live mode offers no Regenerate.
export function contentRootFor(liveApi: OwnerEditApi | null): ContentRoot {
  if (!liveApi) {
    return {
      postsService: createPostsService(defaultFakePostsClient),
      accountsService: createAccountsService(createFakeAccountsClient()),
      now: () => DEMO_NOW,
    };
  }

  const now = () => localIsoString(new Date());
  return {
    postsService: createPostsService(createLivePostsClient(liveApi), { now, canRegenerate: false }),
    accountsService: createAccountsService(createLiveAccountsClient(liveApi)),
    now,
  };
}
