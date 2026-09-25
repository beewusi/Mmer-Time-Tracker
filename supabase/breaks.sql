-- Each break saved on its own (start + end) instead of only a total

create table if not exists public.breaks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  record_id text,            -- set when the session is saved at clock-out
  started_at timestamptz not null default now(),
  ended_at timestamptz,      -- null = break still going
  created_at timestamptz not null default now()
);

create index if not exists breaks_user_record_idx on public.breaks (user_id, record_id);

alter table public.breaks enable row level security;

-- employees only read their own, admin does everything
drop policy if exists "breaks_select_own" on public.breaks;
create policy "breaks_select_own" on public.breaks
  for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists "breaks_admin_all" on public.breaks;
create policy "breaks_admin_all" on public.breaks
  for all to authenticated
  using ((auth.jwt() ->> 'email') = 'admin@mmer3.com')
  with check ((auth.jwt() ->> 'email') = 'admin@mmer3.com');

-- break rows follow employee_status: new row when a break starts,
-- ended when they resume or get clocked out
create or replace function public.track_breaks()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'on_break'
     and (tg_op = 'INSERT' or old.status is distinct from 'on_break') then
    insert into breaks (user_id, started_at)
    values (new.user_id::text::uuid, coalesce(new.break_started_at, now()));
  elsif tg_op = 'UPDATE'
     and old.status = 'on_break'
     and new.status is distinct from 'on_break' then
    update breaks
    set ended_at = now()
    where user_id::text = new.user_id::text and ended_at is null;
  end if;
  return new;
end;
$$;

revoke execute on function public.track_breaks() from public, anon, authenticated;

drop trigger if exists track_breaks on public.employee_status;
create trigger track_breaks
  after insert or update on public.employee_status
  for each row execute function public.track_breaks();

-- session saved at clock-out: its breaks get linked to the record
create or replace function public.link_breaks_to_record()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update breaks
  set record_id = new.id::text
  where user_id::text = new.user_id::text and record_id is null;
  return new;
end;
$$;

revoke execute on function public.link_breaks_to_record() from public, anon, authenticated;

drop trigger if exists link_breaks_to_record on public.records;
create trigger link_breaks_to_record
  after insert on public.records
  for each row execute function public.link_breaks_to_record();
