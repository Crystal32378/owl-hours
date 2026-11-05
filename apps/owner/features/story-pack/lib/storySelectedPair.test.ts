import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hasSelectedStoryMedia } from './storyPack.ts';
import { createStoryPackService, createFakeStoryPackClient } from '../services/storyPackService.ts';

test('handoff eligibility refuses a third photo even when before and after are present', async () => {
  const service = createStoryPackService(createFakeStoryPackClient());
  const source = (await service.listSources())[0];
  const pack = await service.createFromJob(source.id);
  const third = { ...source.assets[1]!, id: 'third-after' };
  assert.equal(hasSelectedStoryMedia({ ...pack, sourceMediaIds: [...pack.sourceMediaIds, third.id] }, { ...source, assets: [...source.assets, third] }), false);
});
