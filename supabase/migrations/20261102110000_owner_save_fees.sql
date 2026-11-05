-- Owners add, edit and remove their extra fees (odd/tasks/owner-area-map-fees-dark.md S2).
-- owner_business lists each fee with atNight (kind night_fee), and owner_save_fees
-- replaces the caller's fee list the way owner_save_prices replaces the prices.
-- create or replace keeps owner_business's grants.

create or replace function public.owner_business()
returns jsonb
language sql stable security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'id', t.id,
    'name', t.name,
    'shortName', t.short_name,
    'category', t.category,
    'logoUrl', t.logo_url,
    'website', t.website,
    'rating', jsonb_build_object('value', t.rating, 'count', t.review_count),
    'technicians', (select count(*) from public.technicians x where x.tenant_id = t.id and x.active),
    'prices', coalesce((
      select jsonb_agg(jsonb_build_object('id', p.id, 'label', p.item, 'amount', p.min_amount,
                                          'from', p.max_amount > p.min_amount)
                       order by p.kind, p.created_at, p.id)
      from public.price_rules p
      where p.tenant_id = t.id and p.kind in ('callout', 'repair_range')), '[]'::jsonb),
    'fees', coalesce((
      select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
                         'id', p.id, 'label', p.item, 'window', p.conditions,
                         'amount', case when p.at_cost then to_jsonb('at_cost'::text) else to_jsonb(p.min_amount) end,
                         'atNight', p.kind = 'night_fee'))
                       order by p.kind, p.created_at, p.id)
      from public.price_rules p
      where p.tenant_id = t.id and p.kind in ('night_fee', 'extra_fee')), '[]'::jsonb),
    'hours', coalesce((
      select jsonb_agg(jsonb_build_object('weekday', h.weekday, 'opens', to_char(h.opens, 'HH24:MI'),
                                          'closes', to_char(h.closes, 'HH24:MI'))
                       order by h.weekday, h.opens)
      from public.business_hours h
      where h.tenant_id = t.id), '[]'::jsonb),
    'nightJobs', t.night_jobs,
    'area', (
      select jsonb_build_object('lat', extensions.st_y(a.center::extensions.geometry),
                                'lng', extensions.st_x(a.center::extensions.geometry),
                                'radiusKm', a.radius_km)
      from public.service_areas a
      where a.tenant_id = t.id
      order by a.id
      limit 1),
    'hasLocation', not extensions.st_equals(t.location::extensions.geometry,
                                            private.geo_point(0, 0)::extensions.geometry),
    'takingRequests', t.accepts_now,
    'acceptWindowMin', jsonb_build_object(
      'urgent', private.minutes(coalesce(t.urgent_accept_window, w.urgent)),
      'other', private.minutes(coalesce(t.normal_accept_window, w.normal))),
    'linkedAccounts', coalesce((
      select jsonb_agg(jsonb_build_object('kind', l.platform, 'name', coalesce(l.display_name, ''))
                       order by l.created_at)
      from public.linked_accounts l
      where l.tenant_id = t.id), '[]'::jsonb)
  )
  from public.tenants t, private.platform_accept_windows() w
  where t.id = private.caller_business_id()
$$;

-- Replaces the fee list: [{ id?, label, amount, atNight }]. atNight makes a night
-- fee, anything else an extra fee. A listed id of the caller's fees is updated, any
-- other entry is added, and an unlisted fee is removed. Prices, the visit (callout)
-- and "at cost" fees are never touched. A night fee keeps its window, or gets the
-- 10 PM-7 AM one the seed uses, because the suggested quote adds a night fee only
-- inside its window; an extra fee has no night window.
create function public.owner_save_fees(p_fees jsonb)
returns jsonb
language plpgsql security invoker
set search_path = ''
as $$
declare
  v_id uuid := private.caller_owned_business_id();
begin
  -- Owners can call this straight through PostgREST, so it keeps the API's limits itself.
  if jsonb_array_length(p_fees) > 20 then
    raise exception 'at most 20 fees' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_to_recordset(p_fees) as l(amount integer)
             where l.amount is null or l.amount not between 1 and 1000000) then
    raise exception 'a fee amount is a whole number from 1 to 1,000,000' using errcode = '22023';
  end if;

  delete from public.price_rules p
  where p.tenant_id = v_id and p.kind in ('night_fee', 'extra_fee') and not p.at_cost
    and not exists (select 1 from jsonb_array_elements(p_fees) e where e ->> 'id' = p.id::text);

  update public.price_rules p
  set item = l.label,
      kind = private.fee_kind(l."atNight"),
      min_amount = l.amount,
      max_amount = l.amount,
      conditions = case
        when l."atNight" then coalesce(case when p.kind = 'night_fee' then p.conditions end, private.night_window())
        when p.kind = 'extra_fee' then p.conditions
      end
  from jsonb_to_recordset(p_fees) as l(id text, label text, amount integer, "atNight" boolean)
  where p.tenant_id = v_id and p.kind in ('night_fee', 'extra_fee') and not p.at_cost and p.id::text = l.id;

  insert into public.price_rules (tenant_id, item, kind, min_amount, max_amount, conditions)
  select v_id, l.label, private.fee_kind(l."atNight"), l.amount, l.amount,
         case when l."atNight" then private.night_window() end
  from jsonb_to_recordset(p_fees) as l(id text, label text, amount integer, "atNight" boolean)
  where not exists (
    select 1 from public.price_rules p
    where p.tenant_id = v_id and p.kind in ('night_fee', 'extra_fee') and not p.at_cost and p.id::text = l.id);

  return public.owner_business();
end
$$;

create function private.fee_kind(p_at_night boolean)
returns public.price_kind
language sql immutable strict
set search_path = ''
as $$
  select (case when p_at_night then 'night_fee' else 'extra_fee' end)::public.price_kind
$$;

create function private.night_window()
returns text
language sql immutable
set search_path = ''
as $$
  select '10 PM-7 AM'::text
$$;

revoke all on function
  public.owner_save_fees(jsonb),
  private.fee_kind(boolean),
  private.night_window()
from public, anon;
grant execute on function
  public.owner_save_fees(jsonb),
  private.fee_kind(boolean),
  private.night_window()
to authenticated, service_role;
