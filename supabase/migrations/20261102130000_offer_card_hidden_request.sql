-- An expired or declined request hides its conversation from the business (private.visible_conversation_ids),
-- so the card's join found no row and the card came back null, which took down the whole Requests list.
-- The card now starts from the request itself and carries no customer data when the conversation is hidden
-- (odd/tasks/judge-local-run.md S8). Same fields as 20261101230000; create or replace keeps the grants.

create or replace function private.offer_card(h public.handoffs)
returns jsonb
language sql stable
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
    'category', c.category,
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
  from (select h.conversation_id as id) request
  left join public.conversations c on c.id = request.id
  left join public.customers cu on cu.id = c.customer_id
$$;
