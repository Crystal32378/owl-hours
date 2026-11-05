-- The owner's chat shows the quote the owner sent, and when the business accepted the offer
-- (odd/tasks/owner-chat-live-fixes.md, S1 and S3).
--
-- send_quote now also writes the quote into the chat as an owner message linked to the quote.
-- That row only records the quote in the owner's thread: the customer still receives it as
-- Zukki's notice 13 (apps/api/src/orchestrator/notices.ts), so the row is stored as already
-- sent and claim_outbox never picks it up (a 'sent' row with no claimed_at is never reclaimed).

alter table public.messages
  add column quote_id uuid references public.quotes (id) on delete set null;
create index messages_quote_idx on public.messages (quote_id) where quote_id is not null;

create or replace function private.send_quote(
  p_job_id uuid,
  p_lines jsonb,
  p_arrival_from timestamptz,
  p_arrival_to timestamptz,
  p_technician_id uuid default null,
  p_note text default null
)
returns public.quotes
language plpgsql security definer
set search_path = ''
as $$
declare
  j public.jobs;
  q public.quotes;
  tz text;
  invalid_lines integer;
  v_min integer;
  v_max integer;
begin
  select * into j from public.jobs where id = p_job_id for update;
  if not found or j.tenant_id not in (select private.user_tenant_ids()) then
    raise exception 'job not found' using errcode = 'P0002';
  end if;
  if j.state not in ('proposed', 'owner_confirmed') then
    raise exception 'a quote can only be sent before the customer approves (job is %)', j.state using errcode = '22023';
  end if;
  if jsonb_typeof(p_lines) is distinct from 'array' or jsonb_array_length(p_lines) not between 1 and 12 then
    raise exception 'a quote needs 1-12 lines' using errcode = '22023';
  end if;

  select count(*) into invalid_lines
  from jsonb_array_elements(p_lines) as e(line)
  where case
    when jsonb_typeof(e.line) <> 'object' then true
    when coalesce(jsonb_typeof(e.line -> 'label'), '') <> 'string'
      or coalesce(jsonb_typeof(e.line -> 'min'), '') <> 'number'
      or coalesce(jsonb_typeof(e.line -> 'max'), '') <> 'number' then true
    else char_length(e.line ->> 'label') not between 1 and 60
      or (e.line ->> 'min')::numeric < 0
      or (e.line ->> 'max')::numeric < (e.line ->> 'min')::numeric
      or (e.line ->> 'min')::numeric % 1 <> 0
      or (e.line ->> 'max')::numeric % 1 <> 0
  end;
  if invalid_lines > 0 then
    raise exception 'each line needs a label and whole amounts with min <= max' using errcode = '22023';
  end if;
  if p_arrival_to < p_arrival_from then
    raise exception 'arrival window ends before it starts' using errcode = '22023';
  end if;

  -- Totals are always the sum of the lines (packages/shared quoteSchema).
  select sum((e.line ->> 'min')::integer), sum((e.line ->> 'max')::integer) into v_min, v_max
  from jsonb_array_elements(p_lines) as e(line);

  update public.quotes set status = 'superseded', decided_at = now()
  where job_id = j.id and status = 'sent';

  insert into public.quotes (job_id, tenant_id, lines, total_min, total_max, currency, arrival_from, arrival_to,
                             technician_id, note, sent_by)
  values (j.id, j.tenant_id, p_lines, v_min, v_max, j.currency, p_arrival_from, p_arrival_to,
          coalesce(p_technician_id, j.technician_id), p_note, (select auth.uid()))
  returning * into q;

  -- The body is the quote's total line ("Estimated total: $130–160", apps/owner moneyRangeText),
  -- what a chat list previews; the thread draws the quote itself.
  insert into public.messages (conversation_id, tenant_id, sender, author_user_id, body, kind, payload, delivery, quote_id)
  values (j.conversation_id, j.tenant_id, 'owner', (select auth.uid()),
          'Estimated total: $' || v_min || case when v_max = v_min then '' else '–' || v_max end,
          'interactive', jsonb_build_object('variant', 'quote'), 'sent', q.id);

  select t.timezone into tz from public.tenants t where t.id = j.tenant_id;
  update public.jobs
  set state = 'owner_confirmed',
      total_min = v_min,
      total_max = v_max,
      technician_id = q.technician_id,
      arrival_window = to_char(p_arrival_from at time zone tz, 'FMHH12:MI') || '–'
                       || to_char(p_arrival_to at time zone tz, 'FMHH12:MI AM')
  where id = j.id;
  if j.state = 'proposed' then
    insert into public.job_events (job_id, tenant_id, actor, actor_user_id, from_state, to_state, reason)
    values (j.id, j.tenant_id, 'owner', (select auth.uid()), 'proposed', 'owner_confirmed', 'quote ' || q.id || ' sent');
  end if;
  return q;
end
$$;

-- Chats the owner's businesses accepted, newest first, with unread counts and the accept time.
create or replace function public.owner_conversations(p_limit integer default 50)
returns jsonb
language sql stable security invoker
set search_path = ''
as $$
  select coalesce(jsonb_agg(s.item order by s.last_at desc), '[]'::jsonb)
  from (
    select c.last_message_at as last_at, jsonb_build_object(
      'id', c.id,
      'offerId', h.id,
      'businessId', h.tenant_id,
      'title', c.title,
      'customerName', cu.display_name,
      'chatOpen', h.status = 'accepted',
      'acceptedAt', h.resolved_at,
      'lastMessageAt', c.last_message_at,
      'job', (
        select jsonb_build_object('id', j.id, 'state', j.state, 'arrivalWindow', j.arrival_window)
        from public.jobs j where j.conversation_id = c.id and j.tenant_id = h.tenant_id
        order by j.created_at desc limit 1),
      'lastMessage', (
        select jsonb_build_object('id', m.id, 'from', m.sender, 'kind', m.kind, 'text', m.body, 'sentAt', m.created_at)
        from public.messages m where m.conversation_id = c.id
        order by m.created_at desc limit 1),
      'unread', (
        select count(*) from public.messages m
        where m.conversation_id = c.id and m.sender <> 'owner'
          and m.created_at > coalesce((
            select r.last_read_at from public.conversation_reads r
            where r.user_id = (select auth.uid()) and r.conversation_id = c.id), '-infinity'::timestamptz))
    ) as item
    from public.handoffs h
    join public.conversations c on c.id = h.conversation_id
    left join public.customers cu on cu.id = c.customer_id
    where h.status in ('accepted', 'closed')
    order by c.last_message_at desc
    limit greatest(1, least(coalesce(p_limit, 50), 100))
  ) s
$$;

-- One page of a chat, oldest first. Page back with p_before = the first sentAt.
-- A quote message carries its quote; Zukki's WhatsApp copy of that same quote is left out.
create or replace function public.owner_conversation_messages(
  p_conversation_id uuid,
  p_before timestamptz default null,
  p_limit integer default 50
)
returns jsonb
language plpgsql stable security invoker
set search_path = ''
as $$
declare
  page jsonb;
begin
  if not exists (select 1 from public.conversations c where c.id = p_conversation_id) then
    raise exception 'conversation not found' using errcode = 'P0002';
  end if;
  select coalesce(jsonb_agg(s.item order by s.created_at), '[]'::jsonb) into page
  from (
    select m.created_at, jsonb_build_object(
      'id', m.id,
      'from', m.sender,
      'kind', m.kind,
      'text', m.body,
      'payload', m.payload,
      'sentAt', m.created_at,
      'status', m.delivery,
      'delivery', case when m.sender = 'owner' and m.quote_id is null
                       then case when m.polished then 'polished' else 'as_written' end end,
      'media', case when md.id is null then null
                    else jsonb_build_object('id', md.id, 'kind', md.kind, 'storagePath', md.storage_path,
                                            'durationMs', md.duration_ms, 'transcript', md.transcript) end,
      'quote', case when q.id is null then null
                    else jsonb_build_object('id', q.id, 'lines', q.lines,
                                            'total', jsonb_build_object('min', q.total_min, 'max', q.total_max),
                                            'arrivalFrom', q.arrival_from, 'arrivalTo', q.arrival_to,
                                            'note', q.note, 'technician', t.display_name) end
    ) as item
    from public.messages m
    left join public.media md on md.id = m.media_id
    left join public.quotes q on q.id = m.quote_id
    left join public.technicians t on t.id = q.technician_id
    where m.conversation_id = p_conversation_id and (p_before is null or m.created_at < p_before)
      and not (m.sender = 'zukki' and m.payload ->> 'variant' = 'quote'
               and exists (select 1 from public.messages shown
                           where shown.conversation_id = m.conversation_id
                             and shown.quote_id::text = m.payload ->> 'quote_id'))
    order by m.created_at desc
    limit greatest(1, least(coalesce(p_limit, 50), 200))
  ) s;
  return page;
end
$$;
