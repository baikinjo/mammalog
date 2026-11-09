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
