-- Upgrade for projects that already ran supabase/data_controls.sql.
-- Run once in Supabase SQL Editor. It lets every member of a child's household
-- (owner or parent) reset that child's shared progress, using the same
-- membership check as the child-data RLS policies.
--
-- This file only replaces public.reset_child_progress and restates its grants.
-- Running it does not reset, delete or change any family data, and it does not
-- change member removal, account deletion or invite permissions.

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

revoke all on function public.reset_child_progress(uuid) from public;
grant execute on function public.reset_child_progress(uuid) to authenticated;

-- Read-only check: expect one row with uses_family_member_check = true.
select
  p.proname as function_name,
  p.prosecdef as security_definer,
  p.proconfig as function_settings,
  pg_get_functiondef(p.oid) like '%public.can_access_child(target_child_id)%' as uses_family_member_check
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'reset_child_progress';
