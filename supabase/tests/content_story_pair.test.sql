-- A Story Pack is one exact before/after pair, including privileged fixtures.
\set ON_ERROR_STOP 1
\set mario '{"sub":"20000000-0000-4000-8000-000000000001","role":"authenticated"}'
begin;
update public.jobs set state = 'done' where id = '80000000-0000-4000-8000-000000000001';
insert into public.media (id, conversation_id, job_id, kind, role, story_role, storage_path, mime_type)
values
 ('60000000-0000-4000-8000-000000000081','40000000-0000-4000-8000-000000000001','80000000-0000-4000-8000-000000000001','image','evidence','before','conversations/40000000-0000-4000-8000-000000000001/pair-a.webp','image/webp'),
 ('60000000-0000-4000-8000-000000000082','40000000-0000-4000-8000-000000000001','80000000-0000-4000-8000-000000000001','image','evidence','after','conversations/40000000-0000-4000-8000-000000000001/pair-b.webp','image/webp'),
 ('60000000-0000-4000-8000-000000000083','40000000-0000-4000-8000-000000000001','80000000-0000-4000-8000-000000000001','image','evidence','after','conversations/40000000-0000-4000-8000-000000000001/pair-c.webp','image/webp');
insert into public.consents(conversation_id, kind, granted, at)
values ('40000000-0000-4000-8000-000000000001','photos_for_marketing',true,'2099-02-01');
set local role authenticated;
set local request.jwt.claims to :'mario';
do $$
declare ids uuid[] := array['60000000-0000-4000-8000-000000000081','60000000-0000-4000-8000-000000000082','60000000-0000-4000-8000-000000000083']::uuid[];
begin
  assert private.story_pack_is_eligible('80000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001', ids[1:2]), 'an exact pair must remain eligible';
  assert not private.story_pack_is_eligible('80000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001', ids), 'three assigned photos must not satisfy the pair contract';
end $$;
rollback;
