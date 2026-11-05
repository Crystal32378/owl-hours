-- Source deletion physically removes linked Story Pack drafts.
-- This file uses disposable synthetic fixtures and rolls them back.
\set ON_ERROR_STOP 1
\set mario '{"sub":"20000000-0000-4000-8000-000000000001","role":"authenticated"}'

\echo '# deleting the source job removes linked Story Pack rows and preserves shared evidence'
begin;
update public.jobs set state = 'done' where id = '80000000-0000-4000-8000-000000000001';
insert into public.media (id, conversation_id, job_id, kind, role, story_role, storage_path, mime_type)
values
  ('60000000-0000-4000-8000-000000000081', '40000000-0000-4000-8000-000000000001', '80000000-0000-4000-8000-000000000001',
   'image', 'before_photo', 'before', 'conversations/40000000-0000-4000-8000-000000000001/ld-before.webp', 'image/webp'),
  ('60000000-0000-4000-8000-000000000082', '40000000-0000-4000-8000-000000000001', '80000000-0000-4000-8000-000000000001',
   'image', 'after_photo', 'after', 'conversations/40000000-0000-4000-8000-000000000001/ld-after.webp', 'image/webp');
insert into public.consents (conversation_id, kind, granted, source_message_id, at)
values ('40000000-0000-4000-8000-000000000001', 'photos_for_marketing', true, null, '2099-01-01 00:00:00+00');

-- Fixture rows are created as the migration owner (the column grant excludes id),
-- with Mario's claims so the owner-scoped eligibility check can see the job.
set local request.jwt.claims to :'mario';
insert into public.content_drafts (id, tenant_id, source, source_job_id, source_media_ids, title, caption, platforms)
values ('d0000000-0000-4000-8000-000000000081', '10000000-0000-4000-8000-000000000001',
        'story_pack', '80000000-0000-4000-8000-000000000001',
        array['60000000-0000-4000-8000-000000000081'::uuid, '60000000-0000-4000-8000-000000000082'::uuid],
        'Logical delete job fixture', 'A sample story.', array['instagram']::public.social_platform[]);

-- Active Story Packs belonging to another job/tenant must remain untouched.
update public.handoffs set status = 'accepted', resolved_at = now() where id = '50000000-0000-4000-8000-000000000002';
insert into public.jobs (id, tenant_id, conversation_id, handoff_id, title, state) values
 ('80000000-0000-4000-8000-000000000081','10000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001','Other Northside job','done'),
 ('80000000-0000-4000-8000-000000000082','10000000-0000-4000-8000-000000000002','40000000-0000-4000-8000-000000000002','50000000-0000-4000-8000-000000000002','Other tenant job','done');
insert into public.media (id, conversation_id, job_id, kind, role, story_role, storage_path, mime_type) values
 ('60000000-0000-4000-8000-000000000085','40000000-0000-4000-8000-000000000001','80000000-0000-4000-8000-000000000081','image','evidence','before','conversations/40000000-0000-4000-8000-000000000001/other-before.webp','image/webp'),
 ('60000000-0000-4000-8000-000000000086','40000000-0000-4000-8000-000000000001','80000000-0000-4000-8000-000000000081','image','evidence','after','conversations/40000000-0000-4000-8000-000000000001/other-after.webp','image/webp'),
 ('60000000-0000-4000-8000-000000000087','40000000-0000-4000-8000-000000000002','80000000-0000-4000-8000-000000000082','image','evidence','before','conversations/40000000-0000-4000-8000-000000000002/other-before.webp','image/webp'),
 ('60000000-0000-4000-8000-000000000088','40000000-0000-4000-8000-000000000002','80000000-0000-4000-8000-000000000082','image','evidence','after','conversations/40000000-0000-4000-8000-000000000002/other-after.webp','image/webp');
insert into public.consents(conversation_id, kind, granted, at) values
 ('40000000-0000-4000-8000-000000000002','photos_for_marketing',true,'2099-01-01');
insert into public.content_drafts(id, tenant_id, source, source_job_id, source_media_ids, caption, platforms) values
 ('d0000000-0000-4000-8000-000000000085','10000000-0000-4000-8000-000000000001','story_pack','80000000-0000-4000-8000-000000000081',array['60000000-0000-4000-8000-000000000085','60000000-0000-4000-8000-000000000086']::uuid[],'Other job draft',array['instagram']::public.social_platform[]);
set local request.jwt.claims = '{"sub":"20000000-0000-4000-8000-000000000002","role":"authenticated"}';
insert into public.content_drafts(id, tenant_id, source, source_job_id, source_media_ids, caption, platforms) values
 ('d0000000-0000-4000-8000-000000000086','10000000-0000-4000-8000-000000000002','story_pack','80000000-0000-4000-8000-000000000082',array['60000000-0000-4000-8000-000000000087','60000000-0000-4000-8000-000000000088']::uuid[],'Other tenant draft',array['instagram']::public.social_platform[]);
set local request.jwt.claims to :'mario';

-- A separate legacy draft uses the same original photo without depending on this job.
insert into public.content_drafts (id, tenant_id, source, source_media_ids, caption, platforms)
values ('d0000000-0000-4000-8000-000000000088', '10000000-0000-4000-8000-000000000001',
 'prices', array['60000000-0000-4000-8000-000000000081'::uuid], 'Separate use of original photo', array['instagram']::public.social_platform[]);
-- The policy also removes approved Story Packs rather than leaving an exportable orphan.
update public.content_drafts set slides = '[{"title":"Before","body":"Leak"},{"title":"After","body":"Fixed"},{"title":"Contact","body":"Call"}]'::jsonb
 where id = 'd0000000-0000-4000-8000-000000000081';
select public.review_content_draft(id, true, updated_at, private.story_pack_media_snapshot(source_job_id, source_media_ids))
 from public.content_drafts where id = 'd0000000-0000-4000-8000-000000000081';
-- Preserve existing T6 semantics: a linked legacy job draft still blocks deletion.
insert into public.content_drafts (id, tenant_id, source, source_job_id, caption, platforms)
values ('d0000000-0000-4000-8000-000000000089', '10000000-0000-4000-8000-000000000001',
 'job', '80000000-0000-4000-8000-000000000001', 'Legacy retention fixture', array['instagram']::public.social_platform[]);
do $$ begin
  begin
    delete from public.jobs where id = '80000000-0000-4000-8000-000000000001';
    raise exception 'legacy job draft was silently cascaded';
  exception when check_violation then null; end;
  assert exists (select 1 from public.content_drafts where id = 'd0000000-0000-4000-8000-000000000081'), 'failed job delete must roll back Story deletion too';
  assert exists (select 1 from public.content_drafts where id = 'd0000000-0000-4000-8000-000000000089'), 'legacy draft must remain';
end $$;
-- Remove only the disposable legacy blocker to exercise the requested Story policy.
delete from public.content_drafts where id = 'd0000000-0000-4000-8000-000000000089';
delete from public.jobs where id = '80000000-0000-4000-8000-000000000001';

do $$
declare
  d record;
begin
  select * into d from public.content_drafts where id = 'd0000000-0000-4000-8000-000000000081';
  assert d.id is null, 'linked Story Pack row must be physically deleted';
  assert (select count(*) from public.content_drafts where id in ('d0000000-0000-4000-8000-000000000085','d0000000-0000-4000-8000-000000000086') and deleted_at is null and source_job_id is not null) = 2, 'other job and tenant Story Packs must remain active';
  assert exists (select 1 from public.media where id = '60000000-0000-4000-8000-000000000081' and role = 'before_photo' and story_role = 'before' and storage_path = 'conversations/40000000-0000-4000-8000-000000000001/ld-before.webp'), 'before photo identity must remain unchanged';
  assert exists (select 1 from public.media where id = '60000000-0000-4000-8000-000000000082' and role = 'after_photo' and story_role = 'after' and storage_path = 'conversations/40000000-0000-4000-8000-000000000001/ld-after.webp'), 'after photo identity must remain unchanged';
  assert exists (select 1 from public.content_drafts where id = 'd0000000-0000-4000-8000-000000000088'), 'unrelated legacy draft must survive';
  assert (select count(*) from public.media where id in ('60000000-0000-4000-8000-000000000081', '60000000-0000-4000-8000-000000000082')) = 2, 'original photo rows must survive job deletion';
  assert not exists (select 1 from public.media where id in ('60000000-0000-4000-8000-000000000081', '60000000-0000-4000-8000-000000000082') and job_id is not null), 'only media job association is detached';
end $$;
rollback;

\echo '# S9: inserting a live story_pack draft with null source_job_id still raises check_violation'
begin;
set local role authenticated;
set local request.jwt.claims to :'mario';
do $$ begin
  begin
    insert into public.content_drafts (tenant_id, source, source_job_id, source_media_ids, title, caption, platforms)
    values ('10000000-0000-4000-8000-000000000001', 'story_pack', null,
            array['60000000-0000-4000-8000-000000000011'::uuid, '60000000-0000-4000-8000-000000000012'::uuid],
            'Null job live insert', 'Should fail.', array['instagram']::public.social_platform[]);
    raise exception 'inserting live story_pack with null source_job_id succeeded';
  exception when check_violation then null;
  end;
end $$;
rollback;

\echo '# existing conversation cascade also deletes linked Story Pack rows (broader purge is not authorized)'
begin;
update public.jobs set state = 'done' where id = '80000000-0000-4000-8000-000000000001';
insert into public.media (id, conversation_id, job_id, kind, role, story_role, storage_path, mime_type)
values
  ('60000000-0000-4000-8000-000000000083', '40000000-0000-4000-8000-000000000001', '80000000-0000-4000-8000-000000000001',
   'image', 'before_photo', 'before', 'conversations/40000000-0000-4000-8000-000000000001/conv-before.webp', 'image/webp'),
  ('60000000-0000-4000-8000-000000000084', '40000000-0000-4000-8000-000000000001', '80000000-0000-4000-8000-000000000001',
   'image', 'after_photo', 'after', 'conversations/40000000-0000-4000-8000-000000000001/conv-after.webp', 'image/webp');
insert into public.consents (conversation_id, kind, granted, source_message_id, at)
values ('40000000-0000-4000-8000-000000000001', 'photos_for_marketing', true, null, '2099-01-01 00:00:00+00');

-- Fixture rows are created as the migration owner (the column grant excludes id),
-- with Mario's claims so the owner-scoped eligibility check can see the job.
set local request.jwt.claims to :'mario';
insert into public.content_drafts (id, tenant_id, source, source_job_id, source_media_ids, title, caption, platforms)
values ('d0000000-0000-4000-8000-000000000082', '10000000-0000-4000-8000-000000000001',
        'story_pack', '80000000-0000-4000-8000-000000000001',
        array['60000000-0000-4000-8000-000000000083'::uuid, '60000000-0000-4000-8000-000000000084'::uuid],
        'Logical delete conv fixture', 'A sample story.', array['instagram']::public.social_platform[]);

delete from public.conversations where id = '40000000-0000-4000-8000-000000000001';

do $$
declare
  d record;
begin
  select * into d from public.content_drafts where id = 'd0000000-0000-4000-8000-000000000082';
  assert d.id is null, 'linked Story Pack row must not survive an existing conversation cascade';
end $$;
rollback;
