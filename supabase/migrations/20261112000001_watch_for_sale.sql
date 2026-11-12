-- Mark watches for sale with an asking price (sale_price stays = what it actually sold for).
alter table public.watches
  add column for_sale boolean not null default false,
  add column asking_price numeric(12,2);
create index watches_for_sale_idx on public.watches (user_id) where for_sale;
