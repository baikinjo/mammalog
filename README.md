# 맘마로그

부부가 아이폰과 아이패드에서 함께 사용하는 개인용 이유식 기록·추천 PWA입니다.

## 제품 원칙

- 디자인은 `Design v1`을 유지합니다.
- 추천은 무작위 메뉴가 아니라 《삐뽀삐뽀 119 이유식》 2023 최신개정판의 규칙을 구조화해 계산합니다.
- 새 재료, 단순 거부, 질감 어려움, 의심 반응을 서로 다른 상태로 저장합니다.
- 월령뿐 아니라 시작 준비, 먹어본 재료, 최근 빈도, 현재 질감과 먹기 기술을 함께 봅니다.
- 모든 추천에는 이유, 충족한 목표, 안전 기준과 책 페이지 근거가 있습니다.

## 추천 엔진 구성

- `lib/book-knowledge.ts`: 단계별 수치, 안전·도입·영양·질감·행동·예외 규칙
- `lib/ingredient-catalog.ts`: 61개 기본 재료와 도입 시기·빈도·조리·질식·출처 메타데이터
- `lib/recommendation-engine.ts`: 상태 추론, 신규 재료 선택, 하루 식단 조립, 주간 상한, 질감과 발달 과제
- `tests/recommendation-engine.test.ts`: 도입 15일 시뮬레이션과 안전·빈도·단계 검증
- `supabase/schema.sql`: 가족 공유를 위한 기본 데이터베이스
- `supabase/book_engine_v2.sql`: 책 기반 규칙·반응·추천 스냅샷 확장 마이그레이션

## 로컬 명령

```bash
pnpm run dev
pnpm run test
pnpm run test:logic
pnpm run build
```

개인 식사 기록은 Supabase 가족 공간에 저장하며 브라우저 저장소를 원본으로 사용하지 않습니다. Supabase 환경 변수가 설정되지 않았거나 가족 공간에 로그인하지 않은 경우 데모 프로필을 미리 볼 수 있지만, 그 상태에서는 기록이 저장되지 않습니다.

### Supabase 연결 설정

1. Supabase 대시보드에서 사용할 프로젝트를 열거나 새 프로젝트를 만듭니다. 기존 프로젝트에 이미 Mammalog 테이블이 있다면 아래 기본 스키마를 다시 실행하지 마세요. 앱의 삭제·초기화 작업은 가족 기록을 영구 삭제할 수 있으므로 테스트는 개인 테스트 가족 공간에서 진행하세요.
2. 새 프로젝트의 **SQL Editor**에서 아래 파일을 순서대로 각각 한 번 실행합니다.
   1. `supabase/schema.sql`
   2. `supabase/book_engine_v2.sql`
   3. `supabase/routine_logs.sql`
   4. `supabase/data_controls.sql`
3. **Project Settings → API Keys**에서 Project URL과 publishable key(레거시 프로젝트에서는 anon key)를 확인합니다. 앱에서 사용하는 값은 브라우저에 노출되는 공개 키여야 합니다. `service_role` 또는 `sb_secret_` 키는 절대 사용하지 마세요.
4. `C:\src\mammalog\.env.local` 파일을 만들고 다음 값을 입력합니다. `.env.local`은 Git에서 제외됩니다.

   ```dotenv
   NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-publishable-or-anon-key
   ```

5. 프로젝트를 재시작합니다: `pnpm run dev`. **우리 가족 → 가족 동기화**에서 이메일 코드를 요청하고, 받은 6자리 코드를 같은 PWA 화면에 입력합니다. 첫 로그인 뒤 가족 공간을 만들면 아이 프로필이 생성됩니다.
6. iOS 홈 화면 앱에서 코드를 사용할 수 있도록 **Authentication → Email Templates → Magic Link** 템플릿에 `{{ .Token }}`을 포함합니다. **Authentication → URL Configuration**의 Site URL은 실제 앱 주소로 설정하고, 필요한 앱 주소와 `http://localhost:3000/**`를 Redirect URLs에 추가합니다.
7. 배포된 앱에서도 연결하려면 호스팅 서비스의 환경 변수에 같은 URL과 공개 키를 등록하고 다시 배포합니다. 이 저장소에는 배포 환경 변수가 없으므로, 로컬 `.env.local` 설정만으로는 이미 배포된 사이트가 연결되지 않습니다.

### iOS 홈 화면 앱에서 이메일 로그인

iOS에서 메일의 로그인 링크가 Safari로 열리면 홈 화면 앱과 로그인 세션이 공유되지 않을 수 있습니다. 앱은 같은 화면에서 인증할 수 있도록 6자리 이메일 코드도 지원합니다. Supabase 대시보드의 **Authentication → Email Templates → Magic Link** 템플릿에 `{{ .Token }}`을 포함해 코드가 메일에 표시되도록 설정하세요. 로그인 이메일을 받은 뒤 링크를 누르지 말고 코드를 홈 화면 앱에 입력하면 됩니다.
