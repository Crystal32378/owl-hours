import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { StoryPackApprovalSnapshot } from '@owl-hours/shared';
import { approveStoryPackDraft, saveStoryPackDraft } from './storyPackDraftController.ts';
import { createStoryPackService, createFakeStoryPackClient, type StoryPackPatch } from '../services/storyPackService.ts';
import { buildApprovalMediaSnapshot, type StoryPack } from '../lib/storyPack.ts';
import { storyPackServiceCopys as copy } from '../copys/storyPackServiceCopys.ts';

async function fixture() {
  const service = createStoryPackService(createFakeStoryPackClient());
  const source = (await service.listSources())[0];
  const created = await service.createFromJob(source.id);
  const draft: StoryPack = { ...created, caption: 'Owner edit', platforms: { facebook: true, instagram: false } };
  const calls: string[] = [];
  const patches: StoryPackPatch[] = [];
  const snapshots: StoryPackApprovalSnapshot[] = [];
  const accepted: [StoryPack, StoryPack][] = [];
  const deps = {
    draft,
    sources: [source],
    updateDraft: async (patch: StoryPackPatch) => { calls.push('save'); patches.push(patch); return service.updateDraft(draft.id, patch); },
    approve: async (snapshot: StoryPackApprovalSnapshot) => { calls.push('approve'); snapshots.push(snapshot); return service.approve(draft.id, snapshot); },
    acceptSaved: (saved: StoryPack, submitted: StoryPack) => { calls.push('accept'); accepted.push([saved, submitted]); return true; },
  };
  return { source, draft, deps, calls, patches, snapshots, accepted };
}

test('save sends editable fields with the write precondition and accepts the saved pack against the draft', async () => {
  const { draft, deps, patches, accepted } = await fixture();
  const saved = await saveStoryPackDraft(deps);
  assert.ok(saved);
  assert.deepEqual(patches, [{ caption: draft.caption, slides: draft.slides, platforms: draft.platforms, expectedUpdatedAt: draft.updatedAt }]);
  assert.deepEqual(accepted, [[saved, draft]]);
});

test('a failed save returns null and accepts nothing', async () => {
  const { deps, accepted } = await fixture();
  assert.equal(await saveStoryPackDraft({ ...deps, updateDraft: async () => null }), null);
  assert.deepEqual(accepted, []);
});

test('approve saves first, approves with the saved timestamp and media snapshot, then accepts the approved pack', async () => {
  const { source, draft, deps, calls, snapshots, accepted } = await fixture();
  assert.deepEqual(await approveStoryPackDraft(deps), { error: null });
  assert.deepEqual(calls, ['save', 'accept', 'approve', 'accept']);
  const saved = accepted[0][0];
  assert.deepEqual(snapshots, [{ expectedUpdatedAt: saved.updatedAt, expectedMedia: buildApprovalMediaSnapshot(source, draft) }]);
  assert.equal(accepted[1][0].status, 'approved');
  assert.equal(accepted[1][1], saved);
});

test('approve without the draft source reports the change and never saves or approves', async () => {
  const { deps, calls } = await fixture();
  assert.deepEqual(await approveStoryPackDraft({ ...deps, sources: [] }), { error: copy.changedSinceReview });
  assert.deepEqual(calls, []);
});

test('approve stops when the editor changed while saving', async () => {
  const { deps, calls } = await fixture();
  await approveStoryPackDraft({ ...deps, acceptSaved: () => { calls.push('accept'); return false; } });
  assert.deepEqual(calls, ['save', 'accept']);
});
