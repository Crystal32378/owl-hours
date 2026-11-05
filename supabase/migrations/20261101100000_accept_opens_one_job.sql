-- Accepting an offer opens one job (D28). Since 20261029101127 resolve_handoff
-- opens it, so open_job (D24) returns that job instead of inserting a second
-- one, and only opens the job itself when the handoff has none. accept_handoff
-- locks the handoff row first, so two accepts cannot both miss the job.

create or replace function private.open_job(h public.handoffs)
returns public.jobs
language plpgsql security definer
set search_path = ''
as $$
declare
  j public.jobs;
begin
  select * into j from public.jobs where handoff_id = h.id order by created_at limit 1;
  if found then
    return j;
  end if;

  insert into public.jobs (tenant_id, conversation_id, handoff_id, title, state, total_min, total_max)
  select h.tenant_id, h.conversation_id, h.id, coalesce(c.title, 'Service request'), 'proposed',
         h.suggested_min, h.suggested_max
  from public.conversations c
  where c.id = h.conversation_id
  returning * into j;

  insert into public.job_events (job_id, tenant_id, actor, actor_user_id, from_state, to_state)
  values (j.id, j.tenant_id, 'owner', (select auth.uid()), null, 'proposed');
  return j;
end
$$;

revoke all on function private.open_job(public.handoffs) from public, anon, authenticated;
