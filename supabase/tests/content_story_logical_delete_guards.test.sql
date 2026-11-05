-- Story Pack logical delete defense in depth:
-- 1. private.review_content_draft must reject logically deleted drafts (P0002 draft not found).
-- 2. content_drafts update policy must reject updates to logically deleted drafts.
\set ON_ERROR_STOP 1
\set mario '{"sub":"20000000-0000-4000-8000-000000000001","role":"authenticated"}'

\echo '# Defense in depth: private.review_content_draft rejects a logically deleted draft'
begin;
update public.jobs set state = 'done' where id = '80000000-0000-4000-8000-000000000001';
insert into public.media (id, conversation_id, job_id, kind, role, story_role, storage_path, mime_type)
values
  ('60000000-0000-4000-8000-000000000091', '40000000-0000-4000-8000-000000000001', '80000000-0000-4000-8000-000000000001',
   'image', 'before_photo', 'before', 'conversations/40000000-0000-4000-8000-000000000001/guard-before.webp', 'image/webp'),
  ('60000000-0000-4000-8000-000000000092', '40000000-0000-4000-8000-000000000001', '80000000-0000-4000-8000-000000000001',
   'image', 'after_photo', 'after', 'conversations/40000000-0000-4000-8000-000000000001/guard-after.webp', 'image/webp');
insert into public.consents (conversation_id, kind, granted, source_message_id, at)
values ('40000000-0000-4000-8000-000000000001', 'photos_for_marketing', true, null, '2099-01-01 00:00:00+00');

-- Fixture rows are created as the migration owner (the column grant excludes id),
-- with Mario's claims so the owner-scoped eligibility check can see the job.
set local request.jwt.claims to :'mario';
insert into public.content_drafts (id, tenant_id, source, source_job_id, source_media_ids, title, caption, platforms, slides)
values ('d0000000-0000-4000-8000-000000000091', '10000000-0000-4000-8000-000000000001',
        'story_pack', '80000000-0000-4000-8000-000000000001',
        array['60000000-0000-4000-8000-000000000091'::uuid, '60000000-0000-4000-8000-000000000092'::uuid],
        'Guard test draft', 'A sample story.', array['instagram']::public.social_platform[],
        '[{"title":"Before","body":"Leak"},{"title":"After","body":"Repaired"},{"title":"Contact","body":"Call us"}]'::jsonb);

-- Historical tombstones remain guarded after the deletion policy changes.
update public.content_drafts set source_job_id = null, deleted_at = now()
 where source = 'story_pack' and source_job_id = '80000000-0000-4000-8000-000000000001';

set local role authenticated;
set local request.jwt.claims to :'mario';
do $$
begin
  begin
    perform private.review_content_draft(
      'd0000000-0000-4000-8000-000000000091',
      true,
      now(),
      '[]'::jsonb
    );
    raise exception 'review_content_draft should have rejected logically deleted draft';
  exception when no_data_found then
    null;
  end;
end $$;
rollback;

\echo '# Defense in depth: content_drafts_update policy rejects updates to logically deleted drafts'
begin;
update public.jobs set state = 'done' where id = '80000000-0000-4000-8000-000000000001';
insert into public.media (id, conversation_id, job_id, kind, role, story_role, storage_path, mime_type)
values
  ('60000000-0000-4000-8000-000000000093', '40000000-0000-4000-8000-000000000001', '80000000-0000-4000-8000-000000000001',
   'image', 'before_photo', 'before', 'conversations/40000000-0000-4000-8000-000000000001/guard-before2.webp', 'image/webp'),
  ('60000000-0000-4000-8000-000000000094', '40000000-0000-4000-8000-000000000001', '80000000-0000-4000-8000-000000000001',
   'image', 'after_photo', 'after', 'conversations/40000000-0000-4000-8000-000000000001/guard-after2.webp', 'image/webp');
insert into public.consents (conversation_id, kind, granted, source_message_id, at)
values ('40000000-0000-4000-8000-000000000001', 'photos_for_marketing', true, null, '2099-01-01 00:00:00+00');

-- Fixture rows are created as the migration owner (the column grant excludes id),
-- with Mario's claims so the owner-scoped eligibility check can see the job.
set local request.jwt.claims to :'mario';
insert into public.content_drafts (id, tenant_id, source, source_job_id, source_media_ids, title, caption, platforms)
values ('d0000000-0000-4000-8000-000000000092', '10000000-0000-4000-8000-000000000001',
        'story_pack', '80000000-0000-4000-8000-000000000001',
        array['60000000-0000-4000-8000-000000000093'::uuid, '60000000-0000-4000-8000-000000000094'::uuid],
        'Update policy test draft', 'A sample story.', array['instagram']::public.social_platform[]);

-- Historical tombstones remain guarded after the deletion policy changes.
update public.content_drafts set source_job_id = null, deleted_at = now()
 where source = 'story_pack' and source_job_id = '80000000-0000-4000-8000-000000000001';

set local role authenticated;
set local request.jwt.claims to :'mario';
do $$
declare
  updated_rows integer;
begin
  update public.content_drafts
  set caption = 'Tampered caption'
  where id = 'd0000000-0000-4000-8000-000000000092';

  get diagnostics updated_rows = row_count;
  assert updated_rows = 0, 'content_drafts_update policy must reject updates to logically deleted drafts';
end $$;
rollback;
