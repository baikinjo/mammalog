import type {
  BabyProfile,
  ChildIngredientState,
  DailyRecommendation,
  IngredientDefinition,
  MealHistoryEntry,
} from "./domain";
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

export async function sendMagicLink(email: string, redirectTo: string): Promise<void> {
  const { error } = await getSupabaseClient().auth.signInWithOtp({
    email: email.trim(),
    options: { emailRedirectTo: redirectTo },
  });
  if (error) throw error;
}

export async function signInFamilyAnonymously(): Promise<void> {
  const { error } = await getSupabaseClient().auth.signInAnonymously();
  if (error) throw error;
}

export async function signOutFamily(): Promise<void> {
  const { error } = await getSupabaseClient().auth.signOut();
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
    .order("created_at");
  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    emoji: row.emoji ?? "",
    assetId: row.asset_id ?? undefined,
    category: row.category,
    foodGroup: row.food_group ?? undefined,
    introductionGroup: row.introduction_group,
    minimumStage: row.minimum_stage,
    minimumAgeMonths: row.minimum_age_months ?? 6,
    introductionPriority: row.introduction_priority,
    preparationConstraints: row.preparation_constraints ?? [],
    chokingFormBlacklist: row.choking_form_blacklist ?? [],
    bookGuidance: row.book_guidance ?? undefined,
    sourcePages: row.source_pages ?? [],
    tags: row.tags ?? [],
  }));
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
    introduction_group: ingredient.introductionGroup,
    minimum_stage: ingredient.minimumStage,
    minimum_age_months: ingredient.minimumAgeMonths ?? 6,
    introduction_priority: ingredient.introductionPriority,
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

function fourMonthsAgo(): string {
  const date = new Date();
  date.setMonth(date.getMonth() - 4);
  return date.toISOString().slice(0, 10);
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
      development_skills: profile.skills ?? {},
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
    history: (historyRows ?? []).map((row: any) => ({
      servedAt: row.recorded_at,
      ingredientIds: row.meal_plans?.meal_plan_items?.map((item: any) => item.ingredient_id) ?? [],
      completion: row.completion,
      mealType: "meal",
      textureMm: row.texture_mm,
      offeredGrams: row.offered_grams,
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
    .select("id,meal_date,meal_index,planned_time,title,texture_mm,meal_plan_items(ingredient_id),meal_logs(id,completion,reaction,note,recorded_by,recorded_at)")
    .eq("child_id", childId)
    .eq("status", "completed")
    .order("meal_date", { ascending: false });
  if (error) throw error;

  return (data ?? []).flatMap((plan: any) => {
    const log = Array.isArray(plan.meal_logs) ? plan.meal_logs[0] : plan.meal_logs;
    if (!log) return [];
    return [{
      id: log.id,
      mealPlanId: plan.id,
      date: plan.meal_date,
      mealIndex: plan.meal_index,
      plannedTime: String(plan.planned_time).slice(0, 5),
      title: plan.title,
      ingredientIds: (plan.meal_plan_items ?? []).map((item: any) => item.ingredient_id),
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

  const { error: deleteItemError } = await client
    .from("meal_plan_items")
    .delete()
    .eq("meal_plan_id", plan.id);
  if (deleteItemError) throw deleteItemError;

  const { error: itemError } = await client.from("meal_plan_items").insert(
    input.ingredients.map((ingredient, index) => ({
      meal_plan_id: plan.id,
      ingredient_id: ingredient.id,
      role: roleForIngredient(ingredient),
      is_new_exposure: input.newExposureIngredientId
        ? ingredient.id === input.newExposureIngredientId
        : index === 0,
    })),
  );
  if (itemError) throw itemError;

  const now = new Date().toISOString();
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
  if (logError) throw logError;
}

function mapChildRow(row: any): BabyProfile {
  const birthDate = new Date(`${row.birth_date}T00:00:00`);
  const ageMonths = Math.max(0, Math.floor((Date.now() - birthDate.getTime()) / (30.4375 * 86_400_000)));
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
    milkMlPerDay: row.milk_ml_per_day,
    textureMm: row.texture_mm,
    preparationStyle: row.preparation_style,
    temporaryCondition: row.temporary_condition,
    skills: row.development_skills,
  };
}
