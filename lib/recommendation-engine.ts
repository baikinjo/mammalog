import type {
  BabyProfile,
  ChildIngredientState,
  IngredientDefinition,
  IntroductionGroup,
  MealHistoryEntry,
  MealSuggestion,
  WeaningStage,
} from "./domain";

const stageRank: Record<WeaningStage, number> = {
  prestart: 0,
  initial: 1,
  middle: 2,
  late: 3,
  completion: 4,
};

const introductionOrder: IntroductionGroup[] = [
  "grain",
  "meat",
  "leafy",
  "yellow",
  "fruit",
];

const introductionLabels: Record<IntroductionGroup, string> = {
  grain: "곡류",
  meat: "고기",
  leafy: "이파리 채소",
  yellow: "노란 채소",
  fruit: "과일",
  other: "다른 식품군",
};

function daysSince(date: string | null, today: Date): number {
  if (!date) return 999;
  const elapsed = today.getTime() - new Date(date).getTime();
  return Math.max(0, Math.floor(elapsed / 86_400_000));
}

function passedIntroductionGroups(
  definitions: IngredientDefinition[],
  states: ChildIngredientState[],
): Set<IntroductionGroup> {
  const stateById = new Map(states.map((state) => [state.ingredientId, state]));
  return new Set(
    definitions
      .filter((ingredient) => stateById.get(ingredient.id)?.status === "passed")
      .map((ingredient) => ingredient.introductionGroup),
  );
}

export function chooseNextIngredient(
  profile: BabyProfile,
  definitions: IngredientDefinition[],
  states: ChildIngredientState[],
  history: MealHistoryEntry[],
  today = new Date(),
): IngredientDefinition | null {
  const activeTest = states.find((state) => state.status === "testing");
  if (activeTest) {
    return (
      definitions.find((ingredient) => ingredient.id === activeTest.ingredientId) ??
      null
    );
  }

  const stateById = new Map(states.map((state) => [state.ingredientId, state]));
  const availableGroups = passedIntroductionGroups(definitions, states);
  const nextMissingGroup = introductionOrder.find(
    (group) => !availableGroups.has(group),
  );

  const recentIds = new Set(
    history
      .slice(-4)
      .flatMap((entry) => entry.ingredientIds),
  );

  const candidates = definitions.filter((ingredient) => {
    const state = stateById.get(ingredient.id);
    const allowedByStage =
      stageRank[ingredient.minimumStage] <= Math.max(1, stageRank[profile.stage]);
    return (
      allowedByStage &&
      (!state || state.status === "ready" || state.status === "rejected")
    );
  });

  const scored = candidates.map((ingredient) => {
    const state = stateById.get(ingredient.id);
    let score = 100 - ingredient.introductionPriority;

    if (ingredient.introductionGroup === nextMissingGroup) score += 80;
    if (!recentIds.has(ingredient.id)) score += 12;
    if (state?.status === "rejected") score -= 25;
    score += Math.min(20, daysSince(state?.lastOfferedAt ?? null, today));

    return { ingredient, score };
  });

  scored.sort(
    (left, right) =>
      right.score - left.score ||
      left.ingredient.introductionPriority - right.ingredient.introductionPriority,
  );

  return scored[0]?.ingredient ?? null;
}

export function createInitialMealSuggestion(
  profile: BabyProfile,
  definitions: IngredientDefinition[],
  states: ChildIngredientState[],
  history: MealHistoryEntry[],
): MealSuggestion {
  const stateById = new Map(states.map((state) => [state.ingredientId, state]));
  const grain = definitions.find((ingredient) => ingredient.id === "rice");
  const oatmeal = definitions.find((ingredient) => ingredient.id === "oatmeal");
  const nextIngredient = chooseNextIngredient(
    { ...profile, stage: "initial" },
    definitions,
    states,
    history,
  );

  const selected = [grain, oatmeal].filter(
    (ingredient): ingredient is IngredientDefinition => Boolean(ingredient),
  );

  if (
    nextIngredient &&
    !selected.some((ingredient) => ingredient.id === nextIngredient.id) &&
    history.length >= 3
  ) {
    selected.push(nextIngredient);
  }

  const testing = selected.find(
    (ingredient) => stateById.get(ingredient.id)?.status === "testing",
  );

  const newFood = testing ?? nextIngredient ?? selected[0];
  const testDay = newFood
    ? stateById.get(newFood.id)?.testDay ?? 1
    : 1;

  return {
    title: selected.length > 1 ? "쌀·오트밀죽" : "쌀죽",
    mealTime: profile.preferredMealTime,
    servingGuide: "한두 숟가락부터",
    textureGuide: "부드럽되 물처럼 묽지 않게",
    ingredients: selected,
    testLabel: newFood ? `${introductionLabels[newFood.introductionGroup]} ${testDay}/3일` : null,
    reasons: [
      "첫날은 곡류 한 그룹에 집중해 반응을 분명하게 기록해요.",
      "먹는 양보다 숟가락과 새로운 질감에 익숙해지는 경험을 우선해요.",
      "실제 섭취량은 아이가 결정하고, 부모는 편안하게 제공해요.",
    ],
  };
}
