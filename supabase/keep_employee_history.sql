-- Run once in the Supabase SQL editor.

-- Keeps records, time off and timesheet approvals when an employee is
-- deleted. Drops the foreign keys on user_id so deleting the auth user
-- isn't blocked, and adds employee_name so old rows still show who it was.

do $$
declare
  c record;
begin
  for c in
    select con.conname, rel.relname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    join pg_attribute att on att.attrelid = con.conrelid and att.attnum = any (con.conkey)
    where con.contype = 'f'
      and nsp.nspname = 'public'
      and rel.relname in ('records', 'time_off_requests', 'timesheet_approvals')
      and att.attname = 'user_id'
  loop
    execute format('alter table public.%I drop constraint %I', c.relname, c.conname);
  end loop;
end $$;

alter table public.records add column if not exists employee_name text;
alter table public.time_off_requests add column if not exists employee_name text;
