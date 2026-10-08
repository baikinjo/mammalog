import assert from "node:assert/strict";
import test from "node:test";
import { ingredientById, ingredientCatalog } from "../lib/ingredient-catalog";
import {
  actualFoodObservation,
  applyEditedTrialOutcome,
  applyRepeatedTrialReaction,
  applyTrialOutcome,
  chooseNextIngredient,
  correctedDaySnapshot,
  countRecentFish,
  createBookBasedDayPlan,
  createInitialMealSuggestion,
  hasStartReadiness,
  inferWeaningStage,
  initialStartAgeDate,
  isActualMeal,
  isHeldMeal,
  mealOptions,
  recordedMealSlot,
  resolveMealTimes,
} from "../lib/recommendation-engine";
import type {
  BabyProfile,
  ChildIngredientState,
  DailyRecommendation,
  IngredientDefinition,
  MealHistoryEntry,
  PlannedMeal,
} from "../lib/domain";
import { stageMenuCatalog } from "../lib/stage-menu-catalog";

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

function testing(ingredientId: string, testDay = 1): ChildIngredientState {
  return {
    ingredientId,
    status: "testing",
    testDay,
    exposureCount: testDay - 1,
    lastOfferedAt: testDay > 1 ? "2026-07-30T10:00:00.000Z" : null,
  };
}

const optionIds = (meal: PlannedMeal) => meal.items.map((item) => item.ingredient.id);
const hasGroup = (meal: PlannedMeal, group: string) => meal.items.some((item) => item.ingredient.foodGroup === group);

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

test("groups every allergen-marked ingredient into one of seven visible allergen groups", () => {
  const allergenIngredients = ingredientCatalog.filter((ingredient) => ingredient.allergen);
  assert.ok(allergenIngredients.length > 7);
  assert.ok(allergenIngredients.every((ingredient) => ingredient.allergenGroup));
  assert.deepEqual(
    [...new Set(allergenIngredients.map((ingredient) => ingredient.allergenGroup))].sort(),
    ["crustacean", "egg", "milk", "peach", "peanut", "soy", "wheat"],
  );
});

test("prioritizes the early wheat allergen after the first five food groups are established", () => {
  const states = ["rice", "beef", "cabbage", "pumpkin", "apple"].map(passed);
  const next = chooseNextIngredient(baseProfile, ingredientCatalog, states, [], new Date("2026-07-31T12:00:00.000Z"));
  assert.equal(next?.id, "wheat");
  assert.equal(next?.allergenGroup, "wheat");
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

test("an edited trial record escalates the introduced ingredient but never clears a reaction", () => {
  const at = (day: number) => new Date(2026, 6, day, 10).toISOString();
  const rice: ChildIngredientState = { ingredientId: "rice", status: "passed", testDay: null, exposureCount: 3, firstOfferedAt: at(1), lastOfferedAt: at(3), lastReaction: null };
  const egg: ChildIngredientState = { ingredientId: "egg", status: "passed", testDay: null, exposureCount: 3, firstOfferedAt: at(10), lastOfferedAt: at(12), lastReaction: null };
  const states = [rice, egg];

  const suspected = applyEditedTrialOutcome(states, "egg", "suspectedReaction", at(11), "입 주변 두드러기");
  assert.deepEqual(suspected.find((state) => state.ingredientId === "egg"), { ...egg, status: "suspectedReaction", lastReaction: "입 주변 두드러기" });

  const testing: ChildIngredientState = { ...egg, status: "testing", testDay: 3, exposureCount: 2 };
  assert.deepEqual(
    applyEditedTrialOutcome([rice, testing], "egg", "textureDifficulty", at(12)).find((state) => state.ingredientId === "egg"),
    { ...testing, status: "paused", testDay: 3 },
  );
  assert.equal(applyEditedTrialOutcome(states, "egg", "tasteRejected", at(10)).find((state) => state.ingredientId === "egg")?.status, "rejected");

  for (const outcome of ["accepted", "tasteRejected", "textureDifficulty", "suspectedReaction"] as const) {
    assert.equal(applyEditedTrialOutcome(suspected, "egg", outcome, at(11)), suspected);
  }
  assert.equal(applyEditedTrialOutcome(states, "rice", "suspectedReaction", at(20)), states);

  const created = applyEditedTrialOutcome(states, "tofu", "suspectedReaction", at(15), " ");
  assert.deepEqual(created.find((state) => state.ingredientId === "tofu"), {
    ingredientId: "tofu",
    status: "suspectedReaction",
    testDay: null,
    exposureCount: 1,
    firstOfferedAt: at(15),
    lastOfferedAt: at(15),
    acceptedTextureMm: [],
    lastReaction: "확인 필요",
  });
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

test("keeps earlier foods while adding only one new ingredient during the initial sequence", () => {
  const day1 = createBookBasedDayPlan(
    baseProfile,
    ingredientCatalog,
    [],
    [],
    new Date("2026-07-01T12:00:00.000Z"),
  );
  assert.deepEqual(day1.meals[0].items.map((item) => item.ingredient.id), ["rice"]);
  assert.deepEqual(day1.meals[0].items.filter((item) => item.isNewExposure).map((item) => item.ingredient.id), ["rice"]);

  const day4 = createBookBasedDayPlan(
    baseProfile,
    ingredientCatalog,
    [passed("rice"), { ingredientId: "beef", status: "testing", testDay: 1, exposureCount: 0, lastOfferedAt: null }],
    [],
    new Date("2026-07-04T12:00:00.000Z"),
  );
  assert.deepEqual(day4.meals[0].items.map((item) => item.ingredient.id), ["rice", "beef"]);
  assert.deepEqual(day4.meals[0].items.filter((item) => item.isNewExposure).map((item) => item.ingredient.id), ["beef"]);

  const day7 = createBookBasedDayPlan(
    baseProfile,
    ingredientCatalog,
    [
      passed("rice"),
      passed("beef"),
      { ingredientId: "cabbage", status: "testing", testDay: 1, exposureCount: 0, lastOfferedAt: null },
    ],
    [],
    new Date("2026-07-07T12:00:00.000Z"),
  );
  assert.deepEqual(day7.meals[0].items.map((item) => item.ingredient.id), ["rice", "beef", "cabbage"]);
  assert.deepEqual(day7.meals[0].items.filter((item) => item.isNewExposure).map((item) => item.ingredient.id), ["cabbage"]);
  assert.match(day7.meals[0].reasons[0], /앞서 통과한 재료는 계속 유지/);
});

test("prestart preview defaults to rice only for the first three-day trial", () => {
  const suggestion = createInitialMealSuggestion(
    { ...baseProfile, stage: "prestart" },
    ingredientCatalog,
    [],
    [],
  );
  assert.deepEqual(suggestion.ingredients.map((ingredient) => ingredient.id), ["rice"]);
  assert.equal(suggestion.title, "쌀죽");
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
  assert.equal(plan.checks.find((check) => check.id === "texture")?.detail, "3mm 안팎");
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

test("replaces an overnight three-meal schedule with a daytime pattern", () => {
  const profile: BabyProfile = { ...baseProfile, stage: "late", ageMonths: 9, mealsPerDay: 3, preferredMealTime: "02:00" };
  assert.deepEqual(resolveMealTimes(profile, 3), ["09:00", "13:00", "17:00"]);
  assert.deepEqual(resolveMealTimes({ ...profile, preferredMealTime: "14:00" }, 3), ["09:00", "13:00", "17:00"]);
});

test("uses three family-defined meal times without forcing four-hour gaps", () => {
  const profile: BabyProfile = {
    ...baseProfile,
    stage: "late",
    ageMonths: 9,
    mealsPerDay: 3,
    preferredMealTime: "08:30",
    mealTimes: ["08:30", "12:15", "17:30"],
  };
  const plan = createBookBasedDayPlan(
    profile,
    ingredientCatalog,
    ["rice", "beef", "cabbage", "pumpkin", "apple"].map(passed),
    [],
    new Date("2026-07-31T12:00:00.000Z"),
  );
  assert.deepEqual(plan.meals.map((meal) => meal.time), profile.mealTimes);
});

test("every stage menu only references ingredients in the app catalog", () => {
  const ingredientIds = new Set(ingredientCatalog.map((ingredient) => ingredient.id));
  const missing = stageMenuCatalog.flatMap((menu) => menu.ingredientIds.filter((id) => !ingredientIds.has(id)));
  assert.deepEqual(missing, []);
  assert.deepEqual(stageMenuCatalog.filter((menu) => new Set(menu.ingredientIds).size !== menu.ingredientIds.length).map((menu) => menu.id), []);
  assert.ok(stageMenuCatalog.filter((menu) => menu.stage === "middle").length >= 15);
  assert.ok(stageMenuCatalog.filter((menu) => menu.stage === "late").length >= 20);
  assert.ok(stageMenuCatalog.filter((menu) => menu.stage === "completion").length >= 25);
});

test("book menus list the allergens their recipes use", () => {
  const menuById = new Map(stageMenuCatalog.map((menu) => [menu.id, menu]));
  const requiredIds: Record<string, string[]> = {
    "completion-soft-tofu-soup": ["egg", "shrimp"],
    "late-egg-zucchini": ["milk"],
    "late-french-toast": ["milk", "butter"],
    "late-tofu-veg-ball": ["wheat"],
    "completion-seaweed-tofu": ["wheat"],
    "completion-cod-pancake": ["wheat"],
    "completion-sujebi": ["egg"],
    "completion-nutrition-rice": ["egg"],
    "completion-veg-omelet": ["milk"],
    "completion-chicken-spinach": ["milk"],
    "completion-beef-cream-soup": ["milk", "butter"],
    "completion-potato-broccoli-sandwich": ["yogurt", "egg"],
    "completion-tofu-tomato": ["yogurt"],
    "late-fruit-yogurt": ["cottage-cheese", "yogurt"],
  };
  for (const [menuId, ids] of Object.entries(requiredIds)) {
    const listed = menuById.get(menuId)?.ingredientIds ?? [];
    assert.deepEqual(ids.filter((id) => !listed.includes(id)), [], `${menuId} must list ${ids.join(", ")}`);
  }
  assert.deepEqual(menuById.get("late-multigrain")?.ingredientIds, ["rice", "brown-rice", "barley", "oatmeal"]);
  assert.equal(menuById.get("middle-pumpkin-potato")?.sourcePage, "책 p.164");
  for (const [menuId, title] of [["completion-fish-tofu-ball", "흰살생선두부밥"], ["completion-tofu-potato", "두부감자밥"]] as const) {
    assert.equal(menuById.get(menuId)?.title, title);
    assert.equal(menuById.get(menuId)?.kind, "ricePlate");
    assert.ok(menuById.get(menuId)?.ingredientIds.includes("rice"));
  }

  const profile: BabyProfile = { ...baseProfile, stage: "completion", ageMonths: 14, mealsPerDay: 3, snacksPerDay: 2, textureMm: 8 };
  const offersSoftTofuStew = (ids: string[]) => createBookBasedDayPlan(profile, ingredientCatalog, ids.map(passed), [], new Date("2026-08-01T12:00:00.000Z"))
    .meals.some((meal) => meal.bookReference === "책 p.275");
  assert.equal(offersSoftTofuStew(["rice", "tofu", "zucchini", "onion"]), false);
  assert.equal(offersSoftTofuStew(["rice", "tofu", "zucchini", "onion", "egg", "shrimp"]), true);
});

test("applies the book's stage and food-group corrections to the ingredient catalog", () => {
  const ingredient = (id: string) => ingredientById.get(id)!;
  for (const [id, stage, age] of [
    ["millet", "middle", 7],
    ["corn", "middle", 7],
    ["mackerel", "late", 9],
    ["bell-pepper", "initial", 6],
    ["blueberry", "initial", 6],
  ] as const) {
    assert.equal(ingredient(id).minimumStage, stage, id);
    assert.equal(ingredient(id).minimumAgeMonths, age, id);
  }
  for (const id of ["zucchini", "broccoli"]) {
    assert.equal(ingredient(id).introductionGroup, "other", id);
    assert.equal(ingredient(id).foodGroup, "otherVegetable", id);
  }
  for (const id of ["sweet-potato", "potato"]) {
    assert.equal(ingredient(id).introductionGroup, "other", id);
    assert.equal(ingredient(id).foodGroup, "starchyFood", id);
  }
  for (const id of ["strawberry", "tomato"]) {
    assert.notEqual(ingredient(id).allergen, true, id);
    assert.match(ingredient(id).bookGuidance ?? "", /알레르기 비슷한 반응/, id);
  }

  const day = new Date("2026-07-31T12:00:00.000Z");
  const avoided = (ingredientId: string): ChildIngredientState => ({ ingredientId, status: "avoid", testDay: null, exposureCount: 0, lastOfferedAt: null });
  assert.equal(chooseNextIngredient(baseProfile, ingredientCatalog, [passed("rice"), passed("beef"), avoided("cabbage"), avoided("bokchoy")], [], day)?.id, "spinach");
  assert.equal(chooseNextIngredient(baseProfile, ingredientCatalog, [passed("rice"), passed("beef"), passed("cabbage"), avoided("pumpkin")], [], day)?.id, "carrot");

  let states: ChildIngredientState[] = [];
  const opened: string[] = [];
  for (let day = 1; day <= 300; day += 1) {
    const date = new Date(Date.UTC(2026, 6, day, 12));
    const next = chooseNextIngredient(baseProfile, ingredientCatalog, states, [], date);
    if (!next) break;
    if (!opened.includes(next.id)) opened.push(next.id);
    states = applyTrialOutcome(states, next.id, "accepted", date.toISOString(), 3);
  }
  for (const id of ["bell-pepper", "blueberry", "zucchini", "broccoli"]) assert.ok(opened.includes(id), `${id} opens in the initial stage`);
  for (const id of ["millet", "corn", "mackerel"]) assert.equal(opened.includes(id), false, `${id} must wait for its book stage`);
});

for (const scenario of [
  { stage: "middle", ageMonths: 8, textureMm: 4, sourcePattern: /책 p\.1[4-7]/ },
  { stage: "late", ageMonths: 10, textureMm: 6, sourcePattern: /책 p\.(18|19|20|21|22)/ },
  { stage: "completion", ageMonths: 14, textureMm: 8, sourcePattern: /책 p\.2[3-7]/ },
] as const) {
  test(`uses book menu templates end-to-end in the ${scenario.stage} stage`, () => {
    const profile: BabyProfile = {
      ...baseProfile,
      stage: scenario.stage,
      ageMonths: scenario.ageMonths,
      mealsPerDay: 3,
      snacksPerDay: scenario.stage === "middle" ? 1 : 2,
      textureMm: scenario.textureMm,
    };
    const states = ingredientCatalog.map((ingredient) => passed(ingredient.id));
    const plan = createBookBasedDayPlan(profile, ingredientCatalog, states, [], new Date("2026-08-01T12:00:00.000Z"));

    assert.equal(plan.meals.length, 3);
    assert.ok(plan.meals.every((meal) => meal.bookReference));
    assert.ok(plan.meals.every((meal) => scenario.sourcePattern.test(meal.bookReference!)));
    assert.ok(plan.meals.every((meal) => meal.preparationSteps.length >= 4));
    assert.ok(plan.meals.every((meal) => meal.items.some((item) => ["grain", "starchyFood"].includes(item.ingredient.foodGroup ?? ""))));
    assert.equal(new Set(plan.meals.map((meal) => meal.title)).size, plan.meals.length);
  });
}

test("adds one new trial to a late-stage menu without dropping the existing dish", () => {
  const profile: BabyProfile = { ...baseProfile, stage: "late", ageMonths: 10, mealsPerDay: 3, snacksPerDay: 2, textureMm: 6 };
  const states = ingredientCatalog
    .filter((ingredient) => ingredient.id !== "kiwi")
    .map((ingredient) => passed(ingredient.id))
    .concat({ ingredientId: "kiwi", status: "testing", testDay: 1, exposureCount: 0, lastOfferedAt: null });
  const plan = createBookBasedDayPlan(profile, ingredientCatalog, states, [], new Date("2026-08-01T12:00:00.000Z"));
  const newItems = plan.meals.flatMap((meal) => meal.items.filter((item) => item.isNewExposure));

  assert.equal(newItems.length, 1);
  assert.equal(newItems[0].ingredient.id, "kiwi");
  assert.match(plan.meals[0].title, /키위 도입/);
  assert.ok(plan.meals[0].items.length > 1);
});

test("initial book menus list every ingredient from their verified recipe pages", () => {
  const expected: Record<string, [string, string[]]> = {
    "initial-rice": ["책 p.70", ["rice"]],
    "initial-rice-oatmeal": ["책 p.72", ["rice", "oatmeal"]],
    "initial-beef": ["책 p.75", ["rice", "beef"]],
    "initial-cabbage-zucchini": ["책 p.79", ["rice", "oatmeal", "cabbage", "zucchini"]],
    "initial-bokchoy-carrot": ["책 p.82", ["rice", "bokchoy", "carrot"]],
    "initial-broccoli-carrot": ["책 p.89", ["rice", "oatmeal", "broccoli", "carrot"]],
    "initial-sweetpotato-cabbage": ["책 p.90", ["rice", "sweet-potato", "cabbage"]],
    "initial-rice-three-veg": ["책 p.70·p.91", ["rice", "cabbage", "bokchoy", "carrot"]],
    "initial-egg-carrot": ["책 p.92~93", ["rice", "carrot", "egg"]],
    "initial-chicken": ["책 p.94", ["rice", "chicken"]],
    "initial-beef-cabbage-pumpkin": ["책 p.100", ["rice", "beef", "cabbage", "pumpkin"]],
    "initial-beef-cabbage": ["책 p.101", ["rice", "beef", "cabbage"]],
    "initial-apple": ["책 p.103", ["rice", "apple"]],
    "initial-wheat-rice": ["책 p.104", ["rice", "wheat"]],
    "initial-spinach": ["책 p.106", ["rice", "spinach"]],
    "initial-cabbage-pumpkin": ["책 p.110", ["rice", "cabbage", "pumpkin"]],
    "initial-pea-pumpkin": ["책 p.123", ["rice", "pumpkin", "green-pea"]],
    "initial-beef-broccoli": ["책 p.124", ["rice", "beef", "broccoli"]],
  };
  const initialMenus = stageMenuCatalog.filter((menu) => menu.stage === "initial");
  assert.deepEqual(initialMenus.map((menu) => menu.id).sort(), Object.keys(expected).sort());
  for (const menu of initialMenus) {
    const [page, ingredientIds] = expected[menu.id];
    assert.equal(menu.sourcePage, page, menu.id);
    assert.deepEqual([...menu.ingredientIds].sort(), [...ingredientIds].sort(), menu.id);
    assert.ok(menu.ingredientIds.every((id) => ingredientById.get(id)?.minimumStage === "initial"), menu.id);
  }
});

test("does not fake variety when only one safe composition exists", () => {
  const date = new Date("2026-07-01T09:00:00.000Z");
  const day1 = createBookBasedDayPlan({ ...baseProfile, mealsPerDay: 2 }, ingredientCatalog, [], [], date, []);
  assert.deepEqual(
    day1.meals.flatMap((meal) => mealOptions(meal).map((option) => [option.index, option.title, option.bookReference, optionIds(option)])),
    [[1, "쌀죽", "책 p.70", ["rice"]], [2, "쌀죽", "책 p.70", ["rice"]]],
    "both meals serve the same rice, each with a single option",
  );
  assert.deepEqual(day1.meals.map((meal) => meal.items.filter((item) => item.isNewExposure).map((item) => item.ingredient.id)), [["rice"], []]);

  const cabbageDay = createBookBasedDayPlan(baseProfile, ingredientCatalog, [passed("rice"), passed("beef"), testing("cabbage")], [], date, []);
  assert.deepEqual(mealOptions(cabbageDay.meals[0]).map((meal) => [meal.title, meal.bookReference]), [["소고기양배추죽", "책 p.101"]]);

  const pumpkinDay = createBookBasedDayPlan(baseProfile, ingredientCatalog, [passed("rice"), passed("beef"), passed("cabbage"), testing("pumpkin")], [], date, []);
  assert.deepEqual(mealOptions(pumpkinDay.meals[0]).map((meal) => [meal.title, meal.bookReference]), [["소고기양배추단호박죽", "책 p.100"]]);
  assert.ok(pumpkinDay.meals[0].preparationSteps.some((step) => step.startsWith("새 재료 단호박: 메뉴에 들어가는 재료라")));
});

test("rotates the default initial menu by what was actually served", () => {
  const states = [
    ...["rice", "oatmeal", "beef", "cabbage", "bokchoy", "pumpkin", "carrot", "zucchini", "broccoli", "apple", "wheat"].map(passed),
    testing("egg", 2),
  ];
  const history: MealHistoryEntry[] = [];
  const served: string[] = [];
  for (let day = 3; day <= 6; day += 1) {
    const date = new Date(2026, 7, day, 9);
    const plan = createBookBasedDayPlan(baseProfile, ingredientCatalog, states, history, date, []);
    const repeated = createBookBasedDayPlan(baseProfile, ingredientCatalog, states, history, date, []);
    assert.deepEqual(mealOptions(repeated.meals[0]).map((meal) => meal.optionId), mealOptions(plan.meals[0]).map((meal) => meal.optionId));
    assert.ok(mealOptions(plan.meals[0]).length >= 2, `day ${day} offers alternatives`);
    const meal = plan.meals[0];
    served.push(optionIds(meal).sort().join("+"));
    history.push({ servedAt: new Date(2026, 7, day, 10).toISOString(), ingredientIds: optionIds(meal), completion: "half", mealType: "meal" });
  }
  assert.notEqual(served[0], served[1]);
  assert.ok(new Set(served).size >= 3, `defaults rotate by composition: ${served.join(" | ")}`);
});

test("every alternative keeps the one current trial, the daily food groups and only familiar foods", () => {
  const familiar = ["rice", "oatmeal", "beef", "pork", "cabbage", "bokchoy", "pumpkin", "carrot", "zucchini", "apple", "wheat", "egg"];
  const plan = createBookBasedDayPlan(
    { ...baseProfile, mealsPerDay: 2 },
    ingredientCatalog,
    [...familiar.map(passed), testing("broccoli", 2)],
    [],
    new Date("2026-08-03T09:00:00.000Z"),
    [],
  );
  assert.equal(plan.currentTrial?.id, "broccoli");
  const [first, second] = plan.meals;
  const firstOptions = mealOptions(first);
  assert.ok(firstOptions.length >= 2);
  const compositions = firstOptions.map((option) => optionIds(option).sort().join("+"));
  assert.equal(new Set(compositions).size, compositions.length, "alternatives are different compositions, not new titles");
  for (const option of firstOptions) {
    assert.deepEqual(option.items.filter((item) => item.isNewExposure).map((item) => item.ingredient.id), ["broccoli"], option.title);
    assert.ok(optionIds(option).every((id) => familiar.includes(id) || id === "broccoli"), option.title);
    for (const group of ["redMeat", "leafyVegetable", "yellowVegetable"]) assert.ok(hasGroup(option, group), `${option.title}: ${group}`);
    assert.ok(optionIds(option).includes("rice") || optionIds(option).includes("oatmeal"), option.title);
    const menu = stageMenuCatalog.find((item) => option.optionId.startsWith(`${item.id}:`));
    if (menu) {
      assert.ok(menu.ingredientIds.every((id) => optionIds(option).includes(id)), `${option.title} keeps every book ingredient`);
      assert.ok(option.title.startsWith(menu.title), option.title);
      assert.equal(option.bookReference, menu.sourcePage);
      if (!menu.ingredientIds.includes("broccoli")) assert.match(option.title, /\+ 브로콜리 도입$/);
    }
  }
  for (const option of mealOptions(second)) {
    assert.ok(option.items.every((item) => !item.isNewExposure), option.title);
    assert.equal(optionIds(option).includes("broccoli"), false, "the trial food stays in its first-meal slot");
  }
});

test("labels a trial food as a separate addition unless the book recipe already contains it", () => {
  const date = new Date("2026-07-14T09:00:00.000Z");
  const fruitTrial = createBookBasedDayPlan(baseProfile, ingredientCatalog, [...["rice", "beef", "cabbage", "pumpkin"].map(passed), testing("apple", 2)], [], date, []);
  assert.equal(fruitTrial.meals[0].title, "소고기양배추단호박죽 + 사과 도입");
  assert.ok(fruitTrial.meals[0].preparationSteps.some((step) => step.startsWith("새 재료 사과: 죽에 섞지 말고")));

  const wheatTrial = createBookBasedDayPlan(baseProfile, ingredientCatalog, ["rice", "beef", "cabbage", "pumpkin", "apple"].map(passed), [], date, []);
  assert.equal(wheatTrial.currentTrial?.id, "wheat");
  for (const option of mealOptions(wheatTrial.meals[0])) {
    assert.ok(optionIds(option).includes("rice"), option.title);
    if (!option.optionId.startsWith("initial-wheat-rice:")) {
      assert.match(option.title, /\+ 밀 도입$/);
      assert.ok(option.preparationSteps.some((step) => step.startsWith("새 재료 밀: 익숙한 죽을 끓일 때 소량만 섞어")), option.title);
    }
  }

  const peanutTrial = createBookBasedDayPlan(baseProfile, ingredientCatalog, [...["rice", "beef", "cabbage", "pumpkin", "apple"].map(passed), testing("peanut-butter", 2)], [], date, []);
  for (const option of mealOptions(peanutTrial.meals[0])) {
    assert.ok(option.preparationSteps.includes("재료별 안전: 뜨거운 물에 충분히 풀기"), `${option.title} keeps the trial's own safety step`);
    assert.ok(option.preparationSteps.includes("재료별 안전: 100% 제품"), option.title);
  }
});

test("never makes wheat the only grain of a meal", () => {
  for (const [stage, ageMonths] of [["initial", 6], ["completion", 14]] as const) {
    const familiar = stage === "initial"
      ? ["wheat", "rice", "beef", "cabbage", "pumpkin", "apple", "egg"]
      : ingredientCatalog.map((ingredient) => ingredient.id);
    for (let day = 1; day <= 21; day += 1) {
      const plan = createBookBasedDayPlan(
        { ...baseProfile, stage, ageMonths, mealsPerDay: 3, snacksPerDay: 0 },
        ingredientCatalog,
        familiar.map(passed),
        [],
        new Date(2026, 7, day, 9),
        [],
      );
      for (const option of plan.meals.flatMap(mealOptions)) {
        if (!optionIds(option).includes("wheat")) continue;
        assert.ok(
          option.items.some((item) => ["grain", "starchyFood"].includes(item.ingredient.foodGroup ?? "") && item.ingredient.id !== "wheat"),
          `${stage} day ${day}: ${option.title}`,
        );
      }
    }
  }
});

test("every option respects reaction, stage and temporary-condition blocks", () => {
  const states: ChildIngredientState[] = [
    ...["rice", "oatmeal", "beef", "cabbage", "bokchoy", "pumpkin", "carrot", "sweet-potato", "apple", "millet", "corn"].map(passed),
    { ingredientId: "broccoli", status: "suspectedReaction", testDay: null, exposureCount: 1, lastOfferedAt: "2026-07-30T10:00:00.000Z", lastReaction: "두드러기" },
    { ingredientId: "zucchini", status: "avoid", testDay: null, exposureCount: 0, lastOfferedAt: null },
  ];
  for (const condition of ["none", "diarrhea", "mouthPain"] as const) {
    const plan = createBookBasedDayPlan(
      { ...baseProfile, mealsPerDay: 2, temporaryCondition: condition },
      ingredientCatalog,
      states,
      [],
      new Date("2026-08-03T09:00:00.000Z"),
      [],
    );
    const offered = new Set(plan.meals.flatMap(mealOptions).flatMap(optionIds));
    for (const blocked of ["broccoli", "zucchini", "millet", "corn"]) assert.equal(offered.has(blocked), false, `${condition}: ${blocked}`);
    if (condition === "diarrhea") assert.equal(offered.has("apple") || offered.has("sweet-potato"), false);
    if (condition === "mouthPain") assert.equal(offered.has("apple"), false);
    for (const { ingredient } of plan.nextAdditions) {
      assert.equal(["broccoli", "zucchini"].includes(ingredient.id), false, `${condition}: next ${ingredient.id}`);
      assert.equal(ingredient.minimumStage, "initial", ingredient.id);
      if (condition === "mouthPain") assert.equal(ingredient.tags?.includes("acidic") ?? false, false, ingredient.id);
      if (condition === "diarrhea") assert.ok(!ingredient.tags?.includes("sweet") && ingredient.foodGroup !== "fat", ingredient.id);
    }
  }
});

test("plans the rest of the day around recorded meals for fish and daily red meat", () => {
  const profile: BabyProfile = { ...baseProfile, stage: "middle", ageMonths: 8, mealsPerDay: 3, snacksPerDay: 0, textureMm: 3 };
  const states = ["rice", "oatmeal", "beef", "pork", "chicken", "cabbage", "bokchoy", "pumpkin", "carrot", "potato", "onion", "whitefish", "tofu", "zucchini"].map(passed);
  const now = new Date(2026, 7, 3, 9);
  const eveningFish = { ingredientIds: ["rice", "whitefish", "cabbage"], newExposureIngredientId: null };
  const history: MealHistoryEntry[] = [
    { servedAt: new Date(2026, 7, 1, 10).toISOString(), ingredientIds: ["rice", "whitefish"], completion: "half", mealType: "meal" },
    // Recorded ahead of its evening time, so the rolling count before now does not include it yet.
    { servedAt: new Date(2026, 7, 3, 18).toISOString(), ingredientIds: eveningFish.ingredientIds, completion: "half", mealType: "meal" },
  ];
  assert.equal(countRecentFish(ingredientCatalog, history, now), 1);

  const plan = createBookBasedDayPlan(profile, ingredientCatalog, states, history, now, [{ index: 3, ...eveningFish }]);
  assert.equal(plan.meals.find((meal) => meal.index === 3)?.optionId, "recorded:3");
  for (const meal of plan.meals.filter((item) => item.index !== 3)) {
    for (const option of mealOptions(meal)) assert.equal(hasGroup(option, "fish"), false, `meal ${meal.index}: ${option.title}`);
  }
  assert.equal(plan.checks.find((check) => check.id === "fish-cap")?.detail, "최근 7일 2/2회");

  const afterMeatlessBreakfast = createBookBasedDayPlan(profile, ingredientCatalog, states, [], now, [
    { index: 1, ingredientIds: ["rice", "chicken", "cabbage"], newExposureIngredientId: null },
  ]);
  const secondMeal = afterMeatlessBreakfast.meals.find((meal) => meal.index === 2)!;
  for (const option of mealOptions(secondMeal)) assert.ok(hasGroup(option, "redMeat"), option.title);
  assert.ok(afterMeatlessBreakfast.meals.flatMap(mealOptions).every((option) => option.optionId === "recorded:1" || option.items.every((item) => !item.isNewExposure)));
});

test("suggests next additions only after the current observation and in introduction order", () => {
  const date = new Date("2026-07-08T09:00:00.000Z");
  const states = [passed("rice"), passed("beef"), testing("cabbage", 2)];
  const plan = createBookBasedDayPlan(baseProfile, ingredientCatalog, states, [], date, []);
  assert.equal(plan.currentTrial?.id, "cabbage");
  assert.equal(plan.nextAdditions[0]?.ingredient.id, "pumpkin");
  assert.ok(plan.nextAdditions.every((addition) => addition.ingredient.introductionGroup === "yellow"));
  assert.deepEqual(plan.nextAdditions[0].unlocks.map((menu) => [menu.title, menu.sourcePage]), [["소고기양배추단호박죽", "책 p.100"], ["양배추단호박죽", "책 p.110"]]);
  const selectableMenus = new Set(plan.meals.flatMap(mealOptions).map((option) => option.optionId.split(":")[0]));
  for (const addition of plan.nextAdditions) {
    for (const menu of addition.unlocks) {
      assert.ok(menu.ingredientIds.includes(addition.ingredient.id), menu.title);
      assert.equal(selectableMenus.has(menu.menuId), false, `${menu.title} needs ${addition.ingredient.name} first`);
    }
  }

  const avoided = createBookBasedDayPlan(baseProfile, ingredientCatalog, [...states, { ingredientId: "pumpkin", status: "avoid", testDay: null, exposureCount: 0, lastOfferedAt: null }], [], date, []);
  assert.ok(avoided.nextAdditions.length > 0);
  assert.ok(avoided.nextAdditions.every((addition) => addition.ingredient.id !== "pumpkin" && addition.ingredient.introductionGroup === "yellow"));

  // With every yellow vegetable blocked the engine moves on, and the first suggestion follows it.
  const yellowAvoided = ["pumpkin", "carrot", "beet", "bell-pepper"].map((ingredientId): ChildIngredientState => (
    { ingredientId, status: "avoid", testDay: null, exposureCount: 0, lastOfferedAt: null }
  ));
  const groupBlocked = createBookBasedDayPlan(baseProfile, ingredientCatalog, [...states, ...yellowAvoided], [], date, []);
  const afterCabbage = chooseNextIngredient(baseProfile, ingredientCatalog, [passed("rice"), passed("beef"), passed("cabbage"), ...yellowAvoided], [], date);
  assert.ok(afterCabbage);
  assert.equal(groupBlocked.nextAdditions[0]?.ingredient.id, afterCabbage.id);
  assert.ok(groupBlocked.nextAdditions.every((addition) => addition.ingredient.introductionGroup !== "yellow"));

  const hold = createBookBasedDayPlan(baseProfile, ingredientCatalog, states, [
    { servedAt: "2026-07-07T10:00:00.000Z", ingredientIds: ["rice", "beef", "cabbage"], completion: "taste", mealType: "meal", reaction: "needsReview" },
  ], date, []);
  assert.equal(hold.currentTrial, null);
  assert.deepEqual(hold.nextAdditions, []);
});

test("keeps the configured meal count on the first rice days by repeating the same rice", () => {
  for (const mealsPerDay of [2, 3]) {
    const profile: BabyProfile = { ...baseProfile, mealsPerDay };
    const plan = createBookBasedDayPlan(profile, ingredientCatalog, [testing("rice", 2)], [], new Date(2026, 6, 2, 8), []);
    assert.equal(plan.meals.length, mealsPerDay);
    assert.deepEqual(plan.meals.map(optionIds), Array.from({ length: mealsPerDay }, () => ["rice"]));
    assert.deepEqual(
      plan.meals.map((meal) => meal.items.some((item) => item.isNewExposure)),
      [true, ...Array<boolean>(mealsPerDay - 1).fill(false)],
      "only the first meal is the trial record",
    );
    for (const meal of plan.meals.slice(1)) {
      assert.equal(mealOptions(meal).length, 1);
      assert.equal(meal.bookReference, "책 p.70");
      assert.match(meal.reasons[0], /관찰 중인 재료\(쌀\)를 한 번 더 주는 끼니예요/);
    }
    assert.equal(plan.checks.find((check) => check.id === "new-food")?.detail, "1개 관찰 중");

    // Once the trial meal is recorded, a refreshed plan still repeats rice in the other meals without counting it.
    const afterTrial = createBookBasedDayPlan(
      profile,
      ingredientCatalog,
      [{ ...testing("rice", 3), lastOfferedAt: new Date(2026, 6, 2, 8).toISOString() }],
      [{ servedAt: new Date(2026, 6, 2, 8).toISOString(), ingredientIds: ["rice"], completion: "half", mealType: "meal", reaction: "none" }],
      new Date(2026, 6, 2, 9),
      [{ index: 1, ingredientIds: ["rice"], newExposureIngredientId: "rice", reaction: "none", title: "쌀죽", time: "08:00" }],
    );
    assert.equal(afterTrial.meals.length, mealsPerDay);
    assert.equal(afterTrial.meals[0].optionId, "recorded:1");
    for (const meal of afterTrial.meals.slice(1)) {
      assert.deepEqual(meal.items.map((item) => [item.ingredient.id, item.isNewExposure]), [["rice", false]]);
    }
  }
});

test("holds the extra rice meals instead of repeating a blocked rice or another new food", () => {
  const profile: BabyProfile = { ...baseProfile, mealsPerDay: 2 };

  // A reaction under review on the first rice days leaves nothing safe to serve, so both meals explain the hold.
  const review = createBookBasedDayPlan(profile, ingredientCatalog, [testing("rice", 2)], [
    { servedAt: new Date(2026, 6, 2, 10).toISOString(), ingredientIds: ["rice"], completion: "taste", mealType: "meal", reaction: "needsReview" },
  ], new Date(2026, 6, 3, 12), []);
  assert.equal(review.currentTrial, null);
  assert.deepEqual(review.meals.map((meal) => [isHeldMeal(meal), meal.items.length]), [[true, 0], [true, 0]]);
  assert.match(review.meals[0].reasons[0], /확인이 필요한 반응/);
  assert.deepEqual(review.nextAdditions, []);

  // With rice blocked the engine's next grain is a trial in meal 1 only; the other meal does not repeat it.
  const suspectedRice: ChildIngredientState = { ingredientId: "rice", status: "suspectedReaction", testDay: null, exposureCount: 2, lastOfferedAt: "2026-07-02T01:00:00.000Z", lastReaction: "두드러기" };
  const blocked = createBookBasedDayPlan(profile, ingredientCatalog, [suspectedRice], [], new Date(2026, 6, 3, 12), []);
  assert.equal(blocked.currentTrial?.id, "oatmeal");
  assert.deepEqual(blocked.meals[0].items.map((item) => [item.ingredient.id, item.isNewExposure]), [["oatmeal", true]]);
  assert.equal(isHeldMeal(blocked.meals[1]), true);
  assert.match(blocked.meals[1].reasons[0], /첫 끼에서만 관찰/);
  assert.equal(blocked.meals.some((meal) => optionIds(meal).includes("rice")), false);

  // An adverse reaction recorded today on a repeated rice meal holds the rest of the day, even before its planned time.
  const sameDay = createBookBasedDayPlan(profile, ingredientCatalog, [suspectedRice], [], new Date(2026, 6, 3, 8), [
    { index: 2, ingredientIds: ["rice"], newExposureIngredientId: null, reaction: "needsReview", title: "쌀죽", time: "14:00" },
  ]);
  assert.equal(sameDay.currentTrial, null);
  assert.equal(isHeldMeal(sameDay.meals[0]), true);
  assert.equal(sameDay.meals.some((meal) => meal.items.some((item) => item.isNewExposure)), false);
  assert.deepEqual(sameDay.nextAdditions, []);
});

test("a reaction on a repeated rice meal restricts rice without counting an exposure or a day", () => {
  const rice: ChildIngredientState = {
    ingredientId: "rice",
    status: "testing",
    testDay: 3,
    exposureCount: 2,
    firstOfferedAt: "2026-07-01T01:00:00.000Z",
    lastOfferedAt: "2026-07-02T01:00:00.000Z",
    acceptedTextureMm: [],
    lastReaction: null,
  };
  const states = [rice];
  for (const outcome of ["accepted", "tasteRejected"] as const) assert.equal(applyRepeatedTrialReaction(states, "rice", outcome), states);
  assert.deepEqual(applyRepeatedTrialReaction(states, "rice", "textureDifficulty")[0], { ...rice, status: "paused" });
  const suspected = applyRepeatedTrialReaction(states, "rice", "suspectedReaction", " 입 주변 발진 ");
  assert.deepEqual(suspected[0], { ...rice, status: "suspectedReaction", testDay: null, lastReaction: "입 주변 발진" });
  assert.equal(applyRepeatedTrialReaction(suspected, "rice", "textureDifficulty"), suspected, "never relaxes a suspected reaction");
  // A repeat recorded before the day's trial meal still records the reaction, with no exposure counted.
  assert.deepEqual(applyRepeatedTrialReaction([], "rice", "suspectedReaction")[0], {
    ingredientId: "rice",
    status: "suspectedReaction",
    testDay: null,
    exposureCount: 0,
    firstOfferedAt: null,
    lastOfferedAt: null,
    acceptedTextureMm: [],
    lastReaction: "확인 필요",
  });
});

test("shows recorded meals as they were stored instead of regenerating a recipe", () => {
  const profile: BabyProfile = { ...baseProfile, stage: "middle", ageMonths: 8, mealsPerDay: 2, textureMm: 4, mealTimes: ["08:30", "12:30"] };
  const states = ["rice", "oatmeal", "beef", "cabbage", "pumpkin", "chicken"].map(passed);
  const stored = {
    index: 1,
    ingredientIds: ["oatmeal", "chicken"],
    newExposureIngredientId: null,
    reaction: "none" as const,
    title: "오트밀죽과 닭고기 반찬",
    time: "07:50",
    textureMm: 3,
    servingGuide: "70~120g 범위에서 아이가 먹는 만큼",
    textureGuide: "3mm 안팎",
    servingMode: "죽과 반찬을 분리 제공",
    reasons: ["책 p.144~145의 단계별 메뉴를 먹어본 재료와 최근 반복에 맞춰 골랐어요."],
  };
  const recorded = createBookBasedDayPlan(profile, ingredientCatalog, states, [], new Date(2026, 7, 3, 9), [stored]).meals[0];
  assert.equal(recorded.optionId, "recorded:1");
  assert.deepEqual(
    [recorded.title, recorded.time, recorded.textureMm, recorded.servingGuide, recorded.textureGuide, recorded.servingMode, recorded.reasons],
    [stored.title, stored.time, stored.textureMm, stored.servingGuide, stored.textureGuide, stored.servingMode, stored.reasons],
  );
  assert.deepEqual(optionIds(recorded), ["oatmeal", "chicken"]);
  assert.deepEqual([recorded.preparationSteps, recorded.storageGuide, recorded.bookReference, recorded.alternatives], [[], "", undefined, undefined]);

  // An older record that never stored these fields keeps them empty rather than borrowing today's settings.
  const legacy = createBookBasedDayPlan(profile, ingredientCatalog, states, [], new Date(2026, 7, 3, 9), [
    { index: 1, ingredientIds: ["rice", "beef"], title: "소고기죽", time: "08:30", textureMm: null, servingGuide: null, textureGuide: null, servingMode: null, reasons: [] },
  ]).meals[0];
  assert.deepEqual([legacy.textureMm, legacy.servingGuide, legacy.textureGuide, legacy.servingMode, legacy.preparationSteps], [undefined, "", "", "", []]);
});

test("keeps whole grains as meal bases in later stages while flour never stands alone", () => {
  const profile: BabyProfile = { ...baseProfile, stage: "middle", ageMonths: 8, mealsPerDay: 2, textureMm: 4 };
  const history: MealHistoryEntry[] = [
    { servedAt: new Date(2026, 7, 2, 10).toISOString(), ingredientIds: ["rice", "chicken"], completion: "half", mealType: "meal" },
  ];
  const plan = createBookBasedDayPlan(profile, ingredientCatalog, ["rice", "barley", "chicken", "broccoli", "tomato"].map(passed), history, new Date(2026, 7, 3, 9), []);
  assert.ok(
    plan.meals.flatMap(mealOptions).some((option) => optionIds(option).includes("barley") && !optionIds(option).includes("rice")),
    "barley, eaten less recently than rice, can carry a meal on its own",
  );
});

test("the day checks follow the chosen menu and count each meal of the day once", () => {
  const now = new Date(2026, 7, 4, 12);
  const breakfast = ["rice", "beef", "cabbage", "pumpkin"];
  const recordedBreakfast = { index: 1, ingredientIds: breakfast, newExposureIngredientId: null };
  const morning: MealHistoryEntry = { servedAt: new Date(2026, 7, 4, 8).toISOString(), ingredientIds: breakfast, completion: "half", mealType: "meal" };
  const check = (plan: DailyRecommendation, id: string) => plan.checks.find((item) => item.id === id);

  // Initial stage, breakfast recorded: 사과죽 brings the day's fruit for meal 2, the other menus do not.
  const initialDay = (choice?: PlannedMeal) => createBookBasedDayPlan(
    { ...baseProfile, mealsPerDay: 2 },
    ingredientCatalog,
    [...breakfast, "apple", "wheat"].map(passed),
    [morning],
    now,
    [recordedBreakfast],
    choice ? { mealIndex: 2, optionId: choice.optionId } : null,
  );
  const initialOptions = mealOptions(initialDay().meals[1]);
  const withFruit = initialOptions.find((option) => hasGroup(option, "fruit"));
  const withoutFruit = initialOptions.find((option) => !hasGroup(option, "fruit"));
  assert.ok(withFruit && withoutFruit, initialOptions.map((option) => option.title).join(" / "));
  assert.equal(check(initialDay(), "fruit")?.met, hasGroup(initialOptions[0], "fruit"), "without a choice the default is counted");
  assert.equal(check(initialDay(withFruit), "fruit")?.met, true, withFruit.title);
  assert.equal(check(initialDay(withoutFruit), "fruit")?.met, false, withoutFruit.title);
  assert.deepEqual(initialDay(withFruit).meals, initialDay().meals, "a choice changes the checks, not the menus");
  const stale = createBookBasedDayPlan({ ...baseProfile, mealsPerDay: 2 }, ingredientCatalog, [...breakfast, "apple", "wheat"].map(passed), [morning], now, [recordedBreakfast], { mealIndex: 2, optionId: "initial-apple:not-offered" });
  assert.deepEqual(stale.checks, initialDay().checks, "a menu that is no longer offered is not counted");

  // Middle stage with one fish meal earlier this week: the chosen menu decides the weekly fish count.
  const fishProfile: BabyProfile = { ...baseProfile, stage: "middle", ageMonths: 8, mealsPerDay: 2, snacksPerDay: 1, textureMm: 3 };
  const fishStates = [...breakfast, "oatmeal", "carrot", "apple", "whitefish", "egg", "tofu", "potato", "onion"].map(passed);
  const earlierFish: MealHistoryEntry = { servedAt: new Date(2026, 7, 1, 10).toISOString(), ingredientIds: ["rice", "whitefish"], completion: "half", mealType: "meal" };
  const fishDay = (choice?: PlannedMeal) => createBookBasedDayPlan(
    fishProfile,
    ingredientCatalog,
    fishStates,
    [earlierFish, morning],
    now,
    [recordedBreakfast],
    choice ? { mealIndex: 2, optionId: choice.optionId } : null,
  );
  const fishOptions = mealOptions(fishDay().meals[1]);
  const fishMenu = fishOptions.find((option) => hasGroup(option, "fish"));
  const otherMenu = fishOptions.find((option) => !hasGroup(option, "fish"));
  assert.ok(fishMenu && otherMenu, fishOptions.map((option) => option.title).join(" / "));
  assert.equal(check(fishDay(fishMenu), "fish-cap")?.detail, "최근 7일 2/2회", fishMenu.title);
  assert.equal(check(fishDay(otherMenu), "fish-cap")?.detail, "최근 7일 1/2회", otherMenu.title);

  // Once that fish meal is recorded (and in today's history), it is still counted once, through its slot.
  const fishLunch: MealHistoryEntry = { servedAt: new Date(2026, 7, 4, 11).toISOString(), ingredientIds: optionIds(fishMenu), completion: "half", mealType: "meal" };
  const afterLunch = createBookBasedDayPlan(fishProfile, ingredientCatalog, fishStates, [earlierFish, morning, fishLunch], now, [
    recordedBreakfast,
    { index: 2, ingredientIds: optionIds(fishMenu), newExposureIngredientId: null },
  ]);
  assert.deepEqual(check(afterLunch, "fish-cap"), check(fishDay(fishMenu), "fish-cap"));
});

test("records the rice actually given before six months once the family confirmed the start", () => {
  // Book menus start at six months; this child is five months old by the planner's rule and started today.
  const day = (offset: number, hour = 12) => new Date(2026, 2, 10 + offset, hour);
  const underSix: BabyProfile = { ...baseProfile, ageMonths: 5, mealsPerDay: 2, weaningStartDate: "2026-03-10" };
  const firstDay = createBookBasedDayPlan(underSix, ingredientCatalog, [], [], day(0), []);
  assert.deepEqual([firstDay.stage, firstDay.currentTrial?.id, firstDay.trialDay], ["initial", "rice", 1]);
  assert.ok(firstDay.meals.every((meal) => isActualMeal(meal) && !isHeldMeal(meal)), "no age-only hold after the real start");
  assert.deepEqual(
    firstDay.meals.map((meal) => meal.items.map((item) => [item.ingredient.id, item.isNewExposure])),
    [[["rice", true]], [["rice", false]]],
    "the first meal records the rice observation and the second meal the same rice again",
  );
  for (const meal of firstDay.meals) {
    assert.deepEqual(mealOptions(meal), [meal], "nothing else to choose");
    assert.deepEqual(
      [meal.title, meal.servingGuide, meal.textureGuide, meal.textureMm, meal.servingMode, meal.preparationSteps, meal.storageGuide, meal.bookReference],
      ["쌀죽", "", "", undefined, "", [], "", undefined],
      "no book menu, serving, texture or cooking guidance",
    );
    assert.match(meal.reasons[0], /^만 6개월 전이라 책 추천 메뉴와 제공량·질감·조리 안내는 보여주지 않아요/);
    assert.match(meal.reasons[1], /실제로 먹인 쌀죽을 기록하는 칸이에요. 먹이라거나 건너뛰라는 안내가 아니/);
  }
  assert.match(firstDay.meals[0].reasons[2], /쌀 관찰 1\/3일째/);
  assert.match(firstDay.meals[1].reasons[2], /새 재료로 세지 않고 관찰 일수도 늘지 않아요/);
  assert.deepEqual(firstDay.nextAdditions, []);
  const noBookClaims = (plan: DailyRecommendation) => [plan.recordOnly, plan.checks, plan.safetyNotes, plan.developmentTask, plan.summaryReasons];
  assert.deepEqual(noBookClaims(firstDay), [true, [], [], "", []], "no book check, texture, development or progression claim");

  // Recording the first meal advances the observation once; the second rice meal that day only repeats it.
  let states = applyTrialOutcome([], "rice", "accepted", day(0, 9).toISOString(), 3);
  assert.deepEqual([states[0].status, states[0].testDay, states[0].exposureCount], ["testing", 2, 1]);
  const history: MealHistoryEntry[] = [{ servedAt: day(0, 9).toISOString(), ingredientIds: ["rice"], completion: "half", mealType: "meal", reaction: "none" }];
  const afterFirst = createBookBasedDayPlan(underSix, ingredientCatalog, states, history, day(0, 12), [
    { index: 1, ingredientIds: ["rice"], newExposureIngredientId: "rice", reaction: "none", title: "쌀죽", time: "09:00", textureMm: null, reasons: firstDay.meals[0].reasons },
  ]);
  assert.deepEqual(afterFirst.meals.map((meal) => meal.optionId), ["recorded:1", "actual:2"]);
  assert.deepEqual(afterFirst.meals[1].items.map((item) => [item.ingredient.id, item.isNewExposure]), [["rice", false]]);
  assert.equal(applyRepeatedTrialReaction(states, "rice", "accepted"), states, "a repeat never counts another day");
  const allRecorded = createBookBasedDayPlan(underSix, ingredientCatalog, states, history, day(0, 18), [
    { index: 1, ingredientIds: ["rice"], newExposureIngredientId: "rice", reaction: "none", title: "쌀죽", time: "09:00", textureMm: null },
    { index: 2, ingredientIds: ["rice"], newExposureIngredientId: null, reaction: "none", title: "쌀죽", time: "13:00", textureMm: null },
  ]);
  assert.deepEqual(allRecorded.meals.map((meal) => [meal.optionId, meal.textureMm]), [["recorded:1", undefined], ["recorded:2", undefined]]);
  assert.deepEqual(noBookClaims(allRecorded), [true, [], [], "", []], "the recorded day claims no book check or texture either");

  // Day 2 continues from that record, and day 3 at six months continues it as the book's own rice menu.
  const secondDay = createBookBasedDayPlan(underSix, ingredientCatalog, states, history, day(1), []);
  assert.deepEqual([isActualMeal(secondDay.meals[0]), secondDay.trialDay, secondDay.meals[0].items[0].isNewExposure], [true, 2, true]);
  assert.match(secondDay.meals[0].reasons[2], /쌀 관찰 2\/3일째/);
  states = applyTrialOutcome(states, "rice", "accepted", day(1, 9).toISOString(), 3);
  history.push({ servedAt: day(1, 9).toISOString(), ingredientIds: ["rice"], completion: "half", mealType: "meal", reaction: "none" });
  const sixMonths = createBookBasedDayPlan({ ...underSix, ageMonths: 6 }, ingredientCatalog, states, history, day(2), []);
  assert.deepEqual([sixMonths.currentTrial?.id, sixMonths.trialDay, sixMonths.meals.some(isActualMeal)], ["rice", 3, false]);
  assert.deepEqual([sixMonths.meals[0].title, sixMonths.meals[0].bookReference], ["쌀죽", "책 p.70"]);
  assert.ok(sixMonths.meals[0].servingGuide && sixMonths.meals[0].preparationSteps.length, "book guidance starts at six months");
  assert.equal(sixMonths.recordOnly, false);
  assert.equal(sixMonths.checks.find((check) => check.id === "texture")?.met, true, "book checks return at six months");
  assert.ok(sixMonths.developmentTask && sixMonths.safetyNotes.length && sixMonths.summaryReasons.length);

  // Rice that passed while the child is still younger stays recordable as a familiar food, never as a new one.
  const passedRice = createBookBasedDayPlan(underSix, ingredientCatalog, [passed("rice")], [], day(3), []);
  assert.equal(passedRice.currentTrial, null);
  assert.ok(passedRice.meals.every((meal) => isActualMeal(meal) && optionIds(meal).join() === "rice" && !meal.items[0].isNewExposure));
  assert.match(passedRice.meals[0].reasons[2], /통과한 쌀을 먹였을 때 기록해요/);

  // A corrected age below six months is named as such.
  const corrected = createBookBasedDayPlan({ ...underSix, ageMonths: 7, correctedAgeMonths: 5 }, ingredientCatalog, [], [], day(0), []);
  assert.match(corrected.meals[0].reasons[0], /^교정 연령으로 만 6개월 전이라/);
});

test("before six months only rice can be recorded and every other hold and food limit stays", () => {
  const day = new Date(2026, 2, 10, 12);
  const underSix: BabyProfile = { ...baseProfile, ageMonths: 5, mealsPerDay: 2, weaningStartDate: "2026-03-10" };
  const kinds = (plan: DailyRecommendation) => plan.meals.map((meal) => meal.optionId.split(":")[0]);

  // Without a confirmed start on or before the day (no date, a later date, or not started) nothing opens.
  for (const profile of [{ ...underSix, weaningStartDate: null }, { ...underSix, weaningStartDate: "2026-03-11" }, { ...underSix, stage: "prestart" as const }]) {
    const plan = createBookBasedDayPlan(profile, ingredientCatalog, [], [], day, []);
    assert.deepEqual([...kinds(plan), plan.recordOnly], ["hold", "hold", false], String(profile.weaningStartDate ?? profile.stage));
  }

  // A recorded reaction or texture difficulty is a genuine hold, not an age note, and stays on the meal card even
  // though the day carries no book checks.
  const review: MealHistoryEntry = { servedAt: new Date(2026, 2, 10, 9).toISOString(), ingredientIds: ["rice"], completion: "taste", mealType: "meal", reaction: "needsReview" };
  const reviewPlan = createBookBasedDayPlan(underSix, ingredientCatalog, [testing("rice", 2)], [review], day, []);
  assert.deepEqual([...kinds(reviewPlan), reviewPlan.recordOnly, reviewPlan.checks], ["hold", "hold", true, []]);
  assert.match(reviewPlan.meals[0].reasons[0], /^확인이 필요한 반응이나 질감 어려움이 기록돼/);
  const sameDay = createBookBasedDayPlan(underSix, ingredientCatalog, [testing("rice", 2)], [], day, [
    { index: 1, ingredientIds: ["rice"], newExposureIngredientId: "rice", reaction: "textureDifficulty" },
  ]);
  assert.deepEqual(kinds(sameDay), ["recorded", "hold"]);

  // A restricted rice, or another food already under observation, stays a hold too.
  const restricted: ChildIngredientState[][] = [
    [{ ingredientId: "rice", status: "suspectedReaction", testDay: null, exposureCount: 1, lastOfferedAt: null, lastReaction: "두드러기" }],
    [{ ingredientId: "rice", status: "avoid", testDay: null, exposureCount: 0, lastOfferedAt: null }],
    [{ ingredientId: "rice", status: "paused", testDay: 2, exposureCount: 1, lastOfferedAt: null }],
    [testing("carrot", 1)],
  ];
  for (const states of restricted) {
    assert.deepEqual(kinds(createBookBasedDayPlan(underSix, ingredientCatalog, states, [], day, [])), ["hold", "hold"], `${states[0].ingredientId}:${states[0].status}`);
  }

  // Foods with their own six-month caution and later foods stay out even when marked passed by hand.
  const handMarked = ["carrot", "spinach", "napa-cabbage", "beet", "millet", "corn", "milk", "oatmeal", "beef"].map(passed);
  const plan = createBookBasedDayPlan(underSix, ingredientCatalog, [...handMarked, testing("rice", 2)], [], day, []);
  assert.deepEqual([...new Set(plan.meals.flatMap(mealOptions).flatMap(optionIds))], ["rice"]);
  assert.deepEqual(plan.nextAdditions, []);
  assert.equal(chooseNextIngredient(underSix, ingredientCatalog, [], [], day), null, "the planner itself still introduces nothing before six months");

  // The record-only day follows the real age, not the catalog: a family food with a lower minimum age that is blocked by
  // its own state keeps the actual rice day free of book claims, and later foods alone never make six months record-only.
  const earlyCustom: IngredientDefinition = { ...ingredientById.get("oatmeal")!, id: "custom-early-grain", name: "우리집 미음", minimumAgeMonths: 4, introductionPriority: 70 };
  const withCustom = createBookBasedDayPlan(underSix, [...ingredientCatalog, earlyCustom], [{ ingredientId: earlyCustom.id, status: "avoid", testDay: null, exposureCount: 0, lastOfferedAt: null }], [], day, []);
  assert.deepEqual([...kinds(withCustom), withCustom.recordOnly, withCustom.checks, withCustom.summaryReasons], ["actual", "actual", true, [], []]);
  const laterFoodsOnly = ingredientCatalog.filter((item) => (item.minimumAgeMonths ?? 6) > 6);
  assert.equal(createBookBasedDayPlan({ ...underSix, ageMonths: 6 }, laterFoodsOnly, [], [], day, []).recordOnly, false);
});

// A fictitious child born 2026-05-20: six calendar months on 2026-11-20, so the early-start window is 2026-11-13..20.
const graceChild: BabyProfile = { ...baseProfile, ageMonths: 5, birthDate: "2026-05-20", mealsPerDay: 2, weaningStartDate: "2026-11-18" };
const graceDay = (day: number, hour = 10) => new Date(2026, 10, day, hour);
const CAUTIONED_AT_SIX = ["carrot", "spinach", "napa-cabbage", "beet"];
const isFullBookDay = (plan: DailyRecommendation) => !plan.recordOnly
  && plan.meals.every((meal) => !isActualMeal(meal) && !isHeldMeal(meal) && meal.preparationSteps.length > 0);
const restricted = (ingredientId: string, status: ChildIngredientState["status"]): ChildIngredientState => (
  { ingredientId, status, testDay: null, exposureCount: 1, lastOfferedAt: null }
);

test("a start in the seven days before the six-month birthday gets the full initial plan before six months", () => {
  // Two days early: the same full plan a six-month-old gets that day, while the age itself stays five months.
  const plan = createBookBasedDayPlan(graceChild, ingredientCatalog, [], [], graceDay(18), []);
  assert.deepEqual(plan, createBookBasedDayPlan({ ...graceChild, ageMonths: 6 }, ingredientCatalog, [], [], graceDay(18), []));
  assert.equal(initialStartAgeDate(graceChild), "2026-11-20");
  assert.deepEqual([plan.recordOnly, plan.currentTrial?.id, plan.trialDay], [false, "rice", 1]);
  const [first, second] = plan.meals;
  assert.deepEqual(
    [first.title, first.bookReference, typeof first.textureMm, first.items.map((item) => [item.ingredient.id, item.isNewExposure])],
    ["쌀죽", "책 p.70", "number", [["rice", true]]],
  );
  assert.ok(first.servingGuide && first.textureGuide && first.servingMode && first.preparationSteps.length && first.storageGuide);
  assert.deepEqual(second.items.map((item) => [item.ingredient.id, item.isNewExposure]), [["rice", false]], "one exposure a day");
  assert.ok(plan.checks.length && plan.safetyNotes.length && plan.developmentTask && plan.summaryReasons.length);
  assert.equal(plan.checks.find((check) => check.id === "texture")?.met, true);
  assert.ok(plan.nextAdditions.length && plan.nextAdditions.every((addition) => !CAUTIONED_AT_SIX.includes(addition.ingredient.id)));
  assert.equal(chooseNextIngredient(graceChild, ingredientCatalog, [], [], graceDay(18))?.id, "rice");
});

test("the early-start window counts calendar days to the six-month birthday with both ends included", () => {
  const planFor = (start: string, day: number, ageMonths = 5) =>
    createBookBasedDayPlan({ ...graceChild, weaningStartDate: start, ageMonths }, ingredientCatalog, [], [], graceDay(day), []);
  assert.ok(isFullBookDay(planFor("2026-11-13", 13)), "seven days early");
  const eightEarly = planFor("2026-11-12", 12);
  assert.deepEqual([eightEarly.recordOnly, eightEarly.meals.map((meal) => meal.optionId)], [true, ["actual:1", "actual:2"]], "eight days early");
  assert.equal(eightEarly.meals[0].reasons[0], "시작일이 만 6개월이 되는 11월 20일보다 7일 넘게 일러서, 그 전까지는 책 추천 메뉴와 제공량·질감·조리 안내를 보여주지 않아요.");
  assert.deepEqual([eightEarly.checks, eightEarly.safetyNotes, eightEarly.developmentTask, eightEarly.summaryReasons, eightEarly.nextAdditions], [[], [], "", [], []]);
  // A start before the window stays outside it on the days that fall inside it.
  for (const day of [13, 16, 19]) assert.equal(planFor("2026-11-10", day).meals.every(isActualMeal), true, `day ${day}`);
  // Before the confirmed start nothing opens.
  const beforeStart = planFor("2026-11-18", 17);
  assert.deepEqual([beforeStart.recordOnly, beforeStart.meals.every(isHeldMeal)], [false, true]);
  assert.equal(chooseNextIngredient(graceChild, ingredientCatalog, [], [], graceDay(17)), null);
  // The birthday is the window's last day, and from it on the age rules apply to every start.
  assert.ok(isFullBookDay(planFor("2026-11-20", 20)), "a start on the birthday");
  assert.ok(isFullBookDay(planFor("2026-11-10", 20, 6)), "an earlier start at six months");
  assert.ok(isFullBookDay(planFor("2026-11-10", 26, 6)), "after six months");
});

test("the window follows the calendar across month ends, leap years and daylight-saving changes", () => {
  const previousTimeZone = process.env.TZ;
  process.env.TZ = "America/Los_Angeles";
  try {
    const qualifies = (birthDate: string, start: string, at: Date) =>
      isFullBookDay(createBookBasedDayPlan({ ...graceChild, birthDate, weaningStartDate: start }, ingredientCatalog, [], [], at, []));
    // Born on 08-31: six months on 02-28, or 02-29 in a leap year.
    assert.equal(qualifies("2026-08-31", "2027-02-21", new Date(2027, 1, 21, 10)), true);
    assert.equal(qualifies("2026-08-31", "2027-02-20", new Date(2027, 1, 21, 10)), false);
    assert.equal(qualifies("2027-08-31", "2028-02-22", new Date(2028, 1, 22, 10)), true);
    assert.equal(qualifies("2027-08-31", "2028-02-21", new Date(2028, 1, 22, 10)), false);
    // Windows that span the end of daylight saving (2026-11-01) and its start (2027-03-14): seven calendar days are
    // seven days although they last an hour more or less, and minutes into or before midnight still count as that day.
    assert.equal(qualifies("2026-05-02", "2026-10-26", new Date(2026, 9, 26, 0, 5)), true);
    assert.equal(qualifies("2026-05-02", "2026-10-25", new Date(2026, 9, 26, 0, 5)), false);
    assert.equal(qualifies("2026-09-15", "2027-03-08", new Date(2027, 2, 8, 23, 55)), true);
    assert.equal(qualifies("2026-09-15", "2027-03-07", new Date(2027, 2, 8, 23, 55)), false);
  } finally {
    if (previousTimeZone === undefined) delete process.env.TZ;
    else process.env.TZ = previousTimeZone;
  }
});

test("no window without a real birth date, and none for a corrected age", () => {
  const day = graceDay(18);
  const noBirthDate = createBookBasedDayPlan({ ...graceChild, birthDate: undefined }, ingredientCatalog, [], [], day, []);
  assert.deepEqual([noBirthDate.recordOnly, noBirthDate.meals[0].reasons[0]], [true, "만 6개월 전이라 책 추천 메뉴와 제공량·질감·조리 안내는 보여주지 않아요."]);
  for (const birthDate of ["2026-02-30", "2026-5-20", "2026-05-20T00:00"]) {
    const invalid = createBookBasedDayPlan({ ...graceChild, birthDate }, ingredientCatalog, [], [], day, []);
    assert.deepEqual(
      [invalid.recordOnly, invalid.meals[0].reasons[0]],
      [true, "생년월일을 날짜로 확인할 수 없어 만 6개월 전에는 책 추천 메뉴와 제공량·질감·조리 안내를 보여주지 않아요."],
      birthDate,
    );
    assert.equal(initialStartAgeDate({ ...graceChild, birthDate }), null);
  }
  // A corrected age is stored without a date, so the chronological birthday never opens the window for it.
  const correctedChild = { ...graceChild, correctedAgeMonths: 5 };
  const corrected = createBookBasedDayPlan(correctedChild, ingredientCatalog, [], [], day, []);
  assert.deepEqual([corrected.recordOnly, corrected.meals[0].reasons[0]], [true, "교정 연령으로 만 6개월 전이라 책 추천 메뉴와 제공량·질감·조리 안내는 보여주지 않아요."]);
  assert.equal(initialStartAgeDate(correctedChild), null);
  assert.equal(chooseNextIngredient(correctedChild, ingredientCatalog, [], [], day), null);
});

test("the early start opens only foods without an age of their own and every other block stays", () => {
  const day = graceDay(18);
  // Foods with their own six-month caution and later foods stay out even when marked passed by hand.
  const strictOrLater = [...CAUTIONED_AT_SIX, "millet", "corn", "milk", "mackerel"];
  const plan = createBookBasedDayPlan(graceChild, ingredientCatalog, [...[...strictOrLater, "oatmeal", "beef"].map(passed), testing("rice", 2)], [], day, []);
  const offered = new Set(plan.meals.flatMap(mealOptions).flatMap(optionIds));
  assert.ok(offered.has("rice") && offered.has("beef"), [...offered].join());
  assert.deepEqual(strictOrLater.filter((id) => offered.has(id)), []);
  assert.ok(plan.nextAdditions.every((addition) => !strictOrLater.includes(addition.ingredient.id)));
  // The introduction order skips the cautioned leafy foods until six months.
  const leafyBlocked = [passed("rice"), passed("beef"), ...["cabbage", "bokchoy", "kale"].map((id) => restricted(id, "avoid"))];
  assert.ok(!CAUTIONED_AT_SIX.includes(chooseNextIngredient(graceChild, ingredientCatalog, leafyBlocked, [], day)?.id ?? ""));
  assert.equal(chooseNextIngredient({ ...graceChild, ageMonths: 6 }, ingredientCatalog, leafyBlocked, [], day)?.id, "spinach");
  // A food with no stage-start provenance keeps its six months.
  const unmarked: IngredientDefinition = { ...ingredientById.get("oatmeal")!, id: "custom-unmarked", minimumAgeIsStageStart: undefined };
  assert.equal(chooseNextIngredient(graceChild, [ingredientById.get("rice")!, unmarked], [passed("rice")], [], day), null);
  assert.equal(chooseNextIngredient({ ...graceChild, ageMonths: 6 }, [ingredientById.get("rice")!, unmarked], [passed("rice")], [], day)?.id, unmarked.id);

  // A recorded reaction is a genuine hold, and a restricted rice is never served.
  const review: MealHistoryEntry = { servedAt: graceDay(18, 9).toISOString(), ingredientIds: ["rice"], completion: "taste", mealType: "meal", reaction: "needsReview" };
  const held = createBookBasedDayPlan(graceChild, ingredientCatalog, [testing("rice", 2)], [review], graceDay(18, 12), []);
  assert.deepEqual([held.recordOnly, held.meals.every(isHeldMeal), held.nextAdditions], [false, true, []]);
  assert.match(held.meals[0].reasons[0], /^확인이 필요한 반응이나 질감 어려움이 기록돼/);
  for (const status of ["suspectedReaction", "avoid", "paused", "locked"] as const) {
    const blocked = createBookBasedDayPlan(graceChild, ingredientCatalog, [restricted("rice", status)], [], day, []);
    assert.ok(!blocked.meals.flatMap(mealOptions).some((meal) => optionIds(meal).includes("rice") || isActualMeal(meal)), status);
  }
  // One observation at a time: a cautioned food under observation by hand holds the day instead of opening another.
  const carrotTest = createBookBasedDayPlan(graceChild, ingredientCatalog, [testing("carrot", 1)], [], day, []);
  assert.deepEqual([carrotTest.currentTrial, carrotTest.meals.every(isHeldMeal)], [null, true]);
  // The weekly fish cap still applies.
  const fishMeals: MealHistoryEntry[] = [13, 16].map((date) => ({ servedAt: graceDay(date).toISOString(), ingredientIds: ["rice", "whitefish"], completion: "half", mealType: "meal" }));
  const fishPlan = createBookBasedDayPlan(graceChild, ingredientCatalog, ["rice", "beef", "whitefish"].map(passed), fishMeals, day, []);
  assert.ok(!fishPlan.meals.flatMap(mealOptions).some((meal) => hasGroup(meal, "fish")));
});

test("rice recorded directly before the window applied continues as the book plan without resetting its observation", () => {
  // The deployed direct record already saved today's first rice and moved the observation to day 2.
  const states = [testing("rice", 2)];
  const direct = {
    index: 1, ingredientIds: ["rice"], newExposureIngredientId: "rice", reaction: "none" as const, title: "쌀죽", time: "09:00",
    textureMm: null, servingGuide: "", textureGuide: "", servingMode: "", reasons: ["만 6개월 전이라 책 추천 메뉴와 제공량·질감·조리 안내는 보여주지 않아요."],
  };
  const history: MealHistoryEntry[] = [{ servedAt: graceDay(18, 9).toISOString(), ingredientIds: ["rice"], completion: "quarter", mealType: "meal", reaction: "none" }];
  const sameDay = createBookBasedDayPlan(graceChild, ingredientCatalog, states, history, graceDay(18, 12), [direct]);
  const [stored, next] = sameDay.meals;
  assert.deepEqual(
    [stored.optionId, stored.title, stored.textureMm, stored.servingGuide, stored.preparationSteps, stored.bookReference, stored.reasons],
    ["recorded:1", "쌀죽", undefined, "", [], undefined, direct.reasons],
    "the direct record is shown as it was stored",
  );
  assert.deepEqual(next.items.map((item) => [item.ingredient.id, item.isNewExposure]), [["rice", false]], "no second exposure today");
  assert.ok(!sameDay.recordOnly && next.preparationSteps.length && typeof next.textureMm === "number");
  // The current book meal for that slot, for reference only and planned from the recorded foods, is the same rice menu.
  const reference = createBookBasedDayPlan(graceChild, ingredientCatalog.filter((item) => item.id === "rice"), states, history, graceDay(18, 12), []);
  assert.deepEqual([reference.meals[0].title, reference.meals[0].bookReference, optionIds(reference.meals[0])], ["쌀죽", "책 p.70", ["rice"]]);
  // The next day the observation goes on at day 2 as the book's rice menu.
  const nextDay = createBookBasedDayPlan(graceChild, ingredientCatalog, states, history, graceDay(19), []);
  assert.deepEqual([nextDay.currentTrial?.id, nextDay.trialDay, nextDay.meals[0].bookReference, nextDay.meals.some(isActualMeal)], ["rice", 2, "책 p.70", false]);
});

test("the current guide beside a direct record of passed rice is the book's rice planned from the recorded foods", () => {
  // Direct records on 11-14..16 passed rice on its third observation, and 11-17's direct record was the familiar rice.
  // Each of those one-meal days is fully recorded.
  const profile: BabyProfile = { ...graceChild, mealsPerDay: 1, weaningStartDate: "2026-11-14" };
  const riceMeal = (date: number): MealHistoryEntry => ({ servedAt: graceDay(date, 9).toISOString(), ingredientIds: ["rice"], completion: "quarter", mealType: "meal", reaction: "none" });
  for (const day of [16, 17]) {
    const history = [14, 15, 16, 17].filter((date) => date <= day).map(riceMeal);
    const evening = graceDay(day, 18);
    // Replanned with every food, the day's one meal introduces the next food instead of the recorded rice.
    const everyFood = createBookBasedDayPlan(profile, ingredientCatalog, [passed("rice")], history, evening, []);
    assert.ok(mealOptions(everyFood.meals[0]).every((option) => option.items.some((item) => item.isNewExposure && item.ingredient.id === "beef")), `11-${day}`);
    // Planned from the recorded foods alone it is the book's rice as a familiar meal at the current texture.
    const reference = createBookBasedDayPlan(profile, ingredientCatalog.filter((item) => item.id === "rice"), [passed("rice")], history, evening, []);
    const [rice, ...others] = mealOptions(reference.meals[0]);
    assert.deepEqual(
      [reference.currentTrial, others.length, rice.title, rice.bookReference, rice.textureMm, rice.items.map((item) => [item.ingredient.id, item.isNewExposure])],
      [null, 0, "쌀죽", "책 p.70", 1, [["rice", false]]],
      `11-${day}`,
    );
    assert.ok(rice.servingGuide && rice.textureGuide && rice.servingMode && rice.preparationSteps.length && rice.storageGuide);
  }
});

test("a meal recorded with other foods counts only the day's observation food, and only when it is the one unconfirmed food", () => {
  const day = new Date(2026, 7, 4, 12);
  const kinds = (result: ReturnType<typeof actualFoodObservation>) => [result.trial, result.repeat, result.uncounted];

  // Rice day 2: the shown first meal is the rice observation.
  const riceStates = [testing("rice", 2)];
  const riceDay = createBookBasedDayPlan({ ...baseProfile, mealsPerDay: 2 }, ingredientCatalog, riceStates, [], day, []);
  const riceMeal = riceDay.meals[0];
  assert.deepEqual(riceMeal.items.map((item) => [item.ingredient.id, item.isNewExposure]), [["rice", true]]);
  assert.deepEqual(kinds(actualFoodObservation(riceDay, riceMeal, ["rice"], riceStates)), ["rice", null, []], "rice as shown");
  assert.deepEqual(
    kinds(actualFoodObservation(riceDay, riceMeal, ["rice", "oatmeal"], riceStates)),
    [null, null, ["rice", "oatmeal"]],
    "rice and oatmeal together: two unconfirmed foods, neither counted",
  );
  assert.deepEqual(kinds(actualFoodObservation(riceDay, riceMeal, ["oatmeal"], riceStates)), [null, null, ["oatmeal"]], "rice replaced");

  // Beef day 1 after rice and oatmeal passed: the shown first meal adds beef to familiar foods.
  const beefStates = [passed("rice"), passed("oatmeal")];
  const beefDay = createBookBasedDayPlan(baseProfile, ingredientCatalog, beefStates, [], day, []);
  const beefMeal = beefDay.meals[0];
  assert.equal(beefDay.currentTrial?.id, "beef");
  assert.ok(beefMeal.items.some((item) => item.isNewExposure && item.ingredient.id === "beef"), optionIds(beefMeal).join());
  assert.deepEqual(kinds(actualFoodObservation(beefDay, beefMeal, ["oatmeal", "beef"], beefStates)), ["beef", null, []], "a familiar base swapped in");
  assert.deepEqual(kinds(actualFoodObservation(beefDay, beefMeal, ["rice"], beefStates)), [null, null, []], "beef left out");
  assert.deepEqual(kinds(actualFoodObservation(beefDay, beefMeal, ["rice", "chicken"], beefStates)), [null, null, ["chicken"]], "one familiar and one other new food");
  assert.deepEqual(kinds(actualFoodObservation(beefDay, beefMeal, ["rice", "beef", "chicken"], beefStates)), [null, null, ["beef", "chicken"]], "beef with another new food");
  // A food under a restriction is never familiar, so it is never counted either.
  assert.deepEqual(
    kinds(actualFoodObservation(beefDay, beefMeal, ["rice", "beef", "egg"], [...beefStates, { ingredientId: "egg", status: "suspectedReaction", testDay: null, exposureCount: 1, lastOfferedAt: null }])),
    [null, null, ["beef", "egg"]],
  );

  // Once the first meal is recorded without rice, rice in a later meal is only a repeat: one observation day per date.
  const afterOatmeal = createBookBasedDayPlan({ ...baseProfile, mealsPerDay: 2 }, ingredientCatalog, riceStates, [], day, [
    { index: 1, ingredientIds: ["oatmeal"], newExposureIngredientId: null, reaction: "none" },
  ]);
  const laterMeal = afterOatmeal.meals[1];
  assert.deepEqual(laterMeal.items.map((item) => [item.ingredient.id, item.isNewExposure]), [["rice", false]]);
  assert.deepEqual(kinds(actualFoodObservation(afterOatmeal, laterMeal, ["rice"], riceStates)), [null, "rice", []]);
  assert.deepEqual(kinds(actualFoodObservation(afterOatmeal, laterMeal, ["rice", "oatmeal"], riceStates)), [null, null, ["rice", "oatmeal"]]);
  // Rice with a familiar food in a meal that was not its trial is a repeat too.
  const oatmealPassed = [testing("rice", 2), passed("oatmeal")];
  const familiarSecond = createBookBasedDayPlan({ ...baseProfile, mealsPerDay: 2 }, ingredientCatalog, oatmealPassed, [], day, []);
  assert.ok(!familiarSecond.meals[1].items.some((item) => item.isNewExposure), optionIds(familiarSecond.meals[1]).join());
  assert.deepEqual(kinds(actualFoodObservation(familiarSecond, familiarSecond.meals[1], ["rice", "oatmeal"], oatmealPassed)), [null, "rice", []]);
});

test("foods a family recorded in place of the meal shown count as the day's new foods, and rice is only repeated while observed", () => {
  const day = new Date(2026, 7, 4, 12);
  const profile: BabyProfile = { ...baseProfile, mealsPerDay: 2 };
  const newFood = (plan: DailyRecommendation) => {
    const check = plan.checks.find((item) => item.id === "new-food");
    return [check?.met, check?.detail];
  };
  const served = (meal: PlannedMeal) => meal.items.map((item) => [item.ingredient.id, item.isNewExposure]);

  // Rice and oatmeal given together before either was observed: two new foods that day, and since that meal did not start
  // rice's observation, the other meal rests instead of calling rice a food under observation.
  const together = createBookBasedDayPlan(profile, ingredientCatalog, [], [], day, [
    { index: 1, ingredientIds: ["rice", "oatmeal"], newExposureIngredientId: null, reaction: "none" },
  ]);
  assert.deepEqual(newFood(together), [false, "아직 통과하지 않은 재료 2가지"]);
  assert.equal(isHeldMeal(together.meals[1]), true);
  assert.match(together.meals[1].reasons[0], /첫 끼에서만 관찰/);
  assert.equal(together.meals.some((meal) => meal.reasons.some((reason) => reason.includes("관찰 중인 재료(쌀)"))), false);

  // Oatmeal in place of the first rice: rice that was never given is not served later that day as a repeat.
  const oatmealOnly = createBookBasedDayPlan(profile, ingredientCatalog, [], [], day, [
    { index: 1, ingredientIds: ["oatmeal"], newExposureIngredientId: null, reaction: "none" },
  ]);
  assert.equal(oatmealOnly.currentTrial?.id, "rice");
  assert.equal(isHeldMeal(oatmealOnly.meals[1]), true);
  assert.match(oatmealOnly.meals[1].reasons[0], /첫 끼에서만 관찰/);
  assert.deepEqual(newFood(oatmealOnly), [true, "아직 통과하지 않은 재료 1가지"]);

  // Rice already under observation is still given again after such a meal, and counts as that day's second new food.
  const underObservation = createBookBasedDayPlan(profile, ingredientCatalog, [testing("rice", 2)], [], day, [
    { index: 1, ingredientIds: ["oatmeal"], newExposureIngredientId: null, reaction: "none" },
  ]);
  assert.deepEqual(served(underObservation.meals[1]), [["rice", false]]);
  assert.deepEqual(newFood(underObservation), [false, "아직 통과하지 않은 재료 2가지"]);

  // The day's observation counted from a family record with a familiar food is the usual one food under observation, and
  // a plan before anything is recorded is unchanged.
  const counted = createBookBasedDayPlan(profile, ingredientCatalog, [testing("rice", 2), passed("oatmeal")], [], day, [
    { index: 1, ingredientIds: ["rice", "oatmeal"], newExposureIngredientId: "rice", reaction: "none" },
  ]);
  assert.deepEqual(newFood(counted), [true, "1개 관찰 중"]);
  assert.deepEqual(newFood(createBookBasedDayPlan(profile, ingredientCatalog, [], [], day, [])), [true, "1개 관찰 중"]);
});

test("a corrected meal replaces only its slot of a stored day and drops the day's food claims instead of recomputing them", () => {
  const profile: BabyProfile = { ...baseProfile, mealsPerDay: 2, milkMlPerDay: 800 };
  // The day as stored when meal 1 was recorded: the book menu that adds beef to rice and oatmeal, one food observed.
  const stored = createBookBasedDayPlan(profile, ingredientCatalog, [passed("rice"), passed("oatmeal")], [], new Date(2026, 7, 4, 12), []);
  const shown = stored.meals[0];
  const claim = (day: DailyRecommendation, id: string) => {
    const check = day.checks.find((item) => item.id === id);
    return check ? [check.met, check.detail] : null;
  };
  assert.deepEqual(shown.items.filter((item) => item.isNewExposure).map((item) => item.ingredient.id), ["beef"]);
  assert.deepEqual([claim(stored, "grain"), claim(stored, "new-food"), claim(stored, "fish-cap")], [
    [true, "매 끼의 기본 에너지 식품"],
    [true, "1개 관찰 중"],
    [true, "최근 7일 0/2회"],
  ]);
  assert.ok(stored.summaryReasons.length > 0);

  // Corrected to beef and salmon: two foods not observed yet, no grain, and a fish meal.
  const corrected = recordedMealSlot({
    index: 1,
    ingredientIds: ["beef", "salmon"],
    newExposureIngredientId: null,
    title: "소고기·연어",
    time: shown.time,
    textureMm: shown.textureMm,
    servingGuide: "",
    textureGuide: "",
    servingMode: "",
    reasons: [`‘${shown.title}’로 기록했던 식사를 실제로 먹인 재료로 고쳤어요.`],
  }, ingredientCatalog, shown.time);
  const day = correctedDaySnapshot(stored, corrected);
  assert.deepEqual(
    [day.meals[0].optionId, day.meals[0].items.map((item) => [item.ingredient.id, item.isNewExposure])],
    ["recorded:1", [["beef", false], ["salmon", false]]],
  );
  assert.deepEqual(
    day.meals[0].alternatives?.map((option) => option.optionId),
    mealOptions(shown).map((option) => option.optionId),
    "the book menu first recorded stays beside it, first, as an option that was not followed",
  );
  assert.equal(day.meals[0].alternatives?.[0].alternatives, undefined);
  assert.deepEqual(day.checks, stored.checks.filter((check) => check.id === "texture" || check.id === "milk-flow"), "only the checks that do not depend on the foods stay");
  assert.deepEqual([claim(day, "grain"), claim(day, "new-food"), claim(day, "fish-cap"), day.summaryReasons], [null, null, null, []]);
  const otherFields = (plan: DailyRecommendation) => Object.fromEntries(Object.entries(plan).filter(([key]) => !["meals", "checks", "summaryReasons"].includes(key)));
  assert.deepEqual(otherFields(day), otherFields(stored), "every other stored field stays");
  assert.deepEqual(day.meals[1], stored.meals[1], "the other meal stays as stored");

  // Correcting the same meal again keeps the first book menu as the option not followed, not the first correction.
  const again = correctedDaySnapshot(day, { ...corrected, title: "소고기" });
  assert.deepEqual(again.meals[0].alternatives?.map((option) => option.optionId), mealOptions(shown).map((option) => option.optionId));
});

test("records keep a food the family removed from its list, its fish meals count toward the cap, and it is never offered", () => {
  const profile: BabyProfile = { ...baseProfile, stage: "middle", ageMonths: 8, mealsPerDay: 3, snacksPerDay: 1, textureMm: 3 };
  const removedFish: IngredientDefinition = { ...ingredientById.get("whitefish")!, id: "custom-old-fish", name: "우리집 동태", introductionPriority: 1000 };
  const removedVegetable: IngredientDefinition = { ...ingredientById.get("cabbage")!, id: "custom-old-veg", name: "우리집 양배추", introductionPriority: 1001 };
  const recordDefinitions = [...ingredientCatalog, removedFish, removedVegetable];
  const states = ["rice", "cabbage", "pumpkin", "apple", "whitefish", removedFish.id, removedVegetable.id].map(passed);
  const today = new Date("2026-07-31T12:00:00.000Z");
  const history: MealHistoryEntry[] = [
    { servedAt: "2026-07-28T10:00:00.000Z", ingredientIds: ["rice", removedFish.id], completion: "half", mealType: "meal" },
    { servedAt: "2026-07-30T10:00:00.000Z", ingredientIds: ["rice", removedFish.id], completion: "most", mealType: "meal" },
  ];
  const recorded = [{ index: 1, ingredientIds: ["rice", removedVegetable.id], newExposureIngredientId: null, reaction: "none" as const, title: "쌀·우리집 양배추", time: "09:00" }];
  const offered = (plan: DailyRecommendation) => [
    ...plan.meals.filter((meal) => meal.index !== 1).flatMap(mealOptions),
    ...plan.snacks,
  ].flatMap((meal) => meal.items.map((item) => item.ingredient.id)).concat(plan.nextAdditions.map((addition) => addition.ingredient.id));
  const fishCap = (plan: DailyRecommendation) => plan.checks.find((check) => check.id === "fish-cap")?.detail;

  const withoutRemoved = createBookBasedDayPlan(profile, ingredientCatalog, states, history, today, recorded);
  const withRemoved = createBookBasedDayPlan(profile, ingredientCatalog, states, history, today, recorded, null, recordDefinitions);
  assert.deepEqual(withoutRemoved.meals[0].items.map((item) => item.ingredient.id), ["rice"], "an unknown food used to drop out of its record");
  assert.deepEqual(withRemoved.meals[0].items.map((item) => item.ingredient.id), ["rice", removedVegetable.id], "the record holds every food it stored");
  assert.ok(offered(withoutRemoved).includes("whitefish"), "without its removed fish meals the week looks fish-free");
  assert.equal(fishCap(withRemoved), "최근 7일 2/2회");
  assert.deepEqual(offered(withRemoved).filter((id) => ingredientById.get(id)?.foodGroup === "fish"), [], "the cap holds with the removed fish meals counted");
  assert.deepEqual(offered(withRemoved).filter((id) => id.startsWith("custom-old")), [], "a removed food is never offered, even when it passed");
  assert.equal(countRecentFish(recordDefinitions, history, today), 2);
});

test("the prestart preview is unchanged by the start window and never stands in for a confirmed start", () => {
  const prestart: BabyProfile = { ...graceChild, stage: "prestart", mealsPerDay: 1 };
  const withoutDates: BabyProfile = { ...prestart, birthDate: undefined, weaningStartDate: null };
  assert.deepEqual(createInitialMealSuggestion(prestart, ingredientCatalog, [], []), createInitialMealSuggestion(withoutDates, ingredientCatalog, [], []));
  // The app's preview assumes six months (corrected age included), so its plan never depends on the dates.
  const preview = (profile: BabyProfile): BabyProfile => ({ ...profile, stage: "initial", ageMonths: 6, correctedAgeMonths: 6, mealsPerDay: 1, snacksPerDay: 0 });
  assert.deepEqual(
    createBookBasedDayPlan(preview(prestart), ingredientCatalog, [], [], graceDay(10), []),
    createBookBasedDayPlan(preview(withoutDates), ingredientCatalog, [], [], graceDay(10), []),
  );
  // The real prestart child is not in the window even on its planned start: the start is not confirmed.
  const real = createBookBasedDayPlan(prestart, ingredientCatalog, [], [], graceDay(18), []);
  assert.deepEqual([real.recordOnly, real.meals.every(isHeldMeal)], [false, true]);
});
