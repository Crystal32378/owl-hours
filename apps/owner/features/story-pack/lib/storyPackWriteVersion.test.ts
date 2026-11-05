import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStoryPackService, createFakeStoryPackClient } from '../services/storyPackService.ts';

test('a stale displayed version cannot overwrite a newer draft, even after service reads it', async () => {
  const client = createFakeStoryPackClient();
  const service = createStoryPackService(client);
  const source = (await service.listSources())[0];
  const pack = await service.createFromJob(source.id);
  await client.update({ ...pack, caption: 'Other owner tab', updatedAt: 'remote-version' });
  await assert.rejects(service.updateDraft(pack.id, { caption: 'Stale local text', expectedUpdatedAt: pack.updatedAt }), /changed/i);
  assert.equal((await client.findPack(pack.id))?.caption, 'Other owner tab');
});

test('demo adapter checks version at write time if another write lands after service read', async () => {
  const client = createFakeStoryPackClient();
  const service = createStoryPackService(client);
  const source = (await service.listSources())[0];
  const pack = await service.createFromJob(source.id);
  const update = client.update;
  client.update = async (next, expected) => {
    await update({ ...pack, caption: 'Racing write', updatedAt: 'racing-version' });
    return update(next, expected);
  };
  await assert.rejects(service.updateDraft(pack.id, { caption: 'Stale local text', expectedUpdatedAt: pack.updatedAt }), /changed/i);
  assert.equal((await client.findPack(pack.id))?.caption, 'Racing write');
});
