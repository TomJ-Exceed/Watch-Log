-- Photo storage, single-user signup lock, and first-login seeding.

-- STORAGE: private bucket, files live under <user_id>/<watch_id>/<file>
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('watch-photos', 'watch-photos', false, 10485760, array['image/jpeg','image/png','image/webp','image/heic'])
on conflict (id) do nothing;

create policy "watch photos: own folder read" on storage.objects for select to authenticated
  using (bucket_id = 'watch-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "watch photos: own folder insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'watch-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "watch photos: own folder update" on storage.objects for update to authenticated
  using (bucket_id = 'watch-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "watch photos: own folder delete" on storage.objects for delete to authenticated
  using (bucket_id = 'watch-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- SIGNUP ALLOWLIST: only these emails can create an account.
create table public.allowed_emails (email text primary key);
alter table public.allowed_emails enable row level security; -- no policies = no API access
insert into public.allowed_emails (email) values ('tjeffersiii@gmail.com');

-- DEFAULT OCCASIONS
create or replace function public.seed_occasions(p_user uuid)
returns void language sql security definer set search_path = '' as $$
  insert into public.occasions (user_id, name, is_special, is_default, sort_order) values
    (p_user, 'Daily Wear', false, true, 0),
    (p_user, 'Work', false, false, 1),
    (p_user, 'Casual', false, false, 2),
    (p_user, 'Gym', false, false, 3),
    (p_user, 'Travel', false, false, 4),
    (p_user, 'Date Night', true, false, 5),
    (p_user, 'Special Occasion', true, false, 6),
    (p_user, 'Wedding', true, false, 7),
    (p_user, 'Event', true, false, 8),
    (p_user, 'Holiday', true, false, 9)
  on conflict (user_id, name) do nothing;
$$;

-- SAMPLE DATA (all tagged "[sample]" in notes so it can be removed in one click)
create or replace function public.seed_sample_data(p_user uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  d_ad uuid; d_grey uuid; d_rep uuid;
  s_oyster uuid; s_rubber uuid; s_nato uuid; s_leather uuid;
  w_omega uuid; w_tudor uuid; w_sub uuid; w_seiko uuid;
  o_daily uuid; o_work uuid; o_wedding uuid; o_casual uuid;
begin
  insert into public.dealers (user_id, name, type, notes) values (p_user, 'Local AD', 'AD', '[sample]') returning id into d_ad;
  insert into public.dealers (user_id, name, type, notes) values (p_user, 'Grey Market Co.', 'grey_market', '[sample]') returning id into d_grey;
  insert into public.dealers (user_id, name, type, notes) values (p_user, 'Sample Dealer', 'rep_dealer', '[sample]') returning id into d_rep;

  insert into public.straps (user_id, name, material, color, width_mm, notes) values (p_user, 'Oyster bracelet', 'Steel', 'Silver', 20, '[sample]') returning id into s_oyster;
  insert into public.straps (user_id, name, material, color, width_mm, notes) values (p_user, 'Black rubber', 'Rubber', 'Black', 20, '[sample]') returning id into s_rubber;
  insert into public.straps (user_id, name, material, color, width_mm, notes) values (p_user, 'Navy NATO', 'Nylon', 'Navy', 20, '[sample]') returning id into s_nato;
  insert into public.straps (user_id, name, material, color, width_mm, notes) values (p_user, 'Brown leather', 'Leather', 'Brown', 20, '[sample]') returning id into s_leather;

  insert into public.watches (user_id, brand, model, reference, dial_color, case_size_mm, case_material, movement, type, strap_id, condition, is_favorite, dealer_id, purchase_date, purchase_price, gen_retail_price, notes)
  values (p_user, 'Omega', 'Seamaster Diver 300M', '210.30.42.20.03.001', 'Blue', 42, 'Steel', 'Cal. 8800', 'genuine', s_rubber, 'Excellent', true, d_ad, current_date - 400, 5400, 5900, '[sample]')
  returning id into w_omega;

  insert into public.watches (user_id, brand, model, reference, dial_color, case_size_mm, case_material, movement, type, strap_id, condition, dealer_id, purchase_date, purchase_price, gen_retail_price, notes)
  values (p_user, 'Tudor', 'Black Bay 58', 'M79030N', 'Black', 39, 'Steel', 'MT5402', 'genuine', s_leather, 'Very good', d_grey, current_date - 250, 3600, 4200, '[sample]')
  returning id into w_tudor;

  insert into public.watches (user_id, brand, model, reference, dial_color, case_size_mm, case_material, movement, type, factory, factory_version, strap_id, condition, is_favorite, dealer_id, purchase_date, purchase_price, gen_retail_price, notes)
  values (p_user, 'Rolex', 'Submariner Date', '126610LN', 'Black', 41, 'Steel', '3235 clone', 'replica', 'Clean', 'V4', s_oyster, 'New', true, d_rep, current_date - 90, 520, 10800, '[sample]')
  returning id into w_sub;

  insert into public.watches (user_id, brand, model, reference, dial_color, case_size_mm, case_material, movement, type, strap_id, condition, dealer_id, purchase_date, purchase_price, gen_retail_price, notes)
  values (p_user, 'Seiko', 'Prospex Alpinist', 'SPB121', 'Green', 39.5, 'Steel', '6R35', 'genuine', s_nato, 'Good', d_grey, current_date - 700, 650, 750, '[sample]')
  returning id into w_seiko;

  select id into o_daily from public.occasions where user_id = p_user and name = 'Daily Wear';
  select id into o_work from public.occasions where user_id = p_user and name = 'Work';
  select id into o_wedding from public.occasions where user_id = p_user and name = 'Wedding';
  select id into o_casual from public.occasions where user_id = p_user and name = 'Casual';

  -- last 7 days (today left empty so you can try the flow)
  insert into public.wear_log (user_id, date, watch_id, strap_id, occasion_id, occasion_detail, notes) values
    (p_user, current_date - 7, w_omega, s_rubber, o_daily, null, '[sample]'),
    (p_user, current_date - 6, w_sub,   s_oyster, o_work,  null, '[sample]'),
    (p_user, current_date - 5, w_sub,   s_oyster, o_work,  null, '[sample]'),
    (p_user, current_date - 4, w_tudor, s_leather, o_wedding, 'Friend''s wedding', '[sample]'),
    (p_user, current_date - 3, w_omega, s_rubber, o_daily, null, '[sample] morning'),
    (p_user, current_date - 3, w_seiko, s_nato,   o_casual, null, '[sample] swapped for dinner'),
    (p_user, current_date - 2, w_omega, s_rubber, o_work,  null, '[sample]'),
    (p_user, current_date - 1, w_sub,   s_oyster, o_daily, null, '[sample]');
end $$;

-- Sample removal is done from the app (Settings > Remove sample data) via RLS-scoped deletes.

-- New user: enforce allowlist, then seed occasions + samples.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.allowed_emails where lower(email) = lower(new.email)) then
    raise exception 'Signups are restricted for this app';
  end if;
  perform public.seed_occasions(new.id);
  perform public.seed_sample_data(new.id);
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Lock down the seeding helpers so they can't be called through the API.
revoke execute on function public.seed_occasions(uuid) from public, anon, authenticated;
revoke execute on function public.seed_sample_data(uuid) from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
