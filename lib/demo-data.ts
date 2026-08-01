import type {
  BabyProfile,
  ChildIngredientState,
  MealHistoryEntry,
} from "./domain";
import { ingredientCatalog } from "./ingredient-catalog";

export const demoProfile: BabyProfile = {
  id: "demo-child",
  nickname: "우리 아기",
  stage: "prestart",
  ageMonths: 4,
  mealsPerDay: 1,
  preferredMealTime: "10:00",
  textureMm: 0,
  preparationStyle: "cube",
  weaningStartDate: null,
  readiness: {
    tongueThrustGone: false,
    headControl: true,
    sitsWithSupport: false,
    foodInterest: false,
  },
  temporaryCondition: "none",
};

export const ingredientDefinitions = ingredientCatalog;

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
