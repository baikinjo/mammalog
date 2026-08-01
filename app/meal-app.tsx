"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
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
  House,
  Info,
  Plus,
  RefreshCw,
  Sprout,
  X,
} from "lucide-react";
import {
  demoHistory,
  demoIngredientStates,
  demoProfile,
  ingredientDefinitions,
} from "../lib/demo-data";
import { createBookBasedDayPlan, createInitialMealSuggestion } from "../lib/recommendation-engine";
import type { IngredientCategory, IngredientDefinition, IntroductionGroup } from "../lib/domain";
import {
  createFamilyInvite,
  createFamilyWorkspace,
  ensureDefaultChild,
  joinFamilyWithCode,
  loadFamilyMealRecords,
  loadFamilyWorkspace,
  saveFamilyMealRecord,
  sendMagicLink,
  signInFamilyAnonymously,
  signOutFamily,
  type FamilyMealReaction,
  type FamilyMealRecord,
  type FamilyWorkspace,
} from "../lib/family-repository";
import { getSupabaseClient, isSupabaseConfigured } from "../lib/supabase-client";

type Tab = "today" | "ingredients" | "records" | "profile";
type Amount = "taste" | "quarter" | "half" | "most";
type SettingKey = "start" | "time" | "style";
type ChoiceSettingKey = Exclude<SettingKey, "time">;
type RecordDraft = { amount: Amount; reaction: FamilyMealReaction; note: string };

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

function familyAuthMessage(error: unknown, fallback: string): string {
  const code = (error as { code?: string } | null)?.code;
  if (code === "over_email_send_rate_limit") {
    return "무료 메일 발송 한도를 넘었어요. 잠시 기다리거나 ‘이 기기 바로 연결’을 이용해주세요.";
  }
  if (code === "email_address_not_authorized") {
    return "Supabase 기본 메일은 등록된 관리자 주소에만 보낼 수 있어요. ‘이 기기 바로 연결’을 이용해주세요.";
  }
  if (code === "anonymous_provider_disabled") {
    return "Supabase에서 익명 로그인을 한 번 켜야 해요. Authentication → Providers → Anonymous에서 활성화해주세요.";
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

function dismissMobileKeyboard() {
  const activeElement = document.activeElement;
  if (activeElement instanceof HTMLElement) activeElement.blur();
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

function TodayPrepare({ onPreview }: { onPreview: () => void }) {
  return (
    <>
      <section className="hero-card">
        <div className="hero-kicker">
          <span>생후 4개월</span>
          <span className="status-pill">시작 전</span>
        </div>
        <h1>천천히, 첫 한끼를<br />준비하고 있어요</h1>
        <p>만 6개월 시작까지 약 8주 남았어요.</p>
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
        <button className="text-action" type="button" onClick={onPreview}>
          시작일 화면 미리보기 <ChevronRight size={17} aria-hidden="true" />
        </button>
      </section>

      <section className="tip-strip">
        <span className="tip-symbol" aria-hidden="true"><Info size={15} /></span>
        <p>날짜가 되어도 자동으로 시작하지 않아요. 부모가 준비됐을 때 시작을 확정해요.</p>
      </section>
    </>
  );
}

function TodayMeal({
  onBack,
  onRecord,
}: {
  onBack: () => void;
  onRecord: () => void;
}) {
  const suggestion = useMemo(
    () =>
      createInitialMealSuggestion(
        demoProfile,
        ingredientDefinitions,
        demoIngredientStates,
        demoHistory,
      ),
    [],
  );
  const bookPlan = useMemo(
    () => createBookBasedDayPlan(
      { ...demoProfile, stage: "initial", ageMonths: 6, correctedAgeMonths: 6, mealsPerDay: 1 },
      ingredientDefinitions,
      demoIngredientStates,
      demoHistory,
    ),
    [],
  );
  const [simpleRice, setSimpleRice] = useState(false);

  return (
    <>
      <button className="back-action" type="button" onClick={onBack}>
        <ArrowLeft size={17} aria-hidden="true" /> 준비 화면
      </button>

      <section className="day-intro">
        <div>
          <span className="overline">오전 {suggestion.mealTime}</span>
          <h1>이유식 1일차</h1>
          <p>먹는 양보다 새로운 경험을 시작하는 날이에요.</p>
        </div>
        <div className="day-number" aria-label="첫째 날">01</div>
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
            <span className="status-pill">{suggestion.testLabel}</span>
            <h2>{simpleRice ? "쌀죽" : suggestion.title}</h2>
          </div>
          <button
            className="swap-button"
            type="button"
            onClick={() => setSimpleRice((value) => !value)}
          >
            <RefreshCw size={13} aria-hidden="true" />
            {simpleRice ? "오트밀 포함" : "쌀만 사용"}
          </button>
        </div>

        <div className="ingredient-chips">
          <span><IngredientVisual ingredient={ingredientDefinitions[0]} className="is-chip" /> 쌀</span>
          {!simpleRice && <span><IngredientVisual ingredient={ingredientDefinitions[1]} className="is-chip" /> 오트밀</span>}
        </div>

        <dl className="meal-facts">
          <div>
            <dt>제공량</dt>
            <dd>{suggestion.servingGuide}</dd>
          </div>
          <div>
            <dt>질감</dt>
            <dd>{suggestion.textureGuide}</dd>
          </div>
        </dl>

        <details className="reason-box">
          <summary>왜 오늘 이 메뉴인가요?</summary>
          <ul>
            {suggestion.reasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        </details>

        <button className="primary-action" type="button" onClick={onRecord}>
          식사 기록하기
        </button>
      </section>

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
        <div className="avatar-pair" aria-hidden="true">
          <span>아</span><span>엄</span>
        </div>
        <p><strong>가족 동기화를 지원해요</strong><br />우리 아이 탭에서 각자 이메일로 연결하면 같은 기록을 보게 됩니다.</p>
      </section>
    </>
  );
}

function IngredientsView({
  ingredients,
  onSelect,
  onAdd,
}: {
  ingredients: IngredientDefinition[];
  onSelect: (ingredient: IngredientDefinition) => void;
  onAdd: () => void;
}) {
  const [selectedCategory, setSelectedCategory] = useState<IngredientCategory | "all">("all");
  const rice = ingredients.find((ingredient) => ingredient.id === "rice") ?? ingredients[0];
  const beef = ingredients.find((ingredient) => ingredient.id === "beef") ?? ingredients[2];
  const visibleIngredients = selectedCategory === "all"
    ? ingredients
    : ingredients.filter((ingredient) => ingredient.category === selectedCategory);

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
        <button className="status-card testing-card" type="button" onClick={() => onSelect(rice)}>
          <span className="status-label">테스트 예정</span>
          <div className="ingredient-large"><IngredientVisual ingredient={rice} className="is-large" /><strong>쌀</strong></div>
          <p>시작일 · 1/3일 <ChevronRight size={14} aria-hidden="true" /></p>
        </button>
        <button className="status-card next-card" type="button" onClick={() => onSelect(beef)}>
          <span className="status-label">그다음</span>
          <div className="ingredient-large"><IngredientVisual ingredient={beef} className="is-large" /><strong>소고기</strong></div>
          <p>곡류 적응 후 <ChevronRight size={14} aria-hidden="true" /></p>
        </button>
      </section>

      <section className="section-card">
        <div className="section-heading">
          <div>
            <span className="overline">책 전체 범위</span>
            <h2>재료 원장</h2>
          </div>
          <span className="count-badge">{visibleIngredients.length}개</span>
        </div>
        <p className="catalog-note">도입 우선순위와 월령·빈도·조리 안전 규칙을 함께 저장한 목록이에요.</p>
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
            return (
              <button className="ingredient-row" type="button" key={ingredient.id} onClick={() => onSelect(ingredient)}>
                <IngredientVisual ingredient={ingredient} />
                <div>
                  <strong>{ingredient.name}</strong>
                  <span>{isCustom ? `직접 추가 · ${categoryLabels[ingredient.category]}` : `${introductionGroupLabels[ingredient.introductionGroup]} · 만 ${ingredient.minimumAgeMonths ?? 6}개월부터`}</span>
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
  workspace,
  selectedDate,
  todayId,
  calendarCursor,
  onSelectDate,
  onMoveMonth,
  onGoToday,
  onEditRecord,
}: {
  records: FamilyMealRecord[];
  workspace: FamilyWorkspace | null;
  selectedDate: string;
  todayId: string;
  calendarCursor: CalendarCursor;
  onSelectDate: (date: string) => void;
  onMoveMonth: (direction: -1 | 1) => void;
  onGoToday: () => void;
  onEditRecord: (record: FamilyMealRecord) => void;
}) {
  const monthDays = useMemo(() => createMonthDays(calendarCursor), [calendarCursor]);
  const firstDayOffset = new Date(calendarCursor.year, calendarCursor.month, 1).getDay();
  const selectedRecord = records.find((record) => record.date === selectedDate) ?? null;
  const recordDates = useMemo(() => new Set(records.map((record) => record.date)), [records]);
  const selectedLabel = formatKoreanDate(selectedDate);
  const recordAuthor = selectedRecord
    ? workspace?.members.find((member) => member.userId === selectedRecord.recordedBy)?.displayName ?? "가족"
    : null;

  return (
    <>
      <section className="page-intro">
        <div>
          <span className="overline">가족 기록</span>
          <h1>작은 변화까지<br />함께 기억해요</h1>
        </div>
        <p>누가 기록해도 다른 기기에서 같은 상태를 보게 됩니다.</p>
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
          <button type="button" onClick={() => onMoveMonth(1)} aria-label="다음 달"><ChevronRight size={19} /></button>
        </div>
        <div className="calendar-weekdays" aria-hidden="true">
          {weekdayLabels.map((weekday) => <span key={weekday}>{weekday}</span>)}
        </div>
        <div className="month-grid" aria-label={`${calendarCursor.year}년 ${calendarCursor.month + 1}월 날짜 선택`}>
          {Array.from({ length: firstDayOffset }, (_, index) => <span className="calendar-blank" key={`blank-${index}`} />)}
          {monthDays.map((day) => {
            const hasRecord = recordDates.has(day.id);
            return (
              <button
                className={`calendar-day ${hasRecord ? "has-record" : ""} ${selectedDate === day.id ? "is-selected" : ""} ${todayId === day.id ? "is-today" : ""}`}
                type="button"
                key={day.id}
                onClick={() => onSelectDate(day.id)}
                aria-label={`${day.label}${todayId === day.id ? ", 오늘" : ""}${hasRecord ? ", 식사 기록 있음" : ""}`}
                aria-pressed={selectedDate === day.id}
              >
                <span>{day.day}</span><i aria-hidden="true" />
              </button>
            );
          })}
        </div>
        <div className="calendar-footer">
          <span className="record-dot-key"><i aria-hidden="true" /> 기록 있음</span>
          <p className="calendar-hint">이전·다음 달로 이동하고 원하는 날짜를 눌러 기록을 확인하세요.</p>
        </div>
      </section>

      <section className="section-card">
        <div className="section-heading">
          <div>
            <span className="overline">{selectedLabel}</span>
            <h2>{selectedRecord ? "식사를 기록했어요" : "이날의 기록이 없어요"}</h2>
          </div>
        </div>
        {selectedRecord ? (
          <button className="saved-record" type="button" onClick={() => onEditRecord(selectedRecord)}>
            <div className="saved-date"><strong>{String(selectedRecord.mealIndex).padStart(2, "0")}</strong><span>{formatKoreanTime(selectedRecord.plannedTime)}</span></div>
            <div>
              <strong>{selectedRecord.title}</strong>
              <p>{completionLabels[selectedRecord.completion]} · {reactionLabels[selectedRecord.reaction]}</p>
              <span className="record-author">{recordAuthor} 기록 · 가족과 동기화됨</span>
            </div>
            <ChevronRight size={18} aria-hidden="true" />
          </button>
        ) : (
          <div className="empty-state">
            <span aria-hidden="true">◌</span>
            <p>{records.length ? "달력에서 기록 표시가 있는 날짜를 눌러 확인할 수 있어요." : "이유식을 시작하면 섭취량, 반응, 질감 기록이 이곳에 쌓입니다."}</p>
          </div>
        )}
      </section>
    </>
  );
}

function ProfileView({
  settings,
  onEditSetting,
  onExport,
  onWorkspaceChange,
}: {
  settings: Record<SettingKey, string>;
  onEditSetting: (key: SettingKey) => void;
  onExport: () => void;
  onWorkspaceChange: () => void;
}) {
  return (
    <>
      <section className="profile-hero">
        <div className="baby-avatar" aria-hidden="true">아</div>
        <div>
          <span className="overline">우리 가족</span>
          <h1>우리 아기</h1>
          <p>생후 4개월 · 이유식 시작 전</p>
        </div>
      </section>

      <section className="section-card profile-settings">
        <div className="setting-row">
          <div><span>예상 시작</span><strong>{settings.start}</strong></div>
          <button type="button" aria-label="예상 시작일 수정" onClick={() => onEditSetting("start")}><ChevronRight size={19} /></button>
        </div>
        <div className="setting-row">
          <div><span>첫 끼 시간</span><strong>{formatKoreanTime(settings.time)}</strong></div>
          <button type="button" aria-label="첫 끼 시간 수정" onClick={() => onEditSetting("time")}><ChevronRight size={19} /></button>
        </div>
        <div className="setting-row">
          <div><span>조리 방식</span><strong>{settings.style}</strong></div>
          <button type="button" aria-label="조리 방식 수정" onClick={() => onEditSetting("style")}><ChevronRight size={19} /></button>
        </div>
      </section>

      <FamilySyncSection onWorkspaceChange={onWorkspaceChange} />

      <button className="export-button" type="button" onClick={onExport}><Download size={17} aria-hidden="true" /> 내 데이터 내보내기</button>
    </>
  );
}

function FamilySyncSection({ onWorkspaceChange }: { onWorkspaceChange: () => void }) {
  const configured = isSupabaseConfigured();
  const [email, setEmail] = useState("");
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [familyName, setFamilyName] = useState("우리 가족");
  const [inviteInput, setInviteInput] = useState("");
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [workspace, setWorkspace] = useState<FamilyWorkspace | null>(null);
  const [loading, setLoading] = useState(configured);
  const [message, setMessage] = useState<string | null>(null);
  const [needsDatabase, setNeedsDatabase] = useState(false);

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
      setUserEmail(nextUserLabel);
      if (nextUserLabel) void refreshWorkspace();
      setLoading(false);
    });
    const { data } = client.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      const nextUserLabel = session?.user ? session.user.email ?? "이 기기 보호자" : null;
      setUserEmail(nextUserLabel);
      setLoading(false);
      if (nextUserLabel) window.setTimeout(() => void refreshWorkspace(), 0);
      else {
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
      await sendMagicLink(email, `${window.location.origin}/`);
      setMessage("이메일로 로그인 링크를 보냈어요. 같은 기기에서 링크를 열어주세요.");
    } catch (error) {
      setMessage(familyAuthMessage(error, "로그인 링크를 보내지 못했어요. 이메일 주소를 확인해주세요."));
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

  return (
    <section className="section-card family-sync-card">
      <div className="section-heading">
        <div>
          <span className="overline">함께 보는 사람</span>
          <h2>가족 동기화</h2>
        </div>
        <span className={`sync-status ${workspace ? "is-connected" : ""}`}>{workspace ? "연결됨" : configured ? "연결 대기" : "설정 전"}</span>
      </div>

      {!configured && <p className="sync-copy">공유 저장소 연결 정보가 설정되면 이메일 로그인을 사용할 수 있어요.</p>}

      {configured && !userEmail && (
        <div className="device-connect-panel">
          <p className="sync-copy">이 아이폰을 보호자 기기로 연결한 뒤, 배우자에게 받은 가족 코드로 같은 기록에 참여하세요.</p>
          <button className="primary-action" type="button" disabled={loading} onClick={() => void connectThisDevice()}><Link2 size={17} aria-hidden="true" /> {loading ? "이 기기 연결 중…" : "이 기기 바로 연결"}</button>
          <details className="email-login-details">
            <summary>기존 이메일 계정으로 로그인</summary>
            <form className="sync-form" onSubmit={requestLogin}>
              <label><span>이메일</span><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@example.com" required disabled={loading} /></label>
              <button className="secondary-action" type="submit" disabled={loading}>로그인 링크 받기</button>
              <small>무료 기본 메일은 발송 수와 받을 수 있는 주소가 제한될 수 있어요.</small>
            </form>
          </details>
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

      {userEmail && workspace && (
        <div className="sync-connected">
          <p className="signed-email"><Check size={14} aria-hidden="true" /> {workspace.householdName} · {userEmail}</p>
          <div className="family-list">
            {workspace.members.map((member, index) => (
              <div key={member.userId}>
                <span className={`family-avatar ${index % 2 ? "apricot" : "sage"}`}>{member.displayName.slice(0, 1)}</span>
                <p><strong>{member.displayName}</strong><br /><small>{member.role === "owner" ? "가족 관리자" : "보호자"}</small></p>
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
  );
}

function IngredientSheet({
  ingredient,
  onClose,
}: {
  ingredient: IngredientDefinition;
  onClose: () => void;
}) {
  const guidance = ingredient.id.startsWith("custom-")
    ? "직접 추가한 재료예요. 가족의 계획에 맞춰 도입 시기를 정할 수 있어요."
    : ingredient.bookGuidance ?? "앞선 재료에 적응한 뒤 한 가지씩 열어요.";
  const preparation = ingredient.preparationConstraints?.join(" · ")
    ?? ingredient.chokingFormBlacklist?.map((item) => `${item} 제외`).join(" · ")
    ?? "단계에 맞게 충분히 부드럽게 조리";

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
          <div><dt>도입 시기</dt><dd>만 {ingredient.minimumAgeMonths ?? 6}개월부터 · {stageLabels[ingredient.minimumStage]}</dd></div>
          <div><dt>조리·안전</dt><dd>{preparation}</dd></div>
          {ingredient.frequencyCap7Days && <div><dt>빈도 제한</dt><dd>최근 7일 최대 {ingredient.frequencyCap7Days}회</dd></div>}
          <div><dt>책 근거</dt><dd>{ingredient.sourcePages?.join(" · ") ?? "가족이 직접 추가한 재료"}</dd></div>
          <div><dt>기록 방법</dt><dd>섭취량, 단순 거부, 질감 어려움, 이상 반응을 각각 나누어 기록해요.</dd></div>
        </dl>
        <button className="primary-action" type="button" onClick={onClose}>확인했어요</button>
      </section>
    </div>
  );
}

function AddIngredientSheet({
  onAdd,
  onClose,
}: {
  onAdd: (name: string, category: IngredientCategory, assetId: string) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState("");
  const [category, setCategory] = useState<IngredientCategory>("vegetable");
  const [assetId, setAssetId] = useState("broccoli");
  const matchingIngredient = ingredientDefinitions.find(
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

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    dismissMobileKeyboard();
    const trimmedName = name.trim();
    if (trimmedName && assetId && !matchingIngredient) onAdd(trimmedName, category, assetId);
  };

  return (
    <div className="sheet-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="record-sheet compact-sheet" role="dialog" aria-modal="true" aria-labelledby="add-ingredient-title" onMouseDown={(event) => event.stopPropagation()}>
        <div className="sheet-handle" aria-hidden="true" />
        <div className="sheet-heading">
          <div><span className="overline">내 재료</span><h2 id="add-ingredient-title">재료 직접 추가</h2></div>
          <button className="close-button" type="button" onClick={onClose} aria-label="닫기"><X size={19} /></button>
        </div>
        <form className="ingredient-form" onSubmit={submit}>
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
          <p>{matchingIngredient ? `${matchingIngredient.name}은(는) 기본 재료 목록에 이미 있어요.` : "책의 식품군을 고르고, 재료에 맞는 이미지를 직접 선택할 수 있어요."}</p>
          <button className="primary-action" type="submit" disabled={!name.trim() || !assetId || Boolean(matchingIngredient)}>
            {matchingIngredient ? "이미 등록된 재료예요" : "재료 추가"}
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

function TimeSettingSheet({
  value,
  onSave,
  onClose,
}: {
  value: string;
  onSave: (value: string) => void;
  onClose: () => void;
}) {
  const [time, setTime] = useState(value);

  return (
    <div className="sheet-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="record-sheet compact-sheet" role="dialog" aria-modal="true" aria-labelledby="time-setting-title" onMouseDown={(event) => event.stopPropagation()}>
        <div className="sheet-handle" aria-hidden="true" />
        <div className="sheet-heading">
          <div><span className="overline">우리 아이 설정</span><h2 id="time-setting-title">첫 끼 시간</h2></div>
          <button className="close-button" type="button" onClick={onClose} aria-label="닫기"><X size={19} /></button>
        </div>
        <form className="time-form" onSubmit={(event) => { event.preventDefault(); dismissMobileKeyboard(); onSave(time); }}>
          <label htmlFor="first-meal-time">원하는 시간을 직접 설정하세요</label>
          <div className="time-input-wrap">
            <input
              id="first-meal-time"
              aria-label="첫 끼 시간"
              type="time"
              step="300"
              value={time}
              onInput={(event) => setTime(event.currentTarget.value)}
              onChange={(event) => setTime(event.target.value)}
            />
          </div>
          <p>아이폰과 아이패드에서는 기기의 시간 선택 다이얼이 열립니다.</p>
          <button className="primary-action" type="submit" disabled={!time}>{formatKoreanTime(time)}에 저장</button>
        </form>
      </section>
    </div>
  );
}

function RecordSheet({
  targetDate,
  initialRecord,
  onClose,
  onSave,
}: {
  targetDate: string;
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
            <span className="overline">{formatKoreanDate(targetDate)} · 오전 10:00</span>
            <h2 id="record-title">{initialRecord ? "식사 기록을 수정할까요?" : "첫 식사는 어땠나요?"}</h2>
          </div>
          <button className="close-button" type="button" onClick={onClose} aria-label="닫기"><X size={19} /></button>
        </div>

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
  const [recordOpen, setRecordOpen] = useState(false);
  const [todayId] = useState(() => toDateId(new Date()));
  const [recordTargetDate, setRecordTargetDate] = useState(() => toDateId(new Date()));
  const [records, setRecords] = useState<FamilyMealRecord[]>([]);
  const [familyWorkspace, setFamilyWorkspace] = useState<FamilyWorkspace | null>(null);
  const [selectedDate, setSelectedDate] = useState(() => toDateId(new Date()));
  const [calendarCursor, setCalendarCursor] = useState<CalendarCursor>(() => {
    const today = new Date();
    return { year: today.getFullYear(), month: today.getMonth() };
  });
  const [selectedIngredient, setSelectedIngredient] = useState<IngredientDefinition | null>(null);
  const [customIngredients, setCustomIngredients] = useState<IngredientDefinition[]>([]);
  const [addIngredientOpen, setAddIngredientOpen] = useState(false);
  const [editingSetting, setEditingSetting] = useState<SettingKey | null>(null);
  const [settings, setSettings] = useState<Record<SettingKey, string>>({
    start: "만 6개월",
    time: "10:00",
    style: "냉동 큐브 활용",
  });
  const [toast, setToast] = useState<string | null>(null);
  const allIngredients = useMemo(() => [...ingredientDefinitions, ...customIngredients], [customIngredients]);
  const currentChild = familyWorkspace?.children[0] ?? null;
  const editingRecord = records.find((record) => record.date === recordTargetDate) ?? null;

  const showToast = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(null), 2600);
  }, []);

  const refreshFamilyData = useCallback(async () => {
    if (!isSupabaseConfigured()) return;
    const client = getSupabaseClient();
    const { data } = await client.auth.getSession();
    if (!data.session?.user) {
      setFamilyWorkspace(null);
      setRecords([]);
      return;
    }

    try {
      let nextWorkspace = await loadFamilyWorkspace();
      if (nextWorkspace && !nextWorkspace.children.length) {
        await ensureDefaultChild(nextWorkspace.householdId);
        nextWorkspace = await loadFamilyWorkspace();
      }
      setFamilyWorkspace(nextWorkspace);
      const child = nextWorkspace?.children[0];
      setRecords(child ? await loadFamilyMealRecords(child.id) : []);
    } catch {
      setFamilyWorkspace(null);
      setRecords([]);
    }
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured()) return;
    void refreshFamilyData();
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
      data.subscription.unsubscribe();
      window.removeEventListener("focus", refreshWhenVisible);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
      window.clearInterval(interval);
    };
  }, [refreshFamilyData]);

  const saveRecord = async (draft: RecordDraft) => {
    if (!currentChild) {
      setRecordOpen(false);
      setActiveTab("profile");
      showToast("먼저 우리 아이 탭에서 가족 로그인을 연결해주세요.");
      return;
    }

    const planProfile = {
      ...currentChild,
      stage: "initial" as const,
      ageMonths: Math.max(6, currentChild.ageMonths),
      correctedAgeMonths: Math.max(6, currentChild.correctedAgeMonths ?? currentChild.ageMonths),
      mealsPerDay: 1,
    };
    const plan = createBookBasedDayPlan(
      planProfile,
      ingredientDefinitions,
      demoIngredientStates,
      demoHistory,
      parseDateId(recordTargetDate),
    );
    const meal = plan.meals[0];
    if (!meal) {
      showToast("오늘 기록할 추천 식사를 만들지 못했어요.");
      return;
    }

    try {
      await saveFamilyMealRecord({
        childId: currentChild.id,
        date: recordTargetDate,
        plannedTime: meal.time,
        title: meal.title,
        ingredients: meal.items.map((item) => item.ingredient),
        completion: draft.amount,
        reaction: draft.reaction,
        note: draft.note,
        stage: plan.stage,
        textureMm: currentChild.textureMm || 1,
        servingGuide: meal.servingGuide,
        textureGuide: meal.textureGuide,
        recommendationReasons: meal.reasons,
      });
      await refreshFamilyData();
      const recordedDay = parseDateId(recordTargetDate);
      setRecordOpen(false);
      setSelectedDate(recordTargetDate);
      setCalendarCursor({ year: recordedDay.getFullYear(), month: recordedDay.getMonth() });
      showToast("식사 기록을 가족 공간에 저장했어요.");
    } catch {
      showToast("기록을 저장하지 못했어요. 잠시 후 다시 시도해주세요.");
    }
  };

  const addIngredient = (name: string, category: IngredientCategory, assetId: string) => {
    setCustomIngredients((current) => [
      ...current,
      {
        id: `custom-${Date.now()}`,
        name,
        emoji: "",
        assetId,
        category,
        introductionGroup: introductionGroupByCategory[category],
        minimumStage: "initial",
        introductionPriority: ingredientDefinitions.length + current.length + 1,
      },
    ]);
    setAddIngredientOpen(false);
    showToast(`${name} 재료를 목록에 추가했어요.`);
  };

  const moveCalendarMonth = (direction: -1 | 1) => {
    const next = new Date(calendarCursor.year, calendarCursor.month + direction, 1);
    setSelectedDate(toDateId(next));
    setCalendarCursor({ year: next.getFullYear(), month: next.getMonth() });
  };

  const goCalendarToday = () => {
    const today = parseDateId(todayId);
    setSelectedDate(todayId);
    setCalendarCursor({ year: today.getFullYear(), month: today.getMonth() });
  };

  const updateSetting = (value: string) => {
    if (!editingSetting) return;
    setSettings((current) => ({ ...current, [editingSetting]: value }));
    setEditingSetting(null);
    showToast("우리 아이 설정을 바꿨어요.");
  };

  const exportData = () => {
    const payload = {
      exportedAt: new Date().toISOString(),
      child: { nickname: demoProfile.nickname, ageMonths: demoProfile.ageMonths },
      settings,
      customIngredients,
      mealRecords: records,
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
          <span className="avatar-pair" aria-hidden="true"><i>아</i><i>엄</i></span>
          <span>우리 가족</span>
          <ChevronRight size={17} aria-hidden="true" />
        </button>
      </header>

      <main id="top" className="app-main">
        {activeTab === "today" && (
          previewStarted ? (
            <TodayMeal onBack={() => setPreviewStarted(false)} onRecord={() => { setRecordTargetDate(todayId); setRecordOpen(true); }} />
          ) : (
            <TodayPrepare onPreview={() => setPreviewStarted(true)} />
          )
        )}
        {activeTab === "ingredients" && (
          <IngredientsView ingredients={allIngredients} onSelect={setSelectedIngredient} onAdd={() => setAddIngredientOpen(true)} />
        )}
        {activeTab === "records" && (
          <RecordsView
            records={records}
            workspace={familyWorkspace}
            selectedDate={selectedDate}
            todayId={todayId}
            calendarCursor={calendarCursor}
            onSelectDate={setSelectedDate}
            onMoveMonth={moveCalendarMonth}
            onGoToday={goCalendarToday}
            onEditRecord={(record) => { setRecordTargetDate(record.date); setRecordOpen(true); }}
          />
        )}
        {activeTab === "profile" && <ProfileView settings={settings} onEditSetting={setEditingSetting} onExport={exportData} onWorkspaceChange={refreshFamilyData} />}
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

      {recordOpen && (
        <RecordSheet targetDate={recordTargetDate} initialRecord={editingRecord} onClose={() => setRecordOpen(false)} onSave={saveRecord} />
      )}

      {selectedIngredient && <IngredientSheet ingredient={selectedIngredient} onClose={() => setSelectedIngredient(null)} />}

      {addIngredientOpen && <AddIngredientSheet onAdd={addIngredient} onClose={() => setAddIngredientOpen(false)} />}

      {editingSetting === "time" && (
        <TimeSettingSheet value={settings.time} onSave={updateSetting} onClose={() => setEditingSetting(null)} />
      )}

      {editingSetting && editingSetting !== "time" && (
        <SettingSheet settingKey={editingSetting} value={settings[editingSetting]} onSelect={updateSetting} onClose={() => setEditingSetting(null)} />
      )}

      {toast && <div className="toast" role="status">✓ {toast}</div>}
    </div>
  );
}
