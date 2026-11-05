import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHttpStoryPackClient } from '../services/storyPackHttpClient.ts';
import { storyPackServiceCopys as copy } from '../copys/storyPackServiceCopys.ts';

const dto = {
  id: '44444444-4444-4444-8444-444444444444', source: 'story_pack', sourceJobId: '11111111-1111-4111-8111-111111111111',
  sourceMediaIds: ['22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333'],
  title: null, caption: 'Saved', slides: [{ title: 'Before', body: 'A' }, { title: 'Work', body: 'B' }, { title: 'After', body: 'C' }],
  platforms: ['instagram'], status: 'draft', scheduledAt: null, reviewedAt: null, publishedAt: null, canHandoff: false,
  createdAt: '2026-10-30T00:00:00Z', updatedAt: '2026-10-30T00:01:00Z',
};

test('HTTP PATCH carries the original reviewed version separately from a local timestamp', async () => {
  let body: Record<string, unknown> | undefined;
  const client = createHttpStoryPackClient({ apiUrl: 'https://example.test', getAccessToken: async () => 'fixture', fetch: async (_url, options) => {
    if (options?.method === 'PATCH') body = JSON.parse(String(options.body));
    return new Response(JSON.stringify({ data: options?.method === 'PATCH' ? dto : [dto] }));
  } });
  const pack = (await client.listPacks())[0]!;
  await client.update({ ...pack, updatedAt: '2026-10-30T00:02:00Z', caption: 'Edit' }, dto.updatedAt);
  assert.equal(body?.expectedUpdatedAt, dto.updatedAt);
});

test('HTTP stale-save409 surfaces actionable conflict copy without provider details', async () => {
  let reject = false;
  const client = createHttpStoryPackClient({ apiUrl: 'https://example.test', getAccessToken: async () => 'fixture', fetch: async () => reject
    ? new Response(JSON.stringify({ error: 'private provider details' }), { status: 409 })
    : new Response(JSON.stringify({ data: [dto] })) });
  const pack = (await client.listPacks())[0]!;
  reject = true;
  await assert.rejects(client.update(pack, dto.updatedAt), { message: copy.changedSinceReview });
});
