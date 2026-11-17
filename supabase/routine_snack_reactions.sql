-- Upgrade for projects that already ran supabase/routine_snack_foods.sql; new projects run it after the other setup files.
-- Run once in Supabase SQL Editor. Running it again changes nothing.
--
-- Adds each snack's reaction to the existing daily routine row. snack_reactions holds one entry per snack, in snack order
-- (the first entry is the first snack): one of a meal's reaction values ('none', 'taste_rejection', 'texture_difficulty',
-- 'needs_review'), or null for a snack whose reaction was not recorded. The column never holds more entries than
-- snack_count. Existing rows keep their milk, snack count, snack foods, eating-practice and note values and start with no
-- recorded reactions ('[]'), so no earlier snack is taken as given without a reaction. The row's sharing policy, grants
-- and progress reset already cover the new column.
--
-- Also keeps the app's rule of one food under observation per child in the database, since a snack can now start an
-- observation of its own and two guardians may save at once (see the second block), and adds the function the app saves
-- every meal's and snack's observation state through, one save of a child at a time (see the third block).
--
-- Run this before deploying the app version that records snack reactions: that version cannot save a daily routine
-- until the column exists, and saves no observation state until the function exists.

alter table public.daily_routine_logs
  add column if not exists snack_reactions jsonb not null default '[]'::jsonb;

do $snack_reactions$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.daily_routine_logs'::regclass
      and conname = 'daily_routine_logs_snack_reactions_check'
  ) then
    alter table public.daily_routine_logs
      add constraint daily_routine_logs_snack_reactions_check check (
        jsonb_typeof(snack_reactions) = 'array'
        and jsonb_array_length(snack_reactions) <= snack_count
        and not jsonb_path_exists(snack_reactions, 'strict $[*] ? (@.type() != "null" && @.type() != "string")')
        and not jsonb_path_exists(snack_reactions, 'strict $[*] ? (@.type() == "string" && @ != "none" && @ != "taste_rejection" && @ != "texture_difficulty" && @ != "needs_review")')
      );
  end if;
end;
$snack_reactions$;

-- One food under observation ('testing') per child at a time. Two saves that would each start a different food are then
-- never both kept: the second is refused and the app asks the family to check that food. The guard is an index, so it
-- changes no row, policy or grant. It is added only while no child already has several foods under observation;
-- otherwise nothing changes and the check below counts those children: change all but one of each such child's 도입 중
-- foods to another status in the app (재료 탭), then run this file again.
do $one_observation$
begin
  if not exists (
    select 1
    from public.child_ingredients
    where status = 'testing'
    group by child_id
    having count(*) > 1
  ) then
    create unique index if not exists child_ingredients_one_observation
      on public.child_ingredients (child_id)
      where status = 'testing';
  end if;
end;
$one_observation$;

-- Observation saves, one at a time per child. The app records a meal or a snack first and then saves the observation
-- state it worked out from the states, meals and snack days it had just read. Another guardian may save in between, so
-- the state is saved through public.save_observation_state, which re-checks under a per-child lock what the app read:
--   - the food's state is still the one read (its updated_at), so a save is never counted twice or written over a
--     stronger restriction;
--   - and, when the save counts an observation day (it moves the food's offered dates or exposures):
--     the meal or snack it counts is still stored with the food (a meal's new food, or the food in that snack with a
--     reaction); no other food is under observation; neither this food nor another one was observed on that calendar
--     day (another food's observation, from its first to its last observed day, does not include it); and no meal or
--     snack reaction that holds new foods was recorded for it: a meal of that day (other than the counted one), a snack
--     of that day (an earlier snack, when a snack is counted), or the latest meal or snack day before it.
-- When a counted day is refused, the meal or snack stays recorded as it is. A reaction that pauses the food or needs a
-- check still restricts it, without counting the day ('restricted'); otherwise nothing is written. The reply says which:
-- 'saved', 'restricted', 'changed' (the state is no longer the one read), 'record_changed' (the counted meal or snack is
-- no longer stored with the food), 'another_food', 'day_observed' or 'held'.
--
-- Calendar days are the app's: the app sends its IANA time zone, a counted day is the local date of the state's
-- last_offered_at there, and a snack day without a time is the end of that local day. Saving a meal's or a day
-- routine's reactions takes the same lock (the triggers below), so a reaction saved first is seen by every observation
-- day counted after it; a day counted first stays counted when a reaction comes after it.
--
-- The function runs with the caller's rights and row level security (security invoker), only for signed-in family
-- members. Writing child_ingredients directly stays allowed as before, for the changes a family makes in the 재료 tab
-- and for an older app version still open, but those writes are not re-checked.
create or replace function public.save_observation_state(
  target_child_id uuid,
  target_ingredient_id text,
  expected_updated_at timestamptz,
  next_state jsonb,
  calendar_time_zone text default null,
  credited_meal_plan_id uuid default null,
  credited_snack_index integer default null
)
returns text
language plpgsql
security invoker
set search_path = ''
as $save_observation_state$
declare
  -- Restrictions from mildest to strongest, as the app ranks them.
  restrictions constant text[] := array['rejected', 'paused', 'suspectedReaction', 'avoid'];
  stored public.child_ingredients%rowtype;
  stored_found boolean;
  next_row public.child_ingredients%rowtype;
  observed_on date;
  cutoff timestamptz;
  refusal text;
  result text := 'saved';
  conflict text;
begin
  -- Each statement after the lock must read what the save before it committed.
  if pg_catalog.current_setting('transaction_isolation') <> 'read committed' then
    raise exception 'Observation states are saved at read committed isolation' using errcode = '0A000';
  end if;
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if not public.can_access_child(target_child_id) then
    raise exception 'Only family members can save the child''s observations' using errcode = '42501';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('mammalog:child-observations:' || target_child_id::text, 0)
  );

  select * into stored
  from public.child_ingredients as ci
  where ci.child_id = target_child_id
    and ci.ingredient_id = target_ingredient_id;
  stored_found := found;
  if stored_found <> (expected_updated_at is not null) or stored.updated_at is distinct from expected_updated_at then
    return 'changed';
  end if;

  next_row := pg_catalog.jsonb_populate_record(null::public.child_ingredients, next_state);
  if next_row.first_offered_at is distinct from stored.first_offered_at
    or next_row.last_offered_at is distinct from stored.last_offered_at
    or next_row.exposure_count is distinct from coalesce(stored.exposure_count, 0)
  then
    if next_row.last_offered_at is null
      or calendar_time_zone is null
      or (credited_meal_plan_id is null) = (credited_snack_index is null)
      or credited_snack_index < 0
    then
      raise exception 'A counted observation day needs its date, the calendar time zone and one meal or snack'
        using errcode = '22023';
    end if;
    observed_on := (next_row.last_offered_at at time zone calendar_time_zone)::date;

    if credited_meal_plan_id is not null then
      if not exists (
        select 1
        from public.meal_plans as mp
        join public.meal_logs as ml on ml.meal_plan_id = mp.id
        join public.meal_plan_items as item on item.meal_plan_id = mp.id
        where mp.id = credited_meal_plan_id
          and mp.child_id = target_child_id
          and (mp.meal_date = observed_on or (ml.recorded_at at time zone calendar_time_zone)::date = observed_on)
          and item.ingredient_id = target_ingredient_id
          and item.is_new_exposure
      ) then
        refusal := 'record_changed';
      end if;
    elsif not exists (
      select 1
      from public.daily_routine_logs as routine
      where routine.child_id = target_child_id
        and routine.log_date = observed_on
        and routine.snack_foods -> credited_snack_index ? target_ingredient_id
        and pg_catalog.jsonb_typeof(routine.snack_reactions -> credited_snack_index) = 'string'
    ) then
      refusal := 'record_changed';
    end if;

    if refusal is null and exists (
      select 1
      from public.child_ingredients as other
      where other.child_id = target_child_id
        and other.ingredient_id <> target_ingredient_id
        and other.status = 'testing'
    ) then
      refusal := 'another_food';
    end if;

    if refusal is null and (
      (stored.last_offered_at at time zone calendar_time_zone)::date >= observed_on
      or exists (
        select 1
        from public.child_ingredients as other
        where other.child_id = target_child_id
          and other.ingredient_id <> target_ingredient_id
          and (other.first_offered_at at time zone calendar_time_zone)::date <= observed_on
          and observed_on <= (other.last_offered_at at time zone calendar_time_zone)::date
      )
    ) then
      refusal := 'day_observed';
    end if;

    if refusal is null then
      -- The latest entry is read up to now on the app's today, and up to the start of an earlier day.
      cutoff := case
        when observed_on = (pg_catalog.now() at time zone calendar_time_zone)::date then pg_catalog.now()
        else observed_on::timestamp at time zone calendar_time_zone
      end;
      if exists (
        select 1
        from public.meal_logs as ml
        join public.meal_plans as mp on mp.id = ml.meal_plan_id
        where mp.child_id = target_child_id
          and mp.meal_date = observed_on
          and mp.id is distinct from credited_meal_plan_id
          and ml.reaction in ('needs_review', 'texture_difficulty')
      ) or exists (
        select 1
        from public.daily_routine_logs as routine
        cross join lateral pg_catalog.jsonb_array_elements_text(routine.snack_reactions)
          with ordinality as snack(reaction, position)
        where routine.child_id = target_child_id
          and routine.log_date = observed_on
          and snack.reaction in ('needs_review', 'texture_difficulty')
          and (credited_snack_index is null or snack.position <= credited_snack_index)
      ) or coalesce((
        select latest.holds
        from (
          select ml.recorded_at as at, 0 as kind, ml.reaction in ('needs_review', 'texture_difficulty') as holds
          from public.meal_logs as ml
          join public.meal_plans as mp on mp.id = ml.meal_plan_id
          where mp.child_id = target_child_id
            and mp.id is distinct from credited_meal_plan_id
            and ml.recorded_at <= cutoff
          union all
          -- A snack has no time: its reaction counts at the end of its day, after that day's meals.
          select ((routine.log_date + 1)::timestamp at time zone calendar_time_zone) - interval '1 millisecond', 1, true
          from public.daily_routine_logs as routine
          where routine.child_id = target_child_id
            and routine.log_date < observed_on
            and routine.snack_reactions ?| array['needs_review', 'texture_difficulty']
        ) as latest
        order by latest.at desc, latest.kind desc, latest.holds desc
        limit 1
      ), false) then
        refusal := 'held';
      end if;
    end if;

    if refusal is not null then
      if refusal = 'record_changed'
        or next_row.status is null
        or next_row.status not in ('paused', 'suspectedReaction')
        or coalesce(pg_catalog.array_position(restrictions, stored.status), 0)
          >= pg_catalog.array_position(restrictions, next_row.status)
      then
        return refusal;
      end if;
      next_row.test_day := case when next_row.status = 'paused' then stored.test_day end;
      next_row.exposure_count := coalesce(stored.exposure_count, 0);
      next_row.first_offered_at := stored.first_offered_at;
      next_row.last_offered_at := stored.last_offered_at;
      next_row.accepted_texture_mm := stored.accepted_texture_mm;
      result := 'restricted';
    end if;
  end if;

  begin
    if stored_found then
      update public.child_ingredients as ci
      set status = next_row.status,
          test_day = next_row.test_day,
          exposure_count = next_row.exposure_count,
          first_offered_at = next_row.first_offered_at,
          last_offered_at = next_row.last_offered_at,
          accepted_texture_mm = coalesce(next_row.accepted_texture_mm, '[]'::jsonb),
          last_reaction = next_row.last_reaction,
          updated_by = auth.uid(),
          updated_at = pg_catalog.clock_timestamp()
      where ci.child_id = target_child_id
        and ci.ingredient_id = target_ingredient_id
        and ci.updated_at = expected_updated_at;
      if not found then
        return 'changed';
      end if;
    else
      insert into public.child_ingredients (
        child_id, ingredient_id, status, test_day, exposure_count, first_offered_at, last_offered_at,
        accepted_texture_mm, last_reaction, updated_by, updated_at
      ) values (
        target_child_id, target_ingredient_id, next_row.status, next_row.test_day, next_row.exposure_count,
        next_row.first_offered_at, next_row.last_offered_at, coalesce(next_row.accepted_texture_mm, '[]'::jsonb),
        next_row.last_reaction, auth.uid(), pg_catalog.clock_timestamp()
      );
    end if;
  exception
    -- A direct write gave the food a state, or put another food under observation, after the checks above.
    when unique_violation then
      get stacked diagnostics conflict = constraint_name;
      return case when conflict = 'child_ingredients_one_observation' then 'another_food' else 'changed' end;
  end;
  return result;
end;
$save_observation_state$;

revoke all on function public.save_observation_state(uuid, text, timestamptz, jsonb, text, uuid, integer) from public, anon;
grant execute on function public.save_observation_state(uuid, text, timestamptz, jsonb, text, uuid, integer) to authenticated;

-- Saving a meal's log or a day's routine (with its snack reactions) waits for the child's observation save in progress,
-- and an observation save waits for it.
create or replace function public.serialize_child_observations()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $serialize_child_observations$
declare
  fact_child_id uuid;
begin
  -- Read through row level security, so a write refused to a non-member never waits on or holds the family's saves.
  if tg_table_name = 'meal_logs' then
    select mp.child_id into fact_child_id
    from public.meal_plans as mp
    where mp.id = new.meal_plan_id;
  else
    select c.id into fact_child_id
    from public.children as c
    where c.id = new.child_id;
  end if;
  if fact_child_id is not null then
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('mammalog:child-observations:' || fact_child_id::text, 0)
    );
  end if;
  return new;
end;
$serialize_child_observations$;

revoke all on function public.serialize_child_observations() from public, anon, authenticated;

create or replace trigger serialize_child_observations
  before insert or update on public.meal_logs
  for each row execute function public.serialize_child_observations();
create or replace trigger serialize_child_observations
  before insert or update on public.daily_routine_logs
  for each row execute function public.serialize_child_observations();

notify pgrst, 'reload schema';

-- Read-only check: expect has_snack_reactions, has_snack_reactions_check, has_one_observation_guard, rls_enabled,
-- has_observation_save, observation_save_members_only and serializes_reaction_writes to be true, and
-- children_with_several_observations to be 0. Right after the first run rows_with_snack_reactions is 0, because existing
-- rows start with no recorded reactions, and routine_rows is the number of daily routine rows the project already had.
select
  exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'daily_routine_logs'
      and column_name = 'snack_reactions'
      and data_type = 'jsonb'
      and is_nullable = 'NO'
  ) as has_snack_reactions,
  exists (
    select 1
    from pg_constraint
    where conrelid = 'public.daily_routine_logs'::regclass
      and conname = 'daily_routine_logs_snack_reactions_check'
  ) as has_snack_reactions_check,
  (select relrowsecurity from pg_class where oid = 'public.daily_routine_logs'::regclass) as rls_enabled,
  (select count(*) from public.daily_routine_logs) as routine_rows,
  (select count(*) from public.daily_routine_logs where snack_reactions <> '[]'::jsonb) as rows_with_snack_reactions,
  to_regclass('public.child_ingredients_one_observation') is not null as has_one_observation_guard,
  (
    select count(*)
    from (
      select child_id
      from public.child_ingredients
      where status = 'testing'
      group by child_id
      having count(*) > 1
    ) as several
  ) as children_with_several_observations,
  coalesce((
    select not p.prosecdef and p.proconfig @> array['search_path=""']
    from pg_proc as p
    where p.oid = to_regprocedure('public.save_observation_state(uuid, text, timestamptz, jsonb, text, uuid, integer)')
  ), false) as has_observation_save,
  coalesce((
    select has_function_privilege('authenticated', p.oid, 'execute')
      and not has_function_privilege('anon', p.oid, 'execute')
    from pg_proc as p
    where p.oid = to_regprocedure('public.save_observation_state(uuid, text, timestamptz, jsonb, text, uuid, integer)')
  ), false) as observation_save_members_only,
  (
    select count(*)
    from pg_trigger
    where tgname = 'serialize_child_observations'
      and tgrelid in ('public.meal_logs'::regclass, 'public.daily_routine_logs'::regclass)
      and tgenabled <> 'D'
  ) = 2 as serializes_reaction_writes;
