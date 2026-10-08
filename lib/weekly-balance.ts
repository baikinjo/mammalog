import { getStageGuide } from "./book-knowledge";
import type {
  BabyProfile,
  ChildIngredientState,
  FoodGroup,
  IngredientDefinition,
  IntroductionGroup,
  MealHistoryEntry,
} from "./domain";
import { inferWeaningStage } from "./recommendation-engine";

export type WeeklyBalanceStatus = "met" | "attention" | "neutral" | "locked";

export interface WeeklyBalanceMetric {
  id: string;
  label: string;
  value: string;
  detail: string;
  status: WeeklyBalanceStatus;
}

export interface WeeklyBalanceSummary {
  startDate: string;
  endDate: string;
  recordedDays: number;
  recordedMeals: number;
  metrics: WeeklyBalanceMetric[];
  focus: string;
  variety: string;
}

const activeStatuses = new Set<ChildIngredientState["status"]>(["testing", "passed"]);

function dateId(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function localDay(value: string): string {
  return dateId(new Date(value));
}

function coverageMetric(
  id: string,
  label: string,
  active: boolean,
  coveredDays: number,
  recordedDays: number,
): WeeklyBalanceMetric {
  if (!active) {
    return { id, label, value: "도입 전", detail: "도입 순서에 맞춰 열려요", status: "locked" };
  }
  if (!recordedDays) {
    return { id, label, value: "기록 전", detail: "식사 기록 후 계산", status: "neutral" };
  }
  return {
    id,
    label,
    value: `${coveredDays}/${recordedDays}일`,
    detail: "기록이 있는 날 기준",
    status: coveredDays >= recordedDays ? "met" : "attention",
  };
}

function hasFoodGroup(ingredient: IngredientDefinition | undefined, groups: FoodGroup[]): boolean {
  return Boolean(ingredient?.foodGroup && groups.includes(ingredient.foodGroup));
}

/**
 * `recordDefinitions` name every food the history may hold, also foods the family has since removed from its list; they
 * only classify what was eaten (food groups and fish meals). Which food groups are open follows `definitions`.
 */
export function createWeeklyBalance(
  profile: BabyProfile,
  definitions: IngredientDefinition[],
  states: ChildIngredientState[],
  history: MealHistoryEntry[],
  anchor = new Date(),
  recordDefinitions: IngredientDefinition[] = definitions,
): WeeklyBalanceSummary {
  const end = new Date(anchor);
  end.setHours(23, 59, 59, 999);
  const start = new Date(end);
  start.setDate(start.getDate() - 6);
  start.setHours(0, 0, 0, 0);

  const entries = history.filter((entry) => {
    const servedAt = new Date(entry.servedAt);
    return servedAt >= start && servedAt <= end;
  });
  const mealEntries = entries.filter((entry) => entry.mealType !== "snack");
  const recordedDayIds = new Set(mealEntries.map((entry) => localDay(entry.servedAt)));
  const ingredientById = new Map(recordDefinitions.map((ingredient) => [ingredient.id, ingredient]));
  const stateById = new Map(states.map((state) => [state.ingredientId, state]));
  const openGroups = new Set<IntroductionGroup>(
    definitions
      .filter((ingredient) => activeStatuses.has(stateById.get(ingredient.id)?.status ?? "locked"))
      .map((ingredient) => ingredient.introductionGroup),
  );

  const daysWith = (groups: FoodGroup[]) => new Set(
    entries
      .filter((entry) => entry.ingredientIds.some((id) => hasFoodGroup(ingredientById.get(id), groups)))
      .map((entry) => localDay(entry.servedAt)),
  ).size;

  const grainDays = daysWith(["grain", "starchyFood"]);
  const meatDays = daysWith(["redMeat"]);
  const leafyDays = daysWith(["leafyVegetable"]);
  const yellowDays = daysWith(["yellowVegetable"]);
  const fruitDays = daysWith(["fruit"]);
  const fishMeals = mealEntries.filter((entry) => entry.ingredientIds.some(
    (id) => ingredientById.get(id)?.foodGroup === "fish",
  )).length;

  const stage = inferWeaningStage(profile);
  const guide = getStageGuide(stage);
  const textureValues = mealEntries
    .map((entry) => entry.textureMm)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  const maximumTexture = textureValues.length ? Math.max(...textureValues) : null;
  const recordedDays = recordedDayIds.size;
  const hasStarted = profile.stage !== "prestart";
  const grainOpen = hasStarted || openGroups.has("grain");

  const metrics: WeeklyBalanceMetric[] = [
    coverageMetric("grain", "곡류", grainOpen, grainDays, recordedDays),
    coverageMetric("meat", "매일 고기", openGroups.has("meat"), meatDays, recordedDays),
    coverageMetric("leafy", "이파리 채소", openGroups.has("leafy"), leafyDays, recordedDays),
    coverageMetric("yellow", "노란 채소", openGroups.has("yellow"), yellowDays, recordedDays),
    coverageMetric("fruit", "과일", openGroups.has("fruit"), fruitDays, recordedDays),
    {
      id: "fish",
      label: "생선 상한",
      value: `${fishMeals}/2회`,
      detail: "최근 7일 최대 2회",
      status: fishMeals <= 2 ? "met" : "attention",
    },
    maximumTexture == null
      ? { id: "texture", label: "현재 질감", value: "기록 전", detail: `${guide.label} 최소 ${guide.textureMmRange[0]}mm`, status: "neutral" }
      : {
          id: "texture",
          label: "현재 질감",
          value: `${maximumTexture}mm`,
          detail: `${guide.label} 최소 ${guide.textureMmRange[0]}mm`,
          status: maximumTexture >= guide.textureMmRange[0] ? "met" : "attention",
        },
  ];

  const proteinIds = new Set<string>();
  const vegetableIds = new Set<string>();
  const vegetableColors = new Set<string>();
  entries.forEach((entry) => entry.ingredientIds.forEach((id) => {
    const ingredient = ingredientById.get(id);
    if (!ingredient) return;
    if (["redMeat", "poultry", "fish", "egg", "legume"].includes(ingredient.foodGroup ?? "")) proteinIds.add(id);
    if (["leafyVegetable", "yellowVegetable", "otherVegetable"].includes(ingredient.foodGroup ?? "")) {
      vegetableIds.add(id);
      if (ingredient.color) vegetableColors.add(ingredient.color);
    }
  }));

  let focus = "기록이 쌓이면 다음에 보완할 식품군을 알려드려요.";
  if (recordedDays) {
    if (fishMeals > 2) focus = "이번 7일은 생선이 2회를 넘었어요. 다음 식사는 고기·계란·두부처럼 이미 통과한 다른 단백질을 사용하세요.";
    else if (grainOpen && grainDays < recordedDays) focus = "곡류가 빠진 기록이 있어요. 다음 식사의 기본 에너지 식품부터 채워주세요.";
    else if (openGroups.has("meat") && meatDays < recordedDays) focus = "고기가 빠진 날이 있어요. 다음 식사에는 기름을 제거한 살코기를 포함하세요.";
    else if (openGroups.has("leafy") && leafyDays < recordedDays) focus = "이파리 채소가 빠진 날이 있어요. 다음 식사에는 익숙한 초록 채소를 더해보세요.";
    else if (openGroups.has("yellow") && yellowDays < recordedDays) focus = "노란 채소가 빠진 날이 있어요. 다음 식사에는 익숙한 노랑·주황 채소를 더해보세요.";
    else if (openGroups.has("fruit") && fruitDays < recordedDays) focus = "과일이 빠진 날이 있어요. 즙이 아닌 부드러운 통과일 형태로 소량 더해보세요.";
    else if (maximumTexture != null && maximumTexture < guide.textureMmRange[0]) focus = `${guide.label} 최소 질감보다 낮게 기록됐어요. 아이가 편안해하면 입자를 조금씩 키워보세요.`;
    else focus = "기록된 날의 핵심 식품군이 고르게 채워졌어요. 같은 재료만 반복되지 않게 종류와 색을 돌려보세요.";
  }

  return {
    startDate: dateId(start),
    endDate: dateId(end),
    recordedDays,
    recordedMeals: mealEntries.length,
    metrics,
    focus,
    variety: `단백질 ${proteinIds.size}종 · 채소 ${vegetableIds.size}종${vegetableColors.size ? ` · ${vegetableColors.size}색` : ""}`,
  };
}
