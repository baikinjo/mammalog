export type WeaningStage =
  | "prestart"
  | "initial"
  | "middle"
  | "late"
  | "completion";

export type IngredientCategory =
  | "grain"
  | "meat"
  | "vegetable"
  | "fruit"
  | "fish"
  | "seaweed"
  | "dairy"
  | "egg"
  | "beans"
  | "nutsOil";

export type IntroductionGroup =
  | "grain"
  | "meat"
  | "leafy"
  | "yellow"
  | "fruit"
  | "other";

export type IngredientStatus =
  | "locked"
  | "ready"
  | "testing"
  | "passed"
  | "rejected"
  | "paused"
  | "avoid";

export interface BabyProfile {
  id: string;
  nickname: string;
  stage: WeaningStage;
  ageMonths: number;
  mealsPerDay: number;
  preferredMealTime: string;
  textureMm: number;
  preparationStyle: "cube" | "fresh" | "batch" | "mixed";
}

export interface IngredientDefinition {
  id: string;
  name: string;
  emoji: string;
  assetId?: string;
  category: IngredientCategory;
  introductionGroup: IntroductionGroup;
  minimumStage: WeaningStage;
  introductionPriority: number;
}

export interface ChildIngredientState {
  ingredientId: string;
  status: IngredientStatus;
  testDay: number | null;
  exposureCount: number;
  lastOfferedAt: string | null;
}

export interface MealHistoryEntry {
  servedAt: string;
  ingredientIds: string[];
  completion: "none" | "taste" | "quarter" | "half" | "most" | "all";
}

export interface MealSuggestion {
  title: string;
  mealTime: string;
  servingGuide: string;
  textureGuide: string;
  ingredients: IngredientDefinition[];
  testLabel: string | null;
  reasons: string[];
}
