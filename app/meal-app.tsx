"use client";

import { useMemo, useState } from "react";
import {
  demoHistory,
  demoIngredientStates,
  demoProfile,
  ingredientDefinitions,
} from "../lib/demo-data";
import { createInitialMealSuggestion } from "../lib/recommendation-engine";

type Tab = "today" | "ingredients" | "records" | "profile";
type Amount = "taste" | "quarter" | "half" | "most";

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

function BrandMark() {
  return (
    <span className="brand-mark" aria-hidden="true">
      <span className="brand-bowl" />
      <span className="brand-leaf">⌁</span>
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
                {completed[index] ? "✓" : ""}
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
          <span className="mini-icon" aria-hidden="true">↗</span>
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
          시작일 화면 미리보기 <span aria-hidden="true">→</span>
        </button>
      </section>

      <section className="tip-strip">
        <span className="tip-symbol" aria-hidden="true">i</span>
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
        <span aria-hidden="true">←</span> 준비 화면
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

function IngredientsView() {
  return (
    <>
      <section className="page-intro">
        <span className="overline">재료 원장</span>
        <h1>먹어본 재료를<br />차곡차곡 모아요</h1>
        <p>거부와 반응을 구분해 다음 추천에 반영합니다.</p>
      </section>

      <section className="ingredient-status-grid">
        <div className="status-card testing-card">
          <span className="status-label">테스트 예정</span>
          <div className="ingredient-large"><span>🍚</span><strong>쌀</strong></div>
          <p>시작일 · 1/3일</p>
        </div>
        <div className="status-card next-card">
          <span className="status-label">그다음</span>
          <div className="ingredient-large"><span>🥩</span><strong>소고기</strong></div>
          <p>곡류 적응 후</p>
        </div>
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
            <div className="ingredient-row" key={ingredient.id}>
              <span className="ingredient-emoji" aria-hidden="true">{ingredient.emoji}</span>
              <div>
                <strong>{ingredient.name}</strong>
                <span>{index < 2 ? "첫 곡류" : index === 2 ? "매일 고기 시작" : "순서에 맞춰 열림"}</span>
              </div>
              <span className="order-number">{String(index + 1).padStart(2, "0")}</span>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}

function RecordsView({ saved, amount }: { saved: boolean; amount: Amount }) {
  return (
    <>
      <section className="page-intro">
        <span className="overline">가족 기록</span>
        <h1>작은 변화까지<br />함께 기억해요</h1>
        <p>누가 기록해도 다른 기기에서 같은 상태를 보게 됩니다.</p>
      </section>

      <section className="section-card record-week">
        <div className="section-heading">
          <div>
            <span className="overline">이번 주</span>
            <h2>준비와 식사 기록</h2>
          </div>
          <span className="fraction">7월</span>
        </div>
        <div className="week-row" aria-label="이번 주 기록">
          {["월", "화", "수", "목", "금", "토", "일"].map((day, index) => (
            <div className={`week-day ${saved && index === 4 ? "has-record" : ""}`} key={day}>
              <span>{day}</span>
              <strong>{27 + index}</strong>
              <i aria-hidden="true" />
            </div>
          ))}
        </div>
      </section>

      <section className="section-card">
        <div className="section-heading">
          <div>
            <span className="overline">최근 기록</span>
            <h2>{saved ? "첫 식사를 기록했어요" : "아직 식사 기록이 없어요"}</h2>
          </div>
        </div>
        {saved ? (
          <div className="saved-record">
            <div className="saved-date"><strong>01</strong><span>1일차</span></div>
            <div>
              <strong>쌀·오트밀죽</strong>
              <p>{amountLabels[amount]} · 특별한 반응 없음</p>
              <span className="record-author">엄마와 동기화됨</span>
            </div>
          </div>
        ) : (
          <div className="empty-state">
            <span aria-hidden="true">◌</span>
            <p>이유식을 시작하면 섭취량, 반응, 질감 기록이 이곳에 쌓입니다.</p>
          </div>
        )}
      </section>
    </>
  );
}

function ProfileView() {
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
          <div><span>예상 시작</span><strong>만 6개월</strong></div>
          <button type="button" aria-label="예상 시작일 수정">›</button>
        </div>
        <div className="setting-row">
          <div><span>첫 끼 시간</span><strong>오전 10:00</strong></div>
          <button type="button" aria-label="첫 끼 시간 수정">›</button>
        </div>
        <div className="setting-row">
          <div><span>조리 방식</span><strong>냉동 큐브 활용</strong></div>
          <button type="button" aria-label="조리 방식 수정">›</button>
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

      <button className="export-button" type="button">내 데이터 내보내기</button>
    </>
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
  const [toast, setToast] = useState<string | null>(null);

  const togglePreparation = (index: number) => {
    setCompleted((items) =>
      items.map((item, itemIndex) => (itemIndex === index ? !item : item)),
    );
  };

  const saveRecord = () => {
    setRecordSaved(true);
    setRecordOpen(false);
    setToast("식사 기록을 가족과 동기화할 준비가 됐어요.");
    window.setTimeout(() => setToast(null), 2600);
  };

  return (
    <div className="site-shell">
      <header className="app-header">
        <a className="brand" href="#top" aria-label="차곡한끼 홈">
          <BrandMark />
          <span><strong>차곡한끼</strong><small>우리 아이의 첫 식사</small></span>
        </a>
        <button className="family-button" type="button" onClick={() => setActiveTab("profile")}>
          <span className="avatar-pair" aria-hidden="true"><i>아</i><i>엄</i></span>
          <span>우리 가족</span>
          <b aria-hidden="true">›</b>
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
        {activeTab === "ingredients" && <IngredientsView />}
        {activeTab === "records" && <RecordsView saved={recordSaved} amount={amount} />}
        {activeTab === "profile" && <ProfileView />}
      </main>

      <nav className="bottom-nav" aria-label="주요 메뉴">
        <button className={activeTab === "today" ? "is-active" : ""} type="button" onClick={() => setActiveTab("today")}>
          <span aria-hidden="true">⌂</span><small>오늘</small>
        </button>
        <button className={activeTab === "ingredients" ? "is-active" : ""} type="button" onClick={() => setActiveTab("ingredients")}>
          <span aria-hidden="true">♧</span><small>재료</small>
        </button>
        <button className={activeTab === "records" ? "is-active" : ""} type="button" onClick={() => setActiveTab("records")}>
          <span aria-hidden="true">▦</span><small>기록</small>
        </button>
        <button className={activeTab === "profile" ? "is-active" : ""} type="button" onClick={() => setActiveTab("profile")}>
          <span aria-hidden="true">◯</span><small>우리 아이</small>
        </button>
      </nav>

      {recordOpen && (
        <RecordSheet amount={amount} setAmount={setAmount} onClose={() => setRecordOpen(false)} onSave={saveRecord} />
      )}

      {toast && <div className="toast" role="status">✓ {toast}</div>}
    </div>
  );
}

