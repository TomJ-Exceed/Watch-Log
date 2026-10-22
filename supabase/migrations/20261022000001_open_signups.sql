-- Open registration. The allowlist stays in place: a '*' row means anyone may sign up.
-- To go back to invite-only: delete from public.allowed_emails where email = '*';
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not exists (
    select 1 from public.allowed_emails
    where email = '*' or lower(email) = lower(new.email)
  ) then
    raise exception 'Signups are restricted for this app';
  end if;
  perform public.seed_occasions(new.id);
  perform public.seed_sample_data(new.id);
  return new;
end $$;
revoke execute on function public.handle_new_user() from public, anon, authenticated;

insert into public.allowed_emails (email) values ('*') on conflict do nothing;
