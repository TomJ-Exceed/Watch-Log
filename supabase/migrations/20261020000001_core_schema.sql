-- Watch Log: core schema
-- Every row carries user_id (defaults to the logged-in user) and is locked down by RLS.

create type public.watch_type as enum ('genuine', 'replica');
create type public.watch_status as enum ('owned', 'sold', 'traded', 'wishlist');
create type public.dealer_type as enum ('AD', 'grey_market', 'rep_dealer', 'private');

-- updated_at helper
create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- DEALERS ------------------------------------------------------------------
create table public.dealers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null,
  type public.dealer_type,
  contact text,
  website text,
  notes text,
  created_at timestamptz not null default now()
);
create index dealers_user_idx on public.dealers (user_id);

-- STRAPS -------------------------------------------------------------------
create table public.straps (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null,
  material text,
  color text,
  width_mm numeric(4,1),
  notes text,
  created_at timestamptz not null default now()
);
create index straps_user_idx on public.straps (user_id);

-- OCCASIONS ----------------------------------------------------------------
create table public.occasions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null,
  is_special boolean not null default false,
  is_default boolean not null default false,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  unique (user_id, name)
);
create index occasions_user_idx on public.occasions (user_id);

-- WATCHES ------------------------------------------------------------------
create table public.watches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  brand text not null,
  model text not null,
  reference text,
  dial_color text,
  case_size_mm numeric(4,1),
  case_material text,
  movement text,
  type public.watch_type not null default 'genuine',
  factory text,              -- replica only (Clean, VSF, ZF...)
  factory_version text,      -- replica only (v4, notes)
  strap_id uuid references public.straps (id) on delete set null,
  condition text,
  serial text,
  notes text,
  is_favorite boolean not null default false,
  dealer_id uuid references public.dealers (id) on delete set null,
  purchase_date date,
  purchase_price numeric(12,2),
  currency text not null default 'USD',
  gen_retail_price numeric(12,2),
  status public.watch_status not null default 'owned',
  sale_date date,
  sale_price numeric(12,2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint factory_only_on_replicas check (type = 'replica' or (factory is null and factory_version is null))
);
create index watches_user_idx on public.watches (user_id);
create index watches_dealer_idx on public.watches (dealer_id);
create index watches_strap_idx on public.watches (strap_id);
create trigger watches_updated_at before update on public.watches
  for each row execute function public.set_updated_at();

-- WATCH PHOTOS -------------------------------------------------------------
create table public.watch_photos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  watch_id uuid not null references public.watches (id) on delete cascade,
  storage_path text not null,
  is_primary boolean not null default false,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
create index watch_photos_watch_idx on public.watch_photos (watch_id);
create index watch_photos_user_idx on public.watch_photos (user_id);
create unique index watch_photos_one_primary on public.watch_photos (watch_id) where is_primary;

-- WEAR LOG -----------------------------------------------------------------
-- Several rows per date are allowed (watch swaps).
create table public.wear_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  date date not null,
  watch_id uuid not null references public.watches (id) on delete cascade,
  strap_id uuid references public.straps (id) on delete set null,
  occasion_id uuid references public.occasions (id) on delete set null,
  occasion_detail text,
  notes text,
  created_at timestamptz not null default now()
);
create index wear_log_user_date_idx on public.wear_log (user_id, date desc);
create index wear_log_watch_idx on public.wear_log (watch_id, date desc);
create index wear_log_strap_idx on public.wear_log (strap_id);
create index wear_log_occasion_idx on public.wear_log (occasion_id);

-- ROW LEVEL SECURITY -------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['dealers','straps','occasions','watches','watch_photos','wear_log'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "own rows: select" on public.%I for select to authenticated using (user_id = (select auth.uid()))', t);
    execute format('create policy "own rows: insert" on public.%I for insert to authenticated with check (user_id = (select auth.uid()))', t);
    execute format('create policy "own rows: update" on public.%I for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t);
    execute format('create policy "own rows: delete" on public.%I for delete to authenticated using (user_id = (select auth.uid()))', t);
  end loop;
end $$;

-- STATS VIEW (respects RLS of the caller) ----------------------------------
create view public.watch_stats with (security_invoker = true) as
select
  w.id as watch_id,
  w.user_id,
  count(l.id)::int as wear_count,
  max(l.date) as last_worn,
  count(l.id) filter (where l.date > current_date - 30)::int as wears_30,
  count(l.id) filter (where l.date > current_date - 90)::int as wears_90,
  count(l.id) filter (where l.date > current_date - 365)::int as wears_365
from public.watches w
left join public.wear_log l on l.watch_id = w.id
group by w.id, w.user_id;
