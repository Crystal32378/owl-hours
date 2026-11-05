-- The owner app's Business tab, Prices, Settings and the Requests switch
-- read and write the caller's business through these functions.
-- The business is the caller's first membership (oldest, then by id), the
-- same one GET /me lists first. Security invoker throughout, so row-level
-- security still decides every write; the only definer is the read of the
-- platform accept windows, which owners may see but not change.

create function private.caller_business_id()
returns uuid
language sql stable security invoker
set search_path = ''
as $$
  select tu.tenant_id from public.tenant_users tu
  where tu.user_id = (select auth.uid())
  order by tu.created_at, tu.tenant_id
  limit 1
$$;

-- The business a write applies to: 404 without one, 403 for staff.
create function private.caller_owned_business_id()
returns uuid
language plpgsql stable security invoker
set search_path = ''
as $$
declare
  v_id uuid := private.caller_business_id();
begin
  if v_id is null then
    raise exception 'no business for this account' using errcode = 'P0002';
  end if;
  if v_id not in (select private.user_owner_tenant_ids()) then
    raise exception 'only the business owner can change it' using errcode = '42501';
  end if;
  return v_id;
end
$$;

-- platform_settings is server-only; owners read the two windows, nothing else.
create function private.platform_accept_windows(out urgent interval, out normal interval)
language sql stable security definer
set search_path = ''
as $$
  select coalesce(s.urgent_accept_window, interval '5 minutes'), coalesce(s.normal_accept_window, interval '30 minutes')
  from (select 1) one
  left join public.platform_settings s on s.id
$$;

create function private.minutes(p_window interval)
returns integer
language sql immutable strict
set search_path = ''
as $$
  select (extract(epoch from p_window) / 60)::integer
$$;

-- Prices are the callout and repair ranges ("from" when the range is open);
-- night and extra fees are listed apart, as the app shows them.
create function public.owner_business()
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
                         'amount', case when p.at_cost then to_jsonb('at_cost'::text) else to_jsonb(p.min_amount) end))
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

-- Profile and switches. A null argument keeps the current value; an empty
-- website clears it.
create function public.owner_update_business(
  p_name text default null,
  p_short_name text default null,
  p_website text default null,
  p_taking_requests boolean default null,
  p_night_jobs boolean default null
)
returns jsonb
language plpgsql security invoker
set search_path = ''
as $$
declare
  v_id uuid := private.caller_owned_business_id();
begin
  update public.tenants set
    name = coalesce(p_name, name),
    short_name = coalesce(p_short_name, short_name),
    website = case when p_website is null then website else nullif(p_website, '') end,
    accepts_now = coalesce(p_taking_requests, accepts_now),
    night_jobs = coalesce(p_night_jobs, night_jobs)
  where id = v_id;
  return public.owner_business();
end
$$;

-- Replaces the price list: [{ id?, label, amount }]. A listed id of the
-- caller's prices is updated (a range keeps its width), any other entry is
-- added as a fixed price, and an unlisted price is removed. Fees stay.
create function public.owner_save_prices(p_prices jsonb)
returns jsonb
language plpgsql security invoker
set search_path = ''
as $$
declare
  v_id uuid := private.caller_owned_business_id();
begin
  -- The visit (callout) is the fee the suggested quote starts from: it is edited, never removed.
  delete from public.price_rules p
  where p.tenant_id = v_id and p.kind = 'repair_range'
    and not exists (select 1 from jsonb_array_elements(p_prices) e where e ->> 'id' = p.id::text);

  update public.price_rules p
  set item = l.label, min_amount = l.amount, max_amount = l.amount + (p.max_amount - p.min_amount)
  from jsonb_to_recordset(p_prices) as l(id text, label text, amount integer)
  where p.tenant_id = v_id and p.kind in ('callout', 'repair_range') and p.id::text = l.id;

  insert into public.price_rules (tenant_id, item, kind, min_amount, max_amount)
  select v_id, l.label, 'repair_range', l.amount, l.amount
  from jsonb_to_recordset(p_prices) as l(id text, label text, amount integer)
  where not exists (
    select 1 from public.price_rules p
    where p.tenant_id = v_id and p.kind in ('callout', 'repair_range') and p.id::text = l.id);

  return public.owner_business();
end
$$;

-- Replaces the opening hours: [{ weekday, opens, closes }] ("HH:MM").
create function public.owner_save_hours(p_hours jsonb)
returns jsonb
language plpgsql security invoker
set search_path = ''
as $$
declare
  v_id uuid := private.caller_owned_business_id();
begin
  delete from public.business_hours where tenant_id = v_id;
  insert into public.business_hours (tenant_id, weekday, opens, closes)
  select v_id, e.weekday, e.opens, e.closes
  from jsonb_to_recordset(p_hours) as e(weekday smallint, opens time, closes time);
  return public.owner_business();
end
$$;

-- Replaces the service area with one circle.
create function public.owner_save_area(p_lat double precision, p_lng double precision, p_radius_km numeric)
returns jsonb
language plpgsql security invoker
set search_path = ''
as $$
declare
  v_id uuid := private.caller_owned_business_id();
begin
  delete from public.service_areas where tenant_id = v_id;
  insert into public.service_areas (tenant_id, center, radius_km)
  values (v_id, private.geo_point(p_lat, p_lng), p_radius_km);
  return public.owner_business();
end
$$;

revoke all on function
  private.caller_business_id(),
  private.caller_owned_business_id(),
  private.platform_accept_windows(),
  private.minutes(interval),
  public.owner_business(),
  public.owner_update_business(text, text, text, boolean, boolean),
  public.owner_save_prices(jsonb),
  public.owner_save_hours(jsonb),
  public.owner_save_area(double precision, double precision, numeric)
from public, anon;
grant execute on function
  private.caller_business_id(),
  private.caller_owned_business_id(),
  private.platform_accept_windows(),
  private.minutes(interval),
  public.owner_business(),
  public.owner_update_business(text, text, text, boolean, boolean),
  public.owner_save_prices(jsonb),
  public.owner_save_hours(jsonb),
  public.owner_save_area(double precision, double precision, numeric)
to authenticated, service_role;
