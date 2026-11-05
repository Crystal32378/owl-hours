import { createOwnerSessionRuntime } from '../../../shared/infra/ownerSessionRuntime';
import type { OwnerSessionService } from '../../../shared/infra/ownerSessionService.ts';
import { createHttpStoryPackClient } from './storyPackHttpClient.ts';
import { resolveStoryPackConfig } from './storyPackConfig.ts';
import { createFakeStoryPackClient, createStoryPackService, type StoryPackService } from './storyPackService.ts';

export type StoryPackDeps = {
  mode:'live'|'demo'|'unconfigured';
  auth:Pick<OwnerSessionService, "restore" | "subscribe" | "getAccessToken" | "signOut">|null;
  service:StoryPackService|null;
};

// Composition stays in services; tests can inject a complete runtime into the hook.
export function createStoryPackRuntime():StoryPackDeps {
  const config=resolveStoryPackConfig({mode:process.env.EXPO_PUBLIC_STORY_PACK_MODE,apiUrl:process.env.EXPO_PUBLIC_API_URL,
    supabaseUrl:process.env.EXPO_PUBLIC_SUPABASE_URL,anonKey:process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY});
  if(config.mode==='demo')return {mode:config.mode,auth:null,service:createStoryPackService(createFakeStoryPackClient())};
  if(config.mode==='unconfigured')return {mode:config.mode,auth:null,service:null};
  const auth=createOwnerSessionRuntime(config.supabaseUrl,config.anonKey);
  return {mode:config.mode,auth,service:createStoryPackService(createHttpStoryPackClient({apiUrl:config.apiUrl,getAccessToken:auth.getAccessToken}))};
}
