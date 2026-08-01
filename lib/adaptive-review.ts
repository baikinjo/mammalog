import { getStageGuide } from "./book-knowledge";
import type {
  AdaptiveReview,
  BabyProfile,
  DailyRoutineLog,
  MealHistoryEntry,
  ProgressionProposal,
  WeaningStage,
} from "./domain";
import { inferWeaningStage } from "./recommendation-engine";

const stageOrder: Array<Exclude<WeaningStage, "prestart">> = ["initial", "middle", "late", "completion"];
const completionScore: Record<MealHistoryEntry["completion"], number> = {
  none: 0,
  taste: 1,
  quarter: 2,
  half: 3,
  most: 4,
  all: 5,
};

function sortedHistory(history: MealHistoryEntry[]): MealHistoryEntry[] {
  return [...history].sort((left, right) => new Date(left.servedAt).getTime() - new Date(right.servedAt).getTime());
}

function currentTexture(profile: BabyProfile): number {
  const stage = inferWeaningStage(profile);
  return Math.max(getStageGuide(stage).textureMmRange[0], profile.textureMm || 0);
}

function proposal(
  action: ProgressionProposal["action"],
  title: string,
  detail: string,
  profile: BabyProfile,
  reasons: string[],
  targetTextureMm = currentTexture(profile),
  targetStage?: ProgressionProposal["targetStage"],
): ProgressionProposal {
  return {
    action,
    title,
    detail,
    targetTextureMm,
    targetStage,
    reasons,
    requiresParentConfirmation: true,
  };
}

export function createAdaptiveReview(
  profile: BabyProfile,
  history: MealHistoryEntry[],
  routineLogs: DailyRoutineLog[] = [],
): AdaptiveReview {
  const stage = inferWeaningStage(profile);
  const guide = getStageGuide(stage);
  const recent = sortedHistory(history).slice(-7);
  const lastThree = recent.slice(-3);
  const latestRoutine = [...routineLogs].sort((left, right) => left.date.localeCompare(right.date)).at(-1);
  const needsReview = lastThree.some((entry) => entry.reaction === "needsReview");
  const textureDifficulty = lastThree.some((entry) => entry.reaction === "textureDifficulty");
  const tasteRejection = recent.some((entry) => entry.reaction === "tasteRejection");
  const steadyTexture = lastThree.length >= 3
    && lastThree.every((entry) => entry.reaction !== "textureDifficulty" && completionScore[entry.completion] >= 3);
  const adjustments: AdaptiveReview["adjustments"] = [];

  if (needsReview) {
    adjustments.push({
      id: "reaction-review",
      title: "새 재료 도입 잠시 보류",
      detail: "최근 ‘확인 필요’ 기록이 있어 해당 재료만 빼고 이미 통과한 음식으로 이어가요.",
      tone: "attention",
    });
  } else if (textureDifficulty) {
    adjustments.push({
      id: "texture-hold",
      title: "현재 질감을 유지",
      detail: "최근 질감이 어려웠다는 기록을 반영해 오늘은 입자를 더 키우지 않아요.",
      tone: "attention",
    });
  } else if (steadyTexture && profile.skills?.handlesCurrentTexture) {
    adjustments.push({
      id: "texture-ready",
      title: "다음 질감을 시도할 준비",
      detail: "최근 3끼에서 현재 질감을 편안히 다뤘어요. 아래 진행 제안은 부모가 확인한 뒤 적용합니다.",
      tone: "positive",
    });
  }

  if (tasteRejection) {
    adjustments.push({
      id: "repeat-rejected",
      title: "거부 재료는 다시 작게",
      detail: "단순 맛 거부는 제외 사유로 보지 않고 익숙한 음식 옆에 소량, 다른 제공 형태로 다시 경험하게 해요.",
      tone: "neutral",
    });
  }

  if (latestRoutine?.milkMl != null) {
    const [minimum, maximum] = guide.milkMlRange;
    adjustments.push({
      id: "milk-rhythm",
      title: "최근 수유 흐름 반영",
      detail: latestRoutine.milkMl >= minimum && latestRoutine.milkMl <= maximum
        ? `${latestRoutine.date} ${latestRoutine.milkMl}ml로 현재 단계의 책 범위 안에 있어요.`
        : `${latestRoutine.date} ${latestRoutine.milkMl}ml예요. 현재 단계의 책 범위 ${minimum}~${maximum}ml와 함께 추세를 확인해요.`,
      tone: latestRoutine.milkMl >= minimum && latestRoutine.milkMl <= maximum ? "positive" : "neutral",
    });
  }

  if (latestRoutine && (latestRoutine.cupPractice || latestRoutine.spoonPractice || latestRoutine.fingerFood)) {
    const practiced = [latestRoutine.fingerFood && "핑거푸드", latestRoutine.spoonPractice && "숟가락", latestRoutine.cupPractice && "컵"]
      .filter(Boolean)
      .join(" · ");
    adjustments.push({ id: "skill-practice", title: "먹기 연습도 누적", detail: `${practiced} 연습 기록을 다음 발달 과제에 반영해요.`, tone: "positive" });
  }

  if (!adjustments.length) {
    adjustments.push({
      id: "no-change",
      title: "오늘은 계획대로",
      detail: "최근 기록에서 별도 조정 신호가 없어 현재 재료 순서와 질감을 유지해요.",
      tone: "neutral",
    });
  }

  let progression: ProgressionProposal;
  if (needsReview) {
    progression = proposal("review", "반응 확인 뒤 다시 결정", "단계나 질감을 올리지 않고 보호자가 확인할 때까지 현재 흐름을 유지해요.", profile, ["최근 3끼 안에 ‘확인 필요’ 기록이 있어요."]);
  } else if (textureDifficulty) {
    progression = proposal("hold", "질감 진행 잠시 멈춤", "현재 단계의 안전한 질감을 유지하고 다음 기록을 더 지켜봐요.", profile, ["최근 3끼 안에 질감 어려움이 기록됐어요."]);
  } else {
    const currentIndex = stageOrder.indexOf(stage);
    const nextStage = stageOrder[currentIndex + 1];
    const age = profile.correctedAgeMonths ?? profile.ageMonths;
    const ageAllowsNext = Boolean(nextStage && age >= getStageGuide(nextStage).ageMonths[0]);
    const canAdvanceTexture = steadyTexture && Boolean(profile.skills?.handlesCurrentTexture);
    const nextTexture = Math.min(guide.textureMmRange[1], currentTexture(profile) + 2);
    if (canAdvanceTexture && ageAllowsNext && currentTexture(profile) >= guide.textureMmRange[1]) {
      const nextGuide = getStageGuide(nextStage!);
      progression = proposal(
        "advance",
        `${nextGuide.label} 전환을 확인해보세요`,
        "월령과 최근 식사 기록이 모두 준비 신호를 보여요. 자동 전환하지 않으며 부모가 설정에서 확정합니다.",
        profile,
        ["최근 3끼를 절반 이상 먹고 질감 어려움이 없었어요.", "현재 단계의 질감 상단에 도달했어요.", `다음 단계 시작 월령 ${nextGuide.ageMonths[0]}개월 이상이에요.`],
        nextGuide.textureMmRange[0],
        nextStage,
      );
    } else if (canAdvanceTexture && nextTexture > currentTexture(profile)) {
      progression = proposal(
        "advance",
        `${nextTexture}mm 질감을 확인해보세요`,
        "같은 단계 안에서 한 단계만 올리는 제안이에요. 부모가 아이 상태를 보고 설정에서 확정합니다.",
        profile,
        ["최근 3끼를 절반 이상 먹었어요.", "질감 어려움 기록이 없어요.", "현재 질감을 다룰 수 있다고 설정했어요."],
        nextTexture,
      );
    } else {
      progression = proposal("hold", "현재 단계 유지", "기록이 더 쌓일 때까지 현재 질감과 단계로 이어가요.", profile, ["단계 변경은 월령만으로 자동 결정하지 않아요."]);
    }
  }

  return { adjustments, progression };
}
