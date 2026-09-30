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
