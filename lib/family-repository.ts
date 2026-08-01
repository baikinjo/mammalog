import type {
  BabyProfile,
  ChildIngredientState,
  DailyRecommendation,
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

export async function sendMagicLink(email: string, redirectTo: string): Promise<void> {
  const { error } = await getSupabaseClient().auth.signInWithOtp({
    email: email.trim(),
    options: { emailRedirectTo: redirectTo },
  });
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
  return data as string;
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
