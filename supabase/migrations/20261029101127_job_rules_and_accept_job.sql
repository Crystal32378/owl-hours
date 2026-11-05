-- Issue #14, items 1 and 2.
--
-- 1. Agent, customer and system job moves follow the same edge table as
--    packages/shared/src/job-states.ts, enforced here so no service-role
--    path can skip a step (customer_approved needs owner_confirmed first).
-- 2. Accepting an offer opens the job in 'proposed', so the owner can send
--    a quote and the customer can approve it.

-- Mirror of canTransitionJob() in packages/shared/src/job-states.ts. Keep
-- the two in step.
create function private.job_move_allowed(p_from public.job_state, p_to public.job_state, p_actor public.job_actor)
returns boolean
language sql immutable
set search_path = ''
as $$
  select case
    when p_from in ('done', 'declined', 'cancelled') then false
    when p_to in ('declined', 'cancelled') then p_from <> 'on_site' and p_actor in ('owner', 'customer', 'system')
    else (p_from, p_to) in (('requested', 'triaged'), ('triaged', 'proposed')) and p_actor in ('agent', 'system')
      or (p_from, p_to) = ('proposed', 'owner_confirmed') and p_actor = 'owner'
      or (p_from, p_to) = ('owner_confirmed', 'customer_approved') and p_actor = 'customer'
      or (p_from, p_to) in (('customer_approved', 'en_route'), ('en_route', 'on_site'), ('on_site', 'done'))
         and p_actor in ('owner', 'system')
  end
$$;

revoke all on function private.job_move_allowed(public.job_state, public.job_state, public.job_actor) from public, anon;
grant execute on function private.job_move_allowed(public.job_state, public.job_state, public.job_actor)
  to authenticated, service_role;

-- Errors: P0002 job missing, 40001 the job changed since it was read
-- (re-read and retry), 22023 owner moves or a move the rules do not allow.
create or replace function public.record_job_transition(
  p_job_id uuid,
  p_from public.job_state,
  p_to public.job_state,
  p_actor public.job_actor,
  p_reason text
)
returns public.jobs
language plpgsql security invoker
set search_path = ''
as $$
declare
  j public.jobs;
begin
  if p_actor = 'owner' then
    raise exception 'owner moves go through owner_transition_job' using errcode = '22023';
  end if;
  if not private.job_move_allowed(p_from, p_to, p_actor) then
    raise exception 'a job cannot move from % to % as %', p_from, p_to, p_actor using errcode = '22023';
  end if;
  if p_reason is null or char_length(p_reason) not between 1 and 500 then
    raise exception 'a reason of 1-500 characters is required' using errcode = '22023';
  end if;

  update public.jobs set state = p_to
  where id = p_job_id and state = p_from
  returning * into j;
  if not found then
    if exists (select 1 from public.jobs where id = p_job_id) then
      raise exception 'job % is no longer %', p_job_id, p_from using errcode = '40001';
    end if;
    raise exception 'job not found' using errcode = 'P0002';
  end if;

  insert into public.job_events (job_id, tenant_id, actor, from_state, to_state, reason)
  values (j.id, j.tenant_id, p_actor, p_from, p_to, p_reason);
  return j;
end
$$;

-- Same body as before, plus the job on accept. Once per handoff: a retried
-- accept never opens a second job.
create or replace function private.resolve_handoff(
  h public.handoffs,
  p_status public.handoff_status,
  p_actor public.job_actor,
  p_reason text
)
returns public.handoffs
language plpgsql security definer
set search_path = ''
as $$
declare
  resolved public.handoffs;
  v_job public.jobs;
begin
  update public.handoffs set status = p_status, resolved_at = now()
  where id = h.id
  returning * into resolved;

  update public.conversations
  set state = case when p_status = 'accepted' then 'accepted'::public.conversation_state
                   else 'matched'::public.conversation_state end,
      active_handoff_id = case when p_status = 'accepted' then h.id else null end
  where id = h.conversation_id and (active_handoff_id = h.id or active_handoff_id is null);

  insert into public.handoff_events (handoff_id, tenant_id, actor, actor_user_id, from_status, to_status, reason)
  values (h.id, h.tenant_id, p_actor, (select auth.uid()), h.status, p_status, p_reason);

  if p_status = 'accepted' and not exists (select 1 from public.jobs where handoff_id = h.id) then
    insert into public.jobs (tenant_id, conversation_id, handoff_id, title, state, total_min, total_max, currency, ticket)
    select h.tenant_id, h.conversation_id, h.id,
           coalesce(nullif(btrim(c.title), ''), 'Service request'),
           'proposed', h.suggested_min, h.suggested_max,
           coalesce((select pr.currency from public.price_rules pr where pr.tenant_id = h.tenant_id
                     order by pr.created_at limit 1), 'USD'),
           jsonb_build_object('category', c.category, 'urgency', h.urgency, 'summary', c.summary)
    from public.conversations c
    where c.id = h.conversation_id
    returning * into v_job;

    insert into public.job_events (job_id, tenant_id, actor, actor_user_id, from_state, to_state, reason)
    values (v_job.id, v_job.tenant_id, p_actor, (select auth.uid()), null, 'proposed', 'request accepted');
  end if;
  return resolved;
end
$$;
