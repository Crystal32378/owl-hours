-- Accepting an offer opens the job the owner quotes (D24). Until now no
-- function created a job, so send_quote() only worked on the seeded one.
-- The job starts at 'proposed', the state send_quote() accepts, with the
-- offer's suggested range. The public wrapper (advisor_fixes) is unchanged.

create or replace function private.accept_handoff(p_handoff_id uuid)
returns public.handoffs
language plpgsql security definer
set search_path = ''
as $$
declare
  h public.handoffs := private.lock_own_handoff(p_handoff_id);
  accepted public.handoffs;
begin
  if h.status <> 'offered' then
    raise exception 'handoff is already %', h.status using errcode = '22023';
  end if;
  if now() >= h.expires_at then
    return private.resolve_handoff(h, 'expired', 'system', 'accepted after the window closed');
  end if;
  accepted := private.resolve_handoff(h, 'accepted', 'owner', null);
  perform private.open_job(accepted);
  return accepted;
end
$$;

create function private.open_job(h public.handoffs)
returns public.jobs
language plpgsql security definer
set search_path = ''
as $$
declare
  j public.jobs;
begin
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
