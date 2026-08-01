import assert from "node:assert/strict";
import test from "node:test";
import { ingredientCatalog } from "../lib/ingredient-catalog";
import {
  applyTrialOutcome,
  chooseNextIngredient,
  countRecentFish,
  createBookBasedDayPlan,
  hasStartReadiness,
  inferWeaningStage,
} from "../lib/recommendation-engine";
import type {
  BabyProfile,
  ChildIngredientState,
  MealHistoryEntry,
} from "../lib/domain";

const baseProfile: BabyProfile = {
  id: "child",
  nickname: "테스트 아기",
  stage: "initial",
  ageMonths: 6,
  mealsPerDay: 1,
  snacksPerDay: 0,
  preferredMealTime: "10:00",
  textureMm: 1,
  preparationStyle: "batch",
  temporaryCondition: "none",
};

function passed(ingredientId: string): ChildIngredientState {
  return {
    ingredientId,
    status: "passed",
    testDay: null,
    exposureCount: 3,
    lastOfferedAt: "2026-07-20T10:00:00.000Z",
  };
}

test("does not mark a four-month-old as ready to start", () => {
  const profile: BabyProfile = {
    ...baseProfile,
    stage: "prestart",
    ageMonths: 4,
    readiness: {
      tongueThrustGone: false,
      headControl: true,
      sitsWithSupport: false,
      foodInterest: true,
    },
  };
  assert.equal(hasStartReadiness(profile), false);
  assert.equal(inferWeaningStage(profile), "initial");
});

test("follows the book's food-group introduction order", () => {
  const next = chooseNextIngredient(
    baseProfile,
    ingredientCatalog,
    [passed("rice"), passed("oatmeal")],
    [],
    new Date("2026-07-31T12:00:00.000Z"),
  );
  assert.equal(next?.introductionGroup, "meat");
  assert.equal(next?.id, "beef");
});

test("keeps an active trial instead of opening another ingredient", () => {
  const states: ChildIngredientState[] = [
    passed("rice"),
    {
      ingredientId: "beef",
      status: "testing",
      testDay: 2,
      exposureCount: 1,
      lastOfferedAt: "2026-07-30T10:00:00.000Z",
    },
  ];
  const next = chooseNextIngredient(baseProfile, ingredientCatalog, states, []);
  assert.equal(next?.id, "beef");
});

test("moves a new ingredient through testing, passed, and reaction states", () => {
  let states: ChildIngredientState[] = [];
  states = applyTrialOutcome(states, "rice", "accepted", "2026-07-01T10:00:00.000Z", 3);
  assert.equal(states[0].testDay, 2);
  states = applyTrialOutcome(states, "rice", "accepted", "2026-07-02T10:00:00.000Z", 3);
  assert.equal(states[0].testDay, 3);
  states = applyTrialOutcome(states, "rice", "accepted", "2026-07-03T10:00:00.000Z", 3);
  assert.equal(states[0].status, "passed");

  states = applyTrialOutcome(states, "egg", "suspectedReaction", "2026-07-04T10:00:00.000Z", 3, "두드러기");
  assert.equal(states.find((state) => state.ingredientId === "egg")?.status, "suspectedReaction");
  assert.equal(states.find((state) => state.ingredientId === "egg")?.lastReaction, "두드러기");
});

test("reproduces the five-group introduction flow over the first fifteen days", () => {
  let states: ChildIngredientState[] = [];
  const opened: string[] = [];
  for (let day = 1; day <= 15; day += 1) {
    const date = new Date(Date.UTC(2026, 6, day, 12));
    const next = chooseNextIngredient(baseProfile, ingredientCatalog, states, [], date);
    assert.ok(next);
    if (!opened.includes(next!.introductionGroup)) opened.push(next!.introductionGroup);
    states = applyTrialOutcome(states, next!.id, "accepted", date.toISOString(), 3);
  }
  assert.deepEqual(opened.slice(0, 5), ["grain", "meat", "leafy", "yellow", "fruit"]);
  for (const group of ["grain", "meat", "leafy", "yellow", "fruit"]) {
    assert.ok(
      ingredientCatalog.some((item) => item.introductionGroup === group && states.find((state) => state.ingredientId === item.id)?.status === "passed"),
      `${group} should be passed`,
    );
  }
});

test("never recommends a suspected-reaction ingredient automatically", () => {
  const states: ChildIngredientState[] = [
    passed("rice"),
    {
      ingredientId: "beef",
      status: "suspectedReaction",
      testDay: null,
      exposureCount: 1,
      lastOfferedAt: "2026-07-30T10:00:00.000Z",
      lastReaction: "두드러기",
    },
  ];
  const next = chooseNextIngredient(baseProfile, ingredientCatalog, states, []);
  assert.notEqual(next?.id, "beef");
});

test("enforces the book's two-fish-meals-per-seven-days cap", () => {
  const history: MealHistoryEntry[] = [
    { servedAt: "2026-07-28T10:00:00.000Z", ingredientIds: ["rice", "whitefish"], completion: "half", mealType: "meal" },
    { servedAt: "2026-07-30T10:00:00.000Z", ingredientIds: ["rice", "salmon"], completion: "most", mealType: "meal" },
  ];
  assert.equal(countRecentFish(ingredientCatalog, history, new Date("2026-07-31T12:00:00.000Z")), 2);

  const profile: BabyProfile = { ...baseProfile, stage: "middle", ageMonths: 8, mealsPerDay: 3, snacksPerDay: 1, textureMm: 3 };
  const states = ["rice", "beef", "cabbage", "pumpkin", "apple", "whitefish", "salmon"].map(passed);
  const plan = createBookBasedDayPlan(profile, ingredientCatalog, states, history, new Date("2026-07-31T12:00:00.000Z"));
  const fishItems = plan.meals.flatMap((meal) => meal.items).filter((item) => item.ingredient.foodGroup === "fish");
  assert.equal(fishItems.length, 0);
  assert.equal(plan.checks.find((check) => check.id === "fish-cap")?.met, true);
});

test("builds a multi-meal middle-stage plan across all three rule layers", () => {
  const profile: BabyProfile = {
    ...baseProfile,
    stage: "middle",
    ageMonths: 8,
    mealsPerDay: 3,
    snacksPerDay: 1,
    textureMm: 3,
    skills: {
      handlesCurrentTexture: true,
      reachesAndGrasps: true,
      fingerFood: false,
      spoonPractice: false,
      cupPractice: false,
    },
  };
  const states = ["rice", "oatmeal", "beef", "pork", "cabbage", "broccoli", "pumpkin", "zucchini", "apple", "pear"].map(passed);
  const plan = createBookBasedDayPlan(profile, ingredientCatalog, states, [], new Date("2026-07-31T12:00:00.000Z"));

  assert.equal(plan.stage, "middle");
  assert.equal(plan.meals.length, 3);
  assert.equal(plan.snacks.length, 1);
  assert.match(plan.developmentTask, /핑거푸드/);
  assert.equal(plan.checks.find((check) => check.id === "daily-meat")?.met, true);
  assert.equal(plan.checks.find((check) => check.id === "leafy")?.met, true);
  assert.equal(plan.checks.find((check) => check.id === "yellow")?.met, true);
  assert.equal(plan.checks.find((check) => check.id === "texture")?.detail, "5mm 안팎");
  const uniqueNewFoods = new Set(
    plan.meals.flatMap((meal) => meal.items.filter((item) => item.isNewExposure).map((item) => item.ingredient.id)),
  );
  assert.ok(uniqueNewFoods.size <= 1);
});

test("holds texture at the safe minimum while the mouth is painful", () => {
  const profile: BabyProfile = {
    ...baseProfile,
    stage: "late",
    ageMonths: 10,
    mealsPerDay: 3,
    snacksPerDay: 2,
    textureMm: 7,
    temporaryCondition: "mouthPain",
    skills: {
      handlesCurrentTexture: true,
      reachesAndGrasps: true,
      fingerFood: true,
      spoonPractice: true,
      cupPractice: true,
    },
  };
  const states = ["rice", "beef", "cabbage", "pumpkin", "banana"].map(passed);
  const plan = createBookBasedDayPlan(profile, ingredientCatalog, states, [], new Date("2026-07-31T12:00:00.000Z"));
  assert.match(plan.meals[0].textureGuide, /^5mm/);
  assert.match(plan.safetyNotes[0], /입안이 아픈 상태/);
});

test("counts a planned fruit snack toward the daily food-group balance", () => {
  const profile: BabyProfile = { ...baseProfile, stage: "middle", ageMonths: 8, mealsPerDay: 2, snacksPerDay: 1, textureMm: 3 };
  const states = ["rice", "beef", "cabbage", "pumpkin", "apple"].map(passed);
  const plan = createBookBasedDayPlan(profile, ingredientCatalog, states, [], new Date("2026-07-31T12:00:00.000Z"));

  assert.equal(plan.snacks.some((snack) => snack.items.some((item) => item.ingredient.id === "apple")), true);
  assert.equal(plan.checks.find((check) => check.id === "fruit")?.met, true);
});

test("does not exceed the weekly fish cap inside a newly assembled day", () => {
  const profile: BabyProfile = { ...baseProfile, stage: "middle", ageMonths: 8, mealsPerDay: 3, snacksPerDay: 1, textureMm: 3 };
  const states = ["rice", "cabbage", "pumpkin", "apple", "whitefish"].map(passed);
  const history: MealHistoryEntry[] = [
    { servedAt: "2026-07-29T10:00:00.000Z", ingredientIds: ["rice", "whitefish"], completion: "half", mealType: "meal" },
  ];
  const plan = createBookBasedDayPlan(profile, ingredientCatalog, states, history, new Date("2026-07-31T12:00:00.000Z"));
  const fishMeals = plan.meals.filter((meal) => meal.items.some((item) => item.ingredient.foodGroup === "fish"));

  assert.equal(fishMeals.length, 1);
  assert.equal(plan.checks.find((check) => check.id === "fish-cap")?.met, true);
});

test("pauses an active fish trial when the weekly cap is already reached", () => {
  const profile: BabyProfile = { ...baseProfile, stage: "middle", ageMonths: 8, mealsPerDay: 2, snacksPerDay: 1, textureMm: 3 };
  const states: ChildIngredientState[] = [
    passed("rice"),
    { ingredientId: "whitefish", status: "testing", testDay: 3, exposureCount: 2, lastOfferedAt: "2026-07-30T10:00:00.000Z" },
  ];
  const history: MealHistoryEntry[] = [
    { servedAt: "2026-07-29T10:00:00.000Z", ingredientIds: ["rice", "whitefish"], completion: "half", mealType: "meal" },
    { servedAt: "2026-07-30T10:00:00.000Z", ingredientIds: ["rice", "whitefish"], completion: "most", mealType: "meal" },
  ];

  assert.equal(chooseNextIngredient(profile, ingredientCatalog, states, history, new Date("2026-07-31T12:00:00.000Z")), null);
});

test("includes passed custom ingredients in the recommendation engine", () => {
  const customBeef = {
    ...ingredientCatalog.find((ingredient) => ingredient.id === "beef")!,
    id: "custom-family-beef",
    name: "우리집 다짐육",
    introductionPriority: 1000,
  };
  const definitions = ingredientCatalog.filter((ingredient) => ingredient.foodGroup !== "redMeat").concat(customBeef);
  const states = ["rice", "cabbage", "pumpkin", "apple", customBeef.id].map(passed);
  const plan = createBookBasedDayPlan(baseProfile, definitions, states, [], new Date("2026-07-31T12:00:00.000Z"));

  assert.equal(plan.meals[0].items.some((item) => item.ingredient.id === customBeef.id), true);
  assert.equal(plan.checks.find((check) => check.id === "daily-meat")?.met, true);
});

test("keeps acidic fruit out of a mouth-pain plan", () => {
  const profile: BabyProfile = { ...baseProfile, stage: "middle", ageMonths: 8, mealsPerDay: 2, snacksPerDay: 1, textureMm: 3, temporaryCondition: "mouthPain" };
  const states = ["rice", "beef", "cabbage", "pumpkin", "apple", "banana"].map(passed);
  const plan = createBookBasedDayPlan(profile, ingredientCatalog, states, [], new Date("2026-07-31T12:00:00.000Z"));
  const plannedIds = [...plan.meals, ...plan.snacks].flatMap((meal) => meal.items.map((item) => item.ingredient.id));

  assert.equal(plannedIds.includes("apple"), false);
  assert.equal(plannedIds.includes("banana"), true);
});
