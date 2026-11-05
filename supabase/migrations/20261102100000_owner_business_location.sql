-- A new business starts at the placeholder point (0, 0) (owner_create_business),
-- and customers are matched against both tenants.location and the service
-- area (search_directory), so a business that only saved its area was never
-- found. Saving the area now moves the business to the area centre, and the
-- business read says whether it still sits at the placeholder.
-- create or replace keeps both functions' grants.

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

-- Replaces the service area with one circle and moves the business to its centre.
-- The point is rounded to 3 decimals (about 110 m): a home-based owner's exact device fix
-- is never stored. The (0, 0) placeholder never overwrites a real business location.
create or replace function public.owner_save_area(p_lat double precision, p_lng double precision, p_radius_km numeric)
returns jsonb
language plpgsql security invoker
set search_path = ''
as $$
declare
  v_id uuid := private.caller_owned_business_id();
  v_center extensions.geography := private.geo_point(round(p_lat::numeric, 3), round(p_lng::numeric, 3));
begin
  delete from public.service_areas where tenant_id = v_id;
  insert into public.service_areas (tenant_id, center, radius_km) values (v_id, v_center, p_radius_km);
  if (p_lat, p_lng) <> (0, 0) then
    update public.tenants set location = v_center where id = v_id;
  end if;
  return public.owner_business();
end
$$;
