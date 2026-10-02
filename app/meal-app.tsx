"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  ArrowLeft,
  Baby,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Download,
  Link2,
  LogOut,
  Mail,
  House,
  Info,
  Plus,
  RotateCcw,
  Sprout,
  Trash2,
  UserMinus,
  X,
} from "lucide-react";
import {
  demoProfile,
  ingredientDefinitions,
} from "../lib/demo-data";
import { getStageGuide } from "../lib/book-knowledge";
import {
  applyEditedTrialOutcome,
  applyRepeatedTrialReaction,
  applyTrialOutcome,
  createBookBasedDayPlan,
  createInitialMealSuggestion,
  hasStartReadiness,
  isHeldMeal,
  isRecordedMeal,
  mealOptions,
  resolveMealTimes,
  type TrialOutcome,
} from "../lib/recommendation-engine";
import type {
  AllergenGroup,
  BabyProfile,
  ChildIngredientState,
  DailyRoutineLog,
  DailyRecommendation,
  DevelopmentSkills,
  FoodGroup,
  IngredientCategory,
  IngredientDefinition,
  IntroductionGroup,
  MealHistoryEntry,
  MealSuggestion,
  PlannedMeal,
  ProgressionProposal,
  ReadinessSignals,
  RecordedMeal,
  TemporaryCondition,
  WeaningStage,
} from "../lib/domain";
import {
  archiveCustomIngredient,
  createFamilyInvite,
  createFamilyWorkspace,
  deleteMyAccount,
  ensureDefaultChild,
  joinFamilyWithCode,
  loadCustomIngredients,
  loadDailyRecommendation,
  loadDailyRoutineLogs,
  loadFamilyMealRecords,
  loadRecommendationInputs,
  removeFamilyMember,
  resetChildProgress,
  loadFamilyWorkspace,
  saveChildIngredientState,
  saveChildProfile,
  saveCustomIngredient,
  saveDailyRecommendation,
  saveDailyRoutineLog,
  saveFamilyMealRecord,
  updateCustomIngredient,
  updateFamilyMealRecord,
  sendFamilyLoginEmail,
  verifyFamilyEmailCode,
  signInFamilyWithPassword,
  setFamilyPassword,
  linkFamilyAccountEmail,
  refreshFamilySession,
  signInFamilyAnonymously,
  signOutFamily,
  type FamilyMealReaction,
  type FamilyMealRecord,
  type FamilyMember,
  type FamilyWorkspace,
} from "../lib/family-repository";
import { getSupabaseClient, isSupabaseConfigured } from "../lib/supabase-client";
import { createWeeklyBalance } from "../lib/weekly-balance";
import { createAdaptiveReview } from "../lib/adaptive-review";

type Tab = "today" | "ingredients" | "records" | "profile";
type Amount = "taste" | "quarter" | "half" | "most";
type SettingKey = "start" | "time" | "style";
type ChoiceSettingKey = Exclude<SettingKey, "time">;
type RecordDraft = { amount: Amount; reaction: FamilyMealReaction; note: string };
type DataControlAction = "resetProgress" | "deleteAccount";
/** A menu chosen for one unrecorded meal; it only applies to the same child, date and meal. */
type MealChoice = { childId: string; date: string; mealIndex: number; optionId: string };
/**
 * What the open record sheet will write, captured when it opened. A save goes only to this family, account,
 * child, date and meal; a new record writes exactly `meal`, and an edit only touches the record `mealPlanId`.
 */
type RecordTarget = {
  childId: string | null;
  householdId: string | null;
  userId: string | null;
  date: string;
  mealIndex: number;
  meal: PlannedMeal | null;
  stage: Exclude<WeaningStage, "prestart"> | null;
  mealPlanId: string | null;
};

const STALE_MEAL_CHOICE_NOTICE = "고른 메뉴가 새 기록이나 반응·설정 변경으로 지금은 맞지 않아 기본 추천으로 돌아왔어요.";
const STALE_RECORD_NOTICE = "새 기록이나 반응·설정 변경으로 기록하려던 식사 내용이 바뀌었어요. 바뀐 추천을 확인한 뒤 다시 기록해주세요.";
const DAY_SNAPSHOT_NOT_SAVED_NOTICE = "식사 기록은 저장했지만 이날 추천 내역은 저장하지 못했어요. 같은 식사를 다시 기록하지 않아도 돼요.";

type CalendarDay = {
  id: string;
  day: number;
  label: string;
};

type CalendarCursor = { year: number; month: number };

const amountLabels: Record<Amount, string> = {
  taste: "맛만 봄",
  quarter: "조금",
  half: "절반",
  most: "대부분",
};

const completionLabels: Record<FamilyMealRecord["completion"], string> = {
  none: "먹지 않음",
  taste: "맛만 봄",
  quarter: "조금",
  half: "절반",
  most: "대부분",
  all: "모두 먹음",
};

const reactionLabels: Record<FamilyMealReaction, string> = {
  none: "특별한 반응 없음",
  taste_rejection: "맛을 거부함",
  texture_difficulty: "질감이 어려웠음",
  needs_review: "확인 필요",
};

const trialOutcomeByReaction: Record<FamilyMealReaction, TrialOutcome> = {
  none: "accepted",
  taste_rejection: "tasteRejected",
  texture_difficulty: "textureDifficulty",
  needs_review: "suspectedReaction",
};

const historyReactionByReaction: Record<FamilyMealReaction, NonNullable<MealHistoryEntry["reaction"]>> = {
  none: "none",
  taste_rejection: "tasteRejection",
  texture_difficulty: "textureDifficulty",
  needs_review: "needsReview",
};

const ingredientStatusLabels: Record<ChildIngredientState["status"], string> = {
  locked: "아직 잠김",
  ready: "미도입",
  testing: "도입 중",
  passed: "통과",
  rejected: "맛 거부 기록",
  paused: "잠시 보류",
  suspectedReaction: "반응 확인 필요",
  avoid: "제외 중",
};

function familyAuthMessage(error: unknown, fallback: string): string {
  const code = (error as { code?: string } | null)?.code;
  if (code === "over_email_send_rate_limit") {
    return "무료 메일 발송 한도를 넘었어요. 잠시 기다리거나 ‘이 기기 바로 연결’을 이용해주세요.";
  }
  if (code === "email_address_not_authorized") {
    return "Supabase 기본 메일은 프로젝트 팀에 등록된 주소에만 보낼 수 있어요. 팀 주소를 사용하거나 custom SMTP를 설정해주세요.";
  }
  if (code === "anonymous_provider_disabled") {
    return "Supabase에서 익명 로그인을 한 번 켜야 해요. Authentication → Providers → Anonymous에서 활성화해주세요.";
  }
  if (code === "manual_linking_disabled") {
    return "Supabase에서 수동 계정 연결을 켜야 기존 가족 계정을 이메일에 연결할 수 있어요. Authentication → Providers에서 Manual Linking을 활성화해주세요.";
  }
  if (code === "identity_already_exists" || code === "email_exists") {
    return "이 이메일은 이미 다른 계정에 연결돼 있어요. 현재 가족 계정에서 초대 코드를 만든 뒤 기존 이메일 계정으로 로그인해 참여해주세요.";
  }
  return fallback;
}

function dataControlMessage(error: unknown, fallback: string): string {
  const message = error instanceof Error
    ? error.message
    : (error as { message?: string } | null)?.message ?? String(error);
  if (/reset_child_progress|delete_my_account|remove_household_member|schema cache|function.*does not exist/i.test(message)) {
    return "Supabase에서 데이터 관리 SQL을 한 번 실행해야 해요.";
  }
  if (/owner can reset shared progress/i.test(message)) {
    return "보호자 모두 초기화하려면 Supabase에서 shared_progress_reset.sql을 한 번 실행해야 해요.";
  }
  if (/family members can reset/i.test(message)) {
    return "이 가족 공간에 연결된 보호자만 진행 기록을 초기화할 수 있어요.";
  }
  if (/household owner|가족 관리자/i.test(message)) {
    return "공유 데이터 관리는 가족 관리자 계정에서만 할 수 있어요.";
  }
  return fallback;
}

const weekdayLabels = ["일", "월", "화", "수", "목", "금", "토"];
const weekdayLongLabels = ["일요일", "월요일", "화요일", "수요일", "목요일", "금요일", "토요일"];

const ingredientAssetPaths: Record<string, string> = {
  rice: "/ingredients/rice.png",
  oatmeal: "/ingredients/oatmeal.png",
  beef: "/ingredients/beef.png",
  cabbage: "/ingredients/cabbage.png",
  bokchoy: "/ingredients/bokchoy.png",
  pumpkin: "/ingredients/pumpkin.png",
  zucchini: "/ingredients/zucchini.png",
  apple: "/ingredients/apple.png",
  pork: "/ingredients/pork.png",
  chicken: "/ingredients/chicken.png",
  broccoli: "/ingredients/broccoli.png",
  carrot: "/ingredients/carrot.png",
  "sweet-potato": "/ingredients/sweet-potato.png",
  whitefish: "/ingredients/whitefish.png",
  egg: "/ingredients/egg.png",
  tofu: "/ingredients/tofu.png",
  legumes: "/ingredients/legumes.png",
  kelp: "/ingredients/kelp.png",
  yogurt: "/ingredients/yogurt.png",
  "peanut-butter": "/ingredients/peanut-butter.png",
};

const categoryLabels: Record<IngredientCategory, string> = {
  grain: "곡류",
  meat: "육류",
  vegetable: "채소",
  fruit: "과일",
  fish: "생선",
  seaweed: "해조류",
  dairy: "유제품",
  egg: "계란",
  beans: "콩류",
  nutsOil: "견과류·유지류",
};

const categoryOrder = Object.keys(categoryLabels) as IngredientCategory[];

const introductionGroupByCategory: Record<IngredientCategory, IntroductionGroup> = {
  grain: "grain",
  meat: "meat",
  vegetable: "leafy",
  fruit: "fruit",
  fish: "other",
  seaweed: "other",
  dairy: "other",
  egg: "other",
  beans: "other",
  nutsOil: "other",
};

const foodGroupByCategory: Record<IngredientCategory, FoodGroup> = {
  grain: "grain",
  meat: "redMeat",
  vegetable: "otherVegetable",
  fruit: "fruit",
  fish: "fish",
  seaweed: "otherVegetable",
  dairy: "dairy",
  egg: "egg",
  beans: "legume",
  nutsOil: "fat",
};

function customIngredientTraits(category: IngredientCategory, assetId: string) {
  const template = ingredientDefinitions.find((ingredient) => ingredient.id === assetId);
  return {
    foodGroup: template?.foodGroup ?? foodGroupByCategory[category],
    introductionGroup: template?.introductionGroup ?? introductionGroupByCategory[category],
    minimumStage: template?.minimumStage ?? "initial",
    minimumAgeMonths: template?.minimumAgeMonths ?? 6,
    color: template?.color,
    allergen: template?.allergen,
    allergenGroup: template?.allergenGroup,
    frequencyCap7Days: template?.frequencyCap7Days,
    preparationConstraints: template?.preparationConstraints ?? [],
    chokingFormBlacklist: template?.chokingFormBlacklist ?? [],
    tags: template?.tags ?? [],
  } satisfies Partial<IngredientDefinition>;
}

const introductionGroupLabels: Record<IntroductionGroup, string> = {
  grain: "곡류",
  meat: "고기",
  leafy: "이파리 채소",
  yellow: "노란 채소",
  fruit: "과일",
  other: "다양화 재료",
};

const stageLabels = {
  initial: "초기",
  middle: "중기",
  late: "후기",
  completion: "완료기",
};

const allergenGroupLabels: Record<AllergenGroup, string> = {
  egg: "계란",
  milk: "우유",
  soy: "대두",
  wheat: "밀",
  peanut: "땅콩",
  crustacean: "새우",
  peach: "복숭아",
};

const ingredientStageRank: Record<Exclude<WeaningStage, "prestart">, number> = {
  initial: 1,
  middle: 2,
  late: 3,
  completion: 4,
};

function toDateId(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseDateId(dateId: string) {
  const [year, month, day] = dateId.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function planDateFor(todayId: string) {
  const now = new Date();
  return toDateId(now) === todayId ? now : parseDateId(todayId);
}

function recordedMealsOn(records: FamilyMealRecord[], date: string): RecordedMeal[] {
  return records
    .filter((record) => record.date === date)
    .map((record) => ({
      index: record.mealIndex,
      ingredientIds: record.ingredientIds,
      newExposureIngredientId: record.newExposureIngredientId,
      reaction: historyReactionByReaction[record.reaction],
      title: record.title,
      time: record.plannedTime,
      textureMm: record.textureMm,
      servingGuide: record.servingGuide,
      textureGuide: record.textureGuide,
      servingMode: record.servingMode,
      reasons: record.recommendationReasons,
    }));
}

/** Everything about a meal that is shown before recording it or saved with it; its alternatives are left out. */
function savedMealKey(meal: PlannedMeal): string {
  return JSON.stringify([
    meal.index,
    meal.optionId,
    meal.title,
    meal.time,
    meal.textureMm ?? null,
    meal.servingGuide,
    meal.textureGuide,
    meal.servingMode,
    meal.preparationSteps,
    meal.storageGuide,
    meal.reasons,
    meal.bookReference ?? null,
    meal.items.map((item) => [item.ingredient.id, item.ingredient.name, item.role, item.isNewExposure]),
  ]);
}

/**
 * Whether a stored day-snapshot meal is the meal recorded in that slot: every field the record stores (title, time,
 * items with the new-food marker, texture, guides, serving mode and reasons) must agree. A field an older record never
 * stored is blank on the recorded side, so a snapshot that fills it in is not taken as what was recorded.
 */
function storedMealMatchesRecord(stored: PlannedMeal, recorded: PlannedMeal): boolean {
  const recordedFields = (meal: PlannedMeal) => JSON.stringify([
    meal.title,
    meal.time,
    (meal.items ?? []).map((item) => `${item.ingredient.id}${item.isNewExposure ? "*" : ""}`).sort(),
    meal.textureMm ?? null,
    meal.servingGuide ?? "",
    meal.textureGuide ?? "",
    meal.servingMode ?? "",
    meal.reasons ?? [],
  ]);
  return recordedFields(stored) === recordedFields(recorded);
}

/**
 * The day as it was followed: the newly recorded option in its slot with the options it was chosen from, meals
 * recorded earlier as they were saved (the option stored with them while it still matches the record, otherwise the
 * stored record fields only), and the current plan for meals not recorded yet.
 */
function daySnapshot(plan: DailyRecommendation, chosen: PlannedMeal, stored: DailyRecommendation | null): DailyRecommendation {
  return {
    ...plan,
    meals: plan.meals.map((meal) => {
      if (meal.index === chosen.index) {
        return {
          ...chosen,
          alternatives: mealOptions(meal)
            .filter((option) => option.optionId !== chosen.optionId)
            .map((option) => ({ ...option, alternatives: undefined })),
        };
      }
      if (!isRecordedMeal(meal)) return meal;
      const storedMeal = stored?.meals?.find((item) => item.index === meal.index);
      return storedMeal && storedMealMatchesRecord(storedMeal, meal) ? storedMeal : meal;
    }),
  };
}

function formatKoreanDate(dateId: string) {
  const date = parseDateId(dateId);
  return `${date.getMonth() + 1}월 ${date.getDate()}일 ${weekdayLongLabels[date.getDay()]}`;
}

function formatKoreanTime(time: string) {
  if (!/^\d{2}:\d{2}$/.test(time)) return "시간";
  const [hourValue, minute = "00"] = time.split(":");
  const hour = Number(hourValue);
  const period = hour < 12 ? "오전" : "오후";
  const displayHour = hour % 12 || 12;
  return `${period} ${displayHour}:${minute}`;
}

function mealTimestamp(dateId: string, time: string) {
  const date = parseDateId(dateId);
  const [hour = 12, minute = 0] = time.split(":").map(Number);
  date.setHours(Number.isFinite(hour) ? hour : 12, Number.isFinite(minute) ? minute : 0, 0, 0);
  return date.toISOString();
}

function dismissMobileKeyboard() {
  const activeElement = document.activeElement;
  if (activeElement instanceof HTMLElement) activeElement.blur();
}

function syncSheetVisualViewport() {
  const viewport = window.visualViewport;
  const root = document.documentElement;

  if (!viewport) {
    root.style.removeProperty("--sheet-visual-height");
    root.style.removeProperty("--sheet-visual-top");
    return;
  }

  root.style.setProperty("--sheet-visual-height", `${Math.round(viewport.height)}px`);
  root.style.setProperty("--sheet-visual-top", `${Math.round(viewport.offsetTop)}px`);
}

function createMonthDays(cursor: CalendarCursor) {
  const total = new Date(cursor.year, cursor.month + 1, 0).getDate();
  return Array.from({ length: total }, (_, index): CalendarDay => {
    const date = new Date(cursor.year, cursor.month, index + 1);
    return { id: toDateId(date), day: index + 1, label: formatKoreanDate(toDateId(date)) };
  });
}

const settingOptions: Record<ChoiceSettingKey, { title: string; values: string[] }> = {
  start: { title: "예상 시작", values: ["만 5개월 반", "만 6개월", "소아과 상담 후"] },
  style: { title: "조리 방식", values: ["바로 조리", "냉동 큐브 활용", "두 방식 함께"] },
};

const preparationStyleLabels: Record<BabyProfile["preparationStyle"], string> = {
  cube: "냉동 큐브 활용",
  fresh: "바로 조리",
  batch: "한 번에 조리",
  mixed: "두 방식 함께",
};

const preparationStyleValues: Record<string, BabyProfile["preparationStyle"]> = {
  "냉동 큐브 활용": "cube",
  "바로 조리": "fresh",
  "한 번에 조리": "batch",
  "두 방식 함께": "mixed",
};

const readinessLabels: Record<keyof ReadinessSignals, string> = {
  tongueThrustGone: "혀로 밀어내는 반사가 줄었어요",
  headControl: "목을 안정적으로 가눠요",
  sitsWithSupport: "도움을 받아 앉을 수 있어요",
  foodInterest: "가족이 먹는 음식에 관심을 보여요",
};

const feedingStageLabels: Record<WeaningStage, string> = {
  prestart: "시작 전",
  initial: "초기",
  middle: "중기",
  late: "후기",
  completion: "완료기",
};

const temporaryConditionLabels: Record<TemporaryCondition, string> = {
  none: "특이사항 없음",
  cold: "감기·코막힘",
  diarrhea: "설사",
  constipation: "변비",
  mouthPain: "입안 통증·이앓이",
};

const developmentSkillLabels: Record<keyof DevelopmentSkills, string> = {
  handlesCurrentTexture: "현재 질감을 편하게 먹어요",
  reachesAndGrasps: "음식을 향해 손을 뻗고 잡아요",
  fingerFood: "핑거푸드를 집어 먹어요",
  spoonPractice: "숟가락을 쥐는 연습을 해요",
  cupPractice: "컵으로 마시는 연습을 해요",
};

function IngredientVisual({ ingredient, className = "" }: { ingredient: IngredientDefinition; className?: string }) {
  const src = ingredientAssetPaths[ingredient.assetId ?? ingredient.id];

  return (
    <span className={`ingredient-visual ${src ? "" : "is-custom"} ${className}`.trim()} aria-hidden="true">
      {src ? <img src={src} alt="" width="96" height="96" /> : <span className="ingredient-letter">{ingredient.name.slice(0, 1)}</span>}
    </span>
  );
}

function BrandMark() {
  return (
    <span className="brand-mark" aria-hidden="true">
      <img src="/icon-192.png" alt="" width="42" height="42" />
    </span>
  );
}

function recommendationProfile(profile: BabyProfile): BabyProfile {
  if (profile.stage !== "prestart") return profile;
  return {
    ...profile,
    stage: "initial",
    ageMonths: Math.max(6, profile.ageMonths),
    correctedAgeMonths: Math.max(6, profile.correctedAgeMonths ?? profile.ageMonths),
    mealsPerDay: 1,
    snacksPerDay: 0,
  };
}

function formatProfileStart(profile: BabyProfile): string {
  if (!profile.weaningStartDate) return "날짜를 정해주세요";
  const date = parseDateId(profile.weaningStartDate);
  return `${date.getFullYear()}년 ${date.getMonth() + 1}월 ${date.getDate()}일`;
}

function preparationCountdown(profile: BabyProfile): string {
  if (profile.weaningStartDate) {
    const days = Math.ceil((parseDateId(profile.weaningStartDate).getTime() - new Date().setHours(0, 0, 0, 0)) / 86_400_000);
    if (days > 0) return `가족이 정한 시작일까지 ${days}일 남았어요.`;
    if (days === 0) return "가족이 정한 시작일이에요. 준비 신호를 함께 확인해보세요.";
  }
  const estimatedWeeks = Math.max(0, Math.round((6 - (profile.correctedAgeMonths ?? profile.ageMonths)) * 4.35));
  return estimatedWeeks
    ? `만 6개월까지 약 ${estimatedWeeks}주 남았어요.`
    : hasStartReadiness(profile)
      ? "월령과 네 가지 준비 신호를 모두 확인했어요."
      : "월령과 네 가지 준비 신호를 확인한 뒤 시작해요.";
}

function TodayPrepare({
  profile,
  onStart,
  onPreview,
}: {
  profile: BabyProfile;
  onStart: () => void;
  onPreview: () => void;
}) {
  const readinessCount = Object.values(profile.readiness ?? {}).filter(Boolean).length;
  return (
    <>
      <section className="hero-card">
        <div className="hero-kicker">
          <span>생후 {profile.ageMonths}개월</span>
          <span className="status-pill">준비 신호 {readinessCount}/4</span>
        </div>
        <h1>천천히, 첫 한끼를<br />준비하고 있어요</h1>
        <p>{preparationCountdown(profile)}</p>
        <div className="hero-orbit" aria-hidden="true">
          <span className="orbit-dot orbit-one" />
          <span className="orbit-dot orbit-two" />
          <span className="orbit-spoon">⌇</span>
        </div>
      </section>

      <section className="section-card plan-card">
        <div className="section-heading">
          <div>
            <span className="overline">미리보기</span>
            <h2>첫 15일의 흐름</h2>
          </div>
          <span className="mini-icon" aria-hidden="true"><CalendarDays size={18} /></span>
        </div>
        <div className="plan-steps">
          <div className="plan-step is-current">
            <span>1–3일</span>
            <strong>쌀 · 오트밀</strong>
          </div>
          <div className="plan-line" />
          <div className="plan-step">
            <span>4–6일</span>
            <strong>소고기</strong>
          </div>
          <div className="plan-line" />
          <div className="plan-step">
            <span>7일–</span>
            <strong>채소 · 과일</strong>
          </div>
        </div>
        <button className="primary-action start-action" type="button" onClick={onStart}>
          이유식 시작하기
        </button>
        <button className="text-action" type="button" onClick={onPreview}>
          추천 화면만 미리보기 <ChevronRight size={17} aria-hidden="true" />
        </button>
      </section>

      <section className="tip-strip">
        <span className="tip-symbol" aria-hidden="true"><Info size={15} /></span>
        <p>날짜가 되어도 자동으로 시작하지 않아요. 부모가 준비됐을 때 시작을 확정해요.</p>
      </section>
    </>
  );
}

function StartWeaningSheet({
  profile,
  onSave,
  onClose,
}: {
  profile: BabyProfile;
  onSave: (profile: BabyProfile) => Promise<void>;
  onClose: () => void;
}) {
  const [stage, setStage] = useState<Exclude<WeaningStage, "prestart">>("initial");
  const [startDate, setStartDate] = useState(profile.weaningStartDate ?? toDateId(new Date()));
  const [saving, setSaving] = useState(false);
  const readinessCount = Object.values(profile.readiness ?? {}).filter(Boolean).length;
  const guide = getStageGuide(stage);
  const stageChoices: Array<{
    value: Exclude<WeaningStage, "prestart">;
    title: string;
    description: string;
  }> = [
    { value: "initial", title: "처음 시작", description: "초기 · 하루 1끼부터" },
    { value: "middle", title: "이미 중기", description: "7~8개월 · 2끼부터" },
    { value: "late", title: "이미 후기", description: "9~11개월 · 하루 3끼" },
    { value: "completion", title: "이미 완료기", description: "12개월 이후 · 가족식 전환" },
  ];

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    dismissMobileKeyboard();
    setSaving(true);
    try {
      const nextProfile: BabyProfile = {
        ...profile,
        stage,
        weaningStartDate: startDate,
        mealsPerDay: guide.mealRange[0],
        snacksPerDay: guide.snackRange[0],
        textureMm: Math.max(profile.textureMm || 0, guide.textureMmRange[0]),
        mealTimes: undefined,
      };
      const mealTimes = resolveMealTimes(nextProfile, nextProfile.mealsPerDay);
      await onSave({ ...nextProfile, preferredMealTime: mealTimes[0], mealTimes });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="sheet-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="record-sheet compact-sheet" role="dialog" aria-modal="true" aria-labelledby="start-weaning-title" onMouseDown={(event) => event.stopPropagation()}>
        <div className="sheet-handle" aria-hidden="true" />
        <div className="sheet-heading">
          <div><span className="overline">오늘부터 실제 기록</span><h2 id="start-weaning-title">이유식 시작 설정</h2></div>
          <button className="close-button" type="button" onClick={onClose} aria-label="닫기"><X size={19} /></button>
        </div>
        <form className="start-weaning-form" onSubmit={(event) => void submit(event)}>
          <p className="start-guide">처음 시작한다면 초기, 이미 이유식을 먹고 있다면 현재 진행 단계를 선택하세요. 월령만으로 단계를 자동 확정하지는 않아요.</p>
          <fieldset className="form-field">
            <legend>현재 진행 상태</legend>
            <div className="start-stage-picker">
              {stageChoices.map((choice) => (
                <button className={stage === choice.value ? "is-selected" : ""} type="button" key={choice.value} onClick={() => setStage(choice.value)} aria-pressed={stage === choice.value}>
                  <strong>{choice.title}</strong>
                  <small>{choice.description}</small>
                </button>
              ))}
            </div>
          </fieldset>
          <label className="form-field start-date-field">
            <span>실제 시작일</span>
            <input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} required />
          </label>
          <div className={`start-readiness-note ${readinessCount < 4 ? "needs-review" : ""}`}>
            <Check size={17} aria-hidden="true" />
            <p><strong>현재 준비 신호 {readinessCount}/4</strong><br />{readinessCount < 4
              ? "이미 진행 중이라면 현재 단계로 시작할 수 있어요. 처음 시작하는 경우에는 우리 아이 설정에서 준비 신호도 확인해주세요."
              : "네 가지 준비 신호가 모두 확인되어 있어요."}</p>
          </div>
          <button className="primary-action" type="submit" disabled={!startDate || saving}>
            {saving ? "가족 공간에 시작 상태 저장 중…" : `${stageLabels[stage]}로 시작하기`}
          </button>
        </form>
      </section>
    </div>
  );
}

function TodayMeal({
  profile,
  ingredients,
  ingredientStates,
  mealHistory,
  records,
  todayId,
  routineLogs,
  plan: bookPlan,
  selectedOption,
  choiceNotice,
  onBack,
  onChooseOption,
  onDismissChoiceNotice,
  onRecord,
  onEditRecord,
  onReviewProgress,
}: {
  profile: BabyProfile;
  ingredients: IngredientDefinition[];
  ingredientStates: ChildIngredientState[];
  mealHistory: MealHistoryEntry[];
  records: FamilyMealRecord[];
  todayId: string;
  routineLogs: DailyRoutineLog[];
  plan: DailyRecommendation;
  selectedOption: { mealIndex: number; optionId: string } | null;
  choiceNotice: string | null;
  onBack?: () => void;
  onChooseOption: (meal: PlannedMeal) => void;
  onDismissChoiceNotice: () => void;
  onRecord: (meal: PlannedMeal) => void;
  onEditRecord: (record: FamilyMealRecord) => void;
  onReviewProgress: () => void;
}) {
  const planProfile = useMemo(() => recommendationProfile(profile), [profile]);
  const todayRecords = useMemo(
    () => records.filter((record) => record.date === todayId),
    [records, todayId],
  );
  const recordByMealIndex = useMemo(
    () => new Map(todayRecords.map((record) => [record.mealIndex, record])),
    [todayRecords],
  );
  const nextMeal = bookPlan.meals.find((meal) => !recordByMealIndex.has(meal.index));
  const plannedFocus = nextMeal ?? bookPlan.meals[bookPlan.meals.length - 1];
  const focusedRecord = recordByMealIndex.get(plannedFocus.index);
  const { focusedOptions, focusedMeal } = useMemo(() => {
    const options = !focusedRecord && profile.stage !== "prestart" ? mealOptions(plannedFocus) : [plannedFocus];
    const chosen = selectedOption?.mealIndex === plannedFocus.index
      ? options.find((option) => option.optionId === selectedOption.optionId)
      : undefined;
    return { focusedOptions: options, focusedMeal: chosen ?? plannedFocus };
  }, [focusedRecord, plannedFocus, profile.stage, selectedOption]);
  const completedMealCount = bookPlan.meals.filter((meal) => recordByMealIndex.has(meal.index)).length;
  const allMealsRecorded = !nextMeal && bookPlan.meals.length > 0;
  const adaptiveReview = useMemo(
    () => createAdaptiveReview(planProfile, mealHistory, routineLogs),
    [mealHistory, planProfile, routineLogs],
  );
  const focusedMealIncludesTrial = Boolean(
    bookPlan.currentTrial
      && focusedMeal.items.some((item) => item.isNewExposure && item.ingredient.id === bookPlan.currentTrial?.id),
  );
  const focusedIsHold = !focusedRecord && isHeldMeal(focusedMeal);
  const suggestion = useMemo(
    (): MealSuggestion => {
      if (profile.stage === "prestart") {
        return createInitialMealSuggestion(
          profile,
          ingredients,
          ingredientStates,
          mealHistory,
        );
      }
      return {
        title: focusedRecord?.title ?? focusedMeal.title,
        mealTime: focusedRecord?.plannedTime ?? focusedMeal.time,
        servingGuide: focusedMeal.servingGuide,
        textureGuide: focusedMeal.textureGuide,
        ingredients: focusedRecord
          ? focusedRecord.ingredientIds
            .map((id) => ingredients.find((ingredient) => ingredient.id === id))
            .filter((ingredient): ingredient is IngredientDefinition => Boolean(ingredient))
          : focusedMeal.items.map((item) => item.ingredient),
        testLabel: focusedRecord
          ? `기록 완료 · ${completionLabels[focusedRecord.completion]}`
          : focusedMealIncludesTrial && bookPlan.currentTrial
            ? `${bookPlan.currentTrial.allergenGroup ? `알레르기 확인 · ${allergenGroupLabels[bookPlan.currentTrial.allergenGroup]} · ` : ""}${bookPlan.currentTrial.name} ${bookPlan.trialDay ?? 1}/3일`
            : null,
        reasons: focusedMeal.reasons,
      };
    },
    [bookPlan, focusedMeal, focusedMealIncludesTrial, focusedRecord, ingredientStates, ingredients, mealHistory, profile],
  );

  return (
    <>
      {onBack && (
        <button className="back-action" type="button" onClick={onBack}>
          <ArrowLeft size={17} aria-hidden="true" /> 준비 화면
        </button>
      )}

      <section className="day-intro">
        <div>
          <span className="overline">{formatKoreanTime(suggestion.mealTime)}</span>
          <h1>{profile.stage === "prestart"
            ? "첫 끼 미리보기"
            : allMealsRecorded
              ? "오늘 식사를 모두 기록했어요"
              : `${focusedMeal.index}번째 이유식`}</h1>
          <p>{profile.stage === "prestart"
            ? bookPlan.summaryReasons[0]
            : allMealsRecorded
              ? `${bookPlan.meals.length}끼 기록을 마쳤어요. 아래 일정이나 버튼을 눌러 언제든 수정할 수 있어요.`
              : `오늘 ${bookPlan.meals.length}끼 중 ${completedMealCount}끼 기록 완료 · 다음 식사를 바로 보여드려요.`}</p>
        </div>
        <div className="day-number meal-progress-number" aria-label={`오늘 ${completedMealCount}/${bookPlan.meals.length}끼 기록`}>
          {completedMealCount}/{bookPlan.meals.length}
        </div>
      </section>

      <section className="meal-card">
        <div className="meal-visual" aria-hidden="true">
          <span className="meal-bowl">⌣</span>
          <span className="grain grain-one">•</span>
          <span className="grain grain-two">•</span>
          <span className="grain grain-three">•</span>
        </div>
        <div className="meal-card-head">
          <div>
            {suggestion.testLabel && <span className="status-pill">{suggestion.testLabel}</span>}
            {focusedIsHold && <span className="status-pill">쉬어가기</span>}
            <h2>{suggestion.title}</h2>
          </div>
        </div>

        {choiceNotice && (
          <div className="meal-option-notice" role="status">
            <p>{choiceNotice}</p>
            <button type="button" onClick={onDismissChoiceNotice}>확인</button>
          </div>
        )}

        {focusedIsHold ? (
          <div className="development-note meal-hold-note" role="status">
            <Info size={17} aria-hidden="true" />
            <p>{focusedMeal.reasons.join(" ")}</p>
          </div>
        ) : (
          <>
            {focusedOptions.length > 1 && (
              <div className="meal-options" role="group" aria-label={`${plannedFocus.index}번째 이유식 메뉴 고르기`}>
                <p className="meal-options-label">오늘 고를 수 있는 메뉴 {focusedOptions.length}가지 · 모두 오늘의 도입·관찰 기준을 지켜요</p>
                {focusedOptions.map((option, position) => {
                  const selected = option.optionId === focusedMeal.optionId;
                  return (
                    <button
                      className={selected ? "is-selected" : ""}
                      type="button"
                      key={option.optionId}
                      aria-pressed={selected}
                      onClick={() => onChooseOption(option)}
                    >
                      <span className="meal-option-mark" aria-hidden="true">{selected && <Check size={13} />}</span>
                      <span>
                        <strong>{option.title}</strong>
                        <small>{position === 0 ? "기본 추천" : "다른 선택"} · {option.bookReference ?? "먹어본 재료 조합"} · {option.items.map((item) => item.ingredient.name).join("·")}</small>
                      </span>
                    </button>
                  );
                })}
              </div>
            )}

            <div className="ingredient-chips">
              {suggestion.ingredients.map((ingredient) => (
                <span key={ingredient.id}><IngredientVisual ingredient={ingredient} className="is-chip" /> {ingredient.name}</span>
              ))}
            </div>

            {(suggestion.servingGuide || suggestion.textureGuide) && (
              <dl className="meal-facts">
                {suggestion.servingGuide && (
                  <div>
                    <dt>제공량</dt>
                    <dd>{suggestion.servingGuide}</dd>
                  </div>
                )}
                {suggestion.textureGuide && (
                  <div>
                    <dt>질감</dt>
                    <dd>{suggestion.textureGuide}</dd>
                  </div>
                )}
              </dl>
            )}

            {suggestion.reasons.length > 0 && (
              <details className="reason-box">
                <summary>{focusedRecord ? "기록할 때 본 추천 이유" : "왜 오늘 이 메뉴인가요?"}</summary>
                <ul>
                  {suggestion.reasons.map((reason) => (
                    <li key={reason}>{reason}</li>
                  ))}
                </ul>
              </details>
            )}

            {/* A recorded meal keeps no recipe of its own, so none is rebuilt for it here. */}
            {focusedMeal.preparationSteps.length > 0 && (
              <details className="reason-box cooking-guide">
                <summary>오늘 만드는 법 · {focusedMeal.servingMode}</summary>
                <ol>
                  {focusedMeal.preparationSteps.map((step) => <li key={step}>{step}</li>)}
                </ol>
                {focusedMeal.bookReference && <p className="book-reference"><strong>책 메뉴</strong> {focusedMeal.bookReference}</p>}
                <p><strong>보관</strong> {focusedMeal.storageGuide}</p>
              </details>
            )}

            <button className="primary-action" type="button" onClick={() => (focusedRecord ? onEditRecord(focusedRecord) : onRecord(focusedMeal))}>
              {focusedRecord ? `${focusedMeal.index}번째 기록 수정하기` : `${focusedMeal.index}번째 식사 기록하기`}
            </button>
          </>
        )}
      </section>

      {profile.stage !== "prestart" && bookPlan.nextAdditions.length > 0 && (
        <section className="section-card next-additions-card">
          <div className="section-heading">
            <div>
              <span className="overline">{bookPlan.currentTrial ? `${bookPlan.currentTrial.name} 관찰이 끝난 뒤` : "다음 도입 후보"}</span>
              <h2>다음에 더할 재료</h2>
            </div>
          </div>
          <p className="next-additions-note">
            {bookPlan.currentTrial ? `오늘은 ${bookPlan.currentTrial.name} 말고 다른 새 재료를 더하지 않아요. ` : ""}
            아래 책 메뉴는 표시한 재료를 도입해 통과한 뒤에 고를 수 있어요.
          </p>
          <ul className="next-additions-list">
            {bookPlan.nextAdditions.map((addition, position) => (
              <li key={addition.ingredient.id}>
                <IngredientVisual ingredient={addition.ingredient} className="is-chip" />
                <p>
                  <strong>{addition.ingredient.name} <span>{position === 0 ? "다음 순서" : "책 메뉴 후보"}</span></strong>
                  <small>{addition.unlocks.length
                    ? `열리는 책 메뉴: ${addition.unlocks.map((menu) => `${menu.title}(${menu.sourcePage})`).join(", ")}`
                    : "이 단계에서 새로 열리는 책 메뉴는 아직 없어요."}</small>
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="section-card adaptive-review-card">
        <div className="section-heading">
          <div><span className="overline">최근 기록 반영</span><h2>다음 식사 조정</h2></div>
          <span className={`count-badge is-${adaptiveReview.progression.action}`}>{adaptiveReview.progression.action === "advance" ? "진행 제안" : "현재 유지"}</span>
        </div>
        <div className="adaptive-adjustments">
          {adaptiveReview.adjustments.map((adjustment) => (
            <div className={`adaptive-adjustment is-${adjustment.tone}`} key={adjustment.id}>
              <i aria-hidden="true">{adjustment.tone === "positive" ? "✓" : adjustment.tone === "attention" ? "!" : "·"}</i>
              <p><strong>{adjustment.title}</strong><small>{adjustment.detail}</small></p>
            </div>
          ))}
        </div>
        <div className="progression-proposal">
          <p><strong>{adaptiveReview.progression.title}</strong><small>{adaptiveReview.progression.detail}</small></p>
          <button type="button" onClick={onReviewProgress}>설정에서 확인</button>
        </div>
      </section>

      {(bookPlan.meals.length > 1 || bookPlan.snacks.length > 0) && (
        <section className="section-card daily-schedule-card">
          <div className="section-heading">
            <div><span className="overline">하루 전체</span><h2>오늘의 식사 일정</h2></div>
            <span className="count-badge">{completedMealCount}/{bookPlan.meals.length}끼 기록</span>
          </div>
          <div className="daily-schedule-list">
            {bookPlan.meals.filter((meal) => meal.index !== focusedMeal.index).map((meal) => {
              const savedRecord = recordByMealIndex.get(meal.index);
              if (!savedRecord && isHeldMeal(meal)) {
                return (
                  <div className="schedule-snack" key={`meal-${meal.index}`}>
                    <span className="schedule-time">{formatKoreanTime(meal.time)}</span>
                    <span><strong>{meal.index}번째 이유식 · {meal.title}</strong><small>{meal.reasons[0]}</small></span>
                    <span className="schedule-kind">쉬어요</span>
                  </div>
                );
              }
              const ingredientNames = savedRecord
                ? savedRecord.ingredientIds
                  .map((id) => ingredients.find((ingredient) => ingredient.id === id)?.name)
                  .filter((name): name is string => Boolean(name))
                  .join(" · ")
                : meal.items.map((item) => item.ingredient.name).join(" · ");
              return (
                <button
                  className={savedRecord ? "is-completed" : ""}
                  type="button"
                  key={`meal-${meal.index}`}
                  onClick={() => (savedRecord ? onEditRecord(savedRecord) : onRecord(meal))}
                >
                  <span className="schedule-time">{formatKoreanTime(savedRecord?.plannedTime ?? meal.time)}</span>
                  <span>
                    <strong>{meal.index}번째 이유식 · {savedRecord?.title ?? meal.title}</strong>
                    <small>{savedRecord ? `기록 완료 · ${completionLabels[savedRecord.completion]} · 눌러서 수정` : ingredientNames}</small>
                  </span>
                  {savedRecord
                    ? <span className="schedule-complete-icon" aria-label="기록 완료"><Check size={14} aria-hidden="true" /></span>
                    : <ChevronRight size={17} aria-hidden="true" />}
                </button>
              );
            })}
            {bookPlan.snacks.map((snack) => (
              <div className="schedule-snack" key={`snack-${snack.index}`}>
                <span className="schedule-time">{formatKoreanTime(snack.time)}</span>
                <span><strong>간식 · {snack.title}</strong><small>{snack.servingGuide}</small></span>
                <span className="schedule-kind">간식</span>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="section-card rule-check-card">
        <div className="section-heading">
          <div>
            <span className="overline">책 기반 확인</span>
            <h2>오늘 적용된 규칙</h2>
          </div>
          <span className="count-badge">{bookPlan.stageLabel}</span>
        </div>
        <div className="rule-check-grid">
          {bookPlan.checks.map((check) => (
            <div className={`rule-check-item ${check.met ? "is-met" : ""}`} key={check.id}>
              <span aria-hidden="true">{check.met ? "✓" : "·"}</span>
              <div><strong>{check.label}</strong><small>{check.detail}</small></div>
            </div>
          ))}
        </div>
        <div className="development-note">
          <Sprout size={17} aria-hidden="true" />
          <p><strong>오늘의 먹기 연습</strong><br />{bookPlan.developmentTask}</p>
        </div>
        <details className="reason-box safety-reasons">
          <summary>안전 기준 보기</summary>
          <ul>{bookPlan.safetyNotes.map((note) => <li key={note}>{note}</li>)}</ul>
        </details>
      </section>

      <section className="sync-row">
        <span className="sync-row-icon" aria-hidden="true"><Link2 size={19} /></span>
        <p><strong>가족과 같은 기록을 봐요</strong><br />우리 아이 탭에서 보호자 계정을 연결하면 어느 기기에서든 함께 기록할 수 있어요.</p>
      </section>
    </>
  );
}

function IngredientsView({
  ingredients,
  ingredientStates,
  plan,
  onSelect,
  onAdd,
}: {
  ingredients: IngredientDefinition[];
  ingredientStates: ChildIngredientState[];
  plan: DailyRecommendation;
  onSelect: (ingredient: IngredientDefinition) => void;
  onAdd: () => void;
}) {
  const [selectedCategory, setSelectedCategory] = useState<IngredientCategory | "all">("all");
  const [selectedAvailability, setSelectedAvailability] = useState<"current" | "later" | "all">("current");
  const [selectedTrait, setSelectedTrait] = useState<"all" | "allergen">("all");
  const stateByIngredient = useMemo(
    () => new Map(ingredientStates.map((state) => [state.ingredientId, state])),
    [ingredientStates],
  );
  const currentTrial = plan.currentTrial ?? ingredients[0];
  const nextIngredient = ingredients.find(
    (ingredient) => ingredient.introductionGroup !== currentTrial.introductionGroup
      && ingredient.introductionPriority > currentTrial.introductionPriority,
  ) ?? ingredients.find((ingredient) => ingredient.id !== currentTrial.id) ?? currentTrial;
  const currentStageRank = ingredientStageRank[plan.stage];
  const allergenProgress = (Object.keys(allergenGroupLabels) as AllergenGroup[]).map((group) => {
    const groupIngredientIds = ingredients.filter((ingredient) => ingredient.allergenGroup === group).map((ingredient) => ingredient.id);
    const groupStates = groupIngredientIds.map((id) => stateByIngredient.get(id)).filter((state): state is ChildIngredientState => Boolean(state));
    const status = groupStates.some((state) => ["suspectedReaction", "avoid"].includes(state.status))
      ? "attention"
      : groupStates.some((state) => state.status === "testing")
        ? "testing"
        : groupStates.some((state) => state.status === "passed")
          ? "passed"
          : "waiting";
    return { group, status } as const;
  });
  const passedAllergenGroups = allergenProgress.filter((item) => item.status === "passed").length;
  const activeAllergenGroups = allergenProgress.filter((item) => item.status === "testing").length;
  const attentionAllergenGroups = allergenProgress.filter((item) => item.status === "attention").length;
  const allergenIngredientCount = ingredients.filter((ingredient) => ingredient.allergenGroup).length;
  const visibleIngredients = ingredients.filter((ingredient) => {
    const categoryMatches = selectedCategory === "all" || ingredient.category === selectedCategory;
    const traitMatches = selectedTrait === "all" || Boolean(ingredient.allergenGroup);
    const isAvailable = ingredientStageRank[ingredient.minimumStage] <= currentStageRank;
    const availabilityMatches = selectedAvailability === "all"
      || (selectedAvailability === "current" ? isAvailable : !isAvailable);
    return categoryMatches && traitMatches && availabilityMatches;
  });

  return (
    <>
      <section className="page-intro">
        <div>
          <span className="overline">재료 원장</span>
          <h1>먹어본 재료를<br />차곡차곡 모아요</h1>
        </div>
        <p>거부와 반응을 구분해 다음 추천에 반영합니다.</p>
      </section>

      <section className="ingredient-status-grid">
        <button className="status-card testing-card" type="button" onClick={() => onSelect(currentTrial)}>
          <span className="status-card-label-row"><span className="status-label">{plan.trialDay && plan.trialDay > 1 ? "도입 중" : "테스트 예정"}</span>{currentTrial.allergenGroup && <em className="allergen-badge">알레르기 · {allergenGroupLabels[currentTrial.allergenGroup]}</em>}</span>
          <div className="ingredient-large"><IngredientVisual ingredient={currentTrial} className="is-large" /><strong>{currentTrial.name}</strong></div>
          <p>{plan.trialDay ?? 1}/3일 · 기록에 따라 갱신 <ChevronRight size={14} aria-hidden="true" /></p>
        </button>
        <button className="status-card next-card" type="button" onClick={() => onSelect(nextIngredient)}>
          <span className="status-card-label-row"><span className="status-label">그다음</span>{nextIngredient.allergenGroup && <em className="allergen-badge">알레르기 · {allergenGroupLabels[nextIngredient.allergenGroup]}</em>}</span>
          <div className="ingredient-large"><IngredientVisual ingredient={nextIngredient} className="is-large" /><strong>{nextIngredient.name}</strong></div>
          <p>{introductionGroupLabels[currentTrial.introductionGroup]} 적응 후 <ChevronRight size={14} aria-hidden="true" /></p>
        </button>
      </section>

      <section className="section-card allergen-progress-card">
        <div className="section-heading">
          <div><span className="overline">새 재료 한 가지씩</span><h2>알레르기 재료 확인</h2></div>
          <span className="count-badge">{passedAllergenGroups}/7 그룹</span>
        </div>
        <p className="catalog-note">같은 원료의 식품은 한 그룹으로 묶었어요. 반응이 의심된 그룹은 자동 추천에서 제외됩니다.</p>
        <div className="allergen-progress-bar" aria-label={`알레르기 재료 ${passedAllergenGroups}/7 그룹 통과`}><i style={{ width: `${passedAllergenGroups / 7 * 100}%` }} /></div>
        <div className="allergen-group-list">
          {allergenProgress.map((item) => (
            <span className={`is-${item.status}`} key={item.group}>
              <i aria-hidden="true">{item.status === "passed" ? "✓" : item.status === "testing" ? "·" : item.status === "attention" ? "!" : "○"}</i>
              {allergenGroupLabels[item.group]}
            </span>
          ))}
        </div>
        <p className="allergen-progress-summary">도입 중 {activeAllergenGroups} · 확인 필요 {attentionAllergenGroups} · 아직 확인 전 {7 - passedAllergenGroups - activeAllergenGroups - attentionAllergenGroups}</p>
      </section>

      <section className="section-card">
        <div className="section-heading">
          <div>
            <span className="overline">6–18개월 전체 흐름</span>
            <h2>재료 원장</h2>
          </div>
          <span className="count-badge">{visibleIngredients.length}개</span>
        </div>
        <p className="catalog-note">61개는 앱이 책을 바탕으로 정리한 기본 재료 목록이에요. 후기·완료기에 재료가 끝나는 것이 아니라, 먹어본 재료를 죽 → 무른밥 → 밥·국·반찬 메뉴로 발전시켜 사용해요.</p>
        <div className="ingredient-filters availability-filters" aria-label="재료 사용 시기 필터">
          <button className={selectedAvailability === "current" ? "is-selected" : ""} type="button" onClick={() => setSelectedAvailability("current")}>현재 단계에서 사용</button>
          <button className={selectedAvailability === "later" ? "is-selected" : ""} type="button" onClick={() => setSelectedAvailability("later")}>나중에 열림</button>
          <button className={selectedAvailability === "all" ? "is-selected" : ""} type="button" onClick={() => setSelectedAvailability("all")}>전체 보기</button>
        </div>
        <div className="ingredient-filters trait-filters" aria-label="재료 특성 필터">
          <button className={selectedTrait === "all" ? "is-selected" : ""} type="button" onClick={() => setSelectedTrait("all")}>모든 재료</button>
          <button className={selectedTrait === "allergen" ? "is-selected allergen-filter" : "allergen-filter"} type="button" onClick={() => setSelectedTrait("allergen")}>알레르기 주의 {allergenIngredientCount}</button>
        </div>
        <div className="ingredient-filters" aria-label="재료 식품군 필터">
          <button className={selectedCategory === "all" ? "is-selected" : ""} type="button" onClick={() => setSelectedCategory("all")}>전체</button>
          {categoryOrder.map((category) => (
            <button className={selectedCategory === category ? "is-selected" : ""} type="button" key={category} onClick={() => setSelectedCategory(category)}>
              {categoryLabels[category]}
            </button>
          ))}
        </div>
        <div className="ingredient-list">
          {visibleIngredients.map((ingredient) => {
            const isCustom = ingredient.id.startsWith("custom-");
            const state = stateByIngredient.get(ingredient.id);
            const status = state
              ? ingredientStatusLabels[state.status]
              : ingredient.id === plan.currentTrial?.id
                ? "테스트 예정"
                : "미도입";
            return (
              <button className="ingredient-row" type="button" key={ingredient.id} onClick={() => onSelect(ingredient)}>
                <IngredientVisual ingredient={ingredient} />
                <div>
                  <span className="ingredient-name-row"><strong>{ingredient.name}</strong>{ingredient.allergenGroup && <em className="allergen-badge">알레르기 · {allergenGroupLabels[ingredient.allergenGroup]}</em>}</span>
                  <span>{isCustom ? `직접 추가 · ${categoryLabels[ingredient.category]}` : `${introductionGroupLabels[ingredient.introductionGroup]} · 만 ${ingredient.minimumAgeMonths ?? 6}개월부터`} · {status}{state?.status === "testing" ? ` ${state.testDay ?? 1}/3일` : ""}</span>
                </div>
                <span className="ingredient-order"><i>{String(ingredient.introductionPriority).padStart(2, "0")}</i><ChevronRight size={16} aria-hidden="true" /></span>
              </button>
            );
          })}
        </div>
        <button className="add-ingredient-button" type="button" onClick={onAdd}><Plus size={17} aria-hidden="true" /> 재료 직접 추가</button>
      </section>
    </>
  );
}

function RecordsView({
  records,
  routineLogs,
  workspace,
  profile,
  ingredients,
  ingredientStates,
  mealHistory,
  mealCount,
  selectedDate,
  todayId,
  calendarCursor,
  onSelectDate,
  onMoveMonth,
  onGoToday,
  onAddRecord,
  onEditRecord,
  onEditRoutine,
}: {
  records: FamilyMealRecord[];
  routineLogs: DailyRoutineLog[];
  workspace: FamilyWorkspace | null;
  profile: BabyProfile;
  ingredients: IngredientDefinition[];
  ingredientStates: ChildIngredientState[];
  mealHistory: MealHistoryEntry[];
  mealCount: number;
  selectedDate: string;
  todayId: string;
  calendarCursor: CalendarCursor;
  onSelectDate: (date: string) => void;
  onMoveMonth: (direction: -1 | 1) => void;
  onGoToday: () => void;
  onAddRecord: (date: string) => void;
  onEditRecord: (record: FamilyMealRecord) => void;
  onEditRoutine: (date: string) => void;
}) {
  const monthDays = useMemo(() => createMonthDays(calendarCursor), [calendarCursor]);
  const firstDayOffset = new Date(calendarCursor.year, calendarCursor.month, 1).getDay();
  const selectedRecords = records
    .filter((record) => record.date === selectedDate)
    .sort((left, right) => left.mealIndex - right.mealIndex);
  const recordDates = useMemo(
    () => new Set([...records.map((record) => record.date), ...routineLogs.map((log) => log.date)]),
    [records, routineLogs],
  );
  const selectedLabel = formatKoreanDate(selectedDate);
  const today = parseDateId(todayId);
  const canMoveToNextMonth = calendarCursor.year < today.getFullYear()
    || (calendarCursor.year === today.getFullYear() && calendarCursor.month < today.getMonth());
  const selectedMealIndexes = new Set(selectedRecords.map((record) => record.mealIndex));
  const completedMealCount = Array.from({ length: mealCount }, (_, index) => index + 1)
    .filter((mealIndex) => selectedMealIndexes.has(mealIndex)).length;
  const isFutureDate = selectedDate > todayId;
  const selectedRoutine = routineLogs.find((log) => log.date === selectedDate);
  const canAddRecord = !isFutureDate && completedMealCount < mealCount;
  const weeklyBalance = useMemo(
    () => createWeeklyBalance(profile, ingredients, ingredientStates, mealHistory, parseDateId(todayId)),
    [ingredientStates, ingredients, mealHistory, profile, todayId],
  );

  return (
    <>
      <section className="page-intro">
        <div>
          <span className="overline">가족 기록</span>
          <h1>작은 변화까지<br />함께 기억해요</h1>
        </div>
        <p>누가 기록해도 다른 기기에서 같은 상태를 보게 됩니다.</p>
      </section>

      <section className="section-card weekly-balance-card">
        <div className="section-heading">
          <div>
            <span className="overline">최근 7일 · 실제 기록 기준</span>
            <h2>주간 균형판</h2>
          </div>
          <span className="count-badge">{weeklyBalance.recordedDays}일 · {weeklyBalance.recordedMeals}끼</span>
        </div>
        <div className="weekly-balance-grid">
          {weeklyBalance.metrics.map((metric) => (
            <div className={`weekly-balance-item is-${metric.status}`} key={metric.id}>
              <div><span>{metric.label}</span><i aria-hidden="true">{metric.status === "met" ? <Check size={11} /> : metric.status === "attention" ? "!" : "·"}</i></div>
              <strong>{metric.value}</strong>
              <small>{metric.detail}</small>
            </div>
          ))}
        </div>
        <div className="weekly-focus-note">
          <Info size={17} aria-hidden="true" />
          <p><strong>다음 보완</strong><br />{weeklyBalance.focus}<small>{weeklyBalance.variety}</small></p>
        </div>
      </section>

      <section className="section-card record-week">
        <div className="calendar-card-heading">
          <div>
            <span className="overline">캘린더 보기</span>
            <h2>준비와 식사 기록</h2>
          </div>
          <button className="today-button" type="button" onClick={onGoToday}>
            <CalendarDays size={15} aria-hidden="true" /> 오늘로 가기
          </button>
        </div>
        <div className="month-navigation">
          <button type="button" onClick={() => onMoveMonth(-1)} aria-label="이전 달"><ChevronLeft size={19} /></button>
          <strong>{calendarCursor.year}년 {calendarCursor.month + 1}월</strong>
          <button type="button" onClick={() => onMoveMonth(1)} aria-label="다음 달" disabled={!canMoveToNextMonth}><ChevronRight size={19} /></button>
        </div>
        <div className="calendar-weekdays" aria-hidden="true">
          {weekdayLabels.map((weekday) => <span key={weekday}>{weekday}</span>)}
        </div>
        <div className="month-grid" aria-label={`${calendarCursor.year}년 ${calendarCursor.month + 1}월 날짜 선택`}>
          {Array.from({ length: firstDayOffset }, (_, index) => <span className="calendar-blank" key={`blank-${index}`} />)}
          {monthDays.map((day) => {
            const hasRecord = recordDates.has(day.id);
            const isFutureDay = day.id > todayId;
            return (
              <button
                className={`calendar-day ${hasRecord ? "has-record" : ""} ${selectedDate === day.id ? "is-selected" : ""} ${todayId === day.id ? "is-today" : ""} ${isFutureDay ? "is-future" : ""}`}
                type="button"
                key={day.id}
                onClick={() => onSelectDate(day.id)}
                disabled={isFutureDay}
                aria-label={`${day.label}${todayId === day.id ? ", 오늘" : ""}${isFutureDay ? ", 미래 날짜 선택 불가" : ""}${hasRecord ? ", 식사 기록 있음" : ""}`}
                aria-pressed={selectedDate === day.id}
              >
                <span>{day.day}</span><i aria-hidden="true" />
              </button>
            );
          })}
        </div>
        <div className="calendar-footer">
          <span className="record-dot-key"><i aria-hidden="true" /> 기록 있음</span>
          <p className="calendar-hint">과거 날짜는 기록을 추가·수정할 수 있고, 미래 날짜는 선택할 수 없어요.</p>
        </div>
      </section>

      <section className="section-card routine-summary-card">
        <div className="section-heading">
          <div><span className="overline">{selectedLabel}</span><h2>수유·간식·먹기 연습</h2></div>
          {!isFutureDate && <button className="add-past-record-button" type="button" onClick={() => onEditRoutine(selectedDate)}>{selectedRoutine ? "수정" : "기록"}</button>}
        </div>
        {selectedRoutine ? (
          <div className="routine-stat-grid">
            <div><span>수유량</span><strong>{selectedRoutine.milkMl == null ? "미기록" : `${selectedRoutine.milkMl}ml`}</strong></div>
            <div><span>간식</span><strong>{selectedRoutine.snackCount}회</strong></div>
            <div className="routine-skills"><span>먹기 연습</span><strong>{[
              selectedRoutine.fingerFood && "핑거푸드",
              selectedRoutine.spoonPractice && "숟가락",
              selectedRoutine.cupPractice && "컵",
            ].filter(Boolean).join(" · ") || "미기록"}</strong></div>
            {selectedRoutine.note && <p>{selectedRoutine.note}</p>}
          </div>
        ) : (
          <p className="routine-empty">이날의 수유량, 간식과 컵·숟가락·핑거푸드 연습을 함께 남길 수 있어요.</p>
        )}
      </section>

      <section className="section-card">
        <div className="section-heading">
          <div>
            <span className="overline">{selectedLabel}</span>
            <h2>{selectedRecords.length ? `${selectedRecords.length}번의 식사를 기록했어요` : "이날의 기록이 없어요"}</h2>
          </div>
          {canAddRecord && (
            <button className="add-past-record-button" type="button" onClick={() => onAddRecord(selectedDate)}>
              <Plus size={15} aria-hidden="true" /> {selectedDate === todayId ? "오늘 식사 추가" : "이 날짜 식사 추가"}
            </button>
          )}
          {!canAddRecord && !isFutureDate && <span className="count-badge">{mealCount}/{mealCount}끼 완료</span>}
        </div>
        {selectedRecords.length ? (
          <div className="saved-record-list">
            {selectedRecords.map((record) => {
              const recordAuthor = workspace?.members.find((member) => member.userId === record.recordedBy)?.displayName ?? "가족";
              return (
                <button className="saved-record" type="button" key={record.id} onClick={() => onEditRecord(record)}>
                  <div className="saved-date"><strong>{String(record.mealIndex).padStart(2, "0")}</strong><span>{formatKoreanTime(record.plannedTime)}</span></div>
                  <div>
                    <strong>{record.title}</strong>
                    <p>{completionLabels[record.completion]} · {reactionLabels[record.reaction]}</p>
                    <span className="record-author">{recordAuthor} 기록 · 가족과 동기화됨</span>
                  </div>
                  <ChevronRight size={18} aria-hidden="true" />
                </button>
              );
            })}
          </div>
        ) : (
          <div className="empty-state">
            <span aria-hidden="true">◌</span>
            <p>{isFutureDate
              ? "미래 날짜의 식사는 아직 기록할 수 없어요."
              : "기억나는 만큼만 추가해도 괜찮아요. 저장한 기록은 가족의 모든 기기에 동기화됩니다."}</p>
          </div>
        )}
      </section>
    </>
  );
}

function ProfileView({
  profile,
  settings,
  onEditSetting,
  onEditProfile,
  onEditFeedingPlan,
  onExport,
  onResetProgress,
  onDeleteAccount,
  onWorkspaceChange,
}: {
  profile: BabyProfile;
  settings: Record<SettingKey, string>;
  onEditSetting: (key: SettingKey) => void;
  onEditProfile: () => void;
  onEditFeedingPlan: () => void;
  onExport: () => void;
  onResetProgress: () => void;
  onDeleteAccount: () => void;
  onWorkspaceChange: () => void;
}) {
  const stageDescription = profile.stage === "prestart" ? "이유식 시작 전" : `${stageLabels[profile.stage]} 진행 중`;
  const mealTimes = resolveMealTimes(profile, profile.mealsPerDay);
  return (
    <>
      <section className="profile-hero">
        <div className="baby-avatar" aria-hidden="true"><Baby size={48} strokeWidth={1.45} /></div>
        <div>
          <span className="overline">우리 가족</span>
          <h1>{profile.nickname}</h1>
          <p>생후 {profile.ageMonths}개월 · {stageDescription}</p>
        </div>
        <button className="profile-edit-action" type="button" onClick={onEditProfile}>정보 수정</button>
      </section>

      <section className="section-card profile-settings">
        <div className="setting-row">
          <div><span>현재 단계</span><strong>{feedingStageLabels[profile.stage]} · 하루 {profile.mealsPerDay}끼{profile.snacksPerDay ? ` · 간식 ${profile.snacksPerDay}회` : ""}</strong></div>
          <button type="button" aria-label="단계와 끼니 설정 수정" onClick={onEditFeedingPlan}><ChevronRight size={19} /></button>
        </div>
        <div className="setting-row">
          <div><span>예상 시작</span><strong>{settings.start}</strong></div>
          <button type="button" aria-label="예상 시작일 수정" onClick={onEditProfile}><ChevronRight size={19} /></button>
        </div>
        <div className="setting-row">
          <div><span>끼니 시간</span><strong>{mealTimes.map(formatKoreanTime).join(" · ")}</strong></div>
          <button type="button" aria-label="끼니 시간 수정" onClick={() => onEditSetting("time")}><ChevronRight size={19} /></button>
        </div>
        <div className="setting-row">
          <div><span>조리 방식</span><strong>{settings.style}</strong></div>
          <button type="button" aria-label="조리 방식 수정" onClick={() => onEditSetting("style")}><ChevronRight size={19} /></button>
        </div>
        <div className="setting-row">
          <div><span>현재 질감</span><strong>{profile.textureMm || 1}mm 안팎 · {temporaryConditionLabels[profile.temporaryCondition ?? "none"]}</strong></div>
          <button type="button" aria-label="질감과 상태 설정 수정" onClick={onEditFeedingPlan}><ChevronRight size={19} /></button>
        </div>
      </section>

      <FamilySyncSection onWorkspaceChange={onWorkspaceChange} />

      <button className="export-button" type="button" onClick={onExport}><Download size={17} aria-hidden="true" /> 내 데이터 내보내기</button>

      <section className="section-card data-control-card">
        <div className="section-heading">
          <div><span className="overline">계정과 데이터</span><h2>데이터 관리</h2></div>
        </div>
        <div className="data-control-list">
          <button type="button" onClick={onResetProgress}>
            <RotateCcw size={18} aria-hidden="true" />
            <span><strong>이유식 진행 초기화</strong><small>아이 정보와 가족 연결은 유지하고 식사·재료 도입·추천 기록만 지워요.</small></span>
            <ChevronRight size={17} aria-hidden="true" />
          </button>
          <button className="is-destructive" type="button" onClick={onDeleteAccount}>
            <Trash2 size={18} aria-hidden="true" />
            <span><strong>계정과 내 데이터 삭제</strong><small>현재 계정·가족 연결·내가 남긴 기록을 영구 삭제해요.</small></span>
            <ChevronRight size={17} aria-hidden="true" />
          </button>
        </div>
      </section>
    </>
  );
}

function DataControlSheet({
  action,
  onConfirm,
  onClose,
}: {
  action: DataControlAction;
  onConfirm: () => Promise<void>;
  onClose: () => void;
}) {
  const isReset = action === "resetProgress";
  const confirmationWord = isReset ? "초기화" : "계정삭제";
  const [confirmation, setConfirmation] = useState("");
  const [working, setWorking] = useState(false);

  const confirm = async () => {
    if (confirmation.trim() !== confirmationWord) return;
    dismissMobileKeyboard();
    setWorking(true);
    try {
      await onConfirm();
    } finally {
      setWorking(false);
    }
  };

  return (
    <div className="sheet-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="record-sheet compact-sheet data-control-sheet" role="dialog" aria-modal="true" aria-labelledby="data-control-title" onMouseDown={(event) => event.stopPropagation()}>
        <div className="sheet-handle" aria-hidden="true" />
        <div className="sheet-heading">
          <div><span className="overline">되돌릴 수 없는 작업</span><h2 id="data-control-title">{isReset ? "진행 기록을 초기화할까요?" : "계정과 내 정보를 삭제할까요?"}</h2></div>
          <button className="close-button" type="button" onClick={onClose} aria-label="닫기"><X size={19} /></button>
        </div>
        <div className="data-control-summary">
          {isReset ? (
            <>
              <p><strong>삭제:</strong> 모든 식사 기록, 재료 도입 상태, 반응 기록, 추천 진행도</p>
              <p><strong>유지:</strong> 아이 이름·생일, 가족 연결, 직접 추가한 재료</p>
              <p>가족이 공유하는 진행 기록도 함께 초기화되며, 이유식 시작 전 화면으로 돌아갑니다.</p>
            </>
          ) : (
            <>
              <p><strong>삭제:</strong> 현재 로그인 계정, 가족 연결, 내가 작성한 식사·반응 기록</p>
              <p>다른 보호자가 있으면 가족 관리 권한과 그 보호자의 기록은 유지됩니다. 혼자 사용하는 가족 공간이라면 가족 데이터 전체가 삭제됩니다.</p>
            </>
          )}
        </div>
        <label className="danger-confirm-field">
          <span>계속하려면 <strong>{confirmationWord}</strong>라고 입력하세요.</span>
          <input value={confirmation} onChange={(event) => setConfirmation(event.target.value)} autoComplete="off" autoCapitalize="none" />
        </label>
        <button className="danger-confirm-button" type="button" disabled={confirmation.trim() !== confirmationWord || working} onClick={() => void confirm()}>
          {working ? "처리 중…" : isReset ? "모든 진행 기록 초기화" : "계정과 내 정보 영구 삭제"}
        </button>
      </section>
    </div>
  );
}

function FamilyMemberRemovalSheet({
  member,
  onConfirm,
  onClose,
}: {
  member: FamilyMember;
  onConfirm: () => Promise<void>;
  onClose: () => void;
}) {
  const confirmationWord = "연결해제";
  const [confirmation, setConfirmation] = useState("");
  const [working, setWorking] = useState(false);

  const confirm = async () => {
    if (confirmation.trim() !== confirmationWord) return;
    dismissMobileKeyboard();
    setWorking(true);
    try {
      await onConfirm();
    } finally {
      setWorking(false);
    }
  };

  return (
    <div className="sheet-backdrop member-removal-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="record-sheet compact-sheet data-control-sheet member-removal-sheet" role="dialog" aria-modal="true" aria-labelledby="member-removal-title" onMouseDown={(event) => event.stopPropagation()}>
        <div className="sheet-handle" aria-hidden="true" />
        <div className="sheet-heading">
          <div><span className="overline">가족 관리자 권한</span><h2 id="member-removal-title">{member.displayName}님의 연결을 해제할까요?</h2></div>
          <button className="close-button" type="button" onClick={onClose} aria-label="닫기"><X size={19} /></button>
        </div>
        <div className="data-control-summary">
          <p><strong>해제:</strong> 이 가족 공간과 아이 기록을 보고 수정할 권한</p>
          <p><strong>유지:</strong> 상대방의 로그인 계정과 지금까지 함께 작성한 기록</p>
          <p>필요하면 나중에 새 초대 코드로 다시 연결할 수 있어요.</p>
        </div>
        <label className="danger-confirm-field">
          <span>계속하려면 <strong>{confirmationWord}</strong>라고 입력하세요.</span>
          <input value={confirmation} onChange={(event) => setConfirmation(event.target.value)} autoComplete="off" autoCapitalize="none" />
        </label>
        <button className="danger-confirm-button" type="button" disabled={confirmation.trim() !== confirmationWord || working} onClick={() => void confirm()}>
          {working ? "연결 해제 중…" : `${member.displayName}님 가족 연결 해제`}
        </button>
      </section>
    </div>
  );
}

function FamilySyncSection({ onWorkspaceChange }: { onWorkspaceChange: () => void }) {
  const configured = isSupabaseConfigured();
  const [email, setEmail] = useState("");
  const [emailCode, setEmailCode] = useState("");
  const [loginRequested, setLoginRequested] = useState(false);
  const [loginEmail, setLoginEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [passwordLogin, setPasswordLogin] = useState("");
  const [emailAccount, setEmailAccount] = useState(false);
  const [anonymousAccount, setAnonymousAccount] = useState(false);
  const [accountEmail, setAccountEmail] = useState("");
  const [emailLinkSent, setEmailLinkSent] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [familyName, setFamilyName] = useState("우리 가족");
  const [inviteInput, setInviteInput] = useState("");
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [workspace, setWorkspace] = useState<FamilyWorkspace | null>(null);
  const [loading, setLoading] = useState(configured);
  const [message, setMessage] = useState<string | null>(null);
  const [needsDatabase, setNeedsDatabase] = useState(false);
  const [memberToRemove, setMemberToRemove] = useState<FamilyMember | null>(null);

  const refreshWorkspace = useCallback(async () => {
    try {
      setNeedsDatabase(false);
      const nextWorkspace = await loadFamilyWorkspace();
      setWorkspace(nextWorkspace);
      onWorkspaceChange();
    } catch (error) {
      const description = error instanceof Error ? error.message : String(error);
      setNeedsDatabase(/relation|schema cache|household_members/i.test(description));
      setWorkspace(null);
    }
  }, [onWorkspaceChange]);

  useEffect(() => {
    if (!configured) return;
    let active = true;
    const client = getSupabaseClient();
    client.auth.getSession().then(({ data }) => {
      if (!active) return;
      const nextUserLabel = data.session?.user ? data.session.user.email ?? "이 기기 보호자" : null;
      setEmailAccount(Boolean(data.session?.user.email && !data.session.user.is_anonymous));
      setAnonymousAccount(data.session?.user.is_anonymous === true);
      setUserEmail(nextUserLabel);
      setCurrentUserId(data.session?.user.id ?? null);
      if (nextUserLabel) void refreshWorkspace();
      setLoading(false);
    });
    const { data } = client.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      const nextUserLabel = session?.user ? session.user.email ?? "이 기기 보호자" : null;
      setEmailAccount(Boolean(session?.user.email && !session.user.is_anonymous));
      setAnonymousAccount(session?.user.is_anonymous === true);
      setUserEmail(nextUserLabel);
      setCurrentUserId(session?.user.id ?? null);
      setLoading(false);
      if (nextUserLabel) window.setTimeout(() => void refreshWorkspace(), 0);
      else {
        setEmailAccount(false);
        setAnonymousAccount(false);
        setWorkspace(null);
        onWorkspaceChange();
      }
    });
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, [configured, onWorkspaceChange, refreshWorkspace]);

  const connectThisDevice = async () => {
    setLoading(true);
    setMessage(null);
    try {
      await signInFamilyAnonymously();
      setUserEmail("이 기기 보호자");
      await refreshWorkspace();
      setMessage("이 기기를 보호자 계정으로 연결했어요. 이제 가족 코드를 입력해주세요.");
    } catch (error) {
      setMessage(familyAuthMessage(error, "이 기기를 연결하지 못했어요. 잠시 후 다시 시도해주세요."));
    } finally {
      setLoading(false);
    }
  };

  const requestLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    dismissMobileKeyboard();
    setLoading(true);
    setMessage(null);
    try {
      await sendFamilyLoginEmail(email, `${window.location.origin}/`);
      setLoginRequested(true);
      setLoginEmail(email.trim());
      setEmailCode("");
      setMessage("로그인 링크를 열어 인증한 뒤, 가족 동기화에서 비밀번호를 설정하면 다음부터는 이메일과 비밀번호로 로그인할 수 있어요.");
    } catch (error) {
      setMessage(familyAuthMessage(error, "로그인 코드를 보내지 못했어요. 이메일 주소를 확인해주세요."));
    } finally {
      setLoading(false);
    }
  };

  const verifyLoginCode = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    dismissMobileKeyboard();
    setLoading(true);
    setMessage(null);
    try {
      await verifyFamilyEmailCode(loginEmail, emailCode);
      setLoginRequested(false);
      setLoginEmail("");
      setEmailCode("");
      setMessage("로그인됐어요.");
    } catch (error) {
      setMessage(familyAuthMessage(error, "인증 코드가 다르거나 만료됐어요. 이메일을 확인하고 다시 시도해주세요."));
    } finally {
      setLoading(false);
    }
  };

  const loginWithPassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    dismissMobileKeyboard();
    setLoading(true);
    setMessage(null);
    try {
      await signInFamilyWithPassword(email, passwordLogin);
      setPasswordLogin("");
      setMessage("로그인됐어요.");
    } catch (error) {
      setMessage(familyAuthMessage(error, "이메일 또는 비밀번호를 확인해주세요."));
    } finally {
      setLoading(false);
    }
  };

  const savePassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    dismissMobileKeyboard();
    if (password !== passwordConfirmation) {
      setMessage("비밀번호가 서로 달라요. 다시 확인해주세요.");
      return;
    }
    setLoading(true);
    setMessage(null);
    try {
      await setFamilyPassword(password);
      setPassword("");
      setPasswordConfirmation("");
      setMessage("비밀번호를 설정했어요. 다음 기기부터 이메일과 비밀번호로 로그인할 수 있어요.");
    } catch (error) {
      setMessage(familyAuthMessage(error, "비밀번호를 설정하지 못했어요. 다시 시도해주세요."));
    } finally {
      setLoading(false);
    }
  };

  const linkCurrentAccountEmail = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    dismissMobileKeyboard();
    setLoading(true);
    setMessage(null);
    try {
      await linkFamilyAccountEmail(accountEmail, `${window.location.origin}/`);
      setEmailLinkSent(true);
      setMessage("확인 이메일 링크를 열어 이 계정에 이메일을 연결하세요. 데이터는 현재 가족 계정에 유지돼요.");
    } catch (error) {
      setMessage(familyAuthMessage(error, "이메일을 연결하지 못했어요. 주소와 Supabase 계정 연결 설정을 확인해주세요."));
    } finally {
      setLoading(false);
    }
  };

  const confirmAccountEmail = async () => {
    setLoading(true);
    setMessage(null);
    try {
      const account = await refreshFamilySession();
      if (account.isAnonymous || !account.email) {
        setMessage("아직 이메일 확인이 완료되지 않았어요. 받은 메일의 확인 링크를 연 뒤 다시 눌러주세요.");
        return;
      }
      setAnonymousAccount(false);
      setEmailAccount(true);
      setUserEmail(account.email);
      setEmailLinkSent(false);
      setMessage("이메일이 확인됐어요. 이제 아래에서 비밀번호를 설정하세요.");
    } catch (error) {
      setMessage(familyAuthMessage(error, "계정 상태를 새로 확인하지 못했어요. 확인 링크를 연 뒤 다시 시도해주세요."));
    } finally {
      setLoading(false);
    }
  };

  const createWorkspace = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    dismissMobileKeyboard();
    setLoading(true);
    setMessage(null);
    try {
      await createFamilyWorkspace(familyName, displayName);
      await refreshWorkspace();
      setMessage("가족 공간을 만들었어요.");
    } catch {
      setMessage("가족 공간을 만들지 못했어요. 데이터베이스 설정을 먼저 확인해주세요.");
    } finally {
      setLoading(false);
    }
  };

  const joinWorkspace = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    dismissMobileKeyboard();
    setLoading(true);
    setMessage(null);
    try {
      await joinFamilyWithCode(inviteInput, displayName);
      await refreshWorkspace();
      setMessage("가족 공간에 연결했어요.");
    } catch {
      setMessage("초대 코드가 다르거나 만료됐어요.");
    } finally {
      setLoading(false);
    }
  };

  const makeInvite = async () => {
    if (!workspace) return;
    setLoading(true);
    try {
      setInviteCode(await createFamilyInvite(workspace.householdId));
      setMessage("7일 동안 사용할 수 있는 초대 코드를 만들었어요.");
    } catch {
      setMessage("초대 코드는 가족 공간을 만든 계정에서 생성할 수 있어요.");
    } finally {
      setLoading(false);
    }
  };

  const copyInvite = async () => {
    if (!inviteCode) return;
    await navigator.clipboard.writeText(inviteCode);
    setMessage("초대 코드를 복사했어요.");
  };

  const confirmMemberRemoval = async () => {
    if (!workspace || !memberToRemove) return;
    setLoading(true);
    setMessage(null);
    try {
      const removedName = memberToRemove.displayName;
      await removeFamilyMember(workspace.householdId, memberToRemove.userId);
      setMemberToRemove(null);
      await refreshWorkspace();
      setMessage(`${removedName}님의 가족 연결을 해제했어요.`);
    } catch (error) {
      setMessage(dataControlMessage(error, "가족 연결을 해제하지 못했어요."));
    } finally {
      setLoading(false);
    }
  };

  const currentMember = workspace?.members.find((member) => member.userId === currentUserId);
  const canManageMembers = currentMember?.role === "owner";

  return (
    <>
    <section className="section-card family-sync-card">
      <div className="section-heading">
        <div>
          <span className="overline">함께 보는 사람</span>
          <h2>가족 동기화</h2>
        </div>
        <span className={`sync-status ${workspace ? "is-connected" : ""}`}>{workspace ? "연결됨" : userEmail ? "가족 연결 필요" : "로그인 필요"}</span>
      </div>

      {!configured && <p className="sync-copy">가족 공유 연결을 준비하는 중이에요. 잠시 후 다시 열어주세요.</p>}

      {configured && !userEmail && (
        <div className="device-connect-panel">
          <div className="email-login-panel">
            <div className="login-panel-heading">
              <span className="login-panel-icon"><Mail size={18} aria-hidden="true" /></span>
              <div>
                <strong>이메일로 로그인</strong>
                <p>비밀번호가 있으면 바로 로그인하고, 처음에는 이메일 링크로 인증해요.</p>
              </div>
            </div>
            <form className="sync-form" onSubmit={loginWithPassword}>
              <label><span>이메일</span><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@example.com" autoComplete="email" inputMode="email" required disabled={loading || loginRequested} /></label>
              <label><span>비밀번호</span><input type="password" value={passwordLogin} onChange={(event) => setPasswordLogin(event.target.value)} autoComplete="current-password" required disabled={loading} /></label>
              <button className="primary-action" type="submit" disabled={loading}>{loading ? "로그인 중…" : "이메일과 비밀번호로 로그인"}</button>
            </form>
            <div className="sync-divider"><span>처음 로그인 또는 비밀번호 재설정</span></div>
            <form className="sync-form" onSubmit={requestLogin}>
              <label><span>이메일</span><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@example.com" autoComplete="email" inputMode="email" required disabled={loading || loginRequested} /></label>
              <button className="secondary-action" type="submit" disabled={loading}><Mail size={17} aria-hidden="true" /> {loading ? "로그인 이메일 보내는 중…" : loginRequested ? "로그인 링크 다시 받기" : "로그인 링크 받기"}</button>
              <small>아이폰·아이패드마다 같은 이메일로 로그인하면 내 가족 공간을 다시 찾을 수 있어요.</small>
            </form>
            {loginRequested && (
              <form className="sync-form compact email-code-form" onSubmit={verifyLoginCode}>
                <p className="email-code-address">{loginEmail} 메일에 6자리 코드가 있으면 여기에 입력하세요. 링크만 있다면 Safari에서 열어 로그인한 뒤 아래 비밀번호 설정을 진행하세요.</p>
                <label><span>이메일 인증 코드</span><input type="text" value={emailCode} onChange={(event) => setEmailCode(event.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="6자리 코드" autoComplete="one-time-code" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} required disabled={loading} /></label>
                <button className="secondary-action" type="submit" disabled={loading || emailCode.length !== 6}>{loading ? "확인 중…" : "이 화면에서 로그인"}</button>
                <button className="text-action" type="button" disabled={loading} onClick={() => { setLoginRequested(false); setLoginEmail(""); setEmailCode(""); }}>다른 이메일 사용</button>
              </form>
            )}
          </div>
          <div className="sync-divider"><span>또는</span></div>
          <div className="guest-connect-panel">
            <button className="secondary-action" type="button" disabled={loading} onClick={() => void connectThisDevice()}><Link2 size={17} aria-hidden="true" /> {loading ? "이 기기 연결 중…" : "이 기기만 임시로 사용"}</button>
            <small>이메일 없이 바로 시작할 수 있지만, 로그아웃하거나 기기를 바꾸면 이 계정을 다시 찾을 수 없어요.</small>
          </div>
        </div>
      )}

      {userEmail && !workspace && (
        <div className="sync-setup">
          <p className="signed-email"><Check size={14} aria-hidden="true" /> {userEmail}</p>
          {needsDatabase && <p className="setup-warning">앱 연결은 완료됐어요. 이제 준비된 데이터베이스 SQL을 한 번 실행하면 가족 공간을 만들 수 있어요.</p>}
          <label><span>화면에 보일 이름</span><input value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="아빠 또는 엄마" /></label>
          <form className="sync-form compact" onSubmit={createWorkspace}>
            <label><span>새 가족 이름</span><input value={familyName} onChange={(event) => setFamilyName(event.target.value)} required /></label>
            <button className="primary-action" type="submit" disabled={!displayName.trim()}>새 가족 공간 만들기</button>
          </form>
          <div className="sync-divider"><span>또는</span></div>
          <form className="sync-form compact" onSubmit={joinWorkspace}>
            <label><span>배우자에게 받은 초대 코드</span><input value={inviteInput} onChange={(event) => setInviteInput(event.target.value.toUpperCase())} placeholder="10자리 코드" maxLength={10} /></label>
            <button className="secondary-action" type="submit" disabled={!displayName.trim() || inviteInput.length < 10}>초대 코드로 참여</button>
          </form>
        </div>
      )}

      {userEmail && anonymousAccount && (
        <form className="sync-form password-setup-form" onSubmit={linkCurrentAccountEmail}>
          <div>
            <strong>기존 가족 기록을 새 휴대폰에서도 사용하기</strong>
            <p>이 이메일을 현재 기기 계정에 연결하면 가족 공간과 기록을 그대로 유지할 수 있어요.</p>
          </div>
          {!emailLinkSent ? (
            <>
              <label><span>이메일</span><input type="email" value={accountEmail} onChange={(event) => setAccountEmail(event.target.value)} placeholder="name@example.com" autoComplete="email" inputMode="email" required disabled={loading} /></label>
              <button className="secondary-action" type="submit" disabled={loading}>{loading ? "확인 이메일 보내는 중…" : "이 계정에 이메일 연결"}</button>
              <small>Supabase Authentication → Providers에서 Manual Linking을 켜야 할 수 있어요. 이미 다른 Supabase 계정에 등록된 이메일은 연결할 수 없습니다.</small>
            </>
          ) : (
            <>
              <p className="email-code-address">{accountEmail}로 받은 링크를 Safari에서 열어 이메일을 확인한 다음 돌아오세요.</p>
              <button className="secondary-action" type="button" disabled={loading} onClick={() => void confirmAccountEmail()}>{loading ? "확인 중…" : "이메일 확인 완료"}</button>
            </>
          )}
        </form>
      )}

      {userEmail && emailAccount && (
        <form className="sync-form password-setup-form" onSubmit={savePassword}>
          <div>
            <strong>기기 변경에 대비해 비밀번호 설정</strong>
            <p>이메일 링크로 로그인한 상태에서 비밀번호를 설정하면, 새 휴대폰에서도 가족 계정에 로그인할 수 있어요.</p>
          </div>
          <label><span>새 비밀번호 (8자 이상)</span><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" minLength={8} required disabled={loading} /></label>
          <label><span>비밀번호 확인</span><input type="password" value={passwordConfirmation} onChange={(event) => setPasswordConfirmation(event.target.value)} autoComplete="new-password" minLength={8} required disabled={loading} /></label>
          <button className="secondary-action" type="submit" disabled={loading || password.length < 8 || passwordConfirmation.length < 8}>{loading ? "저장 중…" : "비밀번호 저장"}</button>
        </form>
      )}

      {userEmail && workspace && (
        <div className="sync-connected">
          <p className="signed-email"><Check size={14} aria-hidden="true" /> {workspace.householdName} · {userEmail}</p>
          <div className="family-list">
            {workspace.members.map((member, index) => (
              <div className="family-member-row" key={member.userId}>
                <span className={`family-avatar ${index % 2 ? "apricot" : "sage"}`}>{member.displayName.slice(0, 1)}</span>
                <p><strong>{member.displayName}</strong><br /><small>{member.role === "owner" ? "가족 관리자" : "보호자"}{member.userId === currentUserId ? " · 현재 계정" : ""}</small></p>
                {canManageMembers && member.userId !== currentUserId && (
                  <button className="member-remove-action" type="button" disabled={loading} onClick={() => setMemberToRemove(member)}>
                    <UserMinus size={14} aria-hidden="true" /> 연결 해제
                  </button>
                )}
              </div>
            ))}
          </div>
          {inviteCode ? (
            <button className="invite-code" type="button" onClick={copyInvite}><span>{inviteCode}</span><small>눌러서 복사</small></button>
          ) : (
            <button className="secondary-action" type="button" onClick={makeInvite}><Link2 size={16} /> 배우자 초대 코드 만들기</button>
          )}
          <button className="signout-action" type="button" onClick={() => void signOutFamily()}><LogOut size={14} /> 이 기기에서 로그아웃</button>
        </div>
      )}

      {message && <p className="sync-message" role="status">{message}</p>}
    </section>
    {memberToRemove && (
      <FamilyMemberRemovalSheet
        member={memberToRemove}
        onConfirm={confirmMemberRemoval}
        onClose={() => setMemberToRemove(null)}
      />
    )}
    </>
  );
}

function IngredientSheet({
  ingredient,
  state,
  onSaveState,
  onEditCustom,
  onClose,
}: {
  ingredient: IngredientDefinition;
  state?: ChildIngredientState;
  onSaveState: (status: ChildIngredientState["status"], testDay: number | null) => Promise<void>;
  onEditCustom?: () => void;
  onClose: () => void;
}) {
  const [status, setStatus] = useState<ChildIngredientState["status"]>(state?.status ?? "ready");
  const [testDay, setTestDay] = useState(state?.testDay ?? 1);
  const [saving, setSaving] = useState(false);
  const guidance = ingredient.id.startsWith("custom-")
    ? "직접 추가한 재료예요. 가족의 계획에 맞춰 도입 시기를 정할 수 있어요."
    : ingredient.bookGuidance ?? "앞선 재료에 적응한 뒤 한 가지씩 열어요.";
  const preparation = ingredient.preparationConstraints?.length
    ? ingredient.preparationConstraints.join(" · ")
    : ingredient.chokingFormBlacklist?.length
      ? ingredient.chokingFormBlacklist.map((item) => `${item} 제외`).join(" · ")
      : "단계에 맞게 충분히 부드럽게 조리";

  return (
    <div className="sheet-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="record-sheet compact-sheet" role="dialog" aria-modal="true" aria-labelledby="ingredient-title" onMouseDown={(event) => event.stopPropagation()}>
        <div className="sheet-handle" aria-hidden="true" />
        <div className="sheet-heading">
          <div className="ingredient-sheet-title">
            <IngredientVisual ingredient={ingredient} className="is-sheet" />
            <div><span className="overline">도입 순서 {ingredient.introductionPriority}</span><h2 id="ingredient-title">{ingredient.name}</h2></div>
          </div>
          <button className="close-button" type="button" onClick={onClose} aria-label="닫기"><X size={19} /></button>
        </div>
        <dl className="detail-list">
          <div><dt>책의 흐름</dt><dd>{guidance}</dd></div>
          {ingredient.allergenGroup && <div><dt>알레르기 주의</dt><dd>{allergenGroupLabels[ingredient.allergenGroup]} 관련 재료 · 다른 새 재료와 겹치지 않게 한 가지씩 기록해요.</dd></div>}
          <div><dt>도입 시기</dt><dd>만 {ingredient.minimumAgeMonths ?? 6}개월부터 · {stageLabels[ingredient.minimumStage]}</dd></div>
          <div><dt>조리·안전</dt><dd>{preparation}</dd></div>
          {ingredient.frequencyCap7Days && <div><dt>빈도 제한</dt><dd>최근 7일 최대 {ingredient.frequencyCap7Days}회</dd></div>}
          <div><dt>현재 상태</dt><dd>{state ? ingredientStatusLabels[state.status] : "미도입"}{state?.status === "testing" ? ` · ${state.testDay ?? 1}/3일` : ""}</dd></div>
          <div><dt>책 근거</dt><dd>{ingredient.sourcePages?.length ? ingredient.sourcePages.join(" · ") : "가족이 직접 추가한 재료"}</dd></div>
          <div><dt>기록 방법</dt><dd>섭취량, 단순 거부, 질감 어려움, 이상 반응을 각각 나누어 기록해요.</dd></div>
        </dl>
        <section className="ingredient-state-editor" aria-labelledby="ingredient-state-title">
          <div>
            <span className="overline">가족 보정</span>
            <h3 id="ingredient-state-title">재료 상태 직접 수정</h3>
          </div>
          <div className="ingredient-state-options">
            {(["ready", "testing", "passed", "rejected", "paused", "suspectedReaction", "avoid"] as ChildIngredientState["status"][]).map((value) => (
              <button className={status === value ? "is-selected" : ""} type="button" key={value} onClick={() => setStatus(value)} aria-pressed={status === value}>
                {ingredientStatusLabels[value]}
              </button>
            ))}
          </div>
          {status === "testing" && (
            <div className="trial-day-picker" aria-label="도입 관찰 일차">
              {[1, 2, 3].map((day) => (
                <button className={testDay === day ? "is-selected" : ""} type="button" key={day} onClick={() => setTestDay(day)} aria-pressed={testDay === day}>{day}/3일</button>
              ))}
            </div>
          )}
          <button
            className="secondary-action"
            type="button"
            disabled={saving}
            onClick={() => {
              setSaving(true);
              void onSaveState(status, status === "testing" ? testDay : null).finally(() => setSaving(false));
            }}
          >
            {saving ? "가족 공간에 저장 중…" : "이 상태로 저장"}
          </button>
        </section>
        {onEditCustom && <button className="custom-edit-action" type="button" onClick={onEditCustom}>직접 추가한 재료 편집·삭제</button>}
        <button className="primary-action" type="button" onClick={onClose}>확인했어요</button>
      </section>
    </div>
  );
}

function AddIngredientSheet({
  ingredients,
  onAdd,
  onClose,
}: {
  ingredients: IngredientDefinition[];
  onAdd: (name: string, category: IngredientCategory, assetId: string) => Promise<void>;
  onClose: () => void;
}) {
  const [name, setName] = useState("");
  const [category, setCategory] = useState<IngredientCategory>("vegetable");
  const [assetId, setAssetId] = useState("broccoli");
  const [saving, setSaving] = useState(false);
  const matchingIngredient = ingredients.find(
    (ingredient) => ingredient.name.replace(/\s/g, "") === name.trim().replace(/\s/g, ""),
  );
  const assetChoices = ingredientDefinitions.filter(
    (ingredient) => ingredient.category === category && ingredientAssetPaths[ingredient.id],
  );

  const chooseCategory = (nextCategory: IngredientCategory) => {
    setCategory(nextCategory);
    const firstAsset = ingredientDefinitions.find(
      (ingredient) => ingredient.category === nextCategory && ingredientAssetPaths[ingredient.id],
    );
    if (firstAsset) setAssetId(firstAsset.id);
  };

  const changeName = (value: string) => {
    setName(value);
    const normalized = value.trim().replace(/\s/g, "");
    const match = ingredientDefinitions.find(
      (ingredient) => ingredient.name.replace(/\s/g, "") === normalized,
    );
    if (match) {
      setCategory(match.category);
      setAssetId(match.id);
    }
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    dismissMobileKeyboard();
    const trimmedName = name.trim();
    if (!trimmedName || !assetId || matchingIngredient) return;
    setSaving(true);
    try {
      await onAdd(trimmedName, category, assetId);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="sheet-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="record-sheet compact-sheet" role="dialog" aria-modal="true" aria-labelledby="add-ingredient-title" onMouseDown={(event) => event.stopPropagation()}>
        <div className="sheet-handle" aria-hidden="true" />
        <div className="sheet-heading">
          <div><span className="overline">내 재료</span><h2 id="add-ingredient-title">재료 직접 추가</h2></div>
          <button className="close-button" type="button" onClick={onClose} aria-label="닫기"><X size={19} /></button>
        </div>
        <form className="ingredient-form" onSubmit={(event) => void submit(event)}>
          <label className="form-field">
            <span>재료 이름</span>
            <input aria-label="재료 이름" value={name} onChange={(event) => changeName(event.target.value)} placeholder="예: 감자" autoFocus />
          </label>
          <fieldset className="form-field">
            <legend>책 식품군</legend>
            <div className="category-picker">
              {categoryOrder.map((value) => (
                <button
                  className={category === value ? "is-selected" : ""}
                  type="button"
                  key={value}
                  onClick={() => chooseCategory(value)}
                  aria-pressed={category === value}
                >
                  {categoryLabels[value]}
                </button>
              ))}
            </div>
          </fieldset>
          <fieldset className="form-field">
            <legend>재료 이미지</legend>
            <div className="asset-picker">
              {assetChoices.map((ingredient) => (
                <button
                  className={assetId === ingredient.id ? "is-selected" : ""}
                  type="button"
                  key={ingredient.id}
                  onClick={() => setAssetId(ingredient.id)}
                  aria-label={`${ingredient.name} 이미지 선택`}
                  aria-pressed={assetId === ingredient.id}
                >
                  <IngredientVisual ingredient={ingredient} />
                  <span>{ingredient.name}</span>
                  {assetId === ingredient.id && <Check size={14} aria-hidden="true" />}
                </button>
              ))}
            </div>
          </fieldset>
          <p>{matchingIngredient ? `${matchingIngredient.name}은(는) 가족 재료 목록에 이미 있어요.` : "책의 식품군을 고르고, 재료에 맞는 이미지를 직접 선택할 수 있어요."}</p>
          <button className="primary-action" type="submit" disabled={!name.trim() || !assetId || Boolean(matchingIngredient) || saving}>
            {matchingIngredient ? "이미 등록된 재료예요" : saving ? "가족 공간에 저장 중…" : "재료 추가"}
          </button>
        </form>
      </section>
    </div>
  );
}

function EditCustomIngredientSheet({
  ingredient,
  ingredients,
  onSave,
  onArchive,
  onClose,
}: {
  ingredient: IngredientDefinition;
  ingredients: IngredientDefinition[];
  onSave: (ingredient: IngredientDefinition) => Promise<void>;
  onArchive: () => Promise<void>;
  onClose: () => void;
}) {
  const [name, setName] = useState(ingredient.name);
  const [category, setCategory] = useState<IngredientCategory>(ingredient.category);
  const [assetId, setAssetId] = useState(ingredient.assetId ?? "broccoli");
  const [saving, setSaving] = useState(false);
  const [confirmingArchive, setConfirmingArchive] = useState(false);
  const duplicate = ingredients.find(
    (item) => item.id !== ingredient.id && item.name.replace(/\s/g, "") === name.trim().replace(/\s/g, ""),
  );
  const assetChoices = ingredientDefinitions.filter(
    (item) => item.category === category && ingredientAssetPaths[item.id],
  );

  const chooseCategory = (nextCategory: IngredientCategory) => {
    setCategory(nextCategory);
    const firstAsset = ingredientDefinitions.find(
      (item) => item.category === nextCategory && ingredientAssetPaths[item.id],
    );
    if (firstAsset) setAssetId(firstAsset.id);
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    dismissMobileKeyboard();
    if (!name.trim() || duplicate || !assetId) return;
    setSaving(true);
    try {
      await onSave({
        ...ingredient,
        name: name.trim(),
        category,
        assetId,
        ...customIngredientTraits(category, assetId),
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="sheet-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="record-sheet compact-sheet" role="dialog" aria-modal="true" aria-labelledby="edit-custom-title" onMouseDown={(event) => event.stopPropagation()}>
        <div className="sheet-handle" aria-hidden="true" />
        <div className="sheet-heading">
          <div><span className="overline">가족 재료</span><h2 id="edit-custom-title">직접 추가한 재료 편집</h2></div>
          <button className="close-button" type="button" onClick={onClose} aria-label="닫기"><X size={19} /></button>
        </div>
        <form className="ingredient-form" onSubmit={(event) => void submit(event)}>
          <label className="form-field">
            <span>재료 이름</span>
            <input value={name} onChange={(event) => setName(event.target.value)} autoFocus />
          </label>
          <fieldset className="form-field">
            <legend>책 식품군</legend>
            <div className="category-picker">
              {categoryOrder.map((value) => (
                <button className={category === value ? "is-selected" : ""} type="button" key={value} onClick={() => chooseCategory(value)} aria-pressed={category === value}>
                  {categoryLabels[value]}
                </button>
              ))}
            </div>
          </fieldset>
          <fieldset className="form-field">
            <legend>재료 이미지</legend>
            <div className="asset-picker">
              {assetChoices.map((item) => (
                <button className={assetId === item.id ? "is-selected" : ""} type="button" key={item.id} onClick={() => setAssetId(item.id)} aria-label={`${item.name} 이미지 선택`} aria-pressed={assetId === item.id}>
                  <IngredientVisual ingredient={item} />
                  <span>{item.name}</span>
                  {assetId === item.id && <Check size={14} aria-hidden="true" />}
                </button>
              ))}
            </div>
          </fieldset>
          <p>{duplicate ? `${duplicate.name}은(는) 가족 재료 목록에 이미 있어요.` : "수정 내용은 연결된 모든 기기에 반영됩니다."}</p>
          <button className="primary-action" type="submit" disabled={!name.trim() || Boolean(duplicate) || saving}>
            {saving ? "수정 내용 저장 중…" : "수정 내용 저장"}
          </button>
        </form>
        <div className="archive-zone">
          {!confirmingArchive ? (
            <button type="button" onClick={() => setConfirmingArchive(true)}>가족 목록에서 삭제</button>
          ) : (
            <div>
              <p><strong>{ingredient.name}</strong>을(를) 가족 목록에서 삭제할까요? 기존 식사 기록은 유지됩니다.</p>
              <span>
                <button type="button" onClick={() => setConfirmingArchive(false)}>취소</button>
                <button className="confirm-archive" type="button" disabled={saving} onClick={() => { setSaving(true); void onArchive().finally(() => setSaving(false)); }}>삭제</button>
              </span>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function BabyProfileSheet({
  profile,
  onSave,
  onClose,
}: {
  profile: BabyProfile;
  onSave: (profile: BabyProfile) => Promise<void>;
  onClose: () => void;
}) {
  const [nickname, setNickname] = useState(profile.nickname);
  const [birthDate, setBirthDate] = useState(profile.birthDate ?? "");
  const [weaningStartDate, setWeaningStartDate] = useState(profile.weaningStartDate ?? "");
  const [readiness, setReadiness] = useState<ReadinessSignals>(profile.readiness ?? {
    tongueThrustGone: false,
    headControl: false,
    sitsWithSupport: false,
    foodInterest: false,
  });
  const [saving, setSaving] = useState(false);
  const today = toDateId(new Date());

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    dismissMobileKeyboard();
    setSaving(true);
    try {
      await onSave({
        ...profile,
        nickname: nickname.trim(),
        birthDate,
        weaningStartDate: weaningStartDate || null,
        readiness,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="sheet-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="record-sheet compact-sheet" role="dialog" aria-modal="true" aria-labelledby="baby-profile-title" onMouseDown={(event) => event.stopPropagation()}>
        <div className="sheet-handle" aria-hidden="true" />
        <div className="sheet-heading">
          <div><span className="overline">추천의 기준</span><h2 id="baby-profile-title">우리 아이 정보</h2></div>
          <button className="close-button" type="button" onClick={onClose} aria-label="닫기"><X size={19} /></button>
        </div>
        <form className="profile-form" onSubmit={(event) => void submit(event)}>
          <label className="form-field">
            <span>화면에 보일 이름</span>
            <input type="text" value={nickname} onChange={(event) => setNickname(event.target.value)} placeholder="우리 아기" autoComplete="off" />
          </label>
          <div className="profile-date-grid">
            <label className="form-field">
              <span>생년월일</span>
              <input type="date" max={today} value={birthDate} onChange={(event) => setBirthDate(event.target.value)} />
            </label>
            <label className="form-field">
              <span>예상 또는 실제 시작일</span>
              <input type="date" min={birthDate || undefined} value={weaningStartDate} onChange={(event) => setWeaningStartDate(event.target.value)} />
            </label>
          </div>
          <fieldset className="form-field">
            <legend>시작 준비 신호</legend>
            <div className="readiness-picker">
              {(Object.keys(readinessLabels) as (keyof ReadinessSignals)[]).map((key) => (
                <label className={readiness[key] ? "is-checked" : ""} key={key}>
                  <input
                    type="checkbox"
                    checked={readiness[key]}
                    onChange={(event) => setReadiness((current) => ({ ...current, [key]: event.target.checked }))}
                  />
                  <span>{readinessLabels[key]}</span>
                  {readiness[key] && <Check size={17} aria-hidden="true" />}
                </label>
              ))}
            </div>
          </fieldset>
          <p>이 정보와 누적 식사 기록을 함께 보고 다음 재료·끼니·질감을 계산합니다.</p>
          <button className="primary-action" type="submit" disabled={!nickname.trim() || !birthDate || saving}>
            {saving ? "가족 공간에 저장 중…" : "아이 정보 저장"}
          </button>
        </form>
      </section>
    </div>
  );
}

function FeedingPlanSheet({
  profile,
  progression,
  onSave,
  onClose,
}: {
  profile: BabyProfile;
  progression?: ProgressionProposal;
  onSave: (profile: BabyProfile) => Promise<void>;
  onClose: () => void;
}) {
  const [stage, setStage] = useState<WeaningStage>(profile.stage);
  const [mealsPerDay, setMealsPerDay] = useState(profile.mealsPerDay);
  const [snacksPerDay, setSnacksPerDay] = useState(profile.snacksPerDay ?? 0);
  const [milkMlPerDay, setMilkMlPerDay] = useState(profile.milkMlPerDay?.toString() ?? "");
  const [textureMm, setTextureMm] = useState(Math.max(1, profile.textureMm || 1));
  const [temporaryCondition, setTemporaryCondition] = useState<TemporaryCondition>(profile.temporaryCondition ?? "none");
  const [skills, setSkills] = useState<DevelopmentSkills>(profile.skills ?? {
    handlesCurrentTexture: false,
    reachesAndGrasps: false,
    fingerFood: false,
    spoonPractice: false,
    cupPractice: false,
  });
  const [saving, setSaving] = useState(false);
  const guide = stage === "prestart" ? getStageGuide("initial") : getStageGuide(stage);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    dismissMobileKeyboard();
    setSaving(true);
    try {
      await onSave({
        ...profile,
        stage,
        mealsPerDay,
        snacksPerDay,
        milkMlPerDay: milkMlPerDay ? Number(milkMlPerDay) : null,
        textureMm,
        temporaryCondition,
        skills,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="sheet-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="record-sheet compact-sheet" role="dialog" aria-modal="true" aria-labelledby="feeding-plan-title" onMouseDown={(event) => event.stopPropagation()}>
        <div className="sheet-handle" aria-hidden="true" />
        <div className="sheet-heading">
          <div><span className="overline">책 기반 운영 설정</span><h2 id="feeding-plan-title">단계·끼니·질감</h2></div>
          <button className="close-button" type="button" onClick={onClose} aria-label="닫기"><X size={19} /></button>
        </div>
        <form className="feeding-plan-form" onSubmit={(event) => void submit(event)}>
          {progression?.action === "advance" && (
            <div className="sheet-progression-banner">
              <p><strong>{progression.title}</strong><small>{progression.detail}</small></p>
              <button type="button" onClick={() => {
                if (progression.targetStage) setStage(progression.targetStage);
                setTextureMm(progression.targetTextureMm);
              }}>제안값 넣기</button>
            </div>
          )}
          <fieldset className="form-field">
            <legend>현재 단계</legend>
            <div className="stage-picker">
              {(Object.keys(feedingStageLabels) as WeaningStage[]).map((value) => (
                <button className={stage === value ? "is-selected" : ""} type="button" key={value} onClick={() => setStage(value)} aria-pressed={stage === value}>
                  {feedingStageLabels[value]}
                </button>
              ))}
            </div>
          </fieldset>
          <div className="feeding-number-grid">
            <label className="form-field">
              <span>하루 이유식</span>
              <select value={mealsPerDay} onChange={(event) => setMealsPerDay(Number(event.target.value))}>
                {[1, 2, 3].map((value) => <option value={value} key={value}>{value}끼</option>)}
              </select>
            </label>
            <label className="form-field">
              <span>하루 간식</span>
              <select value={snacksPerDay} onChange={(event) => setSnacksPerDay(Number(event.target.value))}>
                {[0, 1, 2, 3].map((value) => <option value={value} key={value}>{value}회</option>)}
              </select>
            </label>
            <label className="form-field">
              <span>하루 수유량</span>
              <input type="number" min="0" max="2000" inputMode="numeric" value={milkMlPerDay} onChange={(event) => setMilkMlPerDay(event.target.value)} placeholder={`${guide.milkMlRange[0]}–${guide.milkMlRange[1]}ml`} />
            </label>
          </div>
          <label className="texture-control">
            <span><strong>현재 질감</strong><b>{textureMm}mm 안팎</b></span>
            <input type="range" min="1" max="15" step="1" value={textureMm} onChange={(event) => setTextureMm(Number(event.target.value))} />
            <small>{feedingStageLabels[stage]} 책 범위: {guide.textureMmRange[0]}–{guide.textureMmRange[1]}mm · {guide.textureDescription}</small>
          </label>
          <fieldset className="form-field">
            <legend>오늘의 일시 상태</legend>
            <div className="condition-picker">
              {(Object.keys(temporaryConditionLabels) as TemporaryCondition[]).map((value) => (
                <button className={temporaryCondition === value ? "is-selected" : ""} type="button" key={value} onClick={() => setTemporaryCondition(value)} aria-pressed={temporaryCondition === value}>
                  {temporaryConditionLabels[value]}
                </button>
              ))}
            </div>
          </fieldset>
          <fieldset className="form-field">
            <legend>현재 먹기 기술</legend>
            <div className="readiness-picker compact-readiness">
              {(Object.keys(developmentSkillLabels) as (keyof DevelopmentSkills)[]).map((key) => (
                <label className={skills[key] ? "is-checked" : ""} key={key}>
                  <input type="checkbox" checked={skills[key]} onChange={(event) => setSkills((current) => ({ ...current, [key]: event.target.checked }))} />
                  <span>{developmentSkillLabels[key]}</span>
                  {skills[key] && <Check size={17} aria-hidden="true" />}
                </label>
              ))}
            </div>
          </fieldset>
          <button className="primary-action" type="submit" disabled={saving}>
            {saving ? "가족 공간에 저장 중…" : "운영 설정 저장"}
          </button>
        </form>
      </section>
    </div>
  );
}

function SettingSheet({
  settingKey,
  value,
  onSelect,
  onClose,
}: {
  settingKey: ChoiceSettingKey;
  value: string;
  onSelect: (value: string) => void;
  onClose: () => void;
}) {
  const option = settingOptions[settingKey];

  return (
    <div className="sheet-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="record-sheet compact-sheet" role="dialog" aria-modal="true" aria-labelledby="setting-title" onMouseDown={(event) => event.stopPropagation()}>
        <div className="sheet-handle" aria-hidden="true" />
        <div className="sheet-heading">
          <div><span className="overline">우리 아이 설정</span><h2 id="setting-title">{option.title}</h2></div>
          <button className="close-button" type="button" onClick={onClose} aria-label="닫기"><X size={19} /></button>
        </div>
        <div className="setting-options">
          {option.values.map((item) => (
            <button className={item === value ? "is-selected" : ""} type="button" key={item} onClick={() => onSelect(item)} aria-pressed={item === value}>
              <span>{item}</span>{item === value ? <Check size={18} aria-hidden="true" /> : <ChevronRight size={18} aria-hidden="true" />}
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

function MealTimesSettingSheet({
  profile,
  onSave,
  onClose,
}: {
  profile: BabyProfile;
  onSave: (profile: BabyProfile) => Promise<void>;
  onClose: () => void;
}) {
  const mealCount = Math.max(1, Math.min(3, profile.mealsPerDay));
  const [times, setTimes] = useState(() => resolveMealTimes(profile, mealCount));
  const [saving, setSaving] = useState(false);
  const minuteValues = times.map((time) => {
    const [hour, minute] = time.split(":").map(Number);
    return hour * 60 + minute;
  });
  const isOrdered = minuteValues.every((value, index) => index === 0 || value > minuteValues[index - 1]);
  const hasShortGap = minuteValues.some((value, index) => index > 0 && value - minuteValues[index - 1] < 120);

  const saveTimes = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    dismissMobileKeyboard();
    if (!isOrdered) return;
    setSaving(true);
    try {
      await onSave({ ...profile, preferredMealTime: times[0], mealTimes: times });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="sheet-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="record-sheet compact-sheet" role="dialog" aria-modal="true" aria-labelledby="time-setting-title" onMouseDown={(event) => event.stopPropagation()}>
        <div className="sheet-handle" aria-hidden="true" />
        <div className="sheet-heading">
          <div><span className="overline">우리 아이 설정</span><h2 id="time-setting-title">끼니 시간</h2></div>
          <button className="close-button" type="button" onClick={onClose} aria-label="닫기"><X size={19} /></button>
        </div>
        <form className="time-form" onSubmit={(event) => void saveTimes(event)}>
          <p>책의 4시간 간격은 예시입니다. 실제 수면·수유 리듬에 맞게 각 끼니 시간을 조정하세요.</p>
          <div className="meal-time-list">
            {times.map((time, index) => (
              <label className="meal-time-row" key={index}>
                <span>{index + 1}번째 이유식</span>
                <input
                  aria-label={`${index + 1}번째 이유식 시간`}
                  type="time"
                  step="300"
                  value={time}
                  onInput={(event) => setTimes((current) => current.map((item, itemIndex) => itemIndex === index ? event.currentTarget.value : item))}
                  onChange={(event) => setTimes((current) => current.map((item, itemIndex) => itemIndex === index ? event.target.value : item))}
                />
              </label>
            ))}
          </div>
          {!isOrdered && <p className="time-warning">같은 날의 이른 시간부터 순서대로 설정해주세요.</p>}
          {isOrdered && hasShortGap && <p className="time-warning">끼니 간격이 2시간보다 짧아요. 수유·수면 일정과 겹치지 않는지 확인해주세요.</p>}
          <p>간식 시간은 저장한 끼니 사이로 자동 배치됩니다.</p>
          <button className="primary-action" type="submit" disabled={!isOrdered || saving}>{saving ? "가족 공간에 저장 중…" : "끼니 시간 저장"}</button>
        </form>
      </section>
    </div>
  );
}

function RoutineLogSheet({
  targetDate,
  childId,
  initialLog,
  onClose,
  onSave,
}: {
  targetDate: string;
  childId: string;
  initialLog?: DailyRoutineLog;
  onClose: () => void;
  onSave: (log: DailyRoutineLog) => Promise<void>;
}) {
  const [milkMl, setMilkMl] = useState(initialLog?.milkMl?.toString() ?? "");
  const [snackCount, setSnackCount] = useState(initialLog?.snackCount ?? 0);
  const [fingerFood, setFingerFood] = useState(initialLog?.fingerFood ?? false);
  const [spoonPractice, setSpoonPractice] = useState(initialLog?.spoonPractice ?? false);
  const [cupPractice, setCupPractice] = useState(initialLog?.cupPractice ?? false);
  const [note, setNote] = useState(initialLog?.note ?? "");
  const [saving, setSaving] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    dismissMobileKeyboard();
    setSaving(true);
    try {
      await onSave({
        childId,
        date: targetDate,
        milkMl: milkMl === "" ? null : Number(milkMl),
        snackCount,
        fingerFood,
        spoonPractice,
        cupPractice,
        note,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="sheet-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="record-sheet compact-sheet" role="dialog" aria-modal="true" aria-labelledby="routine-log-title" onMouseDown={(event) => event.stopPropagation()}>
        <div className="sheet-handle" aria-hidden="true" />
        <div className="sheet-heading">
          <div><span className="overline">{formatKoreanDate(targetDate)}</span><h2 id="routine-log-title">하루 흐름 기록</h2></div>
          <button className="close-button" type="button" onClick={onClose} aria-label="닫기"><X size={19} /></button>
        </div>
        <form className="feeding-plan-form routine-log-form" onSubmit={(event) => void submit(event)}>
          <label className="form-field">
            <span>하루 수유량</span>
            <div className="input-with-unit"><input type="number" min="0" max="2000" inputMode="numeric" value={milkMl} onChange={(event) => setMilkMl(event.target.value)} placeholder="예: 650" /><b>ml</b></div>
          </label>
          <fieldset className="form-field">
            <legend>간식 횟수</legend>
            <div className="condition-picker routine-count-picker">
              {[0, 1, 2, 3].map((count) => <button className={snackCount === count ? "is-selected" : ""} type="button" key={count} onClick={() => setSnackCount(count)}>{count}회</button>)}
            </div>
          </fieldset>
          <fieldset className="form-field">
            <legend>오늘 연습한 것</legend>
            <div className="readiness-picker compact-readiness">
              {[
                { label: "핑거푸드", checked: fingerFood, setChecked: setFingerFood },
                { label: "숟가락", checked: spoonPractice, setChecked: setSpoonPractice },
                { label: "컵", checked: cupPractice, setChecked: setCupPractice },
              ].map(({ label, checked, setChecked }) => (
                <label className={checked ? "is-checked" : ""} key={label}>
                  <input type="checkbox" checked={checked} onChange={(event) => setChecked(event.target.checked)} />
                  <span>{label}</span>{checked && <Check size={17} aria-hidden="true" />}
                </label>
              ))}
            </div>
          </fieldset>
          <label className="form-field"><span>메모</span><textarea rows={3} value={note} onChange={(event) => setNote(event.target.value)} placeholder="수유·간식 시간이나 먹기 연습에서 기억할 점" /></label>
          <button className="primary-action" type="submit" disabled={saving}>{saving ? "가족 기록에 저장 중…" : "하루 흐름 저장"}</button>
        </form>
      </section>
    </div>
  );
}

function RecordSheet({
  targetDate,
  mealIndex,
  plannedTime,
  mealSummary,
  initialRecord,
  onClose,
  onSave,
}: {
  targetDate: string;
  mealIndex: number;
  plannedTime: string;
  mealSummary: { title: string; ingredientNames: string[] } | null;
  initialRecord: FamilyMealRecord | null;
  onClose: () => void;
  onSave: (draft: RecordDraft) => Promise<void>;
}) {
  const initialAmount: Amount = initialRecord && ["taste", "quarter", "half", "most"].includes(initialRecord.completion)
    ? initialRecord.completion as Amount
    : "quarter";
  const [amount, setAmount] = useState<Amount>(initialAmount);
  const [reaction, setReaction] = useState<FamilyMealReaction>(initialRecord?.reaction ?? "none");
  const [note, setNote] = useState(initialRecord?.note ?? "");
  const [saving, setSaving] = useState(false);

  const submitRecord = async () => {
    dismissMobileKeyboard();
    setSaving(true);
    try {
      await onSave({ amount, reaction, note });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="sheet-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="record-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="record-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="sheet-handle" aria-hidden="true" />
        <div className="sheet-heading">
          <div>
            <span className="overline">{formatKoreanDate(targetDate)} · {formatKoreanTime(plannedTime)}</span>
            <h2 id="record-title">{initialRecord ? `${mealIndex}번째 식사 기록을 수정할까요?` : `${mealIndex}번째 식사는 어땠나요?`}</h2>
          </div>
          <button className="close-button" type="button" onClick={onClose} aria-label="닫기"><X size={19} /></button>
        </div>

        {mealSummary && (
          <p className="record-sheet-meal">
            <strong>{mealSummary.title}</strong>
            <small>{mealSummary.ingredientNames.join(" · ")}</small>
          </p>
        )}

        <fieldset>
          <legend>얼마나 먹었나요?</legend>
          <div className="amount-options">
            {(Object.keys(amountLabels) as Amount[]).map((value) => (
              <button
                type="button"
                className={amount === value ? "is-selected" : ""}
                key={value}
                onClick={() => setAmount(value)}
                aria-pressed={amount === value}
              >
                <span aria-hidden="true">{value === "taste" ? "◔" : value === "quarter" ? "◑" : value === "half" ? "◕" : "●"}</span>
                {amountLabels[value]}
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend>특별한 반응이 있었나요?</legend>
          <div className="reaction-options">
            {[
              ["none", "없었어요"],
              ["taste_rejection", "맛을 거부했어요"],
              ["texture_difficulty", "질감이 어려웠어요"],
              ["needs_review", "확인이 필요해요"],
            ].map(([value, label]) => (
              <label key={value}>
                <input
                  type="radio"
                  name="reaction"
                  value={value}
                  checked={reaction === value}
                  onChange={() => setReaction(value as FamilyMealReaction)}
                />
                <span>{label}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <label className="note-field">
          <span>함께 볼 메모</span>
          <textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="첫 숟가락은 밀어냈지만 두 번째는 삼켰어요." rows={3} />
        </label>

        <button className="primary-action" type="button" onClick={() => void submitRecord()} disabled={saving}>{saving ? "가족 기록에 저장 중…" : initialRecord ? "수정 내용 저장" : "기록 저장"}</button>
      </section>
    </div>
  );
}

export function MealApp() {
  const [activeTab, setActiveTab] = useState<Tab>("today");
  const [previewStarted, setPreviewStarted] = useState(false);
  const [recordTarget, setRecordTarget] = useState<RecordTarget | null>(null);
  const [mealChoice, setMealChoice] = useState<MealChoice | null>(null);
  const [todayId, setTodayId] = useState(() => toDateId(new Date()));
  const [records, setRecords] = useState<FamilyMealRecord[]>([]);
  const [routineLogs, setRoutineLogs] = useState<DailyRoutineLog[]>([]);
  const [routineLogOpen, setRoutineLogOpen] = useState(false);
  const [routineTargetDate, setRoutineTargetDate] = useState(() => toDateId(new Date()));
  const [familyWorkspace, setFamilyWorkspace] = useState<FamilyWorkspace | null>(null);
  const [familyDataRefreshError, setFamilyDataRefreshError] = useState<string | null>(null);
  const familyDataUserIdRef = useRef<string | null>(null);
  const familyDataRequestRef = useRef(0);
  const [selectedDate, setSelectedDate] = useState(() => toDateId(new Date()));
  const [calendarCursor, setCalendarCursor] = useState<CalendarCursor>(() => {
    const today = new Date();
    return { year: today.getFullYear(), month: today.getMonth() };
  });
  const [selectedIngredient, setSelectedIngredient] = useState<IngredientDefinition | null>(null);
  const [editingCustomIngredient, setEditingCustomIngredient] = useState<IngredientDefinition | null>(null);
  const [ingredientStates, setIngredientStates] = useState<ChildIngredientState[]>([]);
  const [mealHistory, setMealHistory] = useState<MealHistoryEntry[]>([]);
  const [customIngredients, setCustomIngredients] = useState<IngredientDefinition[]>([]);
  const [addIngredientOpen, setAddIngredientOpen] = useState(false);
  const [startWeaningOpen, setStartWeaningOpen] = useState(false);
  const [profileEditorOpen, setProfileEditorOpen] = useState(false);
  const [feedingPlanOpen, setFeedingPlanOpen] = useState(false);
  const [dataControlAction, setDataControlAction] = useState<DataControlAction | null>(null);
  const [editingSetting, setEditingSetting] = useState<SettingKey | null>(null);
  const [settings, setSettings] = useState<Record<SettingKey, string>>({
    start: "만 6개월",
    time: "10:00",
    style: "냉동 큐브 활용",
  });
  const [toast, setToast] = useState<string | null>(null);
  const allIngredients = useMemo(() => [...ingredientDefinitions, ...customIngredients], [customIngredients]);
  const currentChild = familyWorkspace?.children[0] ?? null;
  const displayProfile = currentChild ?? demoProfile;
  const selectedIngredientState = selectedIngredient
    ? ingredientStates.find((state) => state.ingredientId === selectedIngredient.id)
    : undefined;
  const currentPlan = useMemo(
    () => createBookBasedDayPlan(
      recommendationProfile(displayProfile),
      allIngredients,
      ingredientStates,
      mealHistory,
      planDateFor(todayId),
      recordedMealsOn(records, todayId),
      // The day checks follow the menu chosen for the next meal; a choice for another child or day never applies.
      mealChoice?.childId === displayProfile.id && mealChoice.date === todayId ? mealChoice : null,
    ),
    [allIngredients, displayProfile, ingredientStates, mealChoice, mealHistory, records, todayId],
  );
  // A chosen menu stays UI-local until it is recorded, and only for the same child, day and unrecorded meal.
  // If new records, reactions or settings remove it from the eligible options it is dropped with a notice.
  const mealChoiceStatus = useMemo((): { selected: { mealIndex: number; optionId: string } | null; stale: boolean } => {
    if (!mealChoice) return { selected: null, stale: false };
    const sameScope = mealChoice.childId === displayProfile.id
      && mealChoice.date === todayId
      && !records.some((record) => record.date === mealChoice.date && record.mealIndex === mealChoice.mealIndex);
    if (!sameScope) return { selected: null, stale: false };
    const meal = currentPlan.meals.find((item) => item.index === mealChoice.mealIndex);
    return meal && mealOptions(meal).some((option) => option.optionId === mealChoice.optionId)
      ? { selected: { mealIndex: mealChoice.mealIndex, optionId: mealChoice.optionId }, stale: false }
      : { selected: null, stale: true };
  }, [currentPlan, displayProfile.id, mealChoice, records, todayId]);
  const mealChoiceNotice = mealChoiceStatus.stale ? STALE_MEAL_CHOICE_NOTICE : null;
  const currentAdaptiveReview = useMemo(
    () => createAdaptiveReview(recommendationProfile(displayProfile), mealHistory, routineLogs),
    [displayProfile, mealHistory, routineLogs],
  );
  // An edit is bound to the record it opened for; a new record never turns into an edit of someone else's record.
  const editingRecord = recordTarget?.mealPlanId
    ? records.find((record) => record.mealPlanId === recordTarget.mealPlanId) ?? null
    : null;
  const recordPlannedTime = editingRecord?.plannedTime
    ?? recordTarget?.meal?.time
    ?? displayProfile.preferredMealTime;
  const recordMealSummary = editingRecord
    ? {
        title: editingRecord.title,
        ingredientNames: editingRecord.ingredientIds
          .map((id) => allIngredients.find((ingredient) => ingredient.id === id)?.name)
          .filter((name): name is string => Boolean(name)),
      }
    : recordTarget?.meal
      ? { title: recordTarget.meal.title, ingredientNames: recordTarget.meal.items.map((item) => item.ingredient.name) }
      : null;

  const showToast = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(null), 2600);
  }, []);

  useEffect(() => {
    const viewport = window.visualViewport;
    syncSheetVisualViewport();
    if (!viewport) return;

    let focusFrame = 0;
    const keepFocusedControlVisible = () => {
      syncSheetVisualViewport();
      window.cancelAnimationFrame(focusFrame);
      focusFrame = window.requestAnimationFrame(() => {
        const focusedControl = document.activeElement;
        if (focusedControl instanceof HTMLElement && focusedControl.closest(".record-sheet")) {
          focusedControl.scrollIntoView({ block: "center", inline: "nearest" });
        }
      });
    };

    viewport.addEventListener("resize", keepFocusedControlVisible);
    viewport.addEventListener("scroll", syncSheetVisualViewport);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      viewport.removeEventListener("resize", keepFocusedControlVisible);
      viewport.removeEventListener("scroll", syncSheetVisualViewport);
      document.documentElement.style.removeProperty("--sheet-visual-height");
      document.documentElement.style.removeProperty("--sheet-visual-top");
    };
  }, []);

  const refreshFamilyData = useCallback(async () => {
    if (!isSupabaseConfigured()) return;
    // Focus, interval, auth and post-save refreshes can overlap; only the newest one may update state.
    const requestId = familyDataRequestRef.current + 1;
    familyDataRequestRef.current = requestId;
    const isLatestRequest = () => familyDataRequestRef.current === requestId;
    try {
      const client = getSupabaseClient();
      const { data, error } = await client.auth.getSession();
      if (error) throw error;
      if (!isLatestRequest()) return;
      if (!data.session?.user) {
        setRecordTarget(null);
        setFamilyWorkspace(null);
        setRecords([]);
        setIngredientStates([]);
        setMealHistory([]);
        setCustomIngredients([]);
        setRoutineLogs([]);
        setSettings({ start: "만 6개월", time: "10:00", style: "냉동 큐브 활용" });
        familyDataUserIdRef.current = null;
        setFamilyDataRefreshError(null);
        return;
      }

      if (familyDataUserIdRef.current !== data.session.user.id) {
        // A record sheet opened under the previous account must not save under this one.
        setRecordTarget(null);
        setFamilyWorkspace(null);
        setRecords([]);
        setIngredientStates([]);
        setMealHistory([]);
        setCustomIngredients([]);
        setRoutineLogs([]);
        setSettings({ start: "만 6개월", time: "10:00", style: "냉동 큐브 활용" });
        familyDataUserIdRef.current = data.session.user.id;
      }

      let nextWorkspace = await loadFamilyWorkspace();
      if (nextWorkspace && !nextWorkspace.children.length) {
        await ensureDefaultChild(nextWorkspace.householdId);
        nextWorkspace = await loadFamilyWorkspace();
      }
      const child = nextWorkspace?.children[0];
      const householdId = nextWorkspace?.householdId;
      if (!child || !householdId) {
        const nextCustomIngredients = householdId ? await loadCustomIngredients(householdId) : [];
        if (!isLatestRequest()) return;
        setFamilyWorkspace(nextWorkspace);
        setRecords([]);
        setIngredientStates([]);
        setMealHistory([]);
        setCustomIngredients(nextCustomIngredients);
        setRoutineLogs([]);
        setFamilyDataRefreshError(null);
        return;
      }
      const [nextRecords, recommendationInputs, nextCustomIngredients, nextRoutineLogs] = await Promise.all([
        loadFamilyMealRecords(child.id),
        loadRecommendationInputs(child.id),
        loadCustomIngredients(householdId),
        loadDailyRoutineLogs(child.id).catch(() => null),
      ]);
      if (!isLatestRequest()) return;
      setFamilyWorkspace(nextWorkspace);
      setRecords(nextRecords);
      setIngredientStates(recommendationInputs.states);
      setMealHistory(recommendationInputs.history);
      setCustomIngredients(nextCustomIngredients);
      if (nextRoutineLogs) setRoutineLogs(nextRoutineLogs);
      setSettings({
        start: formatProfileStart(child),
        time: child.preferredMealTime,
        style: preparationStyleLabels[child.preparationStyle],
      });
      setFamilyDataRefreshError(nextRoutineLogs
        ? null
        : "수유·간식·먹기 연습 기록을 불러오지 못했어요. 연결 상태를 확인하고 다시 시도해주세요.");
    } catch {
      if (!isLatestRequest()) return;
      setFamilyDataRefreshError("가족 기록을 불러오지 못했어요. 연결 상태를 확인하고 다시 시도해주세요.");
    }
  }, []);

  useEffect(() => {
    let midnightTimer = 0;
    const scheduleNextDay = () => {
      window.clearTimeout(midnightTimer);
      const now = new Date();
      const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
      midnightTimer = window.setTimeout(syncToday, nextMidnight.getTime() - now.getTime() + 1_000);
    };
    const syncToday = () => {
      setTodayId(toDateId(new Date()));
      scheduleNextDay();
    };
    const syncWhenVisible = () => {
      if (document.visibilityState === "visible") syncToday();
    };
    scheduleNextDay();
    window.addEventListener("focus", syncWhenVisible);
    document.addEventListener("visibilitychange", syncWhenVisible);
    return () => {
      window.clearTimeout(midnightTimer);
      window.removeEventListener("focus", syncWhenVisible);
      document.removeEventListener("visibilitychange", syncWhenVisible);
    };
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured()) return;
    const initialRefresh = window.setTimeout(() => void refreshFamilyData(), 0);
    const client = getSupabaseClient();
    const { data } = client.auth.onAuthStateChange(() => {
      window.setTimeout(() => void refreshFamilyData(), 0);
    });
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") void refreshFamilyData();
    };
    window.addEventListener("focus", refreshWhenVisible);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    const interval = window.setInterval(() => void refreshFamilyData(), 30_000);
    return () => {
      window.clearTimeout(initialRefresh);
      data.subscription.unsubscribe();
      window.removeEventListener("focus", refreshWhenVisible);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
      window.clearInterval(interval);
    };
  }, [refreshFamilyData]);

  const saveRecord = async (draft: RecordDraft) => {
    if (!currentChild) {
      setRecordTarget(null);
      setActiveTab("profile");
      showToast("먼저 우리 아이 탭에서 가족 로그인을 연결해주세요.");
      return;
    }
    const target = recordTarget;
    if (!target) return;
    const rejectRecord = (message: string) => {
      setRecordTarget(null);
      showToast(message);
    };
    // Nothing is written unless the account, family and child are the ones the sheet was opened for.
    if (
      target.childId !== currentChild.id
      || target.householdId !== (familyWorkspace?.householdId ?? null)
      || target.userId !== familyDataUserIdRef.current
    ) {
      rejectRecord("가족 계정이나 아이 정보가 바뀌어 이 기록은 저장하지 않았어요. 다시 열어 기록해주세요.");
      return;
    }

    try {
      const outcome = trialOutcomeByReaction[draft.reaction];
      let daySnapshotSaved = true;
      if (target.mealPlanId) {
        if (!editingRecord || editingRecord.date !== target.date || editingRecord.mealIndex !== target.mealIndex) {
          rejectRecord("수정하려던 기록이 바뀌었어요. 기록을 다시 확인한 뒤 수정해주세요.");
          return;
        }
        await updateFamilyMealRecord(editingRecord.mealPlanId, {
          completion: draft.amount,
          reaction: draft.reaction,
          note: draft.note,
        });
        const introducedIngredientId = editingRecord.newExposureIngredientId;
        // A meal that served the food under observation again (the first rice days) has no new-exposure marker and
        // holds only that food, so a reaction on a meal with other foods is never pinned on it.
        const repeatedIngredientId = introducedIngredientId || editingRecord.ingredientIds.length !== 1
          ? null
          : editingRecord.ingredientIds.find((id) => {
            const status = ingredientStates.find((state) => state.ingredientId === id)?.status;
            return status === "testing" || status === "paused";
          }) ?? null;
        const nextStates = introducedIngredientId
          ? applyEditedTrialOutcome(ingredientStates, introducedIngredientId, outcome, editingRecord.recordedAt, draft.note)
          : repeatedIngredientId
            ? applyRepeatedTrialReaction(ingredientStates, repeatedIngredientId, outcome, draft.note)
            : ingredientStates;
        const nextState = nextStates.find((state) => state.ingredientId === (introducedIngredientId ?? repeatedIngredientId));
        if (nextStates !== ingredientStates && nextState) await saveChildIngredientState(currentChild.id, nextState);
      } else {
        const shown = target.meal;
        const shownTextureMm = shown?.textureMm;
        if (!shown || isHeldMeal(shown) || !shown.items.length || shownTextureMm === undefined) {
          rejectRecord(STALE_RECORD_NOTICE);
          return;
        }
        if (records.some((record) => record.date === target.date && record.mealIndex === target.mealIndex)) {
          rejectRecord("다른 보호자가 이미 이 식사를 기록했어요. 기록을 확인한 뒤 필요하면 수정해주세요.");
          return;
        }
        const planProfile = recommendationProfile(currentChild);
        const recordedMeals = recordedMealsOn(records, target.date);
        const plan = createBookBasedDayPlan(
          planProfile,
          allIngredients,
          ingredientStates,
          mealHistory,
          planDateFor(target.date),
          recordedMeals,
          { mealIndex: target.mealIndex, optionId: shown.optionId },
        );
        const plannedMeal = plan.meals.find((item) => item.index === target.mealIndex);
        // Save exactly the meal that was shown, and only while the latest family data still produces it unchanged.
        const current = plannedMeal
          ? mealOptions(plannedMeal).find((option) => option.optionId === shown.optionId)
          : undefined;
        if (!current || plan.stage !== target.stage || savedMealKey(current) !== savedMealKey(shown)) {
          rejectRecord(STALE_RECORD_NOTICE);
          return;
        }
        // Read the day snapshot before writing anything: if it cannot be read, nothing is saved, so the meals recorded
        // earlier keep their stored menus instead of being rewritten from record fields alone.
        const storedDay = await loadDailyRecommendation(currentChild.id, target.date);
        const recordedIngredients = shown.items.map((item) => item.ingredient);
        const trialIngredient = shown.items.find((item) => item.isNewExposure)?.ingredient ?? null;
        const recordsTrial = Boolean(trialIngredient && trialIngredient.id === plan.currentTrial?.id);
        // The rice under observation served again in another meal: it never advances the observation.
        const repeatedTrial = !recordsTrial && plan.currentTrial
          && shown.items.some((item) => item.ingredient.id === plan.currentTrial?.id)
          ? plan.currentTrial
          : null;
        await saveFamilyMealRecord({
          childId: currentChild.id,
          date: target.date,
          mealIndex: target.mealIndex,
          plannedTime: shown.time,
          recordedAt: mealTimestamp(target.date, shown.time),
          title: shown.title,
          ingredients: recordedIngredients,
          newExposureIngredientId: recordsTrial ? trialIngredient!.id : null,
          completion: draft.amount,
          reaction: draft.reaction,
          note: draft.note,
          stage: plan.stage,
          textureMm: shownTextureMm,
          servingGuide: shown.servingGuide,
          textureGuide: shown.textureGuide,
          servingMode: shown.servingMode,
          recommendationReasons: shown.reasons,
        });
        if (recordsTrial && plan.currentTrial) {
          const nextStates = applyTrialOutcome(
            ingredientStates,
            plan.currentTrial.id,
            outcome,
            mealTimestamp(target.date, shown.time),
            getStageGuide(plan.stage).newFoodIntervalDays[1],
            draft.note,
          );
          const nextState = nextStates.find((state) => state.ingredientId === plan.currentTrial?.id);
          if (nextState) await saveChildIngredientState(currentChild.id, nextState);
        } else if (repeatedTrial) {
          const nextStates = applyRepeatedTrialReaction(ingredientStates, repeatedTrial.id, outcome, draft.note);
          const nextState = nextStates.find((state) => state.ingredientId === repeatedTrial.id);
          if (nextStates !== ingredientStates && nextState) await saveChildIngredientState(currentChild.id, nextState);
        }
        // The meal and its trial state are already saved, so a failed snapshot write ends in a warning and the sheet
        // closes instead of inviting the family to record the same meal again.
        daySnapshotSaved = await saveDailyRecommendation(currentChild.id, daySnapshot(plan, shown, storedDay), {
          profile: planProfile,
          ingredientStates,
          recentHistory: mealHistory.slice(-21),
          recordedMeals,
        }).then(() => true, () => false);
      }
      await refreshFamilyData();
      const recordedDay = parseDateId(target.date);
      setRecordTarget(null);
      setMealChoice((choice) => (choice?.date === target.date && choice.mealIndex === target.mealIndex ? null : choice));
      setSelectedDate(target.date);
      setCalendarCursor({ year: recordedDay.getFullYear(), month: recordedDay.getMonth() });
      showToast(daySnapshotSaved ? "식사 기록을 가족 공간에 저장했어요." : DAY_SNAPSHOT_NOT_SAVED_NOTICE);
    } catch {
      showToast("기록을 저장하지 못했어요. 잠시 후 다시 시도해주세요.");
    }
  };

  const saveRoutineLog = async (log: DailyRoutineLog) => {
    try {
      await saveDailyRoutineLog(log);
      await refreshFamilyData();
      setRoutineLogOpen(false);
      showToast("하루 흐름을 가족 기록에 저장했어요.");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      showToast(/daily_routine_logs|schema cache|does not exist/i.test(message)
        ? "Supabase에서 통합 기록 SQL을 한 번 실행해야 해요."
        : "하루 흐름을 저장하지 못했어요. 잠시 후 다시 시도해주세요.");
    }
  };

  const addIngredient = async (name: string, category: IngredientCategory, assetId: string) => {
    if (!familyWorkspace) {
      setAddIngredientOpen(false);
      setActiveTab("profile");
      showToast("먼저 가족 공간을 연결해주세요.");
      return;
    }
    const nextPriority = Math.max(...allIngredients.map((ingredient) => ingredient.introductionPriority), 0) + 1;
    const ingredient: IngredientDefinition = {
      id: `custom-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name,
      emoji: "",
      assetId,
      category,
      ...customIngredientTraits(category, assetId),
      introductionPriority: nextPriority,
      bookGuidance: "가족이 직접 추가한 재료예요. 아이의 진행 상태에 맞춰 도입 시기를 정해요.",
    };
    try {
      await saveCustomIngredient(familyWorkspace.householdId, ingredient);
      await refreshFamilyData();
      setAddIngredientOpen(false);
      showToast(`${name} 재료를 가족 목록에 추가했어요.`);
    } catch {
      showToast("재료를 저장하지 못했어요. 잠시 후 다시 시도해주세요.");
    }
  };

  const saveManualIngredientState = async (
    ingredient: IngredientDefinition,
    status: ChildIngredientState["status"],
    testDay: number | null,
  ) => {
    if (!currentChild) {
      setSelectedIngredient(null);
      setActiveTab("profile");
      showToast("먼저 가족 공간을 연결해주세요.");
      return;
    }
    const existing = ingredientStates.find((state) => state.ingredientId === ingredient.id);
    const exposureCount = status === "passed"
      ? Math.max(3, existing?.exposureCount ?? 0)
      : status === "testing"
        ? Math.max((testDay ?? 1) - 1, existing?.exposureCount ?? 0)
        : status === "ready"
          ? 0
          : existing?.exposureCount ?? 0;
    const nextState: ChildIngredientState = {
      ingredientId: ingredient.id,
      status,
      testDay: status === "testing" ? testDay ?? 1 : null,
      exposureCount,
      firstOfferedAt: existing?.firstOfferedAt ?? null,
      lastOfferedAt: existing?.lastOfferedAt ?? null,
      acceptedTextureMm: existing?.acceptedTextureMm ?? [],
      lastReaction: status === "suspectedReaction"
        ? existing?.lastReaction ?? "가족이 직접 반응 확인 필요로 설정"
        : existing?.lastReaction ?? null,
    };
    try {
      await saveChildIngredientState(currentChild.id, nextState);
      await refreshFamilyData();
      showToast(`${ingredient.name} 상태를 ${ingredientStatusLabels[status]}으로 저장했어요.`);
    } catch {
      showToast("재료 상태를 저장하지 못했어요. 잠시 후 다시 시도해주세요.");
    }
  };

  const saveEditedCustomIngredient = async (ingredient: IngredientDefinition) => {
    if (!familyWorkspace) return;
    try {
      await updateCustomIngredient(familyWorkspace.householdId, ingredient);
      await refreshFamilyData();
      setEditingCustomIngredient(null);
      setSelectedIngredient(null);
      showToast(`${ingredient.name} 수정 내용을 가족 목록에 저장했어요.`);
    } catch {
      showToast("재료 수정 내용을 저장하지 못했어요.");
    }
  };

  const archiveEditedCustomIngredient = async () => {
    if (!familyWorkspace || !editingCustomIngredient) return;
    const archivedName = editingCustomIngredient.name;
    try {
      await archiveCustomIngredient(familyWorkspace.householdId, editingCustomIngredient.id);
      await refreshFamilyData();
      setEditingCustomIngredient(null);
      setSelectedIngredient(null);
      showToast(`${archivedName}을(를) 가족 목록에서 삭제했어요.`);
    } catch {
      showToast("재료를 삭제하지 못했어요. 잠시 후 다시 시도해주세요.");
    }
  };

  const moveCalendarMonth = (direction: -1 | 1) => {
    const today = parseDateId(todayId);
    const isCurrentMonth = calendarCursor.year === today.getFullYear() && calendarCursor.month === today.getMonth();
    if (direction === 1 && isCurrentMonth) return;
    const next = new Date(calendarCursor.year, calendarCursor.month + direction, 1);
    setSelectedDate(toDateId(next));
    setCalendarCursor({ year: next.getFullYear(), month: next.getMonth() });
  };

  const goCalendarToday = () => {
    const today = parseDateId(todayId);
    setSelectedDate(todayId);
    setCalendarCursor({ year: today.getFullYear(), month: today.getMonth() });
  };

  const openRecordSheet = (target: Pick<RecordTarget, "date" | "mealIndex" | "meal" | "stage" | "mealPlanId">) => {
    setRecordTarget({
      ...target,
      childId: currentChild?.id ?? null,
      householdId: familyWorkspace?.householdId ?? null,
      userId: familyDataUserIdRef.current,
    });
  };

  const openRecordEditor = (record: FamilyMealRecord) => {
    openRecordSheet({ date: record.date, mealIndex: record.mealIndex, meal: null, stage: null, mealPlanId: record.mealPlanId });
  };

  const addRecordForDate = (date: string) => {
    if (!currentChild) {
      setActiveTab("profile");
      showToast("먼저 우리 아이 탭에서 가족 로그인을 연결해주세요.");
      return;
    }
    if (date > todayId) {
      showToast("미래 날짜의 식사는 아직 기록할 수 없어요.");
      return;
    }
    const plan = createBookBasedDayPlan(
      recommendationProfile(currentChild),
      allIngredients,
      ingredientStates,
      mealHistory,
      planDateFor(date),
      recordedMealsOn(records, date),
    );
    const recordedMealIndexes = new Set(
      records.filter((record) => record.date === date).map((record) => record.mealIndex),
    );
    const nextMeal = plan.meals.find((meal) => !recordedMealIndexes.has(meal.index));
    if (!nextMeal) {
      showToast("이 날짜의 식사는 모두 기록되어 있어요.");
      return;
    }
    if (isHeldMeal(nextMeal)) {
      showToast("이번 끼니는 쉬어요. 오늘 탭에서 이유를 확인해주세요.");
      return;
    }
    // Adding today's next meal from the records tab keeps the menu chosen on the today tab.
    const chosenOptionId = mealChoice
      && mealChoice.childId === currentChild.id
      && mealChoice.date === date
      && mealChoice.mealIndex === nextMeal.index
      ? mealChoice.optionId
      : null;
    const chosenOption = chosenOptionId
      ? mealOptions(nextMeal).find((option) => option.optionId === chosenOptionId)
      : undefined;
    if (chosenOptionId && !chosenOption) showToast(STALE_MEAL_CHOICE_NOTICE);
    openRecordSheet({ date, mealIndex: nextMeal.index, meal: chosenOption ?? nextMeal, stage: plan.stage, mealPlanId: null });
  };

  const editRoutineForDate = (date: string) => {
    if (!currentChild) {
      setActiveTab("profile");
      showToast("먼저 우리 아이 탭에서 가족 로그인을 연결해주세요.");
      return;
    }
    setRoutineTargetDate(date);
    setRoutineLogOpen(true);
  };

  const updateSetting = async (value: string) => {
    if (!editingSetting) return;
    const settingKey = editingSetting;
    setSettings((current) => ({ ...current, [editingSetting]: value }));
    setEditingSetting(null);
    if (!currentChild || !familyWorkspace) {
      showToast("가족 연결 후 설정을 함께 저장할 수 있어요.");
      return;
    }
    const updatedProfile: BabyProfile = {
      ...currentChild,
      preferredMealTime: settingKey === "time" ? value : currentChild.preferredMealTime,
      preparationStyle: settingKey === "style"
        ? preparationStyleValues[value] ?? currentChild.preparationStyle
        : currentChild.preparationStyle,
    };
    try {
      await saveChildProfile(familyWorkspace.householdId, updatedProfile);
      await refreshFamilyData();
      showToast("우리 아이 설정을 가족 공간에 저장했어요.");
    } catch {
      showToast("설정을 저장하지 못했어요. 잠시 후 다시 시도해주세요.");
    }
  };

  const saveProfile = async (profile: BabyProfile) => {
    if (!familyWorkspace) {
      setProfileEditorOpen(false);
      setFeedingPlanOpen(false);
      setStartWeaningOpen(false);
      setEditingSetting(null);
      setActiveTab("profile");
      showToast("먼저 가족 공간을 연결해주세요.");
      return;
    }
    const startIsPast = profile.weaningStartDate
      ? parseDateId(profile.weaningStartDate).getTime() <= parseDateId(todayId).getTime()
      : false;
    const nextProfile: BabyProfile = {
      ...profile,
      stage: profile.stage === "prestart" && startIsPast ? "initial" : profile.stage,
    };
    try {
      await saveChildProfile(familyWorkspace.householdId, nextProfile);
      await refreshFamilyData();
      setProfileEditorOpen(false);
      setFeedingPlanOpen(false);
      setStartWeaningOpen(false);
      setEditingSetting(null);
      setPreviewStarted(false);
      showToast("아이 정보를 가족 공간에 저장했어요.");
    } catch {
      showToast("아이 정보를 저장하지 못했어요. 잠시 후 다시 시도해주세요.");
    }
  };

  const exportData = () => {
    const payload = {
      exportedAt: new Date().toISOString(),
      child: displayProfile,
      settings,
      customIngredients,
      mealRecords: records,
      dailyRoutineLogs: routineLogs,
      ingredientStates,
    };
    const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "baby-meal-data.json";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast("내보내기 파일을 만들었어요.");
  };

  const resetProgress = async () => {
    if (!currentChild) {
      setDataControlAction(null);
      showToast("가족 공간에 연결된 아이 정보가 없어요.");
      return;
    }
    try {
      await resetChildProgress(currentChild.id);
      await refreshFamilyData();
      setRecords([]);
      setIngredientStates([]);
      setMealHistory([]);
      setRoutineLogs([]);
      setMealChoice(null);
      setPreviewStarted(false);
      setActiveTab("today");
      setSelectedDate(todayId);
      setDataControlAction(null);
      window.scrollTo({ top: 0, behavior: "smooth" });
      showToast("진행 기록을 지우고 시작 전으로 돌아왔어요.");
    } catch (error) {
      showToast(dataControlMessage(error, "진행 기록을 초기화하지 못했어요."));
    }
  };

  const removeAccount = async () => {
    try {
      await deleteMyAccount();
      setFamilyWorkspace(null);
      setRecords([]);
      setIngredientStates([]);
      setMealHistory([]);
      setRoutineLogs([]);
      setCustomIngredients([]);
      setPreviewStarted(false);
      setActiveTab("today");
      setDataControlAction(null);
      window.scrollTo({ top: 0, behavior: "smooth" });
      showToast("계정과 내 정보를 삭제했어요.");
    } catch (error) {
      showToast(dataControlMessage(error, "계정과 내 정보를 삭제하지 못했어요."));
    }
  };

  const goHome = () => {
    setActiveTab("today");
    setPreviewStarted(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const switchTab = (tab: Tab) => {
    setActiveTab(tab);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <div className="site-shell">
      <header className="app-header">
        <a className="brand" href="#top" aria-label="맘마로그 홈" onClick={goHome}>
          <BrandMark />
          <span><strong>맘마로그</strong><small>우리 아이의 첫 식사</small></span>
        </a>
        <button className="family-button" type="button" onClick={() => switchTab("profile")}>
          <Baby className="family-button-icon" size={18} strokeWidth={1.7} aria-hidden="true" />
          <span>우리 가족</span>
          <ChevronRight className="family-button-chevron" size={17} aria-hidden="true" />
        </button>
      </header>

      <main id="top" className="app-main">
        {familyDataRefreshError && (
          <div className="setup-warning family-data-warning" role="alert">
            <span>{familyDataRefreshError}</span>
            <button className="family-data-retry" type="button" onClick={() => void refreshFamilyData()}>다시 시도</button>
          </div>
        )}
        {activeTab === "today" && (
          displayProfile.stage !== "prestart" || previewStarted ? (
            <TodayMeal
              profile={displayProfile}
              ingredients={allIngredients}
              ingredientStates={ingredientStates}
              mealHistory={mealHistory}
              records={records}
              todayId={todayId}
              routineLogs={routineLogs}
              plan={currentPlan}
              selectedOption={mealChoiceStatus.selected}
              choiceNotice={mealChoiceNotice}
              onBack={displayProfile.stage === "prestart" ? () => setPreviewStarted(false) : undefined}
              onChooseOption={(meal) => setMealChoice({ childId: displayProfile.id, date: todayId, mealIndex: meal.index, optionId: meal.optionId })}
              onDismissChoiceNotice={() => setMealChoice(null)}
              onRecord={(meal) => openRecordSheet({ date: todayId, mealIndex: meal.index, meal, stage: currentPlan.stage, mealPlanId: null })}
              onEditRecord={openRecordEditor}
              onReviewProgress={() => setFeedingPlanOpen(true)}
            />
          ) : (
            <TodayPrepare profile={displayProfile} onStart={() => setStartWeaningOpen(true)} onPreview={() => setPreviewStarted(true)} />
          )
        )}
        {activeTab === "ingredients" && (
          <IngredientsView ingredients={allIngredients} ingredientStates={ingredientStates} plan={currentPlan} onSelect={setSelectedIngredient} onAdd={() => setAddIngredientOpen(true)} />
        )}
        {activeTab === "records" && (
          <RecordsView
            records={records}
            routineLogs={routineLogs}
            workspace={familyWorkspace}
            profile={displayProfile}
            ingredients={allIngredients}
            ingredientStates={ingredientStates}
            mealHistory={mealHistory}
            mealCount={currentPlan.meals.length}
            selectedDate={selectedDate}
            todayId={todayId}
            calendarCursor={calendarCursor}
            onSelectDate={setSelectedDate}
            onMoveMonth={moveCalendarMonth}
            onGoToday={goCalendarToday}
            onAddRecord={addRecordForDate}
            onEditRecord={openRecordEditor}
            onEditRoutine={editRoutineForDate}
          />
        )}
        {activeTab === "profile" && (
          <ProfileView
            profile={displayProfile}
            settings={settings}
            onEditSetting={setEditingSetting}
            onEditProfile={() => setProfileEditorOpen(true)}
            onEditFeedingPlan={() => setFeedingPlanOpen(true)}
            onExport={exportData}
            onResetProgress={() => setDataControlAction("resetProgress")}
            onDeleteAccount={() => setDataControlAction("deleteAccount")}
            onWorkspaceChange={refreshFamilyData}
          />
        )}
      </main>

      <nav className="bottom-nav" aria-label="주요 메뉴">
        <button className={activeTab === "today" ? "is-active" : ""} type="button" onClick={() => switchTab("today")}>
          <House size={20} aria-hidden="true" /><small>오늘</small>
        </button>
        <button className={activeTab === "ingredients" ? "is-active" : ""} type="button" onClick={() => switchTab("ingredients")}>
          <Sprout size={20} aria-hidden="true" /><small>재료</small>
        </button>
        <button className={activeTab === "records" ? "is-active" : ""} type="button" onClick={() => switchTab("records")}>
          <CalendarDays size={20} aria-hidden="true" /><small>기록</small>
        </button>
        <button className={activeTab === "profile" ? "is-active" : ""} type="button" onClick={() => switchTab("profile")}>
          <Baby size={21} aria-hidden="true" /><small>우리 아이</small>
        </button>
      </nav>

      {recordTarget && (
        <RecordSheet mealIndex={recordTarget.mealIndex} plannedTime={recordPlannedTime} targetDate={recordTarget.date} mealSummary={recordMealSummary} initialRecord={editingRecord} onClose={() => setRecordTarget(null)} onSave={saveRecord} />
      )}

      {routineLogOpen && currentChild && (
        <RoutineLogSheet
          targetDate={routineTargetDate}
          childId={currentChild.id}
          initialLog={routineLogs.find((log) => log.date === routineTargetDate)}
          onClose={() => setRoutineLogOpen(false)}
          onSave={saveRoutineLog}
        />
      )}

      {selectedIngredient && (
        <IngredientSheet
          ingredient={selectedIngredient}
          state={selectedIngredientState}
          onSaveState={(status, testDay) => saveManualIngredientState(selectedIngredient, status, testDay)}
          onEditCustom={selectedIngredient.id.startsWith("custom-")
            ? () => { setEditingCustomIngredient(selectedIngredient); setSelectedIngredient(null); }
            : undefined}
          onClose={() => setSelectedIngredient(null)}
        />
      )}

      {editingCustomIngredient && (
        <EditCustomIngredientSheet
          ingredient={editingCustomIngredient}
          ingredients={allIngredients}
          onSave={saveEditedCustomIngredient}
          onArchive={archiveEditedCustomIngredient}
          onClose={() => setEditingCustomIngredient(null)}
        />
      )}

      {addIngredientOpen && <AddIngredientSheet ingredients={allIngredients} onAdd={addIngredient} onClose={() => setAddIngredientOpen(false)} />}

      {startWeaningOpen && (
        <StartWeaningSheet profile={displayProfile} onSave={saveProfile} onClose={() => setStartWeaningOpen(false)} />
      )}

      {profileEditorOpen && (
        <BabyProfileSheet profile={displayProfile} onSave={saveProfile} onClose={() => setProfileEditorOpen(false)} />
      )}

      {feedingPlanOpen && (
        <FeedingPlanSheet profile={displayProfile} progression={currentAdaptiveReview.progression} onSave={saveProfile} onClose={() => setFeedingPlanOpen(false)} />
      )}

      {editingSetting === "time" && (
        <MealTimesSettingSheet profile={displayProfile} onSave={saveProfile} onClose={() => setEditingSetting(null)} />
      )}

      {editingSetting && editingSetting !== "time" && (
        <SettingSheet settingKey={editingSetting} value={settings[editingSetting]} onSelect={updateSetting} onClose={() => setEditingSetting(null)} />
      )}

      {dataControlAction && (
        <DataControlSheet
          action={dataControlAction}
          onConfirm={dataControlAction === "resetProgress" ? resetProgress : removeAccount}
          onClose={() => setDataControlAction(null)}
        />
      )}

      {toast && <div className="toast" role="status">✓ {toast}</div>}
    </div>
  );
}
