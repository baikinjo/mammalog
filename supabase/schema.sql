create extension if not exists pgcrypto;

create table if not exists public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null default '우리 가족',
  owner_id uuid not null references auth.users(id) on delete restrict,
  invite_code_hash text,
  invite_expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.household_members (
  household_id uuid not null references public.households(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  display_name text not null,
  role text not null default 'parent' check (role in ('owner', 'parent')),
  joined_at timestamptz not null default now(),
  primary key (household_id, user_id)
);

create table if not exists public.children (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  nickname text not null,
  birth_date date not null,
  due_date date,
  weaning_start_date date,
  stage text not null default 'prestart'
    check (stage in ('prestart', 'initial', 'middle', 'late', 'completion')),
  meals_per_day smallint not null default 1 check (meals_per_day between 1 and 3),
  preferred_meal_time time not null default '10:00',
  texture_mm smallint not null default 0 check (texture_mm between 0 and 30),
  preparation_style text not null default 'cube'
    check (preparation_style in ('cube', 'fresh', 'batch', 'mixed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ingredients (
  id text primary key,
  household_id uuid references public.households(id) on delete cascade,
  name text not null,
  emoji text not null default '',
  category text not null
    check (category in ('grain', 'meat', 'leafy', 'yellow', 'fruit', 'otherProtein')),
  minimum_stage text not null default 'initial'
    check (minimum_stage in ('initial', 'middle', 'late', 'completion')),
  introduction_priority smallint not null default 100,
  is_custom boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.child_ingredients (
  child_id uuid not null references public.children(id) on delete cascade,
  ingredient_id text not null references public.ingredients(id) on delete cascade,
  status text not null default 'locked'
    check (status in ('locked', 'ready', 'testing', 'passed', 'rejected', 'paused', 'avoid')),
  test_day smallint check (test_day between 1 and 3),
  exposure_count integer not null default 0,
  last_offered_at timestamptz,
  last_reaction text,
  note text,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (child_id, ingredient_id)
);

create table if not exists public.meal_plans (
  id uuid primary key default gen_random_uuid(),
  child_id uuid not null references public.children(id) on delete cascade,
  meal_date date not null,
  meal_index smallint not null check (meal_index between 1 and 3),
  planned_time time not null,
  title text not null,
  serving_guide text,
  texture_guide text,
  status text not null default 'planned'
    check (status in ('planned', 'completed', 'skipped', 'replaced')),
  recommendation_version text not null default 'initial-v1',
  recommendation_reasons jsonb not null default '[]'::jsonb,
  locked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (child_id, meal_date, meal_index)
);

create table if not exists public.meal_plan_items (
  id uuid primary key default gen_random_uuid(),
  meal_plan_id uuid not null references public.meal_plans(id) on delete cascade,
  ingredient_id text not null references public.ingredients(id) on delete restrict,
  amount_grams numeric(6, 1),
  role text not null default 'ingredient'
    check (role in ('base', 'new', 'protein', 'vegetable', 'fruit', 'ingredient')),
  is_new_exposure boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.meal_logs (
  id uuid primary key default gen_random_uuid(),
  meal_plan_id uuid not null unique references public.meal_plans(id) on delete cascade,
  completion text not null
    check (completion in ('none', 'taste', 'quarter', 'half', 'most', 'all')),
  reaction text not null default 'none'
    check (reaction in ('none', 'taste_rejection', 'texture_difficulty', 'needs_review')),
  note text,
  recorded_by uuid not null references auth.users(id) on delete restrict,
  recorded_at timestamptz not null default now(),
  version integer not null default 1,
  updated_at timestamptz not null default now()
);

create table if not exists public.preparation_tasks (
  id uuid primary key default gen_random_uuid(),
  child_id uuid not null references public.children(id) on delete cascade,
  task_key text not null,
  label text not null,
  completed boolean not null default false,
  completed_by uuid references auth.users(id) on delete set null,
  completed_at timestamptz,
  sort_order smallint not null default 0,
  unique (child_id, task_key)
);

create index if not exists household_members_user_idx
  on public.household_members(user_id);
create index if not exists children_household_idx
  on public.children(household_id);
create index if not exists child_ingredients_status_idx
  on public.child_ingredients(child_id, status);
create index if not exists meal_plans_child_date_idx
  on public.meal_plans(child_id, meal_date desc);

create or replace function public.is_household_member(target_household_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.household_members
    where household_id = target_household_id
      and user_id = auth.uid()
  );
$$;

create or replace function public.can_access_child(target_child_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.children c
    join public.household_members hm on hm.household_id = c.household_id
    where c.id = target_child_id
      and hm.user_id = auth.uid()
  );
$$;

create or replace function public.can_access_meal(target_meal_plan_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.meal_plans mp
    join public.children c on c.id = mp.child_id
    join public.household_members hm on hm.household_id = c.household_id
    where mp.id = target_meal_plan_id
      and hm.user_id = auth.uid()
  );
$$;

alter table public.households enable row level security;
alter table public.household_members enable row level security;
alter table public.children enable row level security;
alter table public.ingredients enable row level security;
alter table public.child_ingredients enable row level security;
alter table public.meal_plans enable row level security;
alter table public.meal_plan_items enable row level security;
alter table public.meal_logs enable row level security;
alter table public.preparation_tasks enable row level security;

create policy "members can read household"
  on public.households for select
  using (public.is_household_member(id));
create policy "owners can create household"
  on public.households for insert
  with check (owner_id = auth.uid());
create policy "owners can update household"
  on public.households for update
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy "members can read membership"
  on public.household_members for select
  using (public.is_household_member(household_id));
create policy "owners can add members"
  on public.household_members for insert
  with check (
    exists (
      select 1 from public.households h
      where h.id = household_id and h.owner_id = auth.uid()
    )
  );
create policy "owners can update members"
  on public.household_members for update
  using (
    exists (
      select 1 from public.households h
      where h.id = household_id and h.owner_id = auth.uid()
    )
  );

create policy "members can manage children"
  on public.children for all
  using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));

create policy "members can read ingredients"
  on public.ingredients for select
  using (household_id is null or public.is_household_member(household_id));
create policy "members can add custom ingredients"
  on public.ingredients for insert
  with check (household_id is not null and public.is_household_member(household_id));
create policy "members can update custom ingredients"
  on public.ingredients for update
  using (household_id is not null and public.is_household_member(household_id))
  with check (household_id is not null and public.is_household_member(household_id));

create policy "members can manage child ingredient state"
  on public.child_ingredients for all
  using (public.can_access_child(child_id))
  with check (public.can_access_child(child_id));

create policy "members can manage meal plans"
  on public.meal_plans for all
  using (public.can_access_child(child_id))
  with check (public.can_access_child(child_id));

create policy "members can manage meal plan items"
  on public.meal_plan_items for all
  using (public.can_access_meal(meal_plan_id))
  with check (public.can_access_meal(meal_plan_id));

create policy "members can manage meal logs"
  on public.meal_logs for all
  using (public.can_access_meal(meal_plan_id))
  with check (public.can_access_meal(meal_plan_id));

create policy "members can manage preparation tasks"
  on public.preparation_tasks for all
  using (public.can_access_child(child_id))
  with check (public.can_access_child(child_id));

insert into public.ingredients
  (id, name, emoji, category, minimum_stage, introduction_priority)
values
  ('rice', '쌀', '🍚', 'grain', 'initial', 1),
  ('oatmeal', '오트밀', '🌾', 'grain', 'initial', 2),
  ('beef', '소고기', '🥩', 'meat', 'initial', 3),
  ('cabbage', '양배추', '🥬', 'leafy', 'initial', 4),
  ('bokchoy', '청경채', '🌿', 'leafy', 'initial', 5),
  ('pumpkin', '단호박', '🎃', 'yellow', 'initial', 6),
  ('zucchini', '애호박', '🥒', 'yellow', 'initial', 7),
  ('apple', '사과', '🍎', 'fruit', 'initial', 8)
on conflict (id) do update set
  name = excluded.name,
  emoji = excluded.emoji,
  category = excluded.category,
  minimum_stage = excluded.minimum_stage,
  introduction_priority = excluded.introduction_priority;

