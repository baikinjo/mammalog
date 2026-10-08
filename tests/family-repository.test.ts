import assert from "node:assert/strict";
import test from "node:test";
import {
  correctFamilyMealFoods,
  loadArchivedCustomIngredients,
  loadCustomIngredients,
  loadDailyRecommendation,
  loadFamilyMealRecords,
  loadFamilyWorkspace,
  MealFoodCorrectionError,
  saveCustomIngredient,
  saveFamilyMealRecord,
  signInFamilyAnonymously,
  updateCustomIngredient,
  updateDailyRecommendationOutput,
  updateFamilyMealRecord,
  type CorrectFamilyMealFoodsInput,
  type SaveFamilyMealInput,
} from "../lib/family-repository";
import { ingredientById } from "../lib/ingredient-catalog";
import { chooseNextIngredient } from "../lib/recommendation-engine";
import type { BabyProfile } from "../lib/domain";

type RestCall = { method: string; path: string; query: string; params: URLSearchParams; body: unknown };
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
    params: url.searchParams,
    body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined,
  };
  calls.push(call);
  // A route that throws loses the reply the way a dropped connection does.
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

test("a meal recorded with the foods actually given stores exactly those foods as a direct record", async () => {
  await signInFamilyAnonymously();
  calls.length = 0;
  route = replyTo(null);
  await saveFamilyMealRecord({
    ...mealInput,
    title: "쌀·오트밀",
    ingredients: ["rice", "oatmeal"].map((id) => ingredientById.get(id)!),
    newExposureIngredientId: null,
    textureMm: null,
    servingGuide: "",
    textureGuide: "",
    servingMode: "",
    recommendationReasons: ["이번 끼니에 보여준 ‘쌀죽’ 대신 실제로 먹인 재료로 기록했어요."],
    withoutRecommendation: true,
  });
  const plan = calls.find((call) => call.method === "POST" && call.path === "meal_plans")!.body as Record<string, unknown>;
  assert.deepEqual(
    [plan.title, plan.recommendation_version, plan.texture_mm, plan.serving_guide, plan.texture_guide, plan.serving_mode],
    ["쌀·오트밀", "parent-record", null, "", "", ""],
  );
  const items = calls.find((call) => call.method === "POST" && call.path === "meal_plan_items")!.body as Array<Record<string, unknown>>;
  assert.deepEqual(items.map((item) => [item.ingredient_id, item.is_new_exposure]), [["rice", false], ["oatmeal", false]]);
  assert.equal((calls.find((call) => call.path === "meal_logs")!.body as Record<string, unknown>).texture_mm, null);

  // Loaded back, the record holds the same foods, no counted observation and its direct-record provenance.
  route = () => ({
    status: 200,
    body: [{
      id: "plan-1", meal_date: "2026-09-01", meal_index: 1, planned_time: "10:00:00", title: "쌀·오트밀", texture_mm: null,
      serving_guide: "", texture_guide: "", serving_mode: "", recommendation_reasons: plan.recommendation_reasons, recommendation_version: "parent-record",
      meal_plan_items: items.map((item) => ({ ingredient_id: item.ingredient_id, is_new_exposure: item.is_new_exposure })),
      meal_logs: [{ id: "log-1", completion: "half", reaction: "none", note: null, recorded_by: "user-123", recorded_at: "2026-09-01T17:00:00+00:00" }],
    }],
  });
  const [record] = await loadFamilyMealRecords("child-1");
  assert.deepEqual(
    [record.ingredientIds, record.newExposureIngredientId, record.withoutRecommendation, record.textureMm, record.title],
    [["rice", "oatmeal"], null, true, null, "쌀·오트밀"],
  );
});

type ServerItem = { id: string; meal_plan_id: string; ingredient_id: string; role: string; is_new_exposure: boolean };

const storedBeefPlan = {
  id: "plan-1",
  title: "소고기죽",
  serving_guide: "30~100g 범위에서 아이가 먹는 만큼",
  texture_guide: "2mm 안팎",
  serving_mode: "섞은 죽",
  recommendation_version: "book-engine-v2",
  recommendation_reasons: ["소고기 1/3일차예요."],
  updated_at: "2026-09-01T01:00:00.000Z",
};
const storedBeefItems: ServerItem[] = [
  { id: "item-rice", meal_plan_id: "plan-1", ingredient_id: "rice", role: "base", is_new_exposure: false },
  { id: "item-beef", meal_plan_id: "plan-1", ingredient_id: "beef", role: "protein", is_new_exposure: true },
  { id: "item-gone", meal_plan_id: "plan-1", ingredient_id: "custom-gone", role: "vegetable", is_new_exposure: false },
];
const corrected: CorrectFamilyMealFoodsInput = {
  mealPlanId: "plan-1",
  expectedIngredientIds: ["beef", "rice", "custom-gone"],
  // Rice swapped for oatmeal; beef and a food the family has since removed from its list stay.
  ingredients: [ingredientById.get("oatmeal")!, ingredientById.get("beef")!, { id: "custom-gone" }],
  newExposureIngredientId: null,
  title: "오트밀·소고기·우리집 채소",
  recommendationReasons: ["‘소고기죽’로 기록했던 식사를 실제로 먹인 재료로 고쳤어요."],
};

/**
 * One stored meal behind the REST API, so a test sees what each write really left behind. A fault names the n-th call of
 * a method and table: "fail" answers with an error and changes nothing, "lost" makes the change and then drops the reply
 * like a broken connection. `before` makes another save's change just before the named call arrives.
 */
class MealServer {
  plan: typeof storedBeefPlan = structuredClone(storedBeefPlan);
  items: ServerItem[] = structuredClone(storedBeefItems);
  private readonly seen = new Map<string, number>();

  constructor(
    private readonly faults: Record<string, "fail" | "lost"> = {},
    private readonly before: Record<string, (server: MealServer) => void> = {},
  ) {}

  handle(call: RestCall): RestReply {
    const name = `${call.method} ${call.path}`;
    const count = (this.seen.get(name) ?? 0) + 1;
    this.seen.set(name, count);
    this.before[`${name} #${count}`]?.(this);
    const fault = this.faults[`${name} #${count}`];
    if (fault === "fail") return { status: 500, body: { code: "XX000", message: "injected" } };
    const reply = this.apply(call);
    if (fault === "lost") throw new TypeError("fetch failed");
    return reply;
  }

  private apply(call: RestCall): RestReply {
    const eq = (key: string) => call.params.get(key)?.replace(/^eq\./, "");
    if (call.path === "meal_plans" && call.method === "GET") {
      const items = this.items.map(({ id, ingredient_id, role }) => ({ id, ingredient_id, role }));
      return { status: 200, body: eq("id") === this.plan.id ? [{ ...this.plan, meal_plan_items: items }] : [] };
    }
    if (call.path === "meal_plans" && call.method === "PATCH") {
      const matches = eq("id") === this.plan.id && (!call.params.has("updated_at") || eq("updated_at") === this.plan.updated_at);
      if (matches) Object.assign(this.plan, call.body);
      return { status: 200, body: matches ? [{ id: this.plan.id }] : [] };
    }
    if (call.path === "meal_plan_items" && call.method === "POST") {
      this.items.push(...structuredClone(call.body as ServerItem[]));
      return { status: 201 };
    }
    if (call.path === "meal_plan_items" && call.method === "DELETE") {
      const ids = (call.params.get("id") ?? "").replace(/^in\.\(/, "").replace(/\)$/, "").split(",");
      const removed = this.items.filter((item) => ids.includes(item.id));
      this.items = this.items.filter((item) => !ids.includes(item.id));
      return { status: 200, body: removed.map(({ id }) => ({ id })) };
    }
    return { status: 500 };
  }

  /** The meal exactly as it was stored before the correction: the same fields, update time and item rows. */
  isAsStored(): boolean {
    return JSON.stringify([this.plan, this.items]) === JSON.stringify([storedBeefPlan, storedBeefItems]);
  }

  foods(): string[] {
    return this.items.map((item) => `${item.ingredient_id}${item.is_new_exposure ? "*" : ""}`);
  }
}

async function correctOn(server: MealServer, input: CorrectFamilyMealFoodsInput = corrected): Promise<string> {
  calls.length = 0;
  route = (call) => server.handle(call);
  return correctFamilyMealFoods(input).then(
    () => "saved",
    (error) => (error instanceof MealFoodCorrectionError ? error.kind : String(error)),
  );
}
const without = (body: unknown, key: string) => Object.fromEntries(Object.entries(body as object).filter(([name]) => name !== key));
const correctedFields = {
  title: "오트밀·소고기·우리집 채소",
  serving_guide: "",
  texture_guide: "",
  serving_mode: "",
  recommendation_version: "parent-record",
  recommendation_reasons: corrected.recommendationReasons,
};
const storedFields = without(without(storedBeefPlan, "updated_at"), "id");

test("correcting a meal's foods replaces its items with ones it names itself, only while nobody changed the meal", async () => {
  await signInFamilyAnonymously();
  const server = new MealServer();
  assert.equal(await correctOn(server), "saved");
  assert.deepEqual(summary(), ["GET meal_plans", "PATCH meal_plans", "POST meal_plan_items", "DELETE meal_plan_items?id=in.(item-rice,item-beef,item-gone)&select=id"]);
  assert.match(calls[0].query, /id=eq\.plan-1/);
  assert.deepEqual(
    [calls[1].params.get("id"), calls[1].params.get("updated_at")],
    ["eq.plan-1", `eq.${storedBeefPlan.updated_at}`],
    "the fields are written only if the meal is still the one that was read",
  );
  assert.deepEqual(without(calls[1].body, "updated_at"), correctedFields, "the date, time, texture and log are never written");
  const inserted = calls[2].body as ServerItem[];
  assert.ok(inserted.every((item) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(item.id)), "new items carry their own ids");
  assert.deepEqual(inserted.map((item) => without(item, "id")), [
    { meal_plan_id: "plan-1", ingredient_id: "oatmeal", role: "base", is_new_exposure: false },
    { meal_plan_id: "plan-1", ingredient_id: "beef", role: "protein", is_new_exposure: false },
    { meal_plan_id: "plan-1", ingredient_id: "custom-gone", role: "vegetable", is_new_exposure: false },
  ], "kept foods keep their stored role");
  assert.deepEqual([server.foods(), server.items.map((item) => item.id)], [["oatmeal", "beef", "custom-gone"], inserted.map((item) => item.id)]);
  assert.deepEqual(without(server.plan, "updated_at"), { id: "plan-1", ...correctedFields });

  // A removal that keeps the meal's observation food keeps its marker.
  const kept = new MealServer();
  await correctOn(kept, { ...corrected, ingredients: [ingredientById.get("beef")!], newExposureIngredientId: "beef" });
  assert.deepEqual(kept.foods(), ["beef*"]);
});

test("a food correction writes nothing when the meal is not the one the family corrected", async () => {
  await signInFamilyAnonymously();
  for (const expectedIngredientIds of [["rice", "beef"], ["rice", "beef", "custom-gone", "oatmeal"]]) {
    const server = new MealServer();
    assert.equal(await correctOn(server, { ...corrected, expectedIngredientIds }), "recordChanged");
    assert.deepEqual(summary(), ["GET meal_plans"]);
    assert.ok(server.isAsStored());
  }
  const gone = new MealServer();
  gone.plan.id = "plan-other";
  assert.equal(await correctOn(gone), "recordChanged", "a record that is gone");
  assert.deepEqual(summary(), ["GET meal_plans"]);

  // Another guardian's save changed the meal after it was read: the guarded write matches nothing and nothing is written.
  const theirs = { title: "다른 보호자가 고친 식사", updated_at: "2026-09-01T02:00:00.000Z" };
  const raced = new MealServer({}, { "PATCH meal_plans #1": (server) => Object.assign(server.plan, theirs) });
  assert.equal(await correctOn(raced), "recordChanged");
  assert.deepEqual(summary(), ["GET meal_plans", "PATCH meal_plans"]);
  assert.deepEqual([raced.plan.title, raced.plan.updated_at, raced.items], [theirs.title, theirs.updated_at, storedBeefItems]);
});

test("a failed or unanswered correction write is reported from the meal as it reads back", async () => {
  await signInFamilyAnonymously();
  for (const [label, faults, kind] of [
    ["fields not written", { "PATCH meal_plans #1": "fail" }, "notSaved"],
    ["fields written, reply lost", { "PATCH meal_plans #1": "lost" }, "notSaved"],
    ["new items not written", { "POST meal_plan_items #1": "fail" }, "notSaved"],
    ["new items written, reply lost", { "POST meal_plan_items #1": "lost" }, "notSaved"],
    ["old items not removed", { "DELETE meal_plan_items #1": "fail" }, "notSaved"],
    ["old items removed, reply lost", { "DELETE meal_plan_items #1": "lost" }, "saved"],
  ] as const) {
    const server = new MealServer(faults);
    assert.equal(await correctOn(server), kind, label);
    if (kind === "notSaved") assert.ok(server.isAsStored(), `${label}: "not saved" only once the meal reads back exactly as stored`);
    else assert.deepEqual([server.foods(), server.plan.title], [["oatmeal", "beef", "custom-gone"], corrected.title], `${label}: the correction stands`);
  }

  // A write that was made but went unanswered is undone by its own ids, and the fields only while they are still its own.
  const lostInsert = new MealServer({ "POST meal_plan_items #1": "lost" });
  assert.equal(await correctOn(lostInsert), "notSaved");
  const ownIds = (calls[2].body as ServerItem[]).map((item) => item.id);
  const correctedAt = (calls[1].body as { updated_at: string }).updated_at;
  assert.deepEqual(summary(), [
    "GET meal_plans",
    "PATCH meal_plans",
    "POST meal_plan_items",
    "GET meal_plans",
    `DELETE meal_plan_items?id=in.(${ownIds.join(",")})&select=id`,
    "PATCH meal_plans",
    "GET meal_plans",
  ]);
  assert.equal(calls[5].params.get("updated_at"), `eq.${correctedAt}`);
  assert.deepEqual(calls[5].body, { ...storedFields, updated_at: storedBeefPlan.updated_at });

  // The old items were removed but the reply was lost: the meal reads back corrected, and nothing is removed after it.
  const lostRemoval = new MealServer({ "DELETE meal_plan_items #1": "lost" });
  assert.equal(await correctOn(lostRemoval), "saved");
  assert.deepEqual(summary().slice(4), ["GET meal_plans"]);
});

test("a correction that cannot be confirmed keeps every recorded food and another guardian's update", async () => {
  await signInFamilyAnonymously();
  const correctedFoods = ["oatmeal", "beef", "custom-gone"];

  // The old items were removed, the reply was lost and the meal cannot be read back: nothing more is written.
  const unreadable = new MealServer({ "DELETE meal_plan_items #1": "lost", "GET meal_plans #2": "fail" });
  assert.equal(await correctOn(unreadable), "uncertain");
  assert.deepEqual(summary().slice(4), ["GET meal_plans"]);
  assert.deepEqual(unreadable.foods(), correctedFoods, "the corrected foods are never removed");

  // New items were written but unanswered and the meal cannot be read back: the stored items all stay.
  const unreadableInsert = new MealServer({ "POST meal_plan_items #1": "lost", "GET meal_plans #2": "fail" });
  assert.equal(await correctOn(unreadableInsert), "uncertain");
  assert.deepEqual(unreadableInsert.foods(), ["rice", "beef*", "custom-gone", ...correctedFoods]);

  // Undoing the unanswered new items fails: the meal keeps its stored foods next to the new ones, and the book's fields
  // are not put back over foods that menu never had.
  const failedUndo = new MealServer({ "POST meal_plan_items #1": "lost", "DELETE meal_plan_items #1": "fail" });
  assert.equal(await correctOn(failedUndo), "uncertain");
  assert.deepEqual(
    [failedUndo.foods(), failedUndo.plan.recommendation_version],
    [["rice", "beef*", "custom-gone", ...correctedFoods], "parent-record"],
  );

  // Another save removed a stored item and added its own while this one ran: once stored items may be gone, this save's
  // new items are never removed, so the meal cannot end up without foods.
  const replaced = new MealServer({}, {
    "DELETE meal_plan_items #1": (server) => {
      server.items = server.items.filter((item) => item.id !== "item-rice");
      server.items.push({ id: "item-theirs", meal_plan_id: "plan-1", ingredient_id: "rice", role: "base", is_new_exposure: false });
    },
  });
  assert.equal(await correctOn(replaced), "uncertain");
  assert.deepEqual(summary().slice(-1), ["GET meal_plans"], "nothing is undone");
  assert.deepEqual(replaced.foods(), [...correctedFoods, "rice"]);

  // Another guardian updates the meal before this save puts its fields back: that update is never overwritten.
  const theirs = { title: "다른 보호자가 고친 식사", updated_at: "2026-09-01T02:00:00.000Z" };
  const overtaken = new MealServer(
    { "POST meal_plan_items #1": "fail" },
    { "PATCH meal_plans #2": (server) => Object.assign(server.plan, theirs) },
  );
  assert.equal(await correctOn(overtaken), "uncertain");
  assert.deepEqual([overtaken.plan.title, overtaken.plan.updated_at, overtaken.foods()], [theirs.title, theirs.updated_at, ["rice", "beef*", "custom-gone"]]);
  assert.equal(calls.filter((call) => call.method === "PATCH").at(-1)?.params.get("updated_at"), `eq.${(calls[1].body as { updated_at: string }).updated_at}`);
});

test("loads the family's removed foods and updates only a stored day snapshot's output", async () => {
  await signInFamilyAnonymously();
  calls.length = 0;
  route = () => ({
    status: 200,
    body: [{ id: "custom-gone", household_id: "hh-1", name: "우리집 채소", emoji: "", asset_id: "zucchini", category: "vegetable", minimum_age_months: 6, introduction_priority: 70, is_custom: true, is_active: false, preparation_constraints: [], choking_form_blacklist: [], source_pages: [], tags: [] }],
  });
  const [removed] = await loadArchivedCustomIngredients("hh-1");
  assert.match(calls[0].query, /household_id=eq\.hh-1/);
  assert.match(calls[0].query, /is_custom=eq\.true/);
  assert.match(calls[0].query, /is_active=eq\.false/);
  assert.deepEqual([removed.id, removed.name, removed.category], ["custom-gone", "우리집 채소", "vegetable"]);

  calls.length = 0;
  route = () => ({ status: 200, body: { id: "day-1" } });
  const snapshot = { date: "2026-09-01", meals: [{ index: 1, title: "쌀·오트밀" }] } as unknown as Parameters<typeof updateDailyRecommendationOutput>[1];
  await updateDailyRecommendationOutput("child-1", snapshot);
  assert.deepEqual(summary(), ["PATCH daily_recommendations"]);
  assert.match(calls[0].query, /child_id=eq\.child-1/);
  assert.match(calls[0].query, /recommendation_date=eq\.2026-09-01/);
  assert.deepEqual(calls[0].body, { output_snapshot: snapshot }, "the inputs it was computed from stay");
});