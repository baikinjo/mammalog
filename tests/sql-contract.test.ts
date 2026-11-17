import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { ingredientCatalog } from "../lib/ingredient-catalog";
import {
  INGREDIENT_CATALOG_SYNC_COLUMNS,
  renderIngredientCatalogSyncSql,
} from "../scripts/generate-ingredient-catalog-sql";

function readRepoFile(path: string): string {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8").replaceAll("\r\n", "\n");
}

test("daily routine migration is shared safely and included in progress reset", () => {
  const routineSql = readFileSync(new URL("../supabase/routine_logs.sql", import.meta.url), "utf8");
  const controlsSql = readFileSync(new URL("../supabase/data_controls.sql", import.meta.url), "utf8");
  assert.match(routineSql, /create table if not exists public\.daily_routine_logs/);
  assert.match(routineSql, /enable row level security/);
  assert.match(routineSql, /can_access_child\(child_id\)/);
  assert.match(controlsSql, /delete from public\.daily_routine_logs where child_id = target_child_id/);
});

test("the snack food upgrade only adds one checked column to the shared daily routine row", () => {
  const upgradeSql = readRepoFile("supabase/routine_snack_foods.sql");
  assert.deepEqual(
    [...upgradeSql.matchAll(/^(create|revoke|grant|delete|update|insert|drop|alter|select|truncate|do)\b/gm)].map((match) => match[1]),
    ["alter", "do", "select"],
  );
  assert.match(upgradeSql, /^alter table public\.daily_routine_logs\n {2}add column if not exists snack_foods jsonb not null default '\[\]'::jsonb;$/m);
  // The check is added once, and only when it is missing, so a re-run never drops or rewrites anything.
  assert.match(upgradeSql, /if not exists \([\s\S]*?conname = 'daily_routine_logs_snack_foods_check'\n {2}\) then\n {4}alter table public\.daily_routine_logs\n {6}add constraint daily_routine_logs_snack_foods_check check \(/);
  assert.match(upgradeSql, /jsonb_typeof\(snack_foods\) = 'array'\n\s+and jsonb_array_length\(snack_foods\) <= snack_count\n/);
  assert.match(upgradeSql, /not jsonb_path_exists\(snack_foods, 'strict \$\[\*\] \? \(@\.type\(\) != "array"\)'\)/);
  assert.match(upgradeSql, /not jsonb_path_exists\(snack_foods, 'strict \$\[\*\]\[\*\] \? \(@\.type\(\) != "string" \|\| @ == ""\)'\)/);
  assert.doesNotMatch(upgradeSql, /drop (table|column|constraint|policy)|delete from|truncate|update public\.|insert into|(create|alter) policy|row level security|^\s*(grant|revoke)\b/im);

  // The row's family policy, table grants and progress reset already cover the new column.
  const routineSql = readRepoFile("supabase/routine_logs.sql");
  assert.match(routineSql, /on public\.daily_routine_logs for all to authenticated\n {2}using \(public\.can_access_child\(child_id\)\)\n {2}with check \(public\.can_access_child\(child_id\)\);/);
  assert.match(routineSql, /^grant select, insert, update, delete on public\.daily_routine_logs to authenticated;$/m);
  assert.match(readRepoFile("supabase/shared_progress_reset.sql"), /delete from public\.daily_routine_logs where child_id = target_child_id/);

  const readme = readRepoFile("README.md");
  assert.match(readme, /3\. `supabase\/routine_logs\.sql`[\s\S]*6\. `supabase\/routine_snack_foods\.sql`/, "new projects run it after routine_logs.sql");
  assert.match(readme, /이미 설치된 프로젝트의 \*\*SQL Editor\*\*에서 `supabase\/routine_snack_foods\.sql`을 한 번 실행하세요/);
});

/** SQL with every dollar-quoted body (DO blocks, functions) and comment taken out: what runs when the file is run. */
function installStatements(sql: string): string {
  return sql.replace(/\$(\w*)\$[\s\S]*?\$\1\$/g, "$$$$").replace(/--[^\n]*/g, "");
}

/** The body of a function the file creates, comments taken out. */
function functionBody(sql: string, name: string): string {
  const match = new RegExp(`create or replace function public\\.${name}\\([\\s\\S]*?\\nas \\$(\\w+)\\$([\\s\\S]*?)\\$\\1\\$;`).exec(sql);
  assert.ok(match, name);
  return match[2].replace(/--[^\n]*/g, "");
}

test("the snack reaction upgrade adds one checked column to the daily routine row and the one-observation guard, and changes no data", () => {
  const upgradeSql = readRepoFile("supabase/routine_snack_reactions.sql");
  const install = installStatements(upgradeSql);
  assert.deepEqual(
    [...install.matchAll(/^(create|revoke|grant|delete|update|insert|drop|alter|select|truncate|do|notify)\b/gm)].map((match) => match[1]),
    ["alter", "do", "do", "create", "revoke", "grant", "create", "revoke", "create", "create", "notify", "select"],
  );
  assert.match(upgradeSql, /^alter table public\.daily_routine_logs\n {2}add column if not exists snack_reactions jsonb not null default '\[\]'::jsonb;$/m);
  // The check is added once, and only when it is missing, so a re-run never drops or rewrites anything.
  assert.match(upgradeSql, /if not exists \([\s\S]*?conname = 'daily_routine_logs_snack_reactions_check'\n {2}\) then\n {4}alter table public\.daily_routine_logs\n {6}add constraint daily_routine_logs_snack_reactions_check check \(/);
  assert.match(upgradeSql, /jsonb_typeof\(snack_reactions\) = 'array'\n\s+and jsonb_array_length\(snack_reactions\) <= snack_count\n/);
  // Each entry is null (not recorded) or one of a meal's reaction values, checked by type first so no other type slips past.
  assert.match(upgradeSql, /not jsonb_path_exists\(snack_reactions, 'strict \$\[\*\] \? \(@\.type\(\) != "null" && @\.type\(\) != "string"\)'\)/);
  assert.match(upgradeSql, /not jsonb_path_exists\(snack_reactions, 'strict \$\[\*\] \? \(@\.type\(\) == "string" && @ != "none" && @ != "taste_rejection" && @ != "texture_difficulty" && @ != "needs_review"\)'\)/);
  // Running the file changes no row, table, policy or row level security; only the save function is granted.
  assert.doesNotMatch(install, /drop |delete from|truncate|update public\.|insert into|(create|alter) policy|row level security/i);
  assert.doesNotMatch(upgradeSql.replace(/--[^\n]*/g, ""), /\bdrop\b|truncate|delete from|(create|alter) policy|disable row level security|security definer/i);
  // One food under observation per child, kept by a partial unique index (it changes no row), added only while no child
  // already has several foods under observation; the check reports either way.
  assert.match(upgradeSql, /if not exists \(\n {4}select 1\n {4}from public\.child_ingredients\n {4}where status = 'testing'\n {4}group by child_id\n {4}having count\(\*\) > 1\n {2}\) then\n {4}create unique index if not exists child_ingredients_one_observation\n {6}on public\.child_ingredients \(child_id\)\n {6}where status = 'testing';\n {2}end if;/);
  assert.equal((upgradeSql.match(/create unique index/g) ?? []).length, 1);
  assert.match(upgradeSql, /as has_snack_reactions,[\s\S]*as has_snack_reactions_check,[\s\S]*as rls_enabled,[\s\S]*as routine_rows,[\s\S]*as rows_with_snack_reactions,[\s\S]*as has_one_observation_guard,[\s\S]*as children_with_several_observations,[\s\S]*as has_observation_save,[\s\S]*as observation_save_members_only,[\s\S]*as serializes_reaction_writes;/);

  // The row's family policy, table grants and progress reset already cover the new column.
  const routineSql = readRepoFile("supabase/routine_logs.sql");
  assert.match(routineSql, /on public\.daily_routine_logs for all to authenticated\n {2}using \(public\.can_access_child\(child_id\)\)\n {2}with check \(public\.can_access_child\(child_id\)\);/);
  assert.match(routineSql, /^grant select, insert, update, delete on public\.daily_routine_logs to authenticated;$/m);
  assert.match(readRepoFile("supabase/shared_progress_reset.sql"), /delete from public\.daily_routine_logs where child_id = target_child_id/);

  const readme = readRepoFile("README.md");
  assert.match(readme, /6\. `supabase\/routine_snack_foods\.sql`\n\s+7\. `supabase\/routine_snack_reactions\.sql`/, "new projects run it after routine_snack_foods.sql");
  assert.match(readme, /이미 설치된 프로젝트의 \*\*SQL Editor\*\*에서 `supabase\/routine_snack_reactions\.sql`을 한 번 실행하세요/);
});

test("observation states are saved one at a time per child, by members, on the app's calendar days", () => {
  const upgradeSql = readRepoFile("supabase/routine_snack_reactions.sql");
  const signature = "public.save_observation_state(uuid, text, timestamptz, jsonb, text, uuid, integer)";
  const save = functionBody(upgradeSql, "save_observation_state");
  const serialize = functionBody(upgradeSql, "serialize_child_observations");
  // Both run with the caller's rights and row level security, and name every object with its schema.
  for (const name of ["save_observation_state", "serialize_child_observations"]) {
    assert.match(upgradeSql, new RegExp(`create or replace function public\\.${name}\\([\\s\\S]*?\\)\\nreturns \\w+\\nlanguage plpgsql\\nsecurity invoker\\nset search_path = ''\\nas \\$`), name);
  }
  for (const body of [save, serialize]) {
    assert.doesNotMatch(body, /(?<!distinct )\b(from|join|update|insert into)\s+(?!public\.|pg_catalog\.|lateral pg_catalog\.|\()/i);
  }
  assert.ok(upgradeSql.includes(`revoke all on function ${signature} from public, anon;\ngrant execute on function ${signature} to authenticated;`));
  assert.match(upgradeSql, /^revoke all on function public\.serialize_child_observations\(\) from public, anon, authenticated;$/m);
  // Signed-in family members only, then the child's lock, before anything is read; the reaction writers take the same lock.
  assert.match(save, /if pg_catalog\.current_setting\('transaction_isolation'\) <> 'read committed' then[\s\S]*if auth\.uid\(\) is null then[\s\S]*if not public\.can_access_child\(target_child_id\) then[\s\S]*perform pg_catalog\.pg_advisory_xact_lock\(\n\s+pg_catalog\.hashtextextended\('mammalog:child-observations:' \|\| target_child_id::text, 0\)\n\s+\);\n\n\s+select \* into stored/);
  assert.match(serialize, /perform pg_catalog\.pg_advisory_xact_lock\(\n\s+pg_catalog\.hashtextextended\('mammalog:child-observations:' \|\| fact_child_id::text, 0\)\n\s+\);/);
  for (const table of ["meal_logs", "daily_routine_logs"]) {
    assert.match(upgradeSql, new RegExp(`create or replace trigger serialize_child_observations\\n {2}before insert or update on public\\.${table}\\n {2}for each row execute function public\\.serialize_child_observations\\(\\);`), table);
  }
  // Calendar days are always read in the app's time zone, never the server's.
  assert.ok((save.match(/::date/g) ?? []).length >= 6);
  assert.equal((save.match(/::date/g) ?? []).length, (save.match(/at time zone calendar_time_zone\)::date/g) ?? []).length);
  // The save replies with exactly the results the app knows.
  const replies = new Set([...save.matchAll(/(?:return|refusal :=|result text :=|result :=)\s*'(\w+)'/g)].map((match) => match[1]));
  for (const match of save.matchAll(/then '(\w+)' else '(\w+)' end/g)) {
    replies.add(match[1]);
    replies.add(match[2]);
  }
  const repository = readRepoFile("lib/family-repository.ts");
  const known = /OBSERVATION_SAVE_RESULTS = new Set<string>\(\[([^\]]*)\]\)/.exec(repository)?.[1].match(/"(\w+)"/g)?.map((value) => value.slice(1, -1));
  assert.deepEqual([...replies].sort(), [...(known ?? [])].sort());
  // The app writes no observation state of its own: only the family's own changes in the 재료 tab write the table.
  const app = readRepoFile("app/meal-app.tsx");
  assert.equal((app.match(/saveChildIngredientState\(/g) ?? []).length, 1);
  assert.match(app, /saveObservationState\(childId, state, base, record\)/);
});

test("the shared progress reset upgrade replaces only the canonical reset function", () => {
  const resetFunction = (sql: string) => {
    const start = sql.indexOf("create or replace function public.reset_child_progress");
    return start < 0 ? "" : sql.slice(start, sql.indexOf("$$;", start) + 3);
  };
  const upgradeSql = readRepoFile("supabase/shared_progress_reset.sql");
  const canonical = resetFunction(readRepoFile("supabase/data_controls.sql"));
  assert.notEqual(canonical, "");
  assert.equal(resetFunction(upgradeSql), canonical, "shared_progress_reset.sql must match data_controls.sql");
  assert.match(canonical, /if auth\.uid\(\) is null then/);
  assert.match(canonical, /if not public\.can_access_child\(target_child_id\) then/);
  assert.doesNotMatch(canonical, /owner_id/);
  assert.deepEqual(
    [...upgradeSql.matchAll(/^(create|revoke|grant|delete|update|insert|drop|alter|select)\b/gm)].map((match) => match[1]),
    ["create", "revoke", "grant", "select"],
  );
  assert.match(readRepoFile("README.md"), /supabase\/shared_progress_reset\.sql/);
});

test("ingredient catalog sync SQL seeds every catalog id into every ingredients column", () => {
  const syncSql = readRepoFile("supabase/ingredient_catalog_sync.sql");
  assert.equal(
    syncSql,
    renderIngredientCatalogSyncSql(),
    "supabase/ingredient_catalog_sync.sql is stale; run pnpm exec tsx scripts/generate-ingredient-catalog-sql.ts",
  );

  const seededIds = [...syncSql.matchAll(/^ {2}\('([^']+)', null, /gm)].map((match) => match[1]);
  assert.deepEqual(seededIds.sort(), ingredientCatalog.map((ingredient) => ingredient.id).sort());
  assert.match(syncSql, /on conflict \(id\) do update set/);
  assert.match(syncSql, /where public\.ingredients\.household_id is null;/);

  const createBody = readRepoFile("supabase/schema.sql")
    .match(/create table if not exists public\.ingredients \(([\s\S]*?)\n\);/)?.[1] ?? "";
  const alterBody = readRepoFile("supabase/book_engine_v2.sql")
    .match(/alter table public\.ingredients([\s\S]*?);/)?.[1] ?? "";
  const tableColumns = [
    ...[...createBody.matchAll(/^ {2}([a-z0-9_]+) /gm)].map((match) => match[1]),
    ...[...alterBody.matchAll(/add column if not exists ([a-z0-9_]+)/g)].map((match) => match[1]),
  ];
  assert.ok(tableColumns.includes("introduction_priority") && tableColumns.includes("is_active"));
  assert.deepEqual(
    [...INGREDIENT_CATALOG_SYNC_COLUMNS].sort(),
    tableColumns.filter((column) => column !== "created_at").sort(),
  );

  assert.match(readRepoFile("README.md"), /supabase\/ingredient_catalog_sync\.sql/);
});
