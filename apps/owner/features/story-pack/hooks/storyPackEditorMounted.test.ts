import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { useStoryPackEditor } from './useStoryPackEditor.ts';
import { useStoryPackDraft } from './useStoryPackDraft.ts';
import { createStoryPackService, createFakeStoryPackClient } from '../services/storyPackService.ts';
import type { StoryPack } from '../lib/storyPack.ts';
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

async function mount() {
  const service = createStoryPackService(createFakeStoryPackClient());
  const source = (await service.listSources())[0];
  let selected: StoryPack | null = await service.createFromJob(source.id);
  const pack = selected;
  const patches: unknown[] = [];
  let approvals = 0;
  const deps = {
    source,
    updateDraft: async (patch: Record<string, unknown>) => { patches.push(patch); return { ...pack, ...patch, updatedAt: 'saved' }; },
    approve: async () => { approvals++; return { ...pack, status: 'approved' as const, canHandoff: true }; },
  };
  let value!: ReturnType<typeof useStoryPackEditor> & ReturnType<typeof useStoryPackDraft> & { editorError: string | null };
  function Harness() {
    const editor = useStoryPackEditor(selected);
    const actions = useStoryPackDraft({
      draft: editor.draft, sources: [deps.source], updateDraft: patch => deps.updateDraft(patch),
      approve: () => deps.approve(), acceptSaved: editor.acceptSaved,
      expectedUpdatedAt: editor.expectedUpdatedAt,
    });
    value = { ...editor, ...actions, editorError: actions.approvalError };
    return null;
  }
  let renderer!: ReactTestRenderer;
  await act(async () => { renderer = create(createElement(Harness)); });
  return { pack, deps, patches, approvals: () => approvals, get: () => value,
    async select(next: StoryPack | null) { selected = next; await act(async () => renderer.update(createElement(Harness))); },
    async close() { await act(async () => renderer.unmount()); },
  };
}

test('mounted editor blocks export of dirty copy after remote approval and discard restores reviewed copy', async () => {
  const h = await mount();
  try {
    await act(async () => h.get().setDraft({ ...h.pack, caption: 'Local edit' }));
    await h.select({ ...h.pack, caption: 'Reviewed server copy', status: 'approved', canHandoff: true, updatedAt: 'remote' });
    assert.equal(h.get().draft?.caption, 'Local edit');
    assert.equal(h.get().draft?.status, 'approved');
    assert.equal(h.get().canExport, false);
    await act(async () => h.get().discardChanges());
    assert.equal(h.get().draft?.caption, 'Reviewed server copy');
    assert.equal(h.get().canExport, true);
  } finally { await h.close(); }
});

test('mounted editor sends original write version and retains dirty text on stale save rejection', async () => {
  const h = await mount();
  try {
    await act(async () => h.get().setDraft({ ...h.pack, caption: 'Local edit' }));
    await h.select({ ...h.pack, caption: 'Concurrent edit', updatedAt: 'remote' });
    h.deps.updateDraft = async patch => { h.patches.push(patch); throw new Error('untrusted server detail'); };
    await act(async () => { await h.get().saveDraft(); });
    assert.equal((h.patches[0] as {expectedUpdatedAt: string}).expectedUpdatedAt, h.pack.updatedAt);
    assert.equal(h.get().draft?.caption, 'Local edit');
    assert.equal(h.get().dirty, true);
    assert.ok(h.get().editorError);
    assert.doesNotMatch(h.get().editorError!, /untrusted server detail/);
  } finally { await h.close(); }
});

test('mounted approval refuses missing revisions before saving or reviewing', async () => {
  const h = await mount();
  try {
    h.deps.source = { ...h.deps.source, assets: h.deps.source.assets.map(({ revision, ...rest }) => rest) };
    await h.select(h.pack);
    await act(async () => { await h.get().approveDraft(); });
    assert.equal(h.patches.length, 0);
    assert.equal(h.approvals(), 0);
    assert.match(h.get().editorError!, /Reload/i);
  } finally { await h.close(); }
});

test('mounted approval never approves newer text entered while its save is pending', async () => {
  const h = await mount();
  try {
    let resolve!: (pack: StoryPack) => void;
    h.deps.updateDraft = () => new Promise(done => { resolve = done; });
    let pending!: Promise<void>;
    await act(async () => { pending = h.get().approveDraft(); });
    await act(async () => h.get().setDraft({ ...h.pack, caption: 'Typed after submit' }));
    await act(async () => { resolve({ ...h.pack, updatedAt: 'saved' }); await pending; });
    assert.equal(h.approvals(), 0);
    assert.equal(h.get().draft?.caption, 'Typed after submit');
    assert.equal(h.get().dirty, true);
  } finally { await h.close(); }
});

test('a save response cannot replace newer server approval received while that save was pending', async () => {
  const h = await mount();
  try {
    await act(async () => h.get().setDraft({ ...h.pack, caption: 'Submitted copy' }));
    let resolve!: (pack: StoryPack) => void;
    h.deps.updateDraft = () => new Promise(done => { resolve = done; });
    let pending!: Promise<void>;
    await act(async () => { pending = h.get().approveDraft(); });
    await h.select({ ...h.pack, caption: 'Remote reviewed copy', updatedAt: 'remote-approved', status: 'approved', canHandoff: true });
    await act(async () => { resolve({ ...h.pack, caption: 'Submitted copy', updatedAt: 'saved-before-remote' }); await pending; });
    assert.equal(h.get().draft?.status, 'approved');
    assert.equal(h.get().draft?.updatedAt, 'remote-approved');
    assert.equal(h.get().draft?.caption, 'Submitted copy');
    assert.equal(h.get().canExport, false);
    assert.equal(h.approvals(), 0);
  } finally { await h.close(); }
});


test('own save and approval responses advance versions without requiring a parent prop refresh', async () => {
  const h = await mount();
  try {
    h.deps.updateDraft = async patch => ({ ...h.pack, ...patch, updatedAt: 'own-saved-v2' });
    h.deps.approve = async () => ({ ...h.pack, updatedAt: 'own-approved-v3', status: 'approved', canHandoff: true });
    await act(async () => { await h.get().approveDraft(); });
    assert.equal(h.get().draft?.status, 'approved');
    assert.equal(h.get().draft?.updatedAt, 'own-approved-v3');
    assert.equal(h.get().canExport, true);
    assert.equal(h.get().editorError, null);
  } finally { await h.close(); }
});

test('discard after an acknowledged save restores that saved copy before parent props refresh', async () => {
  const h = await mount();
  try {
    h.deps.updateDraft = async patch => ({ ...h.pack, ...patch, updatedAt: 'own-saved-v2' });
    await act(async () => h.get().setDraft({ ...h.pack, caption: 'Saved A' }));
    await act(async () => { await h.get().saveDraft(); });
    assert.equal(h.get().draft?.updatedAt, 'own-saved-v2');
    await act(async () => h.get().setDraft(current => current && { ...current, caption: 'Unsaved B' }));
    await act(async () => h.get().discardChanges());
    assert.equal(h.get().draft?.caption, 'Saved A');
    assert.equal(h.get().draft?.updatedAt, 'own-saved-v2');
    assert.equal(h.get().expectedUpdatedAt, 'own-saved-v2');
    assert.equal(h.get().dirty, false);
  } finally { await h.close(); }
});
