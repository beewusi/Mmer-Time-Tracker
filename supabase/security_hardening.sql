-- Security Advisor fixes

-- 1. SECURITY DEFINER functions open to anon + authenticated via the API
-- auto_clock_out_overdue: not called by the app
-- handle_new_user: sign-up trigger only
-- (auto_clock_out_overdue is dropped in 10, skipped once it's gone)
do $$ begin
  if to_regprocedure('public.auto_clock_out_overdue()') is not null then
    revoke execute on function public.auto_clock_out_overdue() from public, anon, authenticated;
  end if;
end $$;
revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- 2. Functions with no fixed search_path
-- pinned to public so a different search_path can't swap in other objects
alter function public.handle_new_user() set search_path = public;
do $$ begin
  if to_regprocedure('public.auto_clock_out_overdue()') is not null then
    alter function public.auto_clock_out_overdue() set search_path = public;
  end if;
end $$;
alter function public.hms_string set search_path = public;

-- 3. avatars bucket: anyone could list every file in it
-- public URLs still work without a select policy. Kept select for own files
-- only, since the upload in Profile.js uses upsert (needs select on the file).
drop policy if exists "avatars_public_read" on storage.objects;
drop policy if exists "avatars_own_read" on storage.objects;
create policy "avatars_own_read" on storage.objects
  for select to authenticated
  using (bucket_id = 'avatars' and name like auth.uid()::text || '-%');

-- 4. Leaked password protection
-- Pro plan only, left off for now. Stronger password rules set in the
-- dashboard instead (Authentication > Sign In / Providers > Email).

-- RLS fixes

-- 5. profiles readable by anyone with the anon key (names, emails, status, is_admin)
-- own profile + admin policies already cover what the app needs
drop policy if exists "Public profiles are viewable by everyone" on public.profiles;

-- 6. employees could change their own status / is_admin / department
-- profiles are only created by handle_new_user, so no insert policy needed
drop policy if exists "Users can insert their own profile" on public.profiles;

-- admin, service role and the sign-up trigger can change anything,
-- everyone else only their own name, avatar and reminder settings
create or replace function public.protect_profile_fields()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if coalesce(auth.jwt() ->> 'email', '') = 'admin@mmer3.com'
     or coalesce(auth.jwt() ->> 'role', '') = 'service_role'
     or auth.uid() is null then
    return new;
  end if;

  if new.status is distinct from old.status
     or new.is_admin is distinct from old.is_admin
     or new.department is distinct from old.department
     or new.email is distinct from old.email
     or new.id is distinct from old.id then
    raise exception 'Only an admin can change status, admin access, department or email';
  end if;

  return new;
end;
$$;

drop trigger if exists protect_profile_fields on public.profiles;
create trigger protect_profile_fields
  before update on public.profiles
  for each row execute function public.protect_profile_fields();

-- 7. records: "allow all" let employees edit and delete their own sessions,
-- including hours_worked and location_status
-- employees only read + add their own now, admin policies unchanged
drop policy if exists "allow all" on public.records;

drop policy if exists "records_select_own" on public.records;
create policy "records_select_own" on public.records
  for select to authenticated
  using (auth.uid() = user_id::uuid);

drop policy if exists "records_insert_own" on public.records;
create policy "records_insert_own" on public.records
  for insert to authenticated
  with check (auth.uid() = user_id::uuid);

-- location on an employee's own record comes from their employee_status row
-- (where the admin's authorise/decline is saved), not from the browser
create or replace function public.set_record_location()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  live_location text;
begin
  if coalesce(auth.jwt() ->> 'email', '') = 'admin@mmer3.com'
     or coalesce(auth.jwt() ->> 'role', '') = 'service_role'
     or auth.uid() is null then
    return new;
  end if;

  select location_status into live_location
  from employee_status
  where user_id::text = new.user_id::text;

  new.location_status := coalesce(live_location, 'unavailable');
  new.adjusted_by_admin := false;
  return new;
end;
$$;

drop trigger if exists set_record_location on public.records;
create trigger set_record_location
  before insert on public.records
  for each row execute function public.set_record_location();

-- 8. time_off_requests: employees could add a request that was already approved
-- new requests have to come in as pending, with no admin reply
drop policy if exists "time_off_insert_own" on public.time_off_requests;

create policy "time_off_insert_own" on public.time_off_requests
  for insert to authenticated
  with check (
    auth.uid() = user_id
    and status = 'pending'
    and admin_message is null
    and employee_name is null
  );

-- 9. employee_status: employees could change their own live session
-- (location, clock-in time, break total)
-- admin, service role and the SQL editor skip this
create or replace function public.protect_employee_status()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if coalesce(auth.jwt() ->> 'email', '') = 'admin@mmer3.com'
     or coalesce(auth.jwt() ->> 'role', '') = 'service_role'
     or auth.uid() is null then
    return new;
  end if;

  -- the app saves with upsert, which fires the insert trigger first even when
  -- the row exists. Existing row = leave it to the update part of the upsert.
  if tg_op = 'INSERT'
     and exists (select 1 from employee_status where user_id = new.user_id) then
    return new;
  end if;

  -- session carrying on: clock-in time and location stay as they were,
  -- break times measured here instead of trusting the browser
  if tg_op = 'UPDATE'
     and old.status in ('clocked_in', 'on_break')
     and new.status in ('clocked_in', 'on_break') then
    new.clock_in_at := old.clock_in_at;
    new.location_status := old.location_status;

    if old.status = 'clocked_in' and new.status = 'on_break' then
      new.break_started_at := now();
      new.break_accum_seconds := coalesce(old.break_accum_seconds, 0);
    elsif old.status = 'on_break' and new.status = 'clocked_in' then
      new.break_started_at := null;
      new.break_accum_seconds := coalesce(old.break_accum_seconds, 0)
        + greatest(0, round(extract(epoch from (now() - coalesce(old.break_started_at, now())))))::int;
    else
      new.break_started_at := old.break_started_at;
      new.break_accum_seconds := coalesce(old.break_accum_seconds, 0);
    end if;

    return new;
  end if;

  -- new session: clock-in has to be now (5 min either way)
  if new.status in ('clocked_in', 'on_break') then
    if new.clock_in_at is null
       or new.clock_in_at < now() - interval '5 minutes'
       or new.clock_in_at > now() + interval '5 minutes' then
      raise exception 'Clock-in time has to be the current time';
    end if;
    new.status := 'clocked_in';
    new.break_started_at := null;
    new.break_accum_seconds := 0;
  end if;

  return new;
end;
$$;

drop trigger if exists protect_employee_status on public.employee_status;
create trigger protect_employee_status
  before insert or update on public.employee_status
  for each row execute function public.protect_employee_status();

-- 10. old in-database auto clock-out (job auto-clock-out-check) ran alongside
-- reminder-sweep: double clock-outs, N/A locations, marked as admin-adjusted
select cron.unschedule(jobid) from cron.job where jobname = 'auto-clock-out-check';
drop function if exists public.auto_clock_out_overdue();

-- 11. duplicate admin policies: employee_status and time_off_requests had
-- an is_admin copy of each admin rule next to the email one. Keeping the
-- email ones only, same as every other table.
drop policy if exists "employee_status_admin_insert_all" on public.employee_status;
drop policy if exists "employee_status_admin_select_all" on public.employee_status;
drop policy if exists "employee_status_admin_update_all" on public.employee_status;
drop policy if exists "time_off_admin_select_all" on public.time_off_requests;
drop policy if exists "time_off_admin_update_all" on public.time_off_requests;

-- 12. time off could be requested for days that already passed
-- same insert rule as 8, plus the start date can't be before today
drop policy if exists "time_off_insert_own" on public.time_off_requests;

create policy "time_off_insert_own" on public.time_off_requests
  for insert to authenticated
  with check (
    auth.uid() = user_id
    and status = 'pending'
    and admin_message is null
    and employee_name is null
    and start_date::date >= current_date
  );
