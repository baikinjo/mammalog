-- Run once after schema.sql. Adds shared daily milk, snack and eating-skill logs.

create table if not exists public.daily_routine_logs (
  child_id uuid not null references public.children(id) on delete cascade,
  log_date date not null,
  milk_ml smallint check (milk_ml is null or (milk_ml >= 0 and milk_ml <= 2000)),
  snack_count smallint not null default 0 check (snack_count >= 0 and snack_count <= 5),
  cup_practice boolean not null default false,
  spoon_practice boolean not null default false,
  finger_food boolean not null default false,
  note text,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (child_id, log_date)
);

create index if not exists daily_routine_logs_child_date_idx
  on public.daily_routine_logs(child_id, log_date desc);

alter table public.daily_routine_logs enable row level security;
drop policy if exists "members can manage daily routine logs" on public.daily_routine_logs;
create policy "members can manage daily routine logs"
  on public.daily_routine_logs for all to authenticated
  using (public.can_access_child(child_id))
  with check (public.can_access_child(child_id));

grant select, insert, update, delete on public.daily_routine_logs to authenticated;
