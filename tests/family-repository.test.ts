import assert from "node:assert/strict";
import test from "node:test";
import {
  loadFamilyMealRecords,
  saveFamilyMealRecord,
  signInFamilyAnonymously,
  updateFamilyMealRecord,
  type SaveFamilyMealInput,
} from "../lib/family-repository";
import { ingredientById } from "../lib/ingredient-catalog";

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
  recommendationReasons: [],
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

test("loaded meal records expose the ingredient the meal introduced", async () => {
  route = () => ({
    status: 200,
    body: [{
      id: "plan-1",
      meal_date: "2026-09-01",
      meal_index: 1,
      planned_time: "10:00:00",
      title: "소고기시금치죽",
      texture_mm: 2,
      meal_plan_items: [
        { ingredient_id: "rice", is_new_exposure: false },
        { ingredient_id: "spinach", is_new_exposure: true },
      ],
      meal_logs: [{ id: "log-1", completion: "half", reaction: "none", note: null, recorded_by: "user-123", recorded_at: "2026-09-01T17:00:00+00:00" }],
    }],
  });
  const [record] = await loadFamilyMealRecords("child-1");
  assert.deepEqual(record.ingredientIds, ["rice", "spinach"]);
  assert.equal(record.newExposureIngredientId, "spinach");
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
