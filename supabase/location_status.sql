-- Run once in the Supabase SQL editor.

-- Clock-in location on employee_status, so it survives a refresh and
-- the admin can review a live session before clock-out.
alter table public.employee_status
  add column if not exists location_status text;

-- records.location_status: drop any old check constraint and allow 'declined'.
do $$
declare
  c record;
begin
  for c in
    select conname
    from pg_constraint
    where conrelid = 'public.records'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%location_status%'
  loop
    execute format('alter table public.records drop constraint %I', c.conname);
  end loop;
end $$;

alter table public.records
  add constraint records_location_status_check
  check (location_status is null or location_status in ('authorised', 'unauthorised', 'unavailable', 'declined'));
