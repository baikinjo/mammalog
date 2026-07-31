"use client";

import { useMemo, useState } from "react";
import {
  ArrowLeft,
  Baby,
  CalendarDays,
  Check,
  ChevronRight,
  Download,
  House,
  Info,
  RefreshCw,
  Sprout,
} from "lucide-react";
import {
  demoHistory,
  demoIngredientStates,
  demoProfile,
  ingredientDefinitions,
} from "../lib/demo-data";
import { createInitialMealSuggestion } from "../lib/recommendation-engine";
import type { IngredientDefinition } from "../lib/domain";

type Tab = "today" | "ingredients" | "records" | "profile";
type Amount = "taste" | "quarter" | "half" | "most";
type SettingKey = "start" | "time" | "style";

type CalendarDay = {
  id: string;
  weekday: string;
  day: number;
  month: number;
  label: string;
};

const preparationItems = [
  "부부 계정 연결하기",
  "아기의자 준비하기",
  "숟가락과 컵 준비하기",
  "첫 끼 시간을 가족과 정하기",
];

const amountLabels: Record<Amount, string> = {
  taste: "맛만 봄",
  quarter: "조금",
  half: "절반",
  most: "대부분",
};

const calendarDays: CalendarDay[] = [
  { id: "2026-07-27", weekday: "월", day: 27, month: 7, label: "7월 27일 월요일" },
  { id: "2026-07-28", weekday: "화", day: 28, month: 7, label: "7월 28일 화요일" },
  { id: "2026-07-29", weekday: "수", day: 29, month: 7, label: "7월 29일 수요일" },
  { id: "2026-07-30", weekday: "목", day: 30, month: 7, label: "7월 30일 목요일" },
  { id: "2026-07-31", weekday: "금", day: 31, month: 7, label: "7월 31일 금요일" },
  { id: "2026-08-01", weekday: "토", day: 1, month: 8, label: "8월 1일 토요일" },
  { id: "2026-08-02", weekday: "일", day: 2, month: 8, label: "8월 2일 일요일" },
  { id: "2026-08-03", weekday: "월", day: 3, month: 8, label: "8월 3일 월요일" },
  { id: "2026-08-04", weekday: "화", day: 4, month: 8, label: "8월 4일 화요일" },
  { id: "2026-08-05", weekday: "수", day: 5, month: 8, label: "8월 5일 수요일" },
  { id: "2026-08-06", weekday: "목", day: 6, month: 8, label: "8월 6일 목요일" },
  { id: "2026-08-07", weekday: "금", day: 7, month: 8, label: "8월 7일 금요일" },
  { id: "2026-08-08", weekday: "토", day: 8, month: 8, label: "8월 8일 토요일" },
  { id: "2026-08-09", weekday: "일", day: 9, month: 8, label: "8월 9일 일요일" },
];

const settingOptions: Record<SettingKey, { title: string; values: string[] }> = {
  start: { title: "예상 시작", values: ["만 5개월 반", "만 6개월", "소아과 상담 후"] },
  time: { title: "첫 끼 시간", values: ["오전 9:00", "오전 10:00", "오전 11:00"] },
  style: { title: "조리 방식", values: ["바로 조리", "냉동 큐브 활용", "두 방식 함께"] },
};

function BrandMark() {
  return (
    <span className="brand-mark" aria-hidden="true">
      <img src="/icon-192.png" alt="" width="42" height="42" />
    </span>
  );
}

function TodayPrepare({
  completed,
  onToggle,
  onPreview,
}: {
  completed: boolean[];
  onToggle: (index: number) => void;
  onPreview: () => void;
}) {
  const completedCount = completed.filter(Boolean).length;

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

      <section className="section-card readiness-card">
        <div className="section-heading">
          <div>
            <span className="overline">이번 주</span>
            <h2>시작 준비</h2>
          </div>
          <span className="fraction">{completedCount}/4</span>
        </div>
        <div className="progress-track" aria-label={`준비 항목 ${completedCount}개 완료`}>
          <span style={{ width: `${(completedCount / 4) * 100}%` }} />
        </div>
        <div className="check-list">
          {preparationItems.map((item, index) => (
            <button
              className={`check-row ${completed[index] ? "is-complete" : ""}`}
              key={item}
              type="button"
              onClick={() => onToggle(index)}
              aria-pressed={completed[index]}
            >
              <span className="check-circle" aria-hidden="true">
                {completed[index] ? <Check size={15} strokeWidth={2.5} /> : ""}
              </span>
              <span>{item}</span>
            </button>
          ))}
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
          <span>🍚 쌀</span>
          {!simpleRice && <span>🌾 오트밀</span>}
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

      <section className="sync-row">
        <div className="avatar-pair" aria-hidden="true">
          <span>아</span><span>엄</span>
        </div>
        <p><strong>가족과 동기화 준비됨</strong><br />두 계정에서 같은 식단을 확인하게 됩니다.</p>
      </section>
    </>
  );
}

function IngredientsView({ onSelect }: { onSelect: (ingredient: IngredientDefinition) => void }) {
  const rice = ingredientDefinitions[0];
  const beef = ingredientDefinitions[2];

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
          <div className="ingredient-large"><span>🍚</span><strong>쌀</strong></div>
          <p>시작일 · 1/3일 <ChevronRight size={14} aria-hidden="true" /></p>
        </button>
        <button className="status-card next-card" type="button" onClick={() => onSelect(beef)}>
          <span className="status-label">그다음</span>
          <div className="ingredient-large"><span>🥩</span><strong>소고기</strong></div>
          <p>곡류 적응 후 <ChevronRight size={14} aria-hidden="true" /></p>
        </button>
      </section>

      <section className="section-card">
        <div className="section-heading">
          <div>
            <span className="overline">첫 순서</span>
            <h2>도입 대기 재료</h2>
          </div>
          <span className="fraction">8개</span>
        </div>
        <div className="ingredient-list">
          {ingredientDefinitions.map((ingredient, index) => (
            <button className="ingredient-row" type="button" key={ingredient.id} onClick={() => onSelect(ingredient)}>
              <span className="ingredient-emoji" aria-hidden="true">{ingredient.emoji}</span>
              <div>
                <strong>{ingredient.name}</strong>
                <span>{index < 2 ? "첫 곡류" : index === 2 ? "매일 고기 시작" : "순서에 맞춰 열림"}</span>
              </div>
              <span className="ingredient-order"><i>{String(index + 1).padStart(2, "0")}</i><ChevronRight size={16} aria-hidden="true" /></span>
            </button>
          ))}
        </div>
      </section>
    </>
  );
}

function RecordsView({
  saved,
  amount,
  selectedDate,
  onSelectDate,
  onEditRecord,
}: {
  saved: boolean;
  amount: Amount;
  selectedDate: string;
  onSelectDate: (date: string) => void;
  onEditRecord: () => void;
}) {
  const selectedDay = calendarDays.find((day) => day.id === selectedDate) ?? calendarDays[4];
  const selectedHasRecord = saved && selectedDate === "2026-07-31";

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
        <div className="section-heading">
          <div>
            <span className="overline">이번 주</span>
            <h2>준비와 식사 기록</h2>
          </div>
          <span className="fraction">{selectedDay.month}월</span>
        </div>
        <p className="calendar-hint">좌우로 밀어 날짜를 고르고, 원하는 날을 눌러보세요.</p>
        <div className="calendar-scroll" aria-label="날짜 선택">
          <div className="week-row">
            {calendarDays.map((day) => {
              const hasRecord = saved && day.id === "2026-07-31";
              return (
                <button
                  className={`week-day ${hasRecord ? "has-record" : ""} ${selectedDate === day.id ? "is-selected" : ""}`}
                  type="button"
                  key={day.id}
                  onClick={() => onSelectDate(day.id)}
                  aria-label={`${day.label}${hasRecord ? ", 식사 기록 있음" : ""}`}
                  aria-pressed={selectedDate === day.id}
                >
                  <span>{day.month !== 7 && day.day === 1 ? `${day.month}월` : day.weekday}</span>
                  <strong>{day.day}</strong>
                  <i aria-hidden="true" />
                </button>
              );
            })}
          </div>
        </div>
      </section>

      <section className="section-card">
        <div className="section-heading">
          <div>
            <span className="overline">{selectedDay.label}</span>
            <h2>{selectedHasRecord ? "첫 식사를 기록했어요" : "이날의 기록이 없어요"}</h2>
          </div>
        </div>
        {selectedHasRecord ? (
          <button className="saved-record" type="button" onClick={onEditRecord}>
            <div className="saved-date"><strong>01</strong><span>1일차</span></div>
            <div>
              <strong>쌀·오트밀죽</strong>
              <p>{amountLabels[amount]} · 특별한 반응 없음</p>
              <span className="record-author">엄마와 동기화됨</span>
            </div>
            <ChevronRight size={18} aria-hidden="true" />
          </button>
        ) : (
          <div className="empty-state">
            <span aria-hidden="true">◌</span>
            <p>{saved ? "다른 날짜를 눌러 기록을 확인할 수 있어요." : "이유식을 시작하면 섭취량, 반응, 질감 기록이 이곳에 쌓입니다."}</p>
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
}: {
  settings: Record<SettingKey, string>;
  onEditSetting: (key: SettingKey) => void;
  onExport: () => void;
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
          <div><span>첫 끼 시간</span><strong>{settings.time}</strong></div>
          <button type="button" aria-label="첫 끼 시간 수정" onClick={() => onEditSetting("time")}><ChevronRight size={19} /></button>
        </div>
        <div className="setting-row">
          <div><span>조리 방식</span><strong>{settings.style}</strong></div>
          <button type="button" aria-label="조리 방식 수정" onClick={() => onEditSetting("style")}><ChevronRight size={19} /></button>
        </div>
      </section>

      <section className="section-card">
        <div className="section-heading">
          <div>
            <span className="overline">함께 보는 사람</span>
            <h2>가족 구성원</h2>
          </div>
        </div>
        <div className="family-list">
          <div><span className="family-avatar sage">아</span><p><strong>아빠</strong><br /><small>관리자</small></p></div>
          <div><span className="family-avatar apricot">엄</span><p><strong>엄마</strong><br /><small>관리자</small></p></div>
        </div>
      </section>

      <button className="export-button" type="button" onClick={onExport}><Download size={17} aria-hidden="true" /> 내 데이터 내보내기</button>
    </>
  );
}

function IngredientSheet({
  ingredient,
  onClose,
}: {
  ingredient: IngredientDefinition;
  onClose: () => void;
}) {
  const guidance = ingredient.id === "rice" || ingredient.id === "oatmeal"
    ? "첫 곡류로 소량부터 시작해요."
    : ingredient.id === "beef"
      ? "곡류에 익숙해진 뒤 매일 식단에 더해요."
      : "앞선 재료에 적응한 뒤 한 가지씩 열어요.";

  return (
    <div className="sheet-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="record-sheet compact-sheet" role="dialog" aria-modal="true" aria-labelledby="ingredient-title" onMouseDown={(event) => event.stopPropagation()}>
        <div className="sheet-handle" aria-hidden="true" />
        <div className="sheet-heading">
          <div className="ingredient-sheet-title">
            <span className="ingredient-emoji" aria-hidden="true">{ingredient.emoji}</span>
            <div><span className="overline">도입 순서 {ingredient.introductionPriority}</span><h2 id="ingredient-title">{ingredient.name}</h2></div>
          </div>
          <button className="close-button" type="button" onClick={onClose} aria-label="닫기">×</button>
        </div>
        <dl className="detail-list">
          <div><dt>권장 흐름</dt><dd>{guidance}</dd></div>
          <div><dt>현재 상태</dt><dd>{ingredient.id === "rice" ? "테스트 예정" : "도입 대기"}</dd></div>
          <div><dt>기록 방법</dt><dd>섭취량과 거부·반응을 나누어 기록해요.</dd></div>
        </dl>
        <button className="primary-action" type="button" onClick={onClose}>확인했어요</button>
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
  settingKey: SettingKey;
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
          <button className="close-button" type="button" onClick={onClose} aria-label="닫기">×</button>
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

function RecordSheet({
  amount,
  setAmount,
  onClose,
  onSave,
}: {
  amount: Amount;
  setAmount: (amount: Amount) => void;
  onClose: () => void;
  onSave: () => void;
}) {
  const [reaction, setReaction] = useState("none");

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
            <span className="overline">오전 10:00</span>
            <h2 id="record-title">첫 식사는 어땠나요?</h2>
          </div>
          <button className="close-button" type="button" onClick={onClose} aria-label="닫기">×</button>
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
              ["taste", "맛을 거부했어요"],
              ["texture", "질감이 어려웠어요"],
              ["check", "확인이 필요해요"],
            ].map(([value, label]) => (
              <label key={value}>
                <input
                  type="radio"
                  name="reaction"
                  value={value}
                  checked={reaction === value}
                  onChange={() => setReaction(value)}
                />
                <span>{label}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <label className="note-field">
          <span>함께 볼 메모</span>
          <textarea placeholder="첫 숟가락은 밀어냈지만 두 번째는 삼켰어요." rows={3} />
        </label>

        <button className="primary-action" type="button" onClick={onSave}>기록 저장</button>
      </section>
    </div>
  );
}

export function MealApp() {
  const [activeTab, setActiveTab] = useState<Tab>("today");
  const [previewStarted, setPreviewStarted] = useState(false);
  const [completed, setCompleted] = useState([true, false, false, false]);
  const [recordOpen, setRecordOpen] = useState(false);
  const [recordSaved, setRecordSaved] = useState(false);
  const [amount, setAmount] = useState<Amount>("quarter");
  const [selectedDate, setSelectedDate] = useState("2026-07-31");
  const [selectedIngredient, setSelectedIngredient] = useState<IngredientDefinition | null>(null);
  const [editingSetting, setEditingSetting] = useState<SettingKey | null>(null);
  const [settings, setSettings] = useState<Record<SettingKey, string>>({
    start: "만 6개월",
    time: "오전 10:00",
    style: "냉동 큐브 활용",
  });
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(null), 2600);
  };

  const togglePreparation = (index: number) => {
    setCompleted((items) =>
      items.map((item, itemIndex) => (itemIndex === index ? !item : item)),
    );
  };

  const saveRecord = () => {
    setRecordSaved(true);
    setRecordOpen(false);
    setSelectedDate("2026-07-31");
    showToast("식사 기록을 가족과 동기화할 준비가 됐어요.");
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
      preparation: completed,
      settings,
      firstMeal: recordSaved ? { date: "2026-07-31", amount: amountLabels[amount] } : null,
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
        <a className="brand" href="#top" aria-label="차곡한끼 홈" onClick={goHome}>
          <BrandMark />
          <span><strong>차곡한끼</strong><small>우리 아이의 첫 식사</small></span>
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
            <TodayMeal onBack={() => setPreviewStarted(false)} onRecord={() => setRecordOpen(true)} />
          ) : (
            <TodayPrepare completed={completed} onToggle={togglePreparation} onPreview={() => setPreviewStarted(true)} />
          )
        )}
        {activeTab === "ingredients" && <IngredientsView onSelect={setSelectedIngredient} />}
        {activeTab === "records" && (
          <RecordsView saved={recordSaved} amount={amount} selectedDate={selectedDate} onSelectDate={setSelectedDate} onEditRecord={() => setRecordOpen(true)} />
        )}
        {activeTab === "profile" && <ProfileView settings={settings} onEditSetting={setEditingSetting} onExport={exportData} />}
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
        <RecordSheet amount={amount} setAmount={setAmount} onClose={() => setRecordOpen(false)} onSave={saveRecord} />
      )}

      {selectedIngredient && <IngredientSheet ingredient={selectedIngredient} onClose={() => setSelectedIngredient(null)} />}

      {editingSetting && (
        <SettingSheet settingKey={editingSetting} value={settings[editingSetting]} onSelect={updateSetting} onClose={() => setEditingSetting(null)} />
      )}

      {toast && <div className="toast" role="status">✓ {toast}</div>}
    </div>
  );
}
