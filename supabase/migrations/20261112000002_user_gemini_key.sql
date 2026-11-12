-- Per-user Gemini API key for "Identify from photo".
-- The key itself lives encrypted in Supabase Vault; this table only stores the vault id and
-- the last 4 characters for display. Clients can see their own hint row; the key is read only
-- through get_gemini_key() (used by the server route), always scoped to auth.uid().
create table public.user_ai_settings (
  user_id uuid primary key references auth.users (id) on delete cascade,
  gemini_secret_id uuid,
  key_hint text,
  updated_at timestamptz not null default now()
);
alter table public.user_ai_settings enable row level security;
create policy "own ai settings" on public.user_ai_settings for select to authenticated
  using ((select auth.uid()) = user_id);

create or replace function public.set_gemini_key(p_key text)
returns text language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); sid uuid; k text := btrim(p_key);
begin
  if uid is null then raise exception 'not signed in'; end if;
  if k is null or length(k) < 20 then raise exception 'That does not look like an API key'; end if;
  select gemini_secret_id into sid from public.user_ai_settings where user_id = uid;
  if sid is not null and exists (select 1 from vault.secrets where id = sid) then
    perform vault.update_secret(sid, k);
  else
    delete from vault.secrets where name = 'gemini_key_' || uid::text;
    sid := vault.create_secret(k, 'gemini_key_' || uid::text, 'Wrist Check: user Gemini API key');
  end if;
  insert into public.user_ai_settings (user_id, gemini_secret_id, key_hint, updated_at)
  values (uid, sid, right(k, 4), now())
  on conflict (user_id) do update set gemini_secret_id = excluded.gemini_secret_id, key_hint = excluded.key_hint, updated_at = now();
  return right(k, 4);
end $$;

create or replace function public.clear_gemini_key()
returns void language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not signed in'; end if;
  delete from vault.secrets where id = (select gemini_secret_id from public.user_ai_settings where user_id = uid);
  delete from public.user_ai_settings where user_id = uid;
end $$;

create or replace function public.get_gemini_key()
returns text language sql stable security definer set search_path = '' as $$
  select d.decrypted_secret
  from public.user_ai_settings s
  join vault.decrypted_secrets d on d.id = s.gemini_secret_id
  where s.user_id = auth.uid();
$$;

-- Remove a user's vault secret when the account is deleted.
create or replace function public.delete_user_gemini_secret()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  delete from vault.secrets where id = old.gemini_secret_id;
  return old;
end $$;
create trigger user_ai_settings_cleanup after delete on public.user_ai_settings
  for each row execute function public.delete_user_gemini_secret();

revoke execute on function public.set_gemini_key(text), public.clear_gemini_key(), public.get_gemini_key(), public.delete_user_gemini_secret() from public, anon;
grant execute on function public.set_gemini_key(text), public.clear_gemini_key(), public.get_gemini_key() to authenticated;
