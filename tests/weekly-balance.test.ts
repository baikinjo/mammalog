import assert from "node:assert/strict";
import test from "node:test";
import { ingredientCatalog } from "../lib/ingredient-catalog";
import type { BabyProfile, ChildIngredientState, MealHistoryEntry } from "../lib/domain";
import { createWeeklyBalance } from "../lib/weekly-balance";

const profile: BabyProfile = {
  id: "child",
  nickname: "테스트 아기",
  stage: "late",
  ageMonths: 9,
  mealsPerDay: 3,
  snacksPerDay: 2,
  preferredMealTime: "09:00",
  textureMm: 5,
  preparationStyle: "batch",
};

function passed(ingredientId: string): ChildIngredientState {
  return { ingredientId, status: "passed", testDay: null, exposureCount: 3, lastOfferedAt: "2026-07-30T17:00:00.000Z" };
}

test("summarizes the latest seven calendar days from actual meal history", () => {
  const states = ["rice", "beef", "cabbage", "pumpkin", "apple"].map(passed);
  const history: MealHistoryEntry[] = [
    { servedAt: "2026-07-24T09:00:00.000Z", ingredientIds: ["rice"], completion: "half", mealType: "meal", textureMm: 3 },
    { servedAt: "2026-07-29T09:00:00.000Z", ingredientIds: ["rice", "beef", "cabbage", "pumpkin", "apple"], completion: "most", mealType: "meal", textureMm: 5 },
    { servedAt: "2026-07-30T09:00:00.000Z", ingredientIds: ["rice", "beef", "cabbage", "pumpkin", "whitefish"], completion: "half", mealType: "meal", textureMm: 5 },
    { servedAt: "2026-07-31T09:00:00.000Z", ingredientIds: ["rice", "beef", "cabbage", "pumpkin", "salmon"], completion: "most", mealType: "meal", textureMm: 7 },
  ];
  const summary = createWeeklyBalance(profile, ingredientCatalog, states, history, new Date("2026-07-31T12:00:00.000Z"));

  assert.equal(summary.recordedDays, 3);
  assert.equal(summary.recordedMeals, 3);
  assert.equal(summary.metrics.find((metric) => metric.id === "meat")?.value, "3/3일");
  assert.equal(summary.metrics.find((metric) => metric.id === "fruit")?.value, "1/3일");
  assert.equal(summary.metrics.find((metric) => metric.id === "fish")?.value, "2/2회");
  assert.equal(summary.metrics.find((metric) => metric.id === "texture")?.value, "7mm");
  assert.match(summary.focus, /과일이 빠진 날/);
});

test("does not flag food groups that have not been introduced yet", () => {
  const history: MealHistoryEntry[] = [
    { servedAt: "2026-07-31T09:00:00.000Z", ingredientIds: ["rice"], completion: "taste", mealType: "meal", textureMm: 1 },
  ];
  const summary = createWeeklyBalance(
    { ...profile, stage: "initial", ageMonths: 6, mealsPerDay: 1, textureMm: 1 },
    ingredientCatalog,
    [passed("rice")],
    history,
    new Date("2026-07-31T12:00:00.000Z"),
  );

  assert.equal(summary.metrics.find((metric) => metric.id === "meat")?.status, "locked");
  assert.equal(summary.metrics.find((metric) => metric.id === "leafy")?.value, "도입 전");
  assert.match(summary.focus, /고르게 채워졌어요/);
});

test("warns when fish exceeds the rolling seven-day cap", () => {
  const states = ["rice", "beef"].map(passed);
  const history: MealHistoryEntry[] = [
    { servedAt: "2026-07-27T09:00:00.000Z", ingredientIds: ["rice", "whitefish"], completion: "half", mealType: "meal", textureMm: 5 },
    { servedAt: "2026-07-29T09:00:00.000Z", ingredientIds: ["rice", "salmon"], completion: "half", mealType: "meal", textureMm: 5 },
    { servedAt: "2026-07-31T09:00:00.000Z", ingredientIds: ["rice", "mackerel"], completion: "half", mealType: "meal", textureMm: 5 },
  ];
  const summary = createWeeklyBalance(profile, ingredientCatalog, states, history, new Date("2026-07-31T12:00:00.000Z"));

  assert.equal(summary.metrics.find((metric) => metric.id === "fish")?.status, "attention");
  assert.match(summary.focus, /생선이 2회를 넘었어요/);
});

test("counts what was eaten with a food the family has since removed, while open food groups follow its current list", () => {
  const removedFish = { ...ingredientCatalog.find((ingredient) => ingredient.id === "whitefish")!, id: "custom-old-fish", name: "우리집 동태" };
  const removedFruit = { ...ingredientCatalog.find((ingredient) => ingredient.id === "apple")!, id: "custom-old-fruit", name: "우리집 사과" };
  const states = ["rice", "beef", removedFish.id, removedFruit.id].map(passed);
  const history: MealHistoryEntry[] = [
    { servedAt: "2026-07-27T09:00:00.000Z", ingredientIds: ["rice", "beef", removedFish.id], completion: "half", mealType: "meal", textureMm: 5 },
    { servedAt: "2026-07-29T09:00:00.000Z", ingredientIds: ["rice", "beef", removedFish.id, removedFruit.id], completion: "half", mealType: "meal", textureMm: 5 },
    { servedAt: "2026-07-31T09:00:00.000Z", ingredientIds: ["rice", "beef", "salmon"], completion: "half", mealType: "meal", textureMm: 5 },
  ];
  const anchor = new Date("2026-07-31T12:00:00.000Z");
  const metric = (summary: ReturnType<typeof createWeeklyBalance>, id: string) => {
    const found = summary.metrics.find((item) => item.id === id);
    return [found?.value, found?.status];
  };
  const listed = createWeeklyBalance(profile, ingredientCatalog, states, history, anchor);
  const recorded = createWeeklyBalance(profile, ingredientCatalog, states, history, anchor, [...ingredientCatalog, removedFish, removedFruit]);

  assert.deepEqual(metric(listed, "fish"), ["1/2회", "met"]);
  assert.deepEqual(metric(recorded, "fish"), ["3/2회", "attention"], "the removed fish meals still count");
  assert.match(recorded.focus, /생선이 2회를 넘었어요/);
  // A removed food's passed state does not open its group: fruit stays not introduced on the family's current list.
  assert.deepEqual(metric(recorded, "fruit"), metric(listed, "fruit"));
});
