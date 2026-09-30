import type {
  BabyProfile,
  ChildIngredientState,
  DailyRoutineLog,
  DailyRecommendation,
  IngredientDefinition,
  MealHistoryEntry,
} from "./domain";
import { ingredientById } from "./ingredient-catalog";
import { getSupabaseClient } from "./supabase-client";

export interface FamilyMember {
  userId: string;
  displayName: string;
  role: "owner" | "parent";
}

export interface FamilyWorkspace {
  householdId: string;
  householdName: string;
  members: FamilyMember[];
  children: BabyProfile[];
}

export type FamilyMealCompletion = "none" | "taste" | "quarter" | "half" | "most" | "all";
export type FamilyMealReaction = "none" | "taste_rejection" | "texture_difficulty" | "needs_review";

export interface FamilyMealRecord {
  id: string;
  mealPlanId: string;
  date: string;
  mealIndex: number;
  plannedTime: string;
  title: string;
  ingredientIds: string[];
  newExposureIngredientId: string | null;
  completion: FamilyMealCompletion;
  reaction: FamilyMealReaction;
  note: string;
  textureMm: number | null;
  recordedBy: string;
  recordedAt: string;
}

export interface SaveFamilyMealInput {
  childId: string;
  date: string;
  mealIndex: number;
  plannedTime: string;
  recordedAt?: string;
  title: string;
  ingredients: IngredientDefinition[];
  newExposureIngredientId?: string | null;
  completion: FamilyMealCompletion;
  reaction: FamilyMealReaction;
  note: string;
  stage: Exclude<BabyProfile["stage"], "prestart">;
  textureMm: number;
  servingGuide: string;
  textureGuide: string;
  recommendationReasons: string[];
}

interface MealPlanItemRow {
  ingredient_id: string;
  is_new_exposure?: boolean | null;
}

interface RecommendationHistoryRow {
  recorded_at: string;
  meal_plans?: { meal_plan_items?: MealPlanItemRow[] | null } | null;
  completion: MealHistoryEntry["completion"];
  texture_mm: number | null;
  offered_grams: number | null;
  reaction: FamilyMealReaction;
}

interface MealLogRow {
  id: string;
  completion: FamilyMealCompletion;
  reaction: FamilyMealReaction;
  note: string | null;
  recorded_by: string;
  recorded_at: string;
}

interface CompletedMealPlanRow {
  id: string;
  meal_date: string;
  meal_index: number;
  planned_time: string;
  title: string;
  texture_mm: number | null;
  meal_plan_items?: MealPlanItemRow[] | null;
  meal_logs?: MealLogRow | MealLogRow[] | null;
}

interface ChildRow {
  id: string;
  nickname: string;
  stage: BabyProfile["stage"];
  birth_date: string;
  weaning_start_date: string | null;
  corrected_age_days: number | null;
  readiness: NonNullable<BabyProfile["readiness"]>;
  meals_per_day: number;
  snacks_per_day: number;
  preferred_meal_time: string;
  milk_ml_per_day: number | null;
  texture_mm: number;
  preparation_style: BabyProfile["preparationStyle"];
  temporary_condition: NonNullable<BabyProfile["temporaryCondition"]>;
  development_skills?: (Partial<NonNullable<BabyProfile["skills"]>> & { mealTimes?: unknown }) | null;
}

export async function loadDailyRoutineLogs(childId: string): Promise<DailyRoutineLog[]> {
  const { data, error } = await getSupabaseClient()
    .from("daily_routine_logs")
    .select("*")
    .eq("child_id", childId)
    .order("log_date", { ascending: false })
    .limit(60);
  if (error) {
    // Until routine_logs.sql is applied the table does not exist; that means "no logs yet", not a failure.
    if (error.code === "PGRST205" || error.code === "42P01") return [];
    throw error;
  }
  return (data ?? []).map((row) => ({
    childId: row.child_id,
    date: row.log_date,
    milkMl: row.milk_ml,
    snackCount: row.snack_count ?? 0,
    cupPractice: Boolean(row.cup_practice),
    spoonPractice: Boolean(row.spoon_practice),
    fingerFood: Boolean(row.finger_food),
    note: row.note ?? "",
    updatedBy: row.updated_by,
    updatedAt: row.updated_at,
  }));
}

export async function saveDailyRoutineLog(log: DailyRoutineLog): Promise<void> {
  const client = getSupabaseClient();
  const { data: authData, error: authError } = await client.auth.getUser();
  if (authError) throw authError;
  const { error } = await client.from("daily_routine_logs").upsert({
    child_id: log.childId,
    log_date: log.date,
    milk_ml: log.milkMl,
    snack_count: log.snackCount,
    cup_practice: log.cupPractice,
    spoon_practice: log.spoonPractice,
    finger_food: log.fingerFood,
    note: log.note.trim() || null,
    updated_by: authData.user?.id ?? null,
    updated_at: new Date().toISOString(),
  }, { onConflict: "child_id,log_date" });
  if (error) throw error;
}

export async function saveChildIngredientState(
  childId: string,
  state: ChildIngredientState,
): Promise<void> {
  const client = getSupabaseClient();
  const { data: authData, error: authError } = await client.auth.getUser();
  if (authError) throw authError;

  const { error } = await client.from("child_ingredients").upsert({
    child_id: childId,
    ingredient_id: state.ingredientId,
    status: state.status,
    test_day: state.testDay,
    exposure_count: state.exposureCount,
    first_offered_at: state.firstOfferedAt,
    last_offered_at: state.lastOfferedAt,
    accepted_texture_mm: state.acceptedTextureMm ?? [],
    last_reaction: state.lastReaction,
    updated_by: authData.user?.id ?? null,
    updated_at: new Date().toISOString(),
  }, { onConflict: "child_id,ingredient_id" });
  if (error) throw error;
}

export async function sendFamilyLoginEmail(email: string, redirectTo: string): Promise<void> {
  const { error } = await getSupabaseClient().auth.signInWithOtp({
    email: email.trim(),
    options: { emailRedirectTo: redirectTo },
  });
  if (error) throw error;
}

export async function verifyFamilyEmailCode(email: string, token: string): Promise<void> {
  const { error } = await getSupabaseClient().auth.verifyOtp({
    email: email.trim(),
    token: token.trim(),
    type: "email",
  });
  if (error) throw error;
}

export async function signInFamilyWithPassword(email: string, password: string): Promise<void> {
  const { error } = await getSupabaseClient().auth.signInWithPassword({
    email: email.trim(),
    password,
  });
  if (error) throw error;
}

export async function setFamilyPassword(password: string): Promise<void> {
  const client = getSupabaseClient();
  const { data, error } = await client.auth.getUser();
  if (error) throw error;
  if (!data.user?.email || data.user.is_anonymous) {
    throw new Error("이메일 계정으로 로그인해야 비밀번호를 설정할 수 있어요.");
  }

  const { error: updateError } = await client.auth.updateUser({ password });
  if (updateError) throw updateError;
}

export async function linkFamilyAccountEmail(email: string, redirectTo: string): Promise<void> {
  const client = getSupabaseClient();
  const { data, error } = await client.auth.getUser();
  if (error) throw error;
  if (!data.user?.is_anonymous) {
    throw new Error("기기 계정에 이메일을 연결하려면 먼저 이 기기의 가족 계정으로 로그인해야 해요.");
  }

  const { error: updateError } = await client.auth.updateUser(
    { email: email.trim() },
    { emailRedirectTo: redirectTo },
  );
  if (updateError) throw updateError;
}

export async function refreshFamilySession(): Promise<{
  email: string | null;
  isAnonymous: boolean;
}> {
  const { data, error } = await getSupabaseClient().auth.refreshSession();
  if (error) throw error;
  return {
    email: data.user?.email ?? null,
    isAnonymous: data.user?.is_anonymous ?? true,
  };
}

export async function signInFamilyAnonymously(): Promise<void> {
  const { error } = await getSupabaseClient().auth.signInAnonymously();
  if (error) throw error;
}

export async function signOutFamily(): Promise<void> {
  const { error } = await getSupabaseClient().auth.signOut();
  if (error) throw error;
}

export async function resetChildProgress(childId: string): Promise<void> {
  const { error } = await getSupabaseClient().rpc("reset_child_progress", {
    target_child_id: childId,
  });
  if (error) throw error;
}

export async function deleteMyAccount(): Promise<void> {
  const client = getSupabaseClient();
  const { error } = await client.rpc("delete_my_account");
  if (error) throw error;
  await client.auth.signOut({ scope: "local" }).catch(() => undefined);
}

export async function removeFamilyMember(householdId: string, userId: string): Promise<void> {
  const { error } = await getSupabaseClient().rpc("remove_household_member", {
    target_household_id: householdId,
    target_user_id: userId,
  });
  if (error) throw error;
}

export async function createFamilyWorkspace(
  householdName: string,
  displayName: string,
): Promise<string> {
  const { data, error } = await getSupabaseClient().rpc(
    "create_household_with_owner",
    { household_name: householdName, member_display_name: displayName },
  );
  if (error) throw error;
  const householdId = data as string;
  await ensureDefaultChild(householdId);
  return householdId;
}

export async function createFamilyInvite(householdId: string): Promise<string> {
  const { data, error } = await getSupabaseClient().rpc("create_household_invite", {
    target_household_id: householdId,
  });
  if (error) throw error;
  return data as string;
}

export async function joinFamilyWithCode(code: string, displayName: string): Promise<string> {
  const { data, error } = await getSupabaseClient().rpc("join_household_with_code", {
    invite_code: code.trim().toUpperCase(),
    member_display_name: displayName,
  });
  if (error) throw error;
  return data as string;
}

export async function loadFamilyWorkspace(): Promise<FamilyWorkspace | null> {
  const client = getSupabaseClient();
  const { data: memberships, error: membershipError } = await client
    .from("household_members")
    .select("household_id")
    .limit(1);
  if (membershipError) throw membershipError;
  const householdId = memberships?.[0]?.household_id as string | undefined;
  if (!householdId) return null;

  const [{ data: household, error: householdError }, { data: members, error: membersError }, { data: children, error: childrenError }] = await Promise.all([
    client.from("households").select("id,name").eq("id", householdId).single(),
    client.from("household_members").select("user_id,display_name,role").eq("household_id", householdId).order("joined_at"),
    client.from("children").select("*").eq("household_id", householdId).order("created_at"),
  ]);
  if (householdError) throw householdError;
  if (membersError) throw membersError;
  if (childrenError) throw childrenError;

  return {
    householdId,
    householdName: household.name,
    members: (members ?? []).map((member) => ({
      userId: member.user_id,
      displayName: member.display_name,
      role: member.role,
    })),
    children: (children ?? []).map(mapChildRow),
  };
}

export async function loadCustomIngredients(householdId: string): Promise<IngredientDefinition[]> {
  const { data, error } = await getSupabaseClient()
    .from("ingredients")
    .select("*")
    .eq("household_id", householdId)
    .eq("is_custom", true)
    .eq("is_active", true)
    .order("created_at");
  if (error) throw error;

  return (data ?? []).map((row) => {
    const template = ingredientById.get(row.asset_id ?? "");
    return {
      id: row.id,
      name: row.name,
      emoji: row.emoji ?? "",
      assetId: row.asset_id ?? undefined,
      category: row.category,
      foodGroup: row.food_group ?? template?.foodGroup,
      introductionGroup: row.introduction_group ?? template?.introductionGroup ?? "other",
      minimumStage: row.minimum_stage ?? template?.minimumStage ?? "initial",
      minimumAgeMonths: row.minimum_age_months ?? template?.minimumAgeMonths ?? 6,
      introductionPriority: row.introduction_priority,
      color: row.color ?? template?.color,
      allergen: row.allergen ?? template?.allergen ?? false,
      allergenGroup: template?.allergenGroup,
      frequencyCap7Days: row.frequency_cap_7d ?? template?.frequencyCap7Days,
      preparationConstraints: row.preparation_constraints?.length ? row.preparation_constraints : template?.preparationConstraints ?? [],
      chokingFormBlacklist: row.choking_form_blacklist?.length ? row.choking_form_blacklist : template?.chokingFormBlacklist ?? [],
      bookGuidance: row.book_guidance ?? undefined,
      sourcePages: row.source_pages ?? [],
      tags: row.tags?.length ? row.tags : template?.tags ?? [],
    };
  });
}

export async function saveCustomIngredient(
  householdId: string,
  ingredient: IngredientDefinition,
): Promise<void> {
  const { error } = await getSupabaseClient().from("ingredients").insert({
    id: ingredient.id,
    household_id: householdId,
    name: ingredient.name,
    emoji: ingredient.emoji,
    asset_id: ingredient.assetId ?? null,
    category: ingredient.category,
    food_group: ingredient.foodGroup ?? null,
    introduction_group: ingredient.introductionGroup,
    minimum_stage: ingredient.minimumStage,
    minimum_age_months: ingredient.minimumAgeMonths ?? 6,
    introduction_priority: ingredient.introductionPriority,
    color: ingredient.color ?? null,
    allergen: ingredient.allergen ?? false,
    frequency_cap_7d: ingredient.frequencyCap7Days ?? null,
    preparation_constraints: ingredient.preparationConstraints ?? [],
    choking_form_blacklist: ingredient.chokingFormBlacklist ?? [],
    book_guidance: ingredient.bookGuidance ?? "가족이 직접 추가한 재료예요. 도입 시기와 반응을 직접 기록해요.",
    source_pages: ingredient.sourcePages ?? [],
    tags: ingredient.tags ?? [],
    is_custom: true,
    is_active: true,
  });
  if (error) throw error;
}

export async function updateCustomIngredient(
  householdId: string,
  ingredient: IngredientDefinition,
): Promise<void> {
  const { error } = await getSupabaseClient()
    .from("ingredients")
    .update({
      name: ingredient.name,
      asset_id: ingredient.assetId ?? null,
      category: ingredient.category,
      food_group: ingredient.foodGroup ?? null,
      introduction_group: ingredient.introductionGroup,
      minimum_stage: ingredient.minimumStage,
      minimum_age_months: ingredient.minimumAgeMonths ?? 6,
      color: ingredient.color ?? null,
      allergen: ingredient.allergen ?? false,
      frequency_cap_7d: ingredient.frequencyCap7Days ?? null,
      preparation_constraints: ingredient.preparationConstraints ?? [],
      choking_form_blacklist: ingredient.chokingFormBlacklist ?? [],
      book_guidance: ingredient.bookGuidance ?? "가족이 직접 추가한 재료예요. 도입 시기와 반응을 직접 기록해요.",
      tags: ingredient.tags ?? [],
    })
    .eq("id", ingredient.id)
    .eq("household_id", householdId)
    .eq("is_custom", true);
  if (error) throw error;
}

export async function archiveCustomIngredient(
  householdId: string,
  ingredientId: string,
): Promise<void> {
  const { error } = await getSupabaseClient()
    .from("ingredients")
    .update({ is_active: false })
    .eq("id", ingredientId)
    .eq("household_id", householdId)
    .eq("is_custom", true);
  if (error) throw error;
}

function fourMonthsAgo(): string {
  const date = new Date();
  date.setMonth(date.getMonth() - 4);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export async function ensureDefaultChild(householdId: string): Promise<BabyProfile> {
  const client = getSupabaseClient();
  const { data: existing, error } = await client
    .from("children")
    .select("*")
    .eq("household_id", householdId)
    .order("created_at")
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (existing) return mapChildRow(existing);

  const profile: BabyProfile = {
    id: "demo-child",
    nickname: "우리 아기",
    birthDate: fourMonthsAgo(),
    weaningStartDate: null,
    stage: "prestart",
    ageMonths: 4,
    correctedAgeMonths: null,
    readiness: {
      tongueThrustGone: false,
      headControl: true,
      sitsWithSupport: false,
      foodInterest: false,
    },
    mealsPerDay: 1,
    snacksPerDay: 0,
    preferredMealTime: "10:00",
    milkMlPerDay: null,
    textureMm: 0,
    preparationStyle: "cube",
    temporaryCondition: "none",
    skills: {
      handlesCurrentTexture: false,
      reachesAndGrasps: false,
      fingerFood: false,
      spoonPractice: false,
      cupPractice: false,
    },
  };
  const childId = await saveChildProfile(householdId, profile);
  return { ...profile, id: childId };
}

export async function saveChildProfile(
  householdId: string,
  profile: BabyProfile,
): Promise<string> {
  const { data, error } = await getSupabaseClient()
    .from("children")
    .upsert({
      id: profile.id.startsWith("demo-") ? undefined : profile.id,
      household_id: householdId,
      nickname: profile.nickname,
      birth_date: profile.birthDate,
      weaning_start_date: profile.weaningStartDate,
      corrected_age_days: profile.correctedAgeMonths == null ? null : Math.round(profile.correctedAgeMonths * 30.4375),
      readiness: profile.readiness ?? {},
      stage: profile.stage,
      meals_per_day: profile.mealsPerDay,
      snacks_per_day: profile.snacksPerDay ?? 0,
      preferred_meal_time: profile.preferredMealTime,
      milk_ml_per_day: profile.milkMlPerDay,
      texture_mm: profile.textureMm,
      preparation_style: profile.preparationStyle,
      temporary_condition: profile.temporaryCondition ?? "none",
      development_skills: { ...(profile.skills ?? {}), mealTimes: profile.mealTimes ?? [] },
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

export async function loadRecommendationInputs(childId: string): Promise<{
  states: ChildIngredientState[];
  history: MealHistoryEntry[];
}> {
  const client = getSupabaseClient();
  const [{ data: stateRows, error: stateError }, { data: historyRows, error: historyError }] = await Promise.all([
    client.from("child_ingredients").select("*").eq("child_id", childId),
    client
      .from("meal_logs")
      .select("completion,reaction,offered_grams,texture_mm,recorded_at,meal_plans!inner(child_id,meal_plan_items(ingredient_id))")
      .eq("meal_plans.child_id", childId)
      .order("recorded_at", { ascending: true }),
  ]);
  if (stateError) throw stateError;
  if (historyError) throw historyError;

  return {
    states: (stateRows ?? []).map((row) => ({
      ingredientId: row.ingredient_id,
      status: row.status,
      testDay: row.test_day,
      exposureCount: row.exposure_count,
      firstOfferedAt: row.first_offered_at,
      lastOfferedAt: row.last_offered_at,
      acceptedTextureMm: row.accepted_texture_mm ?? [],
      lastReaction: row.last_reaction,
    })),
    history: ((historyRows ?? []) as RecommendationHistoryRow[]).map((row) => ({
      servedAt: row.recorded_at,
      ingredientIds: row.meal_plans?.meal_plan_items?.map((item) => item.ingredient_id) ?? [],
      completion: row.completion,
      mealType: "meal",
      textureMm: row.texture_mm ?? undefined,
      offeredGrams: row.offered_grams ?? undefined,
      reaction: row.reaction === "taste_rejection" ? "tasteRejection" : row.reaction === "texture_difficulty" ? "textureDifficulty" : row.reaction === "needs_review" ? "needsReview" : "none",
    })),
  };
}

export async function saveDailyRecommendation(
  childId: string,
  plan: DailyRecommendation,
  inputSnapshot: object,
): Promise<void> {
  const { error } = await getSupabaseClient().from("daily_recommendations").upsert({
    child_id: childId,
    recommendation_date: plan.date,
    stage: plan.stage,
    recommendation_version: plan.recommendationVersion,
    input_snapshot: inputSnapshot,
    output_snapshot: plan,
  }, { onConflict: "child_id,recommendation_date" });
  if (error) throw error;
}

export async function loadFamilyMealRecords(childId: string): Promise<FamilyMealRecord[]> {
  const { data, error } = await getSupabaseClient()
    .from("meal_plans")
    .select("id,meal_date,meal_index,planned_time,title,texture_mm,meal_plan_items(ingredient_id,is_new_exposure),meal_logs(id,completion,reaction,note,recorded_by,recorded_at)")
    .eq("child_id", childId)
    .eq("status", "completed")
    .order("meal_date", { ascending: false });
  if (error) throw error;

  return ((data ?? []) as CompletedMealPlanRow[]).flatMap((plan) => {
    const log = Array.isArray(plan.meal_logs) ? plan.meal_logs[0] : plan.meal_logs;
    if (!log) return [];
    return [{
      id: log.id,
      mealPlanId: plan.id,
      date: plan.meal_date,
      mealIndex: plan.meal_index,
      plannedTime: String(plan.planned_time).slice(0, 5),
      title: plan.title,
      ingredientIds: (plan.meal_plan_items ?? []).map((item) => item.ingredient_id),
      newExposureIngredientId: (plan.meal_plan_items ?? []).find((item) => item.is_new_exposure)?.ingredient_id ?? null,
      completion: log.completion,
      reaction: log.reaction,
      note: log.note ?? "",
      textureMm: plan.texture_mm,
      recordedBy: log.recorded_by,
      recordedAt: log.recorded_at,
    } satisfies FamilyMealRecord];
  });
}

function roleForIngredient(ingredient: IngredientDefinition): string {
  if (ingredient.category === "grain") return "base";
  if (["meat", "fish", "egg", "beans"].includes(ingredient.category)) return "protein";
  if (ingredient.category === "fruit") return "fruit";
  if (ingredient.category === "vegetable") return "vegetable";
  return "ingredient";
}

export async function saveFamilyMealRecord(input: SaveFamilyMealInput): Promise<void> {
  const client = getSupabaseClient();
  const { data: authData, error: authError } = await client.auth.getUser();
  if (authError) throw authError;
  if (!authData.user) throw new Error("로그인이 필요해요.");

  const { data: existingPlan, error: existingPlanError } = await client
    .from("meal_plans")
    .select("id,meal_plan_items(id)")
    .eq("child_id", input.childId)
    .eq("meal_date", input.date)
    .eq("meal_index", input.mealIndex)
    .maybeSingle();
  if (existingPlanError) throw existingPlanError;
  const previousItemIds = ((existingPlan?.meal_plan_items ?? []) as Array<{ id: string }>).map((item) => item.id);

  const { data: plan, error: planError } = await client
    .from("meal_plans")
    .upsert({
      child_id: input.childId,
      meal_date: input.date,
      meal_index: input.mealIndex,
      planned_time: input.plannedTime,
      title: input.title,
      serving_guide: input.servingGuide,
      texture_guide: input.textureGuide,
      status: "completed",
      recommendation_version: "book-engine-v2",
      recommendation_reasons: input.recommendationReasons,
      stage: input.stage,
      texture_mm: input.textureMm,
      serving_mode: "mixed",
      locked_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: "child_id,meal_date,meal_index" })
    .select("id")
    .single();
  if (planError) throw planError;

  // A plan created by this save must not stay behind as a "completed" meal without items or a log.
  const discardCreatedPlan = async () => {
    if (!existingPlan) await client.from("meal_plans").delete().eq("id", plan.id);
  };

  // Insert the replacement items before removing the previous ones so a failed save never empties a meal.
  const { error: itemError } = await client.from("meal_plan_items").insert(
    input.ingredients.map((ingredient) => ({
      meal_plan_id: plan.id,
      ingredient_id: ingredient.id,
      role: roleForIngredient(ingredient),
      is_new_exposure: ingredient.id === input.newExposureIngredientId,
    })),
  );
  if (itemError) {
    await discardCreatedPlan();
    throw itemError;
  }

  if (previousItemIds.length) {
    const { error: deleteItemError } = await client
      .from("meal_plan_items")
      .delete()
      .in("id", previousItemIds);
    if (deleteItemError) throw deleteItemError;
  }

  const now = input.recordedAt ?? new Date().toISOString();
  const { error: logError } = await client.from("meal_logs").upsert({
    meal_plan_id: plan.id,
    completion: input.completion,
    reaction: input.reaction,
    note: input.note.trim() || null,
    recorded_by: authData.user.id,
    recorded_at: now,
    texture_mm: input.textureMm,
    updated_at: now,
  }, { onConflict: "meal_plan_id" });
  if (logError) {
    await discardCreatedPlan();
    throw logError;
  }
}

export async function updateFamilyMealRecord(
  mealPlanId: string,
  update: Pick<SaveFamilyMealInput, "completion" | "reaction" | "note">,
): Promise<void> {
  const client = getSupabaseClient();
  const { data: authData, error: authError } = await client.auth.getUser();
  if (authError) throw authError;
  if (!authData.user) throw new Error("로그인이 필요해요.");

  // An edit only changes the log; the meal's title, time, texture, items and recommendation snapshot stay as recorded.
  const { error } = await client
    .from("meal_logs")
    .update({
      completion: update.completion,
      reaction: update.reaction,
      note: update.note.trim() || null,
      recorded_by: authData.user.id,
      updated_at: new Date().toISOString(),
    })
    .eq("meal_plan_id", mealPlanId)
    .select("id")
    .single();
  if (error) throw error;
}

function mapChildRow(row: ChildRow): BabyProfile {
  const birthDate = new Date(`${row.birth_date}T00:00:00`);
  const ageMonths = Math.max(0, Math.floor((Date.now() - birthDate.getTime()) / (30.4375 * 86_400_000)));
  const storedSkills = row.development_skills ?? {};
  const storedMealTimes = Array.isArray(storedSkills.mealTimes)
    ? storedSkills.mealTimes.filter((time: unknown): time is string => typeof time === "string")
    : undefined;
  return {
    id: row.id,
    nickname: row.nickname,
    stage: row.stage,
    ageMonths,
    correctedAgeMonths: row.corrected_age_days == null ? null : row.corrected_age_days / 30.4375,
    birthDate: row.birth_date,
    weaningStartDate: row.weaning_start_date,
    readiness: row.readiness,
    mealsPerDay: row.meals_per_day,
    snacksPerDay: row.snacks_per_day,
    preferredMealTime: String(row.preferred_meal_time).slice(0, 5),
    mealTimes: storedMealTimes,
    milkMlPerDay: row.milk_ml_per_day,
    textureMm: row.texture_mm,
    preparationStyle: row.preparation_style,
    temporaryCondition: row.temporary_condition,
    skills: {
      handlesCurrentTexture: Boolean(storedSkills.handlesCurrentTexture),
      reachesAndGrasps: Boolean(storedSkills.reachesAndGrasps),
      fingerFood: Boolean(storedSkills.fingerFood),
      spoonPractice: Boolean(storedSkills.spoonPractice),
      cupPractice: Boolean(storedSkills.cupPractice),
    },
  };
}
