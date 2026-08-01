-- Run after schema.sql. This migration adds the full book-based recommendation model.

alter table public.children
  add column if not exists corrected_age_days integer,
  add column if not exists readiness jsonb not null default '{"tongueThrustGone":false,"headControl":false,"sitsWithSupport":false,"foodInterest":false}'::jsonb,
  add column if not exists snacks_per_day smallint not null default 0 check (snacks_per_day between 0 and 3),
  add column if not exists milk_ml_per_day integer check (milk_ml_per_day between 0 and 2000),
  add column if not exists temporary_condition text not null default 'none'
    check (temporary_condition in ('none', 'cold', 'diarrhea', 'constipation', 'mouthPain')),
  add column if not exists development_skills jsonb not null default '{"handlesCurrentTexture":false,"reachesAndGrasps":false,"fingerFood":false,"spoonPractice":false,"cupPractice":false}'::jsonb;

alter table public.ingredients
  add column if not exists food_group text,
  add column if not exists minimum_age_months smallint not null default 6,
  add column if not exists color text,
  add column if not exists allergen boolean not null default false,
  add column if not exists frequency_cap_7d smallint,
  add column if not exists preparation_constraints jsonb not null default '[]'::jsonb,
  add column if not exists choking_form_blacklist jsonb not null default '[]'::jsonb,
  add column if not exists book_guidance text,
  add column if not exists source_pages jsonb not null default '[]'::jsonb,
  add column if not exists tags jsonb not null default '[]'::jsonb,
  add column if not exists book_edition text,
  add column if not exists is_active boolean not null default true;

alter table public.child_ingredients
  drop constraint if exists child_ingredients_status_check;

alter table public.child_ingredients
  add constraint child_ingredients_status_check
  check (status in ('locked', 'ready', 'testing', 'passed', 'rejected', 'paused', 'suspectedReaction', 'avoid')),
  add column if not exists first_offered_at timestamptz,
  add column if not exists accepted_texture_mm jsonb not null default '[]'::jsonb;

alter table public.meal_plans
  add column if not exists stage text,
  add column if not exists texture_mm smallint,
  add column if not exists serving_mode text,
  add column if not exists development_task text,
  add column if not exists daily_checks jsonb not null default '[]'::jsonb,
  add column if not exists safety_notes jsonb not null default '[]'::jsonb;

alter table public.meal_logs
  add column if not exists offered_grams numeric(6, 1),
  add column if not exists actual_grams numeric(6, 1),
  add column if not exists texture_mm smallint,
  add column if not exists bowel_state text,
  add column if not exists milk_ml integer;

create table if not exists public.book_rules (
  id text primary key,
  layer text not null check (layer in ('safety', 'introduction', 'nutrition', 'texture', 'behavior', 'storage', 'condition')),
  strength text not null check (strength in ('hard', 'repeatedExplicit', 'direct', 'productDerived')),
  title text not null,
  description text not null,
  source_pages jsonb not null default '[]'::jsonb,
  overridable_by text check (overridable_by in ('parent', 'clinician', 'never')),
  book_edition text not null,
  active boolean not null default true,
  updated_at timestamptz not null default now()
);

create table if not exists public.stage_guides (
  stage text primary key check (stage in ('initial', 'middle', 'late', 'completion')),
  label text not null,
  age_months int4range not null,
  milk_ml_range int4range not null,
  meal_range int4range not null,
  snack_range int4range not null,
  offer_grams_range int4range not null,
  meat_grams_range int4range not null,
  texture_mm_range int4range not null,
  texture_description text not null,
  grain_description text not null,
  new_food_interval_days int4range not null,
  serving_modes jsonb not null default '[]'::jsonb,
  development_goals jsonb not null default '[]'::jsonb,
  source_pages jsonb not null default '[]'::jsonb,
  book_edition text not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.ingredient_reactions (
  id uuid primary key default gen_random_uuid(),
  child_id uuid not null references public.children(id) on delete cascade,
  ingredient_id text not null references public.ingredients(id) on delete restrict,
  meal_log_id uuid references public.meal_logs(id) on delete set null,
  observed_at timestamptz not null,
  symptom_type text not null,
  severity text not null check (severity in ('mild', 'moderate', 'severe')),
  onset_minutes integer,
  duration_minutes integer,
  offered_grams numeric(6, 1),
  preparation_form text,
  photo_paths jsonb not null default '[]'::jsonb,
  note text,
  recorded_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);

create table if not exists public.daily_recommendations (
  id uuid primary key default gen_random_uuid(),
  child_id uuid not null references public.children(id) on delete cascade,
  recommendation_date date not null,
  stage text not null check (stage in ('initial', 'middle', 'late', 'completion')),
  recommendation_version text not null,
  input_snapshot jsonb not null,
  output_snapshot jsonb not null,
  generated_at timestamptz not null default now(),
  unique (child_id, recommendation_date)
);

create index if not exists ingredient_reactions_child_time_idx
  on public.ingredient_reactions(child_id, observed_at desc);
create index if not exists daily_recommendations_child_date_idx
  on public.daily_recommendations(child_id, recommendation_date desc);
create index if not exists ingredients_food_group_idx
  on public.ingredients(food_group) where is_active;

alter table public.book_rules enable row level security;
alter table public.stage_guides enable row level security;
alter table public.ingredient_reactions enable row level security;
alter table public.daily_recommendations enable row level security;

create policy "signed in users can read book rules"
  on public.book_rules for select
  using (auth.uid() is not null);
create policy "signed in users can read stage guides"
  on public.stage_guides for select
  using (auth.uid() is not null);
create policy "members can manage ingredient reactions"
  on public.ingredient_reactions for all
  using (public.can_access_child(child_id))
  with check (public.can_access_child(child_id));
create policy "members can manage daily recommendations"
  on public.daily_recommendations for all
  using (public.can_access_child(child_id))
  with check (public.can_access_child(child_id));

insert into public.stage_guides
  (stage, label, age_months, milk_ml_range, meal_range, snack_range, offer_grams_range,
   meat_grams_range, texture_mm_range, texture_description, grain_description,
   new_food_interval_days, serving_modes, development_goals, source_pages, book_edition)
values
  ('initial', '초기', '[6,7)', '[500,901)', '[1,4)', '[0,1)', '[30,101)', '[10,21)', '[1,4)',
   '수프 정도에서 대충 갈거나 으깬 작은 입자로 빠르게 진행', '10~8배죽에서 7~5배죽으로 진행', '[3,4)',
   '["섞은 죽","토핑","익숙한 재료와 분리 제공"]', '["숟가락 경험","질감 경험"]', '["책 p.24-29","책 p.64-69","책 p.302-314"]', '2023 최신개정판'),
  ('middle', '중기', '[7,9)', '[500,801)', '[2,4)', '[1,3)', '[70,121)', '[10,21)', '[3,6)',
   '연두부처럼 부드러운 최소 3mm 이상 입자', '7배죽에서 5배죽, 잘 먹으면 3배죽', '[2,4)',
   '["토핑","반찬 분리","핑거푸드 병행"]', '["핑거푸드","숟가락","컵"]', '["책 p.24-29","책 p.138-145","책 p.315-325"]', '2023 최신개정판'),
  ('late', '후기', '[9,12)', '[500,701)', '[3,4)', '[2,4)', '[120,151)', '[20,31)', '[5,8)',
   '잘 익은 바나나 정도의 최소 5~7mm 입자', '3배죽에서 2배죽·무른밥·진밥', '[2,4)',
   '["밥과 반찬","식판","핑거푸드"]', '["세 끼 리듬","숟가락","분리 선택"]', '["책 p.24-29","책 p.180-185","책 p.326-336"]', '2023 최신개정판'),
  ('completion', '완료기', '[12,19)', '[400,501)', '[3,4)', '[2,4)', '[120,181)', '[30,41)', '[7,11)',
   '부드러운 진밥·완자에서 7~10mm 이상으로 진행', '진밥에서 일반 밥으로 진행', '[2,4)',
   '["밥과 반찬","가족식 변형","스스로 먹기"]', '["가족 식사","컵","스스로 먹기"]', '["책 p.24-29","책 p.230-235","책 p.337-349"]', '2023 최신개정판')
on conflict (stage) do update set
  label = excluded.label,
  age_months = excluded.age_months,
  milk_ml_range = excluded.milk_ml_range,
  meal_range = excluded.meal_range,
  snack_range = excluded.snack_range,
  offer_grams_range = excluded.offer_grams_range,
  meat_grams_range = excluded.meat_grams_range,
  texture_mm_range = excluded.texture_mm_range,
  texture_description = excluded.texture_description,
  grain_description = excluded.grain_description,
  new_food_interval_days = excluded.new_food_interval_days,
  serving_modes = excluded.serving_modes,
  development_goals = excluded.development_goals,
  source_pages = excluded.source_pages,
  book_edition = excluded.book_edition,
  updated_at = now();

insert into public.book_rules
  (id, layer, strength, title, description, source_pages, overridable_by, book_edition)
values
  ('start_at_six_months_with_readiness', 'introduction', 'repeatedExplicit', '만 6개월과 준비 신호', '월령과 네 가지 준비 신호를 함께 확인한다.', '["책 p.12-15","책 p.282-288","책 p.302-305"]', 'clinician', '2023 최신개정판'),
  ('introduction_order', 'introduction', 'repeatedExplicit', '다섯 식품군 도입 순서', '곡류, 고기, 이파리 채소, 노란 채소, 과일 순으로 누적한다.', '["책 p.13-17","책 p.64-69","책 p.287-310"]', null, '2023 최신개정판'),
  ('single_new_food_slot', 'introduction', 'direct', '새 재료 한 가지', '초기 기본값은 한 번에 새 재료 하나다.', '["책 p.14-17","책 p.64-69","책 p.307-318"]', null, '2023 최신개정판'),
  ('daily_meat', 'nutrition', 'repeatedExplicit', '고기는 매일', '살코기 자체를 단계별 목표량 범위에서 매일 제공한다.', '["책 p.16-17","책 p.24-39","책 p.315-356"]', null, '2023 최신개정판'),
  ('fish_weekly_cap', 'nutrition', 'repeatedExplicit', '생선 주 2회 이하', '최근 7일 생선 제공 횟수를 2회 이하로 제한한다.', '["책 p.32-37","책 p.180-185","책 p.345-350"]', 'clinician', '2023 최신개정판'),
  ('texture_progression', 'texture', 'repeatedExplicit', '미음에 머무르지 않기', '양보다 안전하게 처리할 수 있는 최대 질감으로 진행한다.', '["책 p.20-25","책 p.43-44","책 p.294-337"]', null, '2023 최신개정판'),
  ('no_honey_before_one', 'safety', 'hard', '돌 전 꿀 금지', '가열 여부와 관계없이 만 12개월 전 꿀을 제외한다.', '["책 p.18-19","책 p.32-39"]', 'never', '2023 최신개정판'),
  ('choking_forms_blocked', 'safety', 'hard', '질식 위험 형태 제외', '통견과류, 통포도, 떡과 단단한 큰 덩어리를 제외한다.', '["책 p.18-19","책 p.224-230","책 p.350-365"]', 'never', '2023 최신개정판'),
  ('parent_child_roles', 'behavior', 'repeatedExplicit', '부모와 아기의 역할', '부모는 제공을 결정하고 실제 섭취량은 아기가 결정한다.', '["책 p.276-279","책 p.292-293","책 p.337-348"]', null, '2023 최신개정판'),
  ('suspected_reaction_pause', 'condition', 'hard', '의심 반응 자동 재추천 금지', '의심 반응 재료를 중단하고 상세 반응을 기록한다.', '["책 p.364-373"]', 'clinician', '2023 최신개정판')
on conflict (id) do update set
  layer = excluded.layer,
  strength = excluded.strength,
  title = excluded.title,
  description = excluded.description,
  source_pages = excluded.source_pages,
  overridable_by = excluded.overridable_by,
  book_edition = excluded.book_edition,
  active = true,
  updated_at = now();
