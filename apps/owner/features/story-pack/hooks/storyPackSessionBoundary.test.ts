import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStoryPackController } from './storyPackController.ts';
import { createStoryPackService, createFakeStoryPackClient } from '../services/storyPackService.ts';
import type { StoryPackDeps } from '../services/storyPackRuntime.ts';

test('Story Pack consumes an existing owner session without exposing its own sign-in flow', async () => {
  const auth = {
    restore: async () => ({ access_token: 'fixture', user: { id: 'owner', email: 'owner@example.test' } }),
    subscribe: () => () => {}, getAccessToken: async () => 'fixture', signOut: async () => {},
  } satisfies NonNullable<StoryPackDeps['auth']>;
  const controller = createStoryPackController({ mode: 'live', auth, service: createStoryPackService(createFakeStoryPackClient()) });
  try {
    await controller.start();
    assert.equal(controller.getSnapshot().authStatus, 'signed_in');
    assert.equal(controller.getSnapshot().sessionEmail, 'owner@example.test');
    assert.equal('signIn' in controller, false, 'onboarding and the root auth gate own sign-in');
  } finally { controller.stop(); }
});
