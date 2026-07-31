import type {
  BabyProfile,
  ChildIngredientState,
  IngredientDefinition,
  MealHistoryEntry,
} from "./domain";

export const demoProfile: BabyProfile = {
  id: "demo-child",
  nickname: "우리 아기",
  stage: "prestart",
  ageMonths: 4,
  mealsPerDay: 1,
  preferredMealTime: "10:00",
  textureMm: 0,
  preparationStyle: "cube",
};

export const ingredientDefinitions: IngredientDefinition[] = [
  {
    id: "rice",
    name: "쌀",
    emoji: "🍚",
    category: "grain",
    minimumStage: "initial",
    introductionPriority: 1,
  },
  {
    id: "oatmeal",
    name: "오트밀",
    emoji: "🌾",
    category: "grain",
    minimumStage: "initial",
    introductionPriority: 2,
  },
  {
    id: "beef",
    name: "소고기",
    emoji: "🥩",
    category: "meat",
    minimumStage: "initial",
    introductionPriority: 3,
  },
  {
    id: "cabbage",
    name: "양배추",
    emoji: "🥬",
    category: "leafy",
    minimumStage: "initial",
    introductionPriority: 4,
  },
  {
    id: "bokchoy",
    name: "청경채",
    emoji: "🌿",
    category: "leafy",
    minimumStage: "initial",
    introductionPriority: 5,
  },
  {
    id: "pumpkin",
    name: "단호박",
    emoji: "🎃",
    category: "yellow",
    minimumStage: "initial",
    introductionPriority: 6,
  },
  {
    id: "zucchini",
    name: "애호박",
    emoji: "🥒",
    category: "yellow",
    minimumStage: "initial",
    introductionPriority: 7,
  },
  {
    id: "apple",
    name: "사과",
    emoji: "🍎",
    category: "fruit",
    minimumStage: "initial",
    introductionPriority: 8,
  },
];

export const demoIngredientStates: ChildIngredientState[] = [
  {
    ingredientId: "rice",
    status: "testing",
    testDay: 1,
    exposureCount: 0,
    lastOfferedAt: null,
  },
  {
    ingredientId: "oatmeal",
    status: "ready",
    testDay: null,
    exposureCount: 0,
    lastOfferedAt: null,
  },
];

export const demoHistory: MealHistoryEntry[] = [];

