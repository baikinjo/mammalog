-- Upgrade for projects that already ran supabase/routine_logs.sql; new projects run it after the other setup files.
-- Run once in Supabase SQL Editor. Running it again changes nothing.
--
-- Adds the foods given at each snack to the existing daily routine row. snack_foods holds one list of ingredient ids
-- per snack, in snack order (the first list is the first snack). An empty list is a snack whose foods were not
-- recorded, and the column never holds more lists than snack_count. Existing rows keep their milk, snack count,
-- eating-practice and note values and start with no recorded snack foods ('[]'). The row's sharing policy, grants and
-- progress reset already cover the new column.
--
-- Run this before deploying the app version that records snack foods: that version cannot save a daily routine
-- until the column exists.

alter table public.daily_routine_logs
  add column if not exists snack_foods jsonb not null default '[]'::jsonb;

do $snack_foods$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.daily_routine_logs'::regclass
      and conname = 'daily_routine_logs_snack_foods_check'
  ) then
    alter table public.daily_routine_logs
      add constraint daily_routine_logs_snack_foods_check check (
        jsonb_typeof(snack_foods) = 'array'
        and jsonb_array_length(snack_foods) <= snack_count
        and not jsonb_path_exists(snack_foods, 'strict $[*] ? (@.type() != "array")')
        and not jsonb_path_exists(snack_foods, 'strict $[*][*] ? (@.type() != "string" || @ == "")')
      );
  end if;
end;
$snack_foods$;

-- Read-only check: expect has_snack_foods, has_snack_foods_check and rls_enabled to be true. Right after the first
-- run rows_with_snack_foods is 0, because existing rows start with no recorded snack foods, and routine_rows is the
-- number of daily routine rows the project already had.
select
  exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'daily_routine_logs'
      and column_name = 'snack_foods'
      and data_type = 'jsonb'
      and is_nullable = 'NO'
  ) as has_snack_foods,
  exists (
    select 1
    from pg_constraint
    where conrelid = 'public.daily_routine_logs'::regclass
      and conname = 'daily_routine_logs_snack_foods_check'
  ) as has_snack_foods_check,
  (select relrowsecurity from pg_class where oid = 'public.daily_routine_logs'::regclass) as rls_enabled,
  (select count(*) from public.daily_routine_logs) as routine_rows,
  (select count(*) from public.daily_routine_logs where snack_foods <> '[]'::jsonb) as rows_with_snack_foods;
