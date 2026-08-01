import assert from "node:assert/strict";
import test from "node:test";
import { createAdaptiveReview } from "../lib/adaptive-review";
import { ingredientCatalog } from "../lib/ingredient-catalog";
import { createBookBasedDayPlan, chooseNextIngredient } from "../lib/recommendation-engine";
import type { BabyProfile, ChildIngredientState, MealHistoryEntry } from "../lib/domain";

const profile: BabyProfile = {
  id: "child",
  nickname: "아기",
  stage: "middle",
  ageMonths: 8,
  mealsPerDay: 2,
  snacksPerDay: 1,
  preferredMealTime: "09:00",
  textureMm: 3,
  preparationStyle: "batch",
  skills: { handlesCurrentTexture: true, reachesAndGrasps: true, fingerFood: true, spoonPractice: false, cupPractice: false },
};

const steady: MealHistoryEntry[] = [1, 2, 3].map((day) => ({
  servedAt: `2026-07-${20 + day}T09:00:00.000Z`,
  ingredientIds: ["rice", "beef"],
  completion: "half",
  reaction: "none",
  textureMm: 3,
}));

test("proposes a small texture advance but requires parent confirmation", () => {
  const review = createAdaptiveReview(profile, steady);
  assert.equal(review.progression.action, "advance");
  assert.equal(review.progression.targetTextureMm, 5);
  assert.equal(review.progression.requiresParentConfirmation, true);
});

test("holds texture and new ingredients after a texture difficulty record", () => {
  const history: MealHistoryEntry[] = [...steady, { ...steady[2], servedAt: "2026-07-24T09:00:00.000Z", reaction: "textureDifficulty" }];
  const review = createAdaptiveReview(profile, history);
  assert.equal(review.progression.action, "hold");
  assert.equal(chooseNextIngredient(profile, ingredientCatalog, [], history, new Date("2026-07-25T12:00:00.000Z")), null);
});

test("holds the new-food slot after a needs-review record", () => {
  const history: MealHistoryEntry[] = [{ ...steady[0], reaction: "needsReview" }];
  const review = createAdaptiveReview(profile, history);
  assert.equal(review.progression.action, "review");
  assert.match(review.adjustments[0].detail, /이미 통과한 음식/);
});

test("adds preparation, serving and storage instructions to every planned meal", () => {
  const states: ChildIngredientState[] = ["rice", "beef", "cabbage", "pumpkin", "apple"].map((ingredientId) => ({
    ingredientId,
    status: "passed",
    testDay: null,
    exposureCount: 3,
    lastOfferedAt: null,
  }));
  const plan = createBookBasedDayPlan(profile, ingredientCatalog, states, [], new Date("2026-07-31T12:00:00.000Z"));
  for (const meal of [...plan.meals, ...plan.snacks]) {
    assert.ok(meal.preparationSteps.length >= 2);
    assert.ok(meal.servingMode.length > 0);
    assert.match(meal.storageGuide, /보관|냉장|재냉동/);
  }
  assert.doesNotMatch(plan.meals[0].preparationSteps.join(" "), /쌀는|죽로|재료은/);
});
