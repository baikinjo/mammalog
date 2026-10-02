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

export type FoodGroup =
  | "grain"
  | "redMeat"
  | "poultry"
  | "fish"
  | "egg"
  | "legume"
  | "leafyVegetable"
  | "yellowVegetable"
  | "otherVegetable"
  | "starchyFood"
  | "fruit"
  | "dairy"
  | "fat";

export type IntroductionGroup =
  | "grain"
  | "meat"
  | "leafy"
  | "yellow"
  | "fruit"
  | "other";

export type AllergenGroup =
  | "egg"
  | "milk"
  | "soy"
  | "wheat"
  | "peanut"
  | "crustacean"
  | "peach";

export type IngredientStatus =
  | "locked"
  | "ready"
  | "testing"
  | "passed"
  | "rejected"
  | "paused"
  | "suspectedReaction"
  | "avoid";

export type TemporaryCondition =
  | "none"
  | "cold"
  | "diarrhea"
  | "constipation"
  | "mouthPain";

export type RuleLayer =
  | "safety"
  | "introduction"
  | "nutrition"
  | "texture"
  | "behavior"
  | "storage"
  | "condition";

export type RuleStrength =
  | "hard"
  | "repeatedExplicit"
  | "direct"
  | "productDerived";

export interface ReadinessSignals {
  tongueThrustGone: boolean;
  headControl: boolean;
  sitsWithSupport: boolean;
  foodInterest: boolean;
}

export interface DevelopmentSkills {
  handlesCurrentTexture: boolean;
  reachesAndGrasps: boolean;
  fingerFood: boolean;
  spoonPractice: boolean;
  cupPractice: boolean;
}

export interface BabyProfile {
  id: string;
  nickname: string;
  stage: WeaningStage;
  ageMonths: number;
  correctedAgeMonths?: number | null;
  birthDate?: string;
  weaningStartDate?: string | null;
  readiness?: ReadinessSignals;
  mealsPerDay: number;
  snacksPerDay?: number;
  preferredMealTime: string;
  mealTimes?: string[];
  milkMlPerDay?: number | null;
  textureMm: number;
  preparationStyle: "cube" | "fresh" | "batch" | "mixed";
  temporaryCondition?: TemporaryCondition;
  skills?: DevelopmentSkills;
}

export interface StageGuide {
  stage: Exclude<WeaningStage, "prestart">;
  label: string;
  ageMonths: readonly [number, number];
  milkMlRange: readonly [number, number];
  mealRange: readonly [number, number];
  snackRange: readonly [number, number];
  offerGramsRange: readonly [number, number];
  meatGramsPerDay: readonly [number, number];
  textureMmRange: readonly [number, number];
  textureDescription: string;
  grainDescription: string;
  newFoodIntervalDays: readonly [number, number];
  servingModes: string[];
  developmentGoals: string[];
  sourcePages: string[];
}

export interface IngredientDefinition {
  id: string;
  name: string;
  emoji: string;
  assetId?: string;
  category: IngredientCategory;
  foodGroup?: FoodGroup;
  introductionGroup: IntroductionGroup;
  minimumStage: Exclude<WeaningStage, "prestart">;
  minimumAgeMonths?: number;
  introductionPriority: number;
  color?: string;
  allergen?: boolean;
  allergenGroup?: AllergenGroup;
  frequencyCap7Days?: number;
  preparationConstraints?: string[];
  chokingFormBlacklist?: string[];
  bookGuidance?: string;
  sourcePages?: string[];
  tags?: string[];
}

export interface ChildIngredientState {
  ingredientId: string;
  status: IngredientStatus;
  testDay: number | null;
  exposureCount: number;
  firstOfferedAt?: string | null;
  lastOfferedAt: string | null;
  acceptedTextureMm?: number[];
  lastReaction?: string | null;
}

export interface MealHistoryEntry {
  servedAt: string;
  ingredientIds: string[];
  completion: "none" | "taste" | "quarter" | "half" | "most" | "all";
  mealType?: "meal" | "snack";
  textureMm?: number;
  offeredGrams?: number;
  reaction?: "none" | "tasteRejection" | "textureDifficulty" | "needsReview";
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

export interface BookRule {
  id: string;
  layer: RuleLayer;
  strength: RuleStrength;
  title: string;
  description: string;
  sourcePages: string[];
  overridableBy?: "parent" | "clinician" | "never";
}

export interface MealPlanItem {
  ingredient: IngredientDefinition;
  role: "base" | "protein" | "vegetable" | "fruit" | "new" | "snack";
  isNewExposure: boolean;
}

export interface PlannedMeal {
  index: number;
  type: "meal" | "snack";
  /**
   * Stable id of this composition; the same inputs always produce the same id. Recorded meals use
   * `recorded:<index>` and meals with no safe food to offer use `hold:<index>`.
   */
  optionId: string;
  time: string;
  title: string;
  items: MealPlanItem[];
  servingGuide: string;
  textureGuide: string;
  /** Left out only for a recorded meal whose record never stored a texture. */
  textureMm?: number;
  servingMode: string;
  preparationSteps: string[];
  storageGuide: string;
  reasons: string[];
  bookReference?: string;
  /** Other eligible compositions for the same meal, ranked after this default. */
  alternatives?: PlannedMeal[];
}

/**
 * A meal already recorded for the plan date, so the rest of the day is planned around it. The optional fields are
 * what the record stored; the plan shows them as they are and leaves out anything an older record never stored.
 */
export interface RecordedMeal {
  index: number;
  ingredientIds: string[];
  newExposureIngredientId?: string | null;
  reaction?: MealHistoryEntry["reaction"];
  title?: string;
  time?: string;
  textureMm?: number | null;
  servingGuide?: string | null;
  textureGuide?: string | null;
  servingMode?: string | null;
  reasons?: string[];
}

export interface BookMenuPreview {
  menuId: string;
  title: string;
  sourcePage: string;
  ingredientIds: string[];
}

/** An ingredient that could be introduced after the current observation and the book menus it would open. */
export interface NextAddition {
  ingredient: IngredientDefinition;
  unlocks: BookMenuPreview[];
}

export interface DailyRoutineLog {
  childId: string;
  date: string;
  milkMl: number | null;
  snackCount: number;
  cupPractice: boolean;
  spoonPractice: boolean;
  fingerFood: boolean;
  note: string;
  updatedBy?: string | null;
  updatedAt?: string | null;
}

export type AdaptiveTone = "positive" | "attention" | "neutral";

export interface AdaptiveAdjustment {
  id: string;
  title: string;
  detail: string;
  tone: AdaptiveTone;
}

export interface ProgressionProposal {
  action: "advance" | "hold" | "simplify" | "review";
  title: string;
  detail: string;
  targetStage?: Exclude<WeaningStage, "prestart">;
  targetTextureMm: number;
  reasons: string[];
  requiresParentConfirmation: true;
}

export interface AdaptiveReview {
  adjustments: AdaptiveAdjustment[];
  progression: ProgressionProposal;
}

export interface TargetCheck {
  id: string;
  label: string;
  met: boolean;
  detail: string;
}

export interface DailyRecommendation {
  date: string;
  stage: Exclude<WeaningStage, "prestart">;
  stageLabel: string;
  currentTrial: IngredientDefinition | null;
  trialDay: number | null;
  meals: PlannedMeal[];
  snacks: PlannedMeal[];
  checks: TargetCheck[];
  safetyNotes: string[];
  developmentTask: string;
  summaryReasons: string[];
  nextAdditions: NextAddition[];
  recommendationVersion: string;
}
