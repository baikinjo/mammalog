import assert from "node:assert/strict";
import test from "node:test";
import { ingredientById, ingredientCatalog } from "../lib/ingredient-catalog";
import {
  applyEditedTrialOutcome,
  applyTrialOutcome,
  chooseNextIngredient,
  countRecentFish,
  createBookBasedDayPlan,
  createInitialMealSuggestion,
  hasStartReadiness,
  inferWeaningStage,
  resolveMealTimes,
} from "../lib/recommendation-engine";
import type {
  BabyProfile,
  ChildIngredientState,
  MealHistoryEntry,
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
