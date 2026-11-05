-- Issue #14: outbox retries and restart recovery.
--
-- Outbox: a failed send that may succeed later (429, 5xx, no answer) goes
-- back to 'queued' with backoff, up to MAX attempts; a row claimed but never
-- reported (the process died mid-send) is claimed again after 5 minutes.
-- That retry can send a message twice if the process died after Meta took
-- it; a duplicate is better than a customer who never hears back.
--
-- Recovery: Zukki marks each customer message once it has been handled, so
-- messages that arrived just before a restart can be found and answered.

alter table public.messages
  add column send_attempts smallint not null default 0 check (send_attempts between 0 and 20),
  add column next_send_at timestamptz,
  add column claimed_at timestamptz,
  add column zukki_handled_at timestamptz;

-- Everything already stored counts as handled.
update public.messages set zukki_handled_at = created_at where sender = 'customer';

create index messages_outbox_due_idx on public.messages (created_at)
  where sender <> 'customer' and delivery in ('queued', 'sent') and wa_message_id is null;
create index messages_unhandled_idx on public.messages (created_at)
  where sender = 'customer' and zukki_handled_at is null;

create or replace function public.claim_outbox(p_limit integer default 20)
returns jsonb
language sql volatile security invoker
set search_path = ''
as $$
  with picked as (
    select m.id from public.messages m
    where m.sender <> 'customer'
      and (
        (m.delivery = 'queued' and (m.next_send_at is null or m.next_send_at <= now()))
        -- Claimed, never reported: the process stopped mid-send.
        or (m.delivery = 'sent' and m.wa_message_id is null and m.claimed_at < now() - interval '5 minutes'
            and m.send_attempts < 5)
      )
    order by m.created_at
    limit greatest(1, least(coalesce(p_limit, 20), 100))
    for update skip locked
  ),
  claimed as (
    update public.messages m
    set delivery = 'sent', claimed_at = now(), next_send_at = null, send_attempts = m.send_attempts + 1
    from picked where m.id = picked.id
    returning m.*
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', cl.id,
    'conversationId', cl.conversation_id,
    'waId', cu.wa_id,
    'sender', cl.sender,
    'kind', cl.kind,
    'body', cl.body,
    'payload', cl.payload,
    'polished', cl.polished,
    'mediaId', cl.media_id,
    'businessName', t.name,
    'businessShortName', t.short_name,
    'createdAt', cl.created_at,
    'attempt', cl.send_attempts
  ) order by cl.created_at), '[]'::jsonb)
  from claimed cl
  join public.conversations cv on cv.id = cl.conversation_id
  join public.customers cu on cu.id = cv.customer_id
  left join public.tenants t on t.id = cl.tenant_id
$$;

-- WhatsApp's answer to a send: its message id, or null when it failed.
-- p_retry: the failure may pass (429, 5xx, timeout); the row is queued
-- again after 10 s, 20 s, 40 s, 80 s, and marked failed after the 5th try.
drop function public.record_outbound_result(uuid, text);
create function public.record_outbound_result(p_message_id uuid, p_wa_message_id text, p_retry boolean default false)
returns public.messages
language plpgsql security invoker
set search_path = ''
as $$
declare
  m public.messages;
begin
  update public.messages
  set wa_message_id = coalesce(p_wa_message_id, wa_message_id),
      delivery = case
        when p_wa_message_id is not null then 'sent'::public.delivery_status
        when p_retry and send_attempts < 5 then 'queued'::public.delivery_status
        else 'failed'::public.delivery_status
      end,
      next_send_at = case
        when p_wa_message_id is null and p_retry and send_attempts < 5
          then now() + interval '10 seconds' * power(2, greatest(send_attempts, 1) - 1)
      end
  where id = p_message_id and sender <> 'customer' and delivery in ('queued', 'sent')
  returning * into m;
  if not found then
    raise exception 'message not found or already reported' using errcode = 'P0002';
  end if;
  return m;
end
$$;

revoke all on function public.record_outbound_result(uuid, text, boolean) from public, anon, authenticated;
grant execute on function public.record_outbound_result(uuid, text, boolean) to service_role;
