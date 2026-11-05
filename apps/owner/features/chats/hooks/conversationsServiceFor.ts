import type { OwnerApi } from "../../../shared/infra/ownerApi.ts";
import { createConversationsService } from "../services/conversationsService.ts";
import type { ConversationsService } from "../services/conversationsService.ts";
import { createLiveConversationsClient } from "../services/liveConversationsClient.ts";
import { sharedDemoConversationsService } from "./demoConversationsService.ts";

// The chats on the live owner API when there is one; the shared demo service otherwise (null = demo).
export function conversationsServiceFor(liveApi: OwnerApi | null): ConversationsService {
  return liveApi ? createConversationsService(createLiveConversationsClient(liveApi)) : sharedDemoConversationsService();
}
