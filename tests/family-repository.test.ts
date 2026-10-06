import assert from "node:assert/strict";
import test from "node:test";
import {
  loadCustomIngredients,
  loadDailyRecommendation,
  loadFamilyMealRecords,
  loadFamilyWorkspace,
  saveCustomIngredient,
  saveFamilyMealRecord,
  signInFamilyAnonymously,
  updateCustomIngredient,
  updateFamilyMealRecord,
  type SaveFamilyMealInput,
} from "../lib/family-repository";
import { ingredientById } from "../lib/ingredient-catalog";
import { chooseNextIngredient } from "../lib/recommendation-engine";
import type { BabyProfile } from "../lib/domain";

type RestCall = { method: string; path: string; query: string; body: unknown };
type RestReply = { status: number; body?: unknown };

const user = {
  id: "user-123",
  aud: "authenticated",
  role: "authenticated",
  email: null,
  app_metadata: { provider: "anonymous", providers: [] },
  user_metadata: {},
  identities: [],
  created_at: "2026-09-25T00:00:00.000Z",
  is_anonymous: true,
};

let route: (call: RestCall) => RestReply = () => ({ status: 500 });
const calls: RestCall[] = [];

process.env.NEXT_PUBLIC_SUPABASE_URL = "https://mammalog.test";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key";
globalThis.fetch = async (input, init) => {
  const url = new URL(input instanceof Request ? input.url : String(input));
  const method = init?.method ?? (input instanceof Request ? input.method : "GET");
  const json = (status: number, body?: unknown) => new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
  if (url.pathname.startsWith("/auth/v1/")) {
    return url.pathname.endsWith("/user")
      ? json(200, user)
      : json(200, { access_token: "access", token_type: "bearer", expires_in: 3600, refresh_token: "refresh", user });
  }
  const call = {
    method,
    path: url.pathname.replace("/rest/v1/", ""),
    query: decodeURIComponent(url.search),
    body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined,
  };
  calls.push(call);
  const reply = route(call);
  return json(reply.status, reply.body);
};

const mealInput: SaveFamilyMealInput = {
  childId: "child-1",
  date: "2026-09-01",
  mealIndex: 1,
  plannedTime: "10:00",
  title: "소고기배추죽",
  ingredients: ["rice", "beef", "spinach"].map((id) => ingredientById.get(id)!),
  newExposureIngredientId: "spinach",
  completion: "half",
  reaction: "none",
  note: "",
  stage: "initial",
  textureMm: 2,
  servingGuide: "",
  textureGuide: "",
  servingMode: "토핑을 올린 죽",
  recommendationReasons: [],
  withoutRecommendation: false,
};

function replyTo(existingItemIds: string[] | null, itemInsertStatus = 201): (call: RestCall) => RestReply {
  return (call) => {
    if (call.method === "GET" && call.path === "meal_plans") {
      return { status: 200, body: existingItemIds ? [{ id: "plan-1", meal_plan_items: existingItemIds.map((id) => ({ id })) }] : [] };
    }
    if (call.method === "POST" && call.path === "meal_plans") return { status: 201, body: { id: "plan-1" } };
    if (call.method === "POST" && call.path === "meal_plan_items") {
      return itemInsertStatus < 300
        ? { status: itemInsertStatus }
        : { status: itemInsertStatus, body: { code: "23503", message: "violates foreign key constraint" } };
    }
    return { status: call.method === "DELETE" ? 204 : 201 };
  };
}

function summary(): string[] {
  return calls.map((call) => `${call.method} ${call.path}${call.method === "DELETE" ? call.query : ""}`);
}

test("meal save writes new items before deleting only the previous rows", async () => {
  await signInFamilyAnonymously();

  calls.length = 0;
  route = replyTo(["old-1", "old-2"]);
  await saveFamilyMealRecord({ ...mealInput, newExposureIngredientId: null });
  assert.deepEqual(summary(), [
    "GET meal_plans",
    "POST meal_plans",
    "POST meal_plan_items",
    "DELETE meal_plan_items?id=in.(old-1,old-2)",
    "POST meal_logs",
  ]);
  const insertedItems = calls[2].body as Array<{ ingredient_id: string; is_new_exposure: boolean }>;
  assert.deepEqual(insertedItems.map((item) => item.is_new_exposure), [false, false, false]);
  assert.equal((calls[1].body as { serving_mode: string }).serving_mode, "토핑을 올린 죽", "the chosen serving style is stored");
  assert.equal((calls[1].body as { recommendation_version: string }).recommendation_version, "book-engine-v2");

  // A meal recorded as actually given (no book recommendation) says so and stores no suggested texture.
  calls.length = 0;
  route = replyTo(null);
  await saveFamilyMealRecord({ ...mealInput, ingredients: [ingredientById.get("rice")!], newExposureIngredientId: "rice", textureMm: null, servingMode: "", withoutRecommendation: true });
  const actualPlan = calls[1].body as { recommendation_version: string; texture_mm: number | null };
  const actualLog = calls.find((call) => call.path === "meal_logs")!.body as { texture_mm: number | null };
  assert.deepEqual([actualPlan.recommendation_version, actualPlan.texture_mm, actualLog.texture_mm], ["parent-record", null, null]);

  calls.length = 0;
  route = replyTo(["old-1", "old-2"], 409);
  await assert.rejects(saveFamilyMealRecord(mealInput), { code: "23503" });
  assert.deepEqual(summary(), ["GET meal_plans", "POST meal_plans", "POST meal_plan_items"]);

  calls.length = 0;
  route = replyTo(null, 409);
  await assert.rejects(saveFamilyMealRecord(mealInput), { code: "23503" });
  assert.deepEqual(summary(), ["GET meal_plans", "POST meal_plans", "POST meal_plan_items", "DELETE meal_plans?id=eq.plan-1"]);
  const flagged = (calls[2].body as Array<{ ingredient_id: string; is_new_exposure: boolean }>)
    .filter((item) => item.is_new_exposure)
    .map((item) => item.ingredient_id);
  assert.deepEqual(flagged, ["spinach"]);
});

test("loaded meal records expose the ingredient the meal introduced and what the meal stored", async () => {
  const row = {
    id: "plan-1",
    meal_date: "2026-09-01",
    meal_index: 1,
    planned_time: "10:00:00",
    title: "소고기시금치죽",
    texture_mm: 2,
    serving_guide: "30~100g 범위에서 아이가 먹는 만큼",
    texture_guide: "2mm 안팎",
    serving_mode: "토핑을 올린 죽",
    recommendation_reasons: ["시금치 1/3일차예요."],
    meal_plan_items: [
      { ingredient_id: "rice", is_new_exposure: false },
      { ingredient_id: "spinach", is_new_exposure: true },
    ],
    meal_logs: [{ id: "log-1", completion: "half", reaction: "none", note: null, recorded_by: "user-123", recorded_at: "2026-09-01T17:00:00+00:00" }],
  };
  route = () => ({
    status: 200,
    body: [
      { ...row, recommendation_version: "book-engine-v2" },
      { ...row, id: "plan-0", meal_date: "2026-08-31", serving_guide: null, texture_guide: null, serving_mode: "mixed", recommendation_reasons: [] },
      { ...row, id: "plan-2", meal_date: "2026-09-02", texture_mm: null, serving_mode: "", recommendation_version: "parent-record" },
    ],
  });
  const [record, legacy, actual] = await loadFamilyMealRecords("child-1");
  assert.match(calls.at(-1)!.query, /recommendation_version/, "the provenance column is loaded");
  assert.deepEqual(record.ingredientIds, ["rice", "spinach"]);
  assert.equal(record.newExposureIngredientId, "spinach");
  assert.deepEqual(
    [record.servingGuide, record.textureGuide, record.servingMode, record.recommendationReasons],
    ["30~100g 범위에서 아이가 먹는 만큼", "2mm 안팎", "토핑을 올린 죽", ["시금치 1/3일차예요."]],
  );
  // Older saves stored a "mixed" placeholder rather than the serving style that was shown.
  assert.deepEqual([legacy.servingGuide, legacy.textureGuide, legacy.servingMode, legacy.recommendationReasons], [null, null, null, []]);
  assert.deepEqual([record.withoutRecommendation, legacy.withoutRecommendation, actual.withoutRecommendation], [false, false, true]);
  assert.deepEqual([actual.textureMm, actual.servingMode], [null, null]);
});

test("loads the stored day snapshot for one child and date", async () => {
  await signInFamilyAnonymously();
  calls.length = 0;
  const snapshot = { date: "2026-09-01", meals: [{ index: 1, title: "달걀당근죽" }] };
  route = (call) => ({ status: 200, body: call.path === "daily_recommendations" ? [{ output_snapshot: snapshot }] : [] });
  assert.deepEqual(await loadDailyRecommendation("child-1", "2026-09-01"), snapshot);
  assert.equal(calls[0].path, "daily_recommendations");
  assert.match(calls[0].query, /child_id=eq\.child-1/);
  assert.match(calls[0].query, /recommendation_date=eq\.2026-09-01/);

  route = () => ({ status: 200, body: [] });
  assert.equal(await loadDailyRecommendation("child-1", "2026-09-02"), null);
});

test("editing a meal record only updates its log and keeps the stored meal", async () => {
  await signInFamilyAnonymously();
  calls.length = 0;
  route = () => ({ status: 200, body: { id: "log-1" } });
  await updateFamilyMealRecord("plan-1", { completion: "most", reaction: "needs_review", note: " 입 주변 발진 " });

  assert.deepEqual(summary(), ["PATCH meal_logs"]);
  assert.match(calls[0].query, /meal_plan_id=eq\.plan-1/);
  const body = calls[0].body as Record<string, unknown>;
  assert.deepEqual(Object.keys(body).sort(), ["completion", "note", "reaction", "recorded_by", "updated_at"]);
  assert.deepEqual([body.completion, body.reaction, body.note], ["most", "needs_review", "입 주변 발진"]);
});

test("family foods keep the age provenance of their catalog template after reload", async () => {
  await signInFamilyAnonymously();
  const row = (id: string, assetId: string | null, minimumAgeMonths: number | null, minimumStage = "initial") => ({
    id, household_id: "hh-1", name: id, emoji: "", asset_id: assetId, category: "grain", food_group: null, introduction_group: null,
    minimum_stage: minimumStage, minimum_age_months: minimumAgeMonths, introduction_priority: 70, color: null, allergen: false,
    frequency_cap_7d: null, preparation_constraints: [], choking_form_blacklist: [], book_guidance: null, source_pages: [], tags: [],
    is_custom: true, is_active: true,
  });
  route = (call) => ({
    status: 200,
    body: call.path === "ingredients"
      ? [
          row("custom-brown-rice", "rice", 6),
          row("custom-unset-age", "rice", null),
          row("custom-stronger", "rice", 7),
          row("custom-carrot", "carrot", 6),
          row("custom-millet", "millet", 7, "middle"),
          row("custom-no-template", null, 6),
        ]
      : [],
  });
  const loaded = await loadCustomIngredients("hh-1");
  assert.deepEqual(loaded.map((item) => [item.id, item.minimumAgeMonths, item.minimumAgeIsStageStart]), [
    ["custom-brown-rice", 6, true],
    ["custom-unset-age", 6, true],
    ["custom-stronger", 7, false],
    ["custom-carrot", 6, false],
    ["custom-millet", 7, false],
    ["custom-no-template", 6, false],
  ]);

  // Through the planner, for a fictitious child born 2026-05-20 who started two days before six months: only the
  // template's stage-start age opens in the window; at six months every other food follows its own age and stage.
  const child: BabyProfile = {
    id: "child-1", nickname: "아기", stage: "initial", ageMonths: 5, birthDate: "2026-05-20", weaningStartDate: "2026-11-18",
    mealsPerDay: 1, preferredMealTime: "09:00", textureMm: 1, preparationStyle: "batch",
  };
  const pick = (profile: BabyProfile, food: (typeof loaded)[number], at: Date) => chooseNextIngredient(
    profile,
    [ingredientById.get("rice")!, food],
    [{ ingredientId: "rice", status: "passed", testDay: null, exposureCount: 3, lastOfferedAt: null }],
    [],
    at,
  )?.id ?? null;
  const opens = loaded.map((food) => [food.id, pick(child, food, new Date(2026, 10, 18, 10)) === food.id, pick({ ...child, ageMonths: 6 }, food, new Date(2026, 10, 20, 10)) === food.id]);
  assert.deepEqual(opens, [
    ["custom-brown-rice", true, true],
    ["custom-unset-age", true, true],
    ["custom-stronger", false, false],
    ["custom-carrot", false, true],
    ["custom-millet", false, false],
    ["custom-no-template", false, true],
  ]);

  // Saving and updating write the same columns as before: the provenance is derived, never stored.
  calls.length = 0;
  route = () => ({ status: 201 });
  await saveCustomIngredient("hh-1", loaded[0]);
  await updateCustomIngredient("hh-1", loaded[0]);
  for (const call of calls) {
    const body = call.body as Record<string, unknown>;
    assert.equal(body.minimum_age_months, 6);
    assert.deepEqual(Object.keys(body).filter((key) => /stage_start|age_is/.test(key)), []);
  }
});

test("the child's age counts completed calendar months and turns over on the birthday itself", async (t) => {
  await signInFamilyAnonymously();
  const childRow = (birthDate: string) => ({
    id: "child-1", household_id: "hh-1", nickname: "아기", birth_date: birthDate, weaning_start_date: null, stage: "prestart",
    corrected_age_days: null, readiness: {}, meals_per_day: 1, snacks_per_day: 0, preferred_meal_time: "09:00:00", milk_ml_per_day: null,
    texture_mm: 0, preparation_style: "batch", temporary_condition: "none", development_skills: {},
  });
  let child = childRow("2026-05-20");
  route = (call) => {
    if (call.path === "household_members") return { status: 200, body: call.query.includes("select=household_id") ? [{ household_id: "hh-1" }] : [] };
    if (call.path === "households") return { status: 200, body: { id: "hh-1", name: "가족" } };
    return { status: 200, body: call.path === "children" ? [child] : [] };
  };
  const ageOn = async (at: Date) => {
    t.mock.timers.enable({ apis: ["Date"], now: at });
    try {
      return (await loadFamilyWorkspace())!.children[0].ageMonths;
    } finally {
      t.mock.timers.reset();
    }
  };
  // 183.5 days after birth an average month length would already count six months; the calendar says five.
  assert.equal(await ageOn(new Date(2026, 10, 19, 12)), 5);
  assert.equal(await ageOn(new Date(2026, 10, 20, 0, 30)), 6);
  // Born on 08-31: six months on the last day of February, a day before an average month length gets there.
  child = childRow("2026-08-31");
  assert.equal(await ageOn(new Date(2027, 1, 27, 23, 30)), 5);
  assert.equal(await ageOn(new Date(2027, 1, 28, 0, 30)), 6);
});
