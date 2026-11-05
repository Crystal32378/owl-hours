-- Issue #14: the owner app opens one request by id (offersService.getOffer),
-- so the offer card moves into one function shared by the list and the
-- single read. approxLocation falls back to the distance, since nothing
-- writes customers.approx_area yet; the exact address stays hidden.
-- Security invoker throughout: row-level security on handoffs decides
-- which offers a caller can see.

create function private.offer_card(h public.handoffs)
returns jsonb
language sql stable security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'id', h.id,
    'conversationId', h.conversation_id,
    'businessId', h.tenant_id,
    'status', h.status,
    'urgent', h.urgency = 'now',
    'distanceKm', h.distance_km,
    'suggestedQuote', case when h.suggested_min is null then null
                           else jsonb_build_object('min', h.suggested_min, 'max', h.suggested_max) end,
    'offeredAt', h.offered_at,
    'expiresAt', h.expires_at,
    'declineReason', h.decline_reason,
    'title', c.title,
    'zukkiSummary', c.summary,
    'customerName', cu.display_name,
    'approxLocation', coalesce(cu.approx_area,
                               case when h.distance_km is not null then h.distance_km::text || ' km away' end),
    'customerQuote', (
      select m.transcript from public.media m
      where m.conversation_id = c.id and m.kind = 'audio' and m.transcript is not null
      order by m.created_at desc limit 1),
    'media', coalesce((
      select jsonb_agg(jsonb_build_object('id', m.id, 'kind', m.kind, 'role', m.role, 'storagePath', m.storage_path,
                                          'thumbPath', m.thumb_path, 'durationMs', m.duration_ms)
                       order by m.created_at)
      from public.media m
      where m.conversation_id = c.id and m.kind in ('video', 'image') and m.role in ('evidence', 'marked_frame')),
      '[]'::jsonb)
  )
  from public.conversations c
  left join public.customers cu on cu.id = c.customer_id
  where c.id = h.conversation_id
$$;

create or replace function public.owner_offers(p_status public.handoff_status default 'offered', p_limit integer default 50)
returns jsonb
language sql stable security invoker
set search_path = ''
as $$
  select coalesce(jsonb_agg(private.offer_card(s) order by s.offered_at desc), '[]'::jsonb)
  from (
    select h.* from public.handoffs h
    where h.status = p_status
    order by h.offered_at desc
    limit greatest(1, least(coalesce(p_limit, 50), 100))
  ) s
$$;

-- null when the offer does not exist or belongs to another business.
create function public.owner_offer(p_handoff_id uuid)
returns jsonb
language sql stable security invoker
set search_path = ''
as $$
  select private.offer_card(h) from public.handoffs h where h.id = p_handoff_id
$$;

revoke all on function private.offer_card(public.handoffs), public.owner_offer(uuid) from public, anon;
grant execute on function private.offer_card(public.handoffs), public.owner_offer(uuid) to authenticated, service_role;
