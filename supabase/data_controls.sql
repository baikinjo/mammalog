-- Run once in Supabase SQL Editor after schema.sql, book_engine_v2.sql,
-- and routine_logs.sql.
-- Adds family-member progress reset, owner-only family member removal, and authenticated account deletion.
-- Projects that already ran an older copy of this file only need shared_progress_reset.sql.

create or replace function public.reset_child_progress(target_child_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  -- Any current member of the child's household (owner or parent) may reset its shared progress,
  -- using the same membership check as the child-data RLS policies.
  if not public.can_access_child(target_child_id) then
    raise exception 'Only family members can reset shared progress';
  end if;

  delete from public.ingredient_reactions where child_id = target_child_id;
  delete from public.daily_routine_logs where child_id = target_child_id;
  delete from public.daily_recommendations where child_id = target_child_id;
  delete from public.preparation_tasks where child_id = target_child_id;
  delete from public.child_ingredients where child_id = target_child_id;
  delete from public.meal_plans where child_id = target_child_id;

  update public.children
  set weaning_start_date = null,
      stage = 'prestart',
      meals_per_day = 1,
      snacks_per_day = 0,
      texture_mm = 0,
      temporary_condition = 'none',
      readiness = '{"tongueThrustGone":false,"headControl":false,"sitsWithSupport":false,"foodInterest":false}'::jsonb,
      development_skills = '{"handlesCurrentTexture":false,"reachesAndGrasps":false,"fingerFood":false,"spoonPractice":false,"cupPractice":false}'::jsonb,
      updated_at = now()
  where id = target_child_id;
end;
$$;

create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  calling_user_id uuid := auth.uid();
  owned_household record;
  replacement_owner_id uuid;
begin
  if calling_user_id is null then
    raise exception 'Authentication required';
  end if;

  -- Remove records authored by this account while preserving other guardians' records.
  delete from public.ingredient_reactions
  where recorded_by = calling_user_id;

  delete from public.meal_plans mp
  using public.meal_logs ml
  where ml.meal_plan_id = mp.id
    and ml.recorded_by = calling_user_id;

  -- Transfer shared households; delete a household only when nobody else belongs to it.
  for owned_household in
    select id from public.households where owner_id = calling_user_id
  loop
    select hm.user_id
    into replacement_owner_id
    from public.household_members hm
    where hm.household_id = owned_household.id
      and hm.user_id <> calling_user_id
    order by hm.joined_at
    limit 1;

    if replacement_owner_id is null then
      delete from public.households where id = owned_household.id;
    else
      update public.households
      set owner_id = replacement_owner_id,
          updated_at = now()
      where id = owned_household.id;

      update public.household_members
      set role = case when user_id = replacement_owner_id then 'owner' else 'parent' end
      where household_id = owned_household.id;
    end if;
  end loop;

  delete from public.household_members where user_id = calling_user_id;
  delete from auth.users where id = calling_user_id;
end;
$$;

create or replace function public.remove_household_member(
  target_household_id uuid,
  target_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  calling_user_id uuid := auth.uid();
begin
  if calling_user_id is null then
    raise exception 'Authentication required';
  end if;

  if target_user_id is null or target_user_id = calling_user_id then
    raise exception 'The household owner cannot remove this account';
  end if;

  if not exists (
    select 1
    from public.households h
    where h.id = target_household_id
      and h.owner_id = calling_user_id
  ) then
    raise exception 'Only the household owner can remove a family member';
  end if;

  if not exists (
    select 1
    from public.household_members hm
    where hm.household_id = target_household_id
      and hm.user_id = target_user_id
      and hm.role <> 'owner'
  ) then
    raise exception 'Family member not found';
  end if;

  -- Keep the person's login and historical authorship intact, but revoke all
  -- access to this household immediately through the membership-based RLS rules.
  delete from public.household_members
  where household_id = target_household_id
    and user_id = target_user_id;
end;
$$;

revoke all on function public.reset_child_progress(uuid) from public;
revoke all on function public.delete_my_account() from public;
revoke all on function public.remove_household_member(uuid, uuid) from public;
grant execute on function public.reset_child_progress(uuid) to authenticated;
grant execute on function public.delete_my_account() to authenticated;
grant execute on function public.remove_household_member(uuid, uuid) to authenticated;
