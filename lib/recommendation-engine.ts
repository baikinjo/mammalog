import {
  RECOMMENDATION_VERSION,
  conditionGuidance,
  getStageGuide,
} from "./book-knowledge";
import {
  menuInstruction,
  menusForStage,
  type StageMenuTemplate,
} from "./stage-menu-catalog";
import type {
  BabyProfile,
  ChildIngredientState,
  DailyRecommendation,
  FoodGroup,
  IngredientDefinition,
  IntroductionGroup,
  MealHistoryEntry,
  MealPlanItem,
  MealSuggestion,
  PlannedMeal,
  TargetCheck,
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
  other: "다음 재료",
};

const roleByFoodGroup: Partial<Record<FoodGroup, MealPlanItem["role"]>> = {
  grain: "base",
  starchyFood: "base",
  redMeat: "protein",
  poultry: "protein",
  fish: "protein",
  egg: "protein",
  legume: "protein",
  leafyVegetable: "vegetable",
  yellowVegetable: "vegetable",
  otherVegetable: "vegetable",
  fruit: "fruit",
  dairy: "snack",
  fat: "snack",
};

function isoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function ageForRules(profile: BabyProfile): number {
  return profile.correctedAgeMonths ?? profile.ageMonths;
}

function daysSince(date: string | null | undefined, today: Date): number {
  if (!date) return 999;
  const elapsed = today.getTime() - new Date(date).getTime();
  return Math.max(0, Math.floor(elapsed / 86_400_000));
}

function withinLastDays(date: string, today: Date, days: number): boolean {
  const elapsed = today.getTime() - new Date(date).getTime();
  return elapsed >= 0 && elapsed < days * 86_400_000;
}

function timeToMinutes(time: string): number | null {
  if (!/^\d{2}:\d{2}$/.test(time)) return null;
  const [rawHour = "10", rawMinute = "00"] = time.split(":");
  const hour = Number(rawHour);
  const minute = Number(rawMinute);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return hour * 60 + minute;
}

function minutesToTime(total: number): string {
  const safeTotal = Math.max(0, Math.min(23 * 60 + 59, Math.round(total)));
  return `${String(Math.floor(safeTotal / 60)).padStart(2, "0")}:${String(safeTotal % 60).padStart(2, "0")}`;
}

function isOrderedSameDaySchedule(times: string[]): boolean {
  const minutes = times.map(timeToMinutes);
  return minutes.every((value): value is number => value != null)
    && minutes.every((value, index) => index === 0 || value > minutes[index - 1]!);
}

export function resolveMealTimes(profile: BabyProfile, mealCount: number): string[] {
  const count = Math.max(1, Math.min(3, mealCount));
  const savedTimes = profile.mealTimes?.slice(0, count) ?? [];
  if (savedTimes.length === count && isOrderedSameDaySchedule(savedTimes)) return savedTimes;

  const preferredMinutes = timeToMinutes(profile.preferredMealTime);
  const gapMinutes = 4 * 60;
  const earliestFirstMeal = 6 * 60;
  const latestFinalMeal = 20 * 60;
  const latestFirstMeal = latestFinalMeal - (count - 1) * gapMinutes;
  const safeFirstMeal = preferredMinutes != null
    && preferredMinutes >= earliestFirstMeal
    && preferredMinutes <= latestFirstMeal
      ? preferredMinutes
      : count === 1 ? 10 * 60 : 9 * 60;

  return Array.from({ length: count }, (_, index) => minutesToTime(safeFirstMeal + index * gapMinutes));
}

function resolveSnackTimes(mealTimes: string[], snackCount: number): string[] {
  const mealMinutes = mealTimes.map(timeToMinutes).filter((value): value is number => value != null);
  const times: string[] = [];
  for (let index = 0; index < snackCount; index += 1) {
    if (index < mealMinutes.length - 1) {
      times.push(minutesToTime((mealMinutes[index] + mealMinutes[index + 1]) / 2));
    } else {
      const lastMeal = mealMinutes.at(-1) ?? 17 * 60;
      times.push(minutesToTime(lastMeal + (index - mealMinutes.length + 2) * 2 * 60));
    }
  }
  return times;
}

export function hasStartReadiness(profile: BabyProfile): boolean {
  if (ageForRules(profile) < 6) return false;
  if (!profile.readiness) return true;
  return Object.values(profile.readiness).every(Boolean);
}

export function inferWeaningStage(profile: BabyProfile): Exclude<WeaningStage, "prestart"> {
  if (profile.stage !== "prestart") return profile.stage;
  const age = ageForRules(profile);
  if (age >= 12) return "completion";
  if (age >= 9) return "late";
  if (age >= 7) return "middle";
  return "initial";
}

function passedIntroductionGroups(
  definitions: IngredientDefinition[],
  states: ChildIngredientState[],
): Set<IntroductionGroup> {
  const stateById = new Map(states.map((state) => [state.ingredientId, state]));
  return new Set(
    definitions
      .filter((item) => stateById.get(item.id)?.status === "passed")
      .map((item) => item.introductionGroup),
  );
}

function recentIngredientIds(history: MealHistoryEntry[], today: Date, days: number): Set<string> {
  return new Set(
    history
      .filter((entry) => withinLastDays(entry.servedAt, today, days))
      .flatMap((entry) => entry.ingredientIds),
  );
}

export function countRecentFish(
  definitions: IngredientDefinition[],
  history: MealHistoryEntry[],
  today = new Date(),
): number {
  const fishIds = new Set(
    definitions.filter((item) => item.foodGroup === "fish").map((item) => item.id),
  );
  return history.filter(
    (entry) =>
      entry.mealType !== "snack" &&
      withinLastDays(entry.servedAt, today, 7) &&
      entry.ingredientIds.some((id) => fishIds.has(id)),
  ).length;
}

function hardBlocked(
  profile: BabyProfile,
  ingredient: IngredientDefinition,
  state: ChildIngredientState | undefined,
  fishCount: number,
): boolean {
  if (["avoid", "suspectedReaction", "paused", "locked"].includes(state?.status ?? "")) return true;
  if (stageRank[ingredient.minimumStage] > stageRank[inferWeaningStage(profile)]) return true;
  if ((ingredient.minimumAgeMonths ?? 6) > ageForRules(profile)) return true;
  if (ingredient.foodGroup === "fish" && fishCount >= (ingredient.frequencyCap7Days ?? 2)) return true;
  const tags = new Set(ingredient.tags ?? []);
  if (profile.temporaryCondition === "mouthPain" && tags.has("acidic")) return true;
  if (profile.temporaryCondition === "diarrhea" && (tags.has("sweet") || ingredient.foodGroup === "fat")) return true;
  return false;
}

function conditionScore(profile: BabyProfile, ingredient: IngredientDefinition): number {
  const condition = profile.temporaryCondition ?? "none";
  const tags = new Set(ingredient.tags ?? []);
  if (condition === "constipation") {
    if (tags.has("constipationHelpful")) return 45;
    if ([...tags].some((tag) => tag.startsWith("constipationCaution"))) return -35;
  }
  if (condition === "diarrhea" && (tags.has("sweet") || ingredient.foodGroup === "fat")) return -30;
  if (condition === "mouthPain" && tags.has("acidic")) return -80;
  return 0;
}

export function chooseNextIngredient(
  profile: BabyProfile,
  definitions: IngredientDefinition[],
  states: ChildIngredientState[],
  history: MealHistoryEntry[],
  today = new Date(),
): IngredientDefinition | null {
  const latestReaction = history
    .filter((entry) => new Date(entry.servedAt).getTime() <= today.getTime())
    .slice()
    .sort((left, right) => new Date(left.servedAt).getTime() - new Date(right.servedAt).getTime())
    .at(-1)?.reaction;
  if (latestReaction === "needsReview" || latestReaction === "textureDifficulty") return null;

  const activeTest = states.find((state) => state.status === "testing");
  if (activeTest) {
    const activeIngredient = definitions.find((item) => item.id === activeTest.ingredientId);
    const fishCount = countRecentFish(definitions, history, today);
    return activeIngredient && !hardBlocked(profile, activeIngredient, activeTest, fishCount)
      ? activeIngredient
      : null;
  }

  const stateById = new Map(states.map((state) => [state.ingredientId, state]));
  const availableGroups = passedIntroductionGroups(definitions, states);
  const nextMissingGroup = introductionOrder.find((group) => !availableGroups.has(group));
  const recentIds = recentIngredientIds(history, today, 3);
  const fishCount = countRecentFish(definitions, history, today);

  const candidates = definitions.filter((item) => {
    const state = stateById.get(item.id);
    if (hardBlocked(profile, item, state, fishCount)) return false;
    return !state || state.status === "ready" || state.status === "rejected";
  });

  const scored = candidates.map((item) => {
    const state = stateById.get(item.id);
    let score = 200 - item.introductionPriority;

    if (item.introductionGroup === nextMissingGroup) score += 1_000;
    if (!nextMissingGroup && item.id === "wheat" && ageForRules(profile) < 7) score += 500;
    if (!nextMissingGroup && item.allergen && !recentIds.has(item.id)) score += 90;
    if (!recentIds.has(item.id)) score += 35;
    if (state?.status === "rejected") score -= Math.max(15, 60 - state.exposureCount * 8);
    score += Math.min(30, daysSince(state?.lastOfferedAt, today));
    score += conditionScore(profile, item);

    return { item, score };
  });

  scored.sort(
    (left, right) =>
      right.score - left.score ||
      left.item.introductionPriority - right.item.introductionPriority ||
      left.item.id.localeCompare(right.item.id),
  );
  return scored[0]?.item ?? null;
}

export type TrialOutcome =
  | "accepted"
  | "tasteRejected"
  | "textureDifficulty"
  | "suspectedReaction";

export function applyTrialOutcome(
  states: ChildIngredientState[],
  ingredientId: string,
  outcome: TrialOutcome,
  observedAt: string,
  requiredDays: number,
  reactionNote?: string,
): ChildIngredientState[] {
  const existing = states.find((state) => state.ingredientId === ingredientId);
  const currentDay = existing?.testDay ?? 1;
  const exposureCount = (existing?.exposureCount ?? 0) + 1;
  let status: ChildIngredientState["status"] = "testing";
  let testDay: number | null = currentDay;

  if (outcome === "suspectedReaction") {
    status = "suspectedReaction";
    testDay = null;
  } else if (outcome === "tasteRejected") {
    status = "rejected";
    testDay = null;
  } else if (outcome === "textureDifficulty") {
    status = "paused";
    testDay = currentDay;
  } else if (currentDay >= requiredDays) {
    status = "passed";
    testDay = null;
  } else {
    status = "testing";
    testDay = currentDay + 1;
  }

  const next: ChildIngredientState = {
    ingredientId,
    status,
    testDay,
    exposureCount,
    firstOfferedAt: existing?.firstOfferedAt ?? observedAt,
    lastOfferedAt: observedAt,
    acceptedTextureMm: existing?.acceptedTextureMm ?? [],
    lastReaction: outcome === "suspectedReaction" ? reactionNote ?? "확인 필요" : existing?.lastReaction ?? null,
  };

  return existing
    ? states.map((state) => state.ingredientId === ingredientId ? next : state)
    : [...states, next];
}

const editedOutcomeStatus: Record<Exclude<TrialOutcome, "accepted">, ChildIngredientState["status"]> = {
  tasteRejected: "rejected",
  textureDifficulty: "paused",
  suspectedReaction: "suspectedReaction",
};

const statusRestriction: Partial<Record<ChildIngredientState["status"], number>> = {
  rejected: 1,
  paused: 2,
  suspectedReaction: 3,
  avoid: 4,
};

/**
 * Applies a corrected reaction from an edited meal record to the ingredient that meal introduced.
 * The exposure was already counted when the record was created, so only the status can move, and only toward
 * a more restrictive one: an edit never clears a pause or a suspected reaction. A meal outside the ingredient's
 * recorded trial window (for example a legacy row flagged without a trial) leaves the state unchanged.
 */
export function applyEditedTrialOutcome(
  states: ChildIngredientState[],
  ingredientId: string,
  outcome: TrialOutcome,
  mealRecordedAt: string,
  reactionNote?: string,
): ChildIngredientState[] {
  if (outcome === "accepted") return states;
  const status = editedOutcomeStatus[outcome];
  const lastReaction = status === "suspectedReaction" ? reactionNote?.trim() || "확인 필요" : null;
  const existing = states.find((state) => state.ingredientId === ingredientId);
  if (!existing) {
    return [...states, {
      ingredientId,
      status,
      testDay: null,
      exposureCount: 1,
      firstOfferedAt: mealRecordedAt,
      lastOfferedAt: mealRecordedAt,
      acceptedTextureMm: [],
      lastReaction,
    }];
  }

  const mealDay = isoDate(new Date(mealRecordedAt));
  const insideTrialWindow = Boolean(existing.firstOfferedAt && existing.lastOfferedAt)
    && mealDay >= isoDate(new Date(existing.firstOfferedAt!))
    && mealDay <= isoDate(new Date(existing.lastOfferedAt!));
  if (!insideTrialWindow) return states;
  if ((statusRestriction[status] ?? 0) <= (statusRestriction[existing.status] ?? 0)) return states;

  const next: ChildIngredientState = {
    ...existing,
    status,
    testDay: status === "paused" ? existing.testDay : null,
    lastReaction: lastReaction ?? existing.lastReaction ?? null,
  };
  return states.map((state) => state.ingredientId === ingredientId ? next : state);
}

function allowedPassedIngredients(
  profile: BabyProfile,
  definitions: IngredientDefinition[],
  states: ChildIngredientState[],
  history: MealHistoryEntry[],
  today: Date,
): IngredientDefinition[] {
  const stateById = new Map(states.map((state) => [state.ingredientId, state]));
  const fishCount = countRecentFish(definitions, history, today);
  return definitions.filter((item) => {
    const state = stateById.get(item.id);
    return state?.status === "passed" && !hardBlocked(profile, item, state, fishCount);
  });
}

function chooseLeastRecent(
  candidates: IngredientDefinition[],
  history: MealHistoryEntry[],
  offset = 0,
): IngredientDefinition | null {
  if (!candidates.length) return null;
  const lastIndex = new Map<string, number>();
  history.forEach((entry, index) => {
    entry.ingredientIds.forEach((id) => lastIndex.set(id, index));
  });
  return [...candidates].sort(
    (left, right) =>
      (lastIndex.get(left.id) ?? -1) - (lastIndex.get(right.id) ?? -1) ||
      left.introductionPriority - right.introductionPriority,
  )[offset % candidates.length];
}

function byFoodGroup(items: IngredientDefinition[], groups: FoodGroup[]): IngredientDefinition[] {
  return items.filter((item) => item.foodGroup && groups.includes(item.foodGroup));
}

function uniqueIngredients(items: Array<IngredientDefinition | null>): IngredientDefinition[] {
  const seen = new Set<string>();
  return items.filter((item): item is IngredientDefinition => {
    if (!item || seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

function ingredientHistoryIndex(history: MealHistoryEntry[]): Map<string, number> {
  const lastIndex = new Map<string, number>();
  history.forEach((entry, index) => {
    entry.ingredientIds.forEach((id) => lastIndex.set(id, index));
  });
  return lastIndex;
}

function selectStageMenu(
  stage: Exclude<WeaningStage, "prestart">,
  available: IngredientDefinition[],
  history: MealHistoryEntry[],
  today: Date,
  mealIndex: number,
  requireRedMeat: boolean,
  excludedMenuIds: Set<string>,
): StageMenuTemplate | null {
  if (stage === "initial") return null;
  const availableById = new Map(available.map((ingredient) => [ingredient.id, ingredient]));
  const lastIndex = ingredientHistoryIndex(history);
  const daySeed = Number(isoDate(today).replaceAll("-", ""));
  const candidates = menusForStage(stage)
    .filter((template) => template.kind !== "snack")
    .filter((template) => template.ingredientIds.every((id) => availableById.has(id)))
    .map((template) => {
      const ingredients = template.ingredientIds.map((id) => availableById.get(id)!);
      const hasRedMeat = ingredients.some((ingredient) => ingredient.foodGroup === "redMeat");
      const recency = ingredients.reduce((sum, ingredient) => sum + (lastIndex.get(ingredient.id) ?? -1), 0);
      const varietyBonus = excludedMenuIds.has(template.id) ? -5_000 : 0;
      const meatBonus = requireRedMeat && hasRedMeat ? 2_000 : 0;
      const stableRotation = (daySeed + mealIndex * 17 + template.id.length) % 31;
      return { template, score: meatBonus + varietyBonus - recency + stableRotation };
    })
    .sort((left, right) => right.score - left.score || left.template.id.localeCompare(right.template.id));
  return candidates[0]?.template ?? null;
}

function templateIngredients(
  template: StageMenuTemplate,
  available: IngredientDefinition[],
): IngredientDefinition[] {
  const byId = new Map(available.map((ingredient) => [ingredient.id, ingredient]));
  return template.ingredientIds.map((id) => byId.get(id)).filter((item): item is IngredientDefinition => Boolean(item));
}

function textureForDay(
  profile: BabyProfile,
  history: MealHistoryEntry[],
  minimum: number,
  maximum: number,
): number {
  const recentDifficulty = history
    .slice(-3)
    .some((entry) => entry.reaction === "textureDifficulty");
  const condition = profile.temporaryCondition ?? "none";
  const current = Math.max(minimum, profile.textureMm || minimum);
  if (recentDifficulty || condition === "cold" || condition === "diarrhea") return Math.min(current, maximum);
  if (condition === "mouthPain") return minimum;
  return Math.min(current, maximum);
}

function itemFor(ingredient: IngredientDefinition, newIngredientId: string | null): MealPlanItem {
  const isNew = ingredient.id === newIngredientId;
  return {
    ingredient,
    role: isNew ? "new" : roleByFoodGroup[ingredient.foodGroup ?? "otherVegetable"] ?? "vegetable",
    isNewExposure: isNew,
  };
}

function mealTitle(stage: Exclude<WeaningStage, "prestart">, items: IngredientDefinition[]): string {
  const names = items.map((item) => item.name.replace("완숙 ", ""));
  if (stage === "initial") return `${names.join("·")}죽`;
  const grain = items.find((item) => item.foodGroup === "grain" || item.foodGroup === "starchyFood");
  const protein = items.find((item) => ["redMeat", "poultry", "fish", "egg", "legume"].includes(item.foodGroup ?? ""));
  const vegetables = items.filter((item) => item.category === "vegetable").slice(0, 2);
  if (stage === "middle") return `${grain?.name ?? "곡류"}죽과 ${[protein, ...vegetables].filter(Boolean).map((item) => item?.name).join("·")} 토핑`;
  return `${grain?.name ?? "밥"}과 ${[protein, ...vegetables].filter(Boolean).map((item) => item?.name).join("·")} 반찬`;
}

function preparationForMeal(
  stage: Exclude<WeaningStage, "prestart">,
  ingredients: IngredientDefinition[],
  servingMode: string,
  textureMm: number,
  newIngredientId: string | null,
): string[] {
  const guide = getStageGuide(stage);
  const grain = ingredients.find((item) => ["grain", "starchyFood"].includes(item.foodGroup ?? ""));
  const animalFoods = ingredients.filter((item) => ["meat", "fish", "egg"].includes(item.category));
  const vegetables = ingredients.filter((item) => item.category === "vegetable");
  const constraints = ingredients.flatMap((item) => item.preparationConstraints ?? []).slice(0, 2);
  const baseStep = stage === "initial"
    ? `${grain?.name ?? "곡류"}: ${guide.grainDescription} 기준으로 충분히 익혀 ${textureMm}mm 안팎 입자를 남겨요.`
    : stage === "middle"
      ? `${grain?.name ?? "곡류"}: 부드러운 죽으로 준비하고, 다른 재료는 ${textureMm}mm 안팎으로 으깨거나 잘게 썰어요.`
      : stage === "late"
        ? `${grain?.name ?? "밥"}: 무른밥·진밥으로 준비하고, 반찬은 ${textureMm}mm 안팎의 잇몸으로 으깨지는 크기로 만들어요.`
        : `${grain?.name ?? "밥"}: 가족 밥보다 부드럽게 준비하고, 반찬은 ${textureMm}mm 안팎으로 무염 조리해요.`;
  const cookStep = animalFoods.length
    ? `${animalFoods.map((item) => item.name).join("·")}: 속까지 완전히 익혀요.${vegetables.length ? ` ${vegetables.map((item) => item.name).join("·")}: 손가락으로 눌러 으깨질 만큼 익혀요.` : ""}`
    : `${vegetables.map((item) => item.name).join("·") || "재료"}: 손가락으로 눌러 으깨질 만큼 부드럽게 익혀요.`;
  const serveStep = newIngredientId
    ? `새 재료 ${ingredients.find((item) => item.id === newIngredientId)?.name ?? "한 가지"}: 처음에는 소량을 ${servingMode === "섞은 죽" ? "익숙한 죽 한쪽에 얹어" : "분리해"} 반응을 구분하고, 나머지는 ‘${servingMode}’ 형태로 제공해요.`
    : `‘${servingMode}’ 형태로 놓고 무엇을 얼마나 먹을지는 아이가 결정하게 해요.`;
  return [baseStep, cookStep, serveStep, ...constraints.map((constraint) => `재료별 안전: ${constraint}`)];
}

function storageForProfile(profileStyle: BabyProfile["preparationStyle"]): string {
  if (profileStyle === "fresh") return "가능하면 바로 제공하고, 남은 음식과 아이가 먹던 음식은 다시 보관하지 않아요.";
  return "1회분씩 소분해 냉장 1~2일 또는 냉동 1~2주 안에 사용하고, 해동한 음식은 재냉동하지 않아요.";
}

function makeMeal(
  stage: Exclude<WeaningStage, "prestart">,
  index: number,
  time: string,
  ingredients: IngredientDefinition[],
  newIngredientId: string | null,
  textureMm: number,
  reasons: string[],
  preparationStyle: BabyProfile["preparationStyle"],
  template: StageMenuTemplate | null = null,
): PlannedMeal {
  const guide = getStageGuide(stage);
  const servingMode = template?.servingMode ?? guide.servingModes[(index - 1) % guide.servingModes.length];
  const newIngredient = ingredients.find((item) => item.id === newIngredientId);
  const title = template
    ? `${template.title}${newIngredient && !template.ingredientIds.includes(newIngredient.id) ? ` + ${newIngredient.name} 도입` : ""}`
    : mealTitle(stage, ingredients);
  const preparationSteps = preparationForMeal(stage, ingredients, servingMode, textureMm, newIngredientId);
  if (template) preparationSteps.unshift(menuInstruction(template.kind, textureMm));
  return {
    index,
    type: "meal",
    time,
    title,
    items: ingredients.map((item) => itemFor(item, newIngredientId)),
    servingGuide: `${guide.offerGramsRange[0]}~${guide.offerGramsRange[1]}g 범위에서 아이가 먹는 만큼`,
    textureGuide: `${textureMm}mm 안팎 · ${guide.textureDescription}`,
    servingMode,
    preparationSteps,
    storageGuide: storageForProfile(preparationStyle),
    reasons,
    bookReference: template?.sourcePage,
  };
}

function developmentTaskFor(profile: BabyProfile, stage: Exclude<WeaningStage, "prestart">): string {
  if (stage === "initial") return "숟가락과 질감에 편안하게 익숙해지는 경험을 우선해요.";
  if (!profile.skills?.fingerFood) return "부드러운 핑거푸드를 한 조각 놓아 손으로 잡아보게 해요.";
  if (!profile.skills?.cupPractice) return "식사 뒤 컵으로 물을 조금 마시는 연습을 해요.";
  if (!profile.skills?.spoonPractice) return "보호자용과 별도로 아기 손에 숟가락 하나를 쥐여줘요.";
  return stage === "completion"
    ? "가족과 함께 앉아 분리된 밥과 반찬 중 스스로 선택하게 해요."
    : "식품을 일부 분리해 보고 고르고 집는 기회를 주세요.";
}

function buildChecks(
  profile: BabyProfile,
  stage: Exclude<WeaningStage, "prestart">,
  plannedItems: PlannedMeal[],
  introductionGroups: Set<IntroductionGroup>,
  fishCountBeforeToday: number,
  textureMm: number,
): TargetCheck[] {
  const ingredients = plannedItems.flatMap((meal) => meal.items.map((item) => item.ingredient));
  const hasGroup = (...groups: FoodGroup[]) => ingredients.some((item) => item.foodGroup && groups.includes(item.foodGroup));
  const newCount = new Set(plannedItems.flatMap((meal) => meal.items.filter((item) => item.isNewExposure).map((item) => item.ingredient.id))).size;
  const fishToday = plannedItems.filter((meal) => meal.items.some((item) => item.ingredient.foodGroup === "fish")).length;
  const guide = getStageGuide(stage);
  const meatIntroduced = introductionGroups.has("meat");
  const checks: TargetCheck[] = [
    { id: "grain", label: "곡류", met: hasGroup("grain", "starchyFood"), detail: "매 끼의 기본 에너지 식품" },
    { id: "daily-meat", label: "매일 고기", met: !meatIntroduced || hasGroup("redMeat"), detail: meatIntroduced ? `하루 ${guide.meatGramsPerDay[0]}~${guide.meatGramsPerDay[1]}g 이상 목표` : "곡류 적응 뒤 시작" },
    { id: "new-food", label: "새 재료 한 가지", met: newCount <= 1, detail: newCount ? `${newCount}개 관찰 중` : "현재 관찰 재료 없음" },
    { id: "fish-cap", label: "생선 주 2회", met: fishCountBeforeToday + fishToday <= 2, detail: `최근 7일 ${fishCountBeforeToday + fishToday}/2회` },
    { id: "texture", label: "현재 질감", met: textureMm >= guide.textureMmRange[0], detail: `${textureMm}mm 안팎` },
  ];

  if (profile.milkMlPerDay != null) {
    const [minimumMilk, maximumMilk] = guide.milkMlRange;
    checks.push({
      id: "milk-flow",
      label: "하루 수유 흐름",
      met: profile.milkMlPerDay >= minimumMilk && profile.milkMlPerDay <= maximumMilk,
      detail: `${profile.milkMlPerDay}ml 기록 · 책 범위 ${minimumMilk}~${maximumMilk}ml`,
    });
  }

  if (introductionGroups.has("leafy")) checks.splice(2, 0, { id: "leafy", label: "이파리 채소", met: hasGroup("leafyVegetable"), detail: "초록색 채소 포함" });
  if (introductionGroups.has("yellow")) checks.splice(3, 0, { id: "yellow", label: "노란 채소", met: hasGroup("yellowVegetable"), detail: "노랑·주황색 채소 포함" });
  if (introductionGroups.has("fruit")) checks.splice(4, 0, { id: "fruit", label: "과일", met: hasGroup("fruit"), detail: "주스가 아닌 통과일 형태" });
  return checks;
}

export function createBookBasedDayPlan(
  profile: BabyProfile,
  definitions: IngredientDefinition[],
  states: ChildIngredientState[],
  history: MealHistoryEntry[],
  today = new Date(),
): DailyRecommendation {
  const stage = inferWeaningStage(profile);
  const guide = getStageGuide(stage);
  const passed = allowedPassedIngredients(profile, definitions, states, history, today);
  const currentTrial = chooseNextIngredient(profile, definitions, states, history, today);
  const currentState = states.find((state) => state.ingredientId === currentTrial?.id);
  const trialDay = currentTrial ? currentState?.testDay ?? 1 : null;
  const passedGroups = passedIntroductionGroups(definitions, states);
  const effectiveGroups = new Set(passedGroups);
  if (currentTrial) effectiveGroups.add(currentTrial.introductionGroup);

  const grains = byFoodGroup(passed, ["grain"]);
  const redMeats = byFoodGroup(passed, ["redMeat"]);
  const proteins = byFoodGroup(passed, ["redMeat", "poultry", "fish", "egg", "legume"]);
  const leafy = byFoodGroup(passed, ["leafyVegetable"]);
  const yellow = byFoodGroup(passed, ["yellowVegetable"]);
  const otherVegetables = byFoodGroup(passed, ["otherVegetable"]);
  const fruits = byFoodGroup(passed, ["fruit"]);
  const dairy = byFoodGroup(passed, ["dairy"]);
  const textureMm = textureForDay(profile, history, guide.textureMmRange[0], guide.textureMmRange[1]);
  const mealCount = Math.max(guide.mealRange[0], Math.min(guide.mealRange[1], profile.mealsPerDay));
  const mealTimes = resolveMealTimes(profile, mealCount);
  const fishCount = countRecentFish(definitions, history, today);
  const newId = currentTrial?.id ?? null;
  const meals: PlannedMeal[] = [];
  const selectedMenuIds = new Set<string>();

  for (let index = 1; index <= mealCount; index += 1) {
    const fishMealsAlreadyPlanned = meals.filter(
      (meal) => meal.items.some((item) => item.ingredient.foodGroup === "fish"),
    ).length;
    const availableProteins = proteins.filter(
      (item) => item.foodGroup !== "fish" || fishCount + fishMealsAlreadyPlanned < (item.frequencyCap7Days ?? 2),
    );
    const fishAllowed = fishCount + fishMealsAlreadyPlanned < 2;
    const templatePool = fishAllowed ? passed : passed.filter((item) => item.foodGroup !== "fish");
    const requireRedMeat = index === 1 && redMeats.length > 0;
    const template = selectStageMenu(stage, templatePool, history, today, index, requireRedMeat, selectedMenuIds);
    if (template) selectedMenuIds.add(template.id);
    const templateItems = template ? templateIngredients(template, templatePool) : [];
    const selected = template
      ? uniqueIngredients([
          ...templateItems,
          templateItems.some((item) => ["grain", "starchyFood"].includes(item.foodGroup ?? ""))
            ? null
            : chooseLeastRecent(grains, history, index - 1),
        ])
      : uniqueIngredients([
          chooseLeastRecent(grains, history, index - 1),
          chooseLeastRecent(index === 1 ? redMeats : availableProteins, history, index - 1),
          chooseLeastRecent(leafy, history, index - 1),
          chooseLeastRecent(yellow, history, index - 1),
          stage === "initial" ? null : chooseLeastRecent(otherVegetables, history, index - 1),
        ]);

    if (index === 1 && currentTrial && !selected.some((item) => item.id === currentTrial.id)) {
      selected.push(currentTrial);
    }

    if (!selected.length && currentTrial) selected.push(currentTrial);

    const reasons = [
      index === 1 && currentTrial
        ? `${currentTrial.name} ${trialDay}/${guide.newFoodIntervalDays[1]}일차예요. 새 재료만 추가하고 앞서 통과한 재료는 계속 유지했어요.`
        : template
          ? `${template.sourcePage}의 단계별 메뉴를 먹어본 재료와 최근 반복에 맞춰 골랐어요.`
          : "오늘의 식품군 균형과 최근 반복을 함께 보고 조합했어요.",
      redMeats.length || currentTrial?.foodGroup === "redMeat"
        ? `책의 매일 고기 원칙과 하루 ${guide.meatGramsPerDay[0]}~${guide.meatGramsPerDay[1]}g 이상 목표를 반영했어요.`
        : "아직 통과한 붉은 고기가 없어 도입 순서에서 우선 후보로 유지해요.",
      `현재 ${guide.label} 최소 질감에 맞춰 ${textureMm}mm 안팎으로 제안했어요.`,
    ];
    meals.push(makeMeal(stage, index, mealTimes[index - 1], selected, index === 1 ? newId : null, textureMm, reasons, profile.preparationStyle, template));
  }

  const requestedSnackCount = profile.snacksPerDay ?? guide.snackRange[0];
  const snackCount = Math.max(guide.snackRange[0], Math.min(guide.snackRange[1], requestedSnackCount));
  const snackTimes = resolveSnackTimes(mealTimes, snackCount);
  const snacks: PlannedMeal[] = [];
  for (let index = 1; index <= snackCount; index += 1) {
    const snackTemplates = stage === "initial"
      ? []
      : menusForStage(stage).filter((template) => template.kind === "snack"
        && template.ingredientIds.every((id) => passed.some((ingredient) => ingredient.id === id)));
    const snackTemplate = snackTemplates[(Number(isoDate(today).replaceAll("-", "")) + index - 1) % Math.max(1, snackTemplates.length)] ?? null;
    const snackTemplateItems = snackTemplate ? templateIngredients(snackTemplate, passed) : [];
    const snackIngredient = chooseLeastRecent(index % 2 === 0 && dairy.length ? dairy : fruits, history, index - 1);
    if (!snackTemplateItems.length && !snackIngredient) continue;
    const snackItems = snackTemplateItems.length ? snackTemplateItems : [snackIngredient!];
    snacks.push({
      index,
      type: "snack",
      time: snackTimes[index - 1],
      title: snackTemplate?.title ?? snackIngredient!.name,
      items: snackItems.map((ingredient) => itemFor(ingredient, null)),
      servingGuide: "다음 식사를 방해하지 않는 소량",
      textureGuide: snackItems.some((ingredient) => ingredient.category === "fruit") ? "즙이 아닌 부드러운 통과일 형태" : "무가당·무염 제품",
      servingMode: snackTemplate?.servingMode ?? (stage === "middle" ? "핑거푸드 또는 으깬 형태" : "간식 접시에 분리 제공"),
      preparationSteps: [
        snackTemplate ? menuInstruction(snackTemplate.kind, textureMm) : snackIngredient!.category === "fruit" ? "껍질·씨·단단한 부분을 제거하고 잇몸으로 으깨지는 형태로 준비해요." : "무가당·무염 제품인지 확인해요.",
        "식사를 대신하지 않는 소량을 간식 접시에 따로 놓아요.",
      ],
      storageGuide: "먹던 음식은 다시 보관하지 않고, 준비한 제품의 보관 표시를 따라요.",
      reasons: [snackTemplate ? `${snackTemplate.sourcePage}의 단계 간식 예시를 먹어본 재료로 구성했어요.` : "세 끼 사이의 작은 위 용량을 보완하되 식사량을 대신하지 않아요."],
      bookReference: snackTemplate?.sourcePage,
    });
  }

  const checks = buildChecks(profile, stage, [...meals, ...snacks], effectiveGroups, fishCount, textureMm);
  const condition = profile.temporaryCondition ?? "none";
  const safetyNotes = [
    "계란·고기·생선은 속까지 익히고, 단계보다 단단하거나 둥근 질식 위험 형태는 제외해요.",
    "제공량은 목표 범위이며 실제로 얼마나 먹을지는 아이가 결정해요.",
  ];
  if (condition !== "none") {
    const guidance = conditionGuidance[condition];
    safetyNotes.unshift(`${guidance.title}: ${guidance.recommendation}`);
  }

  return {
    date: isoDate(today),
    stage,
    stageLabel: guide.label,
    currentTrial,
    trialDay,
    meals,
    snacks,
    checks,
    safetyNotes,
    developmentTask: developmentTaskFor(profile, stage),
    summaryReasons: [
      currentTrial
        ? `${introductionLabels[currentTrial.introductionGroup]} 도입 상태와 관찰 간격을 가장 먼저 반영했어요.`
        : "현재 도입할 수 있는 새 재료보다 먹어본 재료의 균형을 우선했어요.",
      "하루 전체의 곡류·고기·채소·과일 균형과 최근 7일 빈도를 확인했어요.",
      "월령만이 아니라 현재 질감 능력과 식사 기술을 함께 반영했어요.",
    ],
    recommendationVersion: RECOMMENDATION_VERSION,
  };
}

export function createInitialMealSuggestion(
  profile: BabyProfile,
  definitions: IngredientDefinition[],
  states: ChildIngredientState[],
  history: MealHistoryEntry[],
): MealSuggestion {
  const initialProfile: BabyProfile = {
    ...profile,
    stage: "initial",
    ageMonths: Math.max(6, profile.ageMonths),
    correctedAgeMonths: Math.max(6, profile.correctedAgeMonths ?? profile.ageMonths),
    mealsPerDay: 1,
    snacksPerDay: 0,
  };
  const plan = createBookBasedDayPlan(initialProfile, definitions, states, history);
  const meal = plan.meals[0];
  const ingredients = meal.items.map((item) => item.ingredient);

  return {
    title: meal.title,
    mealTime: meal.time,
    servingGuide: "한두 숟가락부터, 아이가 먹는 만큼",
    textureGuide: getStageGuide("initial").textureDescription,
    ingredients,
    testLabel: plan.currentTrial ? `${introductionLabels[plan.currentTrial.introductionGroup]} ${plan.trialDay}/3일` : null,
    reasons: [
      "책의 첫 식품군 순서와 새 재료 관찰 규칙을 적용했어요. 첫 3일은 쌀부터 시작해요.",
      "새 재료를 열 때는 앞서 통과한 재료를 빼지 않고 한 가지씩 계속 더해요.",
      "먹는 양보다 숟가락과 새로운 질감에 익숙해지는 경험을 우선해요.",
    ],
  };
}
