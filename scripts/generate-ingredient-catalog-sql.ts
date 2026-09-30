import { writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { ingredientCatalog } from "../lib/ingredient-catalog";
import type { IngredientDefinition } from "../lib/domain";

export const INGREDIENT_CATALOG_SYNC_SQL_PATH = new URL("../supabase/ingredient_catalog_sync.sql", import.meta.url);

const BOOK_EDITION = "2023 최신개정판";

type SqlValue = string | number | boolean | null | readonly string[];

const columns: Array<[column: string, value: (item: IngredientDefinition) => SqlValue]> = [
  ["id", (item) => item.id],
  ["household_id", () => null],
  ["name", (item) => item.name],
  ["emoji", (item) => item.emoji],
  ["asset_id", (item) => item.assetId ?? null],
  ["category", (item) => item.category],
  ["food_group", (item) => item.foodGroup ?? null],
  ["introduction_group", (item) => item.introductionGroup],
  ["minimum_stage", (item) => item.minimumStage],
  ["minimum_age_months", (item) => item.minimumAgeMonths ?? 6],
  ["introduction_priority", (item) => item.introductionPriority],
  ["color", (item) => item.color ?? null],
  ["allergen", (item) => item.allergen ?? false],
  ["frequency_cap_7d", (item) => item.frequencyCap7Days ?? null],
  ["preparation_constraints", (item) => item.preparationConstraints ?? []],
  ["choking_form_blacklist", (item) => item.chokingFormBlacklist ?? []],
  ["book_guidance", (item) => item.bookGuidance ?? null],
  ["source_pages", (item) => item.sourcePages ?? []],
  ["tags", (item) => item.tags ?? []],
  ["book_edition", () => BOOK_EDITION],
  ["is_custom", () => false],
  ["is_active", () => true],
];

export const INGREDIENT_CATALOG_SYNC_COLUMNS = columns.map(([column]) => column);

function sqlText(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function sqlValue(value: SqlValue): string {
  if (value === null) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return String(value);
  if (typeof value === "string") return sqlText(value);
  return `${sqlText(JSON.stringify(value))}::jsonb`;
}

export function renderIngredientCatalogSyncSql(): string {
  const rows = ingredientCatalog.map(
    (item) => `  (${columns.map(([, value]) => sqlValue(value(item))).join(", ")})`,
  );
  const updates = INGREDIENT_CATALOG_SYNC_COLUMNS
    .filter((column) => column !== "id")
    .map((column) => `  ${column} = excluded.${column}`);

  return [
    "-- Generated from lib/ingredient-catalog.ts by scripts/generate-ingredient-catalog-sql.ts. Do not edit by hand;",
    "-- regenerate with: pnpm exec tsx scripts/generate-ingredient-catalog-sql.ts",
    "--",
    `-- Upserts all ${ingredientCatalog.length} built-in ingredients so meal_plan_items, child_ingredients and`,
    "-- ingredient_reactions can reference every catalog id. Run after schema.sql and book_engine_v2.sql.",
    "-- Safe to re-run at any time: it only touches shared rows (household_id is null) and does not need a code deploy.",
    "",
    "insert into public.ingredients",
    `  (${INGREDIENT_CATALOG_SYNC_COLUMNS.join(", ")})`,
    "values",
    rows.join(",\n"),
    "on conflict (id) do update set",
    updates.join(",\n"),
    "where public.ingredients.household_id is null;",
    "",
    `-- Expected result: ${ingredientCatalog.length}`,
    "select count(*) as built_in_ingredients",
    "from public.ingredients",
    "where household_id is null",
    "  and is_custom = false",
    `  and id in (${ingredientCatalog.map((item) => sqlText(item.id)).join(", ")});`,
    "",
  ].join("\n");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  writeFileSync(INGREDIENT_CATALOG_SYNC_SQL_PATH, renderIngredientCatalogSyncSql(), "utf8");
  console.log(`Wrote ${INGREDIENT_CATALOG_SYNC_SQL_PATH.pathname}`);
}
