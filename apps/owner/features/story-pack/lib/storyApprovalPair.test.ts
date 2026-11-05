import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildApprovalMediaSnapshot } from './storyPack.ts';
import { createStoryPackService, createFakeStoryPackClient } from '../services/storyPackService.ts';

async function fixture() {
  const service = createStoryPackService(createFakeStoryPackClient());
  const source = (await service.listSources())[0];
  return { source, pack: await service.createFromJob(source.id) };
}

test('approval snapshot rejects three selected eligible photos', async () => {
  const { source, pack } = await fixture();
  const third = { ...source.assets[1]!, id: 'third-after' };
  assert.equal(buildApprovalMediaSnapshot({ ...source, assets: [...source.assets, third] }, { ...pack, sourceMediaIds: [...pack.sourceMediaIds, third.id] }), null);
});

test('live approval requires valid revisions; explicit demo revisions remain usable', async () => {
  const { source, pack } = await fixture();
  assert.ok(buildApprovalMediaSnapshot(source, pack));
  assert.equal(buildApprovalMediaSnapshot({ ...source, isDemo: false }, { ...pack, isDemo: false }), null);
  assert.ok(buildApprovalMediaSnapshot({ ...source, isDemo: false, assets: source.assets.map((asset, index) => ({ ...asset, revision: (index ? 'b' : 'a').repeat(64) })) }, { ...pack, isDemo: false }));
});
