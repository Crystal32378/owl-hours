-- Accepting an offer opens the job the owner quotes (odd/tasks/live-accept-creates-job.md).
\set ON_ERROR_STOP 1
\set mario '{"sub":"20000000-0000-4000-8000-000000000001","role":"authenticated"}'
\set eastside '{"sub":"20000000-0000-4000-8000-000000000002","role":"authenticated"}'

\echo '# an accepted offer opens one proposed job for that business'
begin;
set local role service_role;
update public.handoffs set suggested_min = 80, suggested_max = 120 where id = '50000000-0000-4000-8000-000000000002';
set local role authenticated;
set local request.jwt.claims to :'eastside';
do $$
declare j public.jobs;
begin
  perform public.accept_handoff('50000000-0000-4000-8000-000000000002');
  assert (select count(*) from public.jobs where handoff_id = '50000000-0000-4000-8000-000000000002') = 1,
    'one job per accepted handoff';
  select * into j from public.jobs where handoff_id = '50000000-0000-4000-8000-000000000002';
  assert j.tenant_id = '10000000-0000-4000-8000-000000000002', 'job belongs to the accepting business';
  assert j.conversation_id = '40000000-0000-4000-8000-000000000002', 'job belongs to the conversation';
  assert j.state = 'proposed', 'job state was ' || j.state;
  assert j.title = 'Kitchen sink dripping', 'title was ' || j.title;
  assert j.total_min = 80 and j.total_max = 120, 'range comes from the offer';
  assert (select count(*) from public.job_events
          where job_id = j.id and from_state is null and to_state = 'proposed' and actor = 'owner') = 1,
    'job creation is logged';
end $$;
rollback;

\echo '# a conversation without a title still opens a job'
begin;
set local role service_role;
update public.conversations set title = null where id = '40000000-0000-4000-8000-000000000002';
set local role authenticated;
set local request.jwt.claims to :'eastside';
do $$ begin
  perform public.accept_handoff('50000000-0000-4000-8000-000000000002');
  assert (select title from public.jobs where handoff_id = '50000000-0000-4000-8000-000000000002') = 'Service request',
    'fallback title';
end $$;
rollback;

\echo '# a late accept and a decline open no job'
begin;
set local role service_role;
update public.handoffs set offered_at = now() - interval '2 hours', expires_at = now() - interval '1 hour'
where id = '50000000-0000-4000-8000-000000000002';
set local role authenticated;
set local request.jwt.claims to :'eastside';
do $$ begin
  perform public.accept_handoff('50000000-0000-4000-8000-000000000002');
  assert (select count(*) from public.jobs where handoff_id = '50000000-0000-4000-8000-000000000002') = 0,
    'expired offer opened a job';
end $$;
rollback;

begin;
set local role authenticated;
set local request.jwt.claims to :'eastside';
do $$ begin
  perform public.decline_handoff('50000000-0000-4000-8000-000000000002', 'busy');
  assert (select count(*) from public.jobs where handoff_id = '50000000-0000-4000-8000-000000000002') = 0,
    'declined offer opened a job';
end $$;
rollback;

\echo '# the owner quotes the new job and another business cannot see it'
begin;
set local role authenticated;
set local request.jwt.claims to :'eastside';
do $$
declare j public.jobs;
begin
  perform public.accept_handoff('50000000-0000-4000-8000-000000000002');
  select * into j from public.jobs where handoff_id = '50000000-0000-4000-8000-000000000002';
  perform public.send_quote(j.id, '[{"label":"Fix the drip","min":80,"max":120}]'::jsonb,
                            now() + interval '1 hour', now() + interval '2 hours');
  assert (select state from public.jobs where id = j.id) = 'owner_confirmed', 'quoted job is owner_confirmed';
  perform set_config('zukki.test_job', j.id::text, true);
end $$;
set local request.jwt.claims to :'mario';
do $$ begin
  assert (select count(*) from public.jobs where id = current_setting('zukki.test_job')::uuid) = 0,
    'Mario sees Eastside''s job';
end $$;
rollback;
