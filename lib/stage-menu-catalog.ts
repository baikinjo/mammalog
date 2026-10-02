import type { WeaningStage } from "./domain";

export type MenuKind =
  | "porridge"
  | "toppings"
  | "softRice"
  | "ricePlate"
  | "braise"
  | "soup"
  | "fingerFood"
  | "snack";

export interface StageMenuTemplate {
  id: string;
  stage: Exclude<WeaningStage, "prestart">;
  title: string;
  ingredientIds: string[];
  kind: MenuKind;
  servingMode: string;
  sourcePage: string;
}

function menu(
  id: string,
  stage: StageMenuTemplate["stage"],
  title: string,
  ingredientIds: string[],
  kind: MenuKind,
  servingMode: string,
  sourcePage: string,
): StageMenuTemplate {
  return { id, stage, title, ingredientIds, kind, servingMode, sourcePage };
}

export const stageMenuCatalog: StageMenuTemplate[] = [
  // 초기 6개월: 책의 초기 레시피 중 재료 목록을 직접 확인한 죽. 물·육수는 제외하고 모든 재료를 나열합니다.
  menu("initial-rice", "initial", "쌀죽", ["rice"], "porridge", "섞은 죽", "책 p.70"),
  menu("initial-rice-oatmeal", "initial", "오트밀쌀죽", ["rice", "oatmeal"], "porridge", "섞은 죽", "책 p.72"),
  menu("initial-beef", "initial", "소고기죽", ["rice", "beef"], "porridge", "섞은 죽", "책 p.75"),
  menu("initial-cabbage-zucchini", "initial", "양배추애호박죽", ["rice", "oatmeal", "cabbage", "zucchini"], "porridge", "섞은 죽", "책 p.79"),
  menu("initial-bokchoy-carrot", "initial", "청경채당근죽", ["rice", "bokchoy", "carrot"], "porridge", "섞은 죽", "책 p.82"),
  menu("initial-broccoli-carrot", "initial", "브로콜리당근죽", ["rice", "oatmeal", "broccoli", "carrot"], "porridge", "섞은 죽", "책 p.89"),
  menu("initial-sweetpotato-cabbage", "initial", "고구마양배추죽", ["rice", "sweet-potato", "cabbage"], "porridge", "섞은 죽", "책 p.90"),
  menu("initial-rice-three-veg", "initial", "쌀죽과 삼색 채소 반찬", ["rice", "cabbage", "bokchoy", "carrot"], "toppings", "죽과 반찬을 분리 제공", "책 p.70·p.91"),
  menu("initial-egg-carrot", "initial", "달걀당근죽", ["rice", "carrot", "egg"], "porridge", "토핑을 올린 죽", "책 p.92~93"),
  menu("initial-chicken", "initial", "닭고기죽", ["rice", "chicken"], "porridge", "섞은 죽", "책 p.94"),
  menu("initial-beef-cabbage-pumpkin", "initial", "소고기양배추단호박죽", ["rice", "beef", "cabbage", "pumpkin"], "porridge", "섞은 죽", "책 p.100"),
  menu("initial-beef-cabbage", "initial", "소고기양배추죽", ["rice", "beef", "cabbage"], "porridge", "섞은 죽", "책 p.101"),
  menu("initial-apple", "initial", "사과죽", ["rice", "apple"], "porridge", "섞은 죽", "책 p.103"),
  menu("initial-wheat-rice", "initial", "밀가루쌀죽", ["rice", "wheat"], "porridge", "섞은 죽", "책 p.104"),
  menu("initial-spinach", "initial", "시금치죽", ["rice", "spinach"], "porridge", "섞은 죽", "책 p.106"),
  menu("initial-cabbage-pumpkin", "initial", "양배추단호박죽", ["rice", "cabbage", "pumpkin"], "porridge", "섞은 죽", "책 p.110"),
  menu("initial-pea-pumpkin", "initial", "완두콩단호박죽", ["rice", "pumpkin", "green-pea"], "porridge", "섞은 죽", "책 p.123"),
  menu("initial-beef-broccoli", "initial", "소고기브로콜리죽", ["rice", "beef", "broccoli"], "porridge", "섞은 죽", "책 p.124"),
  // 중기 7~8개월: 죽과 토핑을 함께 쓰고, 으깬 반찬과 핑거푸드를 병행합니다.
  menu("middle-rice-three-veg", "middle", "쌀죽과 삼색 채소 반찬", ["rice", "cabbage", "bokchoy", "carrot"], "toppings", "죽과 반찬을 분리 제공", "책 p.142~143"),
  menu("middle-oat-chicken", "middle", "오트밀죽과 닭고기 반찬", ["oatmeal", "chicken"], "toppings", "죽과 반찬을 분리 제공", "책 p.144~145"),
  menu("middle-pea-zucchini", "middle", "완두콩애호박죽", ["rice", "green-pea", "zucchini"], "porridge", "부드러운 죽", "책 p.146"),
  menu("middle-chicken-broccoli-tomato", "middle", "닭고기브로콜리 토마토조림", ["chicken", "broccoli", "tomato"], "braise", "죽 옆에 으깬 조림", "책 p.147"),
  menu("middle-chicken-egg", "middle", "닭살달걀죽", ["rice", "chicken", "egg", "bokchoy", "potato"], "porridge", "부드러운 죽", "책 p.148"),
  menu("middle-beef-napa", "middle", "소고기배추죽", ["rice", "beef", "napa-cabbage", "carrot"], "porridge", "부드러운 죽", "책 p.153"),
  menu("middle-tofu-zucchini", "middle", "두부애호박죽", ["rice", "tofu", "zucchini"], "porridge", "토핑을 올린 죽", "책 p.150"),
  menu("middle-pork-tomato", "middle", "돼지고기토마토조림", ["pork", "tomato", "carrot", "potato", "onion"], "braise", "죽 옆에 으깬 조림", "책 p.161"),
  menu("middle-fish-potato-onion", "middle", "흰살생선감자양파조림", ["whitefish", "potato", "onion"], "braise", "죽 옆에 으깬 조림", "책 p.158"),
  menu("middle-peanut-tofu", "middle", "땅콩소스두부", ["tofu", "peanut-butter"], "toppings", "묽은 소스를 곁들인 토핑", "책 p.160"),
  menu("middle-pumpkin-potato", "middle", "단호박감자매시", ["pumpkin", "potato"], "fingerFood", "으깬 반찬", "책 p.164"),
  menu("middle-broccoli-tofu-soup", "middle", "브로콜리연두부수프", ["broccoli", "tofu"], "soup", "되직한 수프", "책 p.166"),
  menu("middle-banana-avocado", "middle", "바나나아보카도매시", ["banana", "avocado"], "snack", "으깬 간식", "책 p.169"),
  menu("middle-sweetpotato-apple-yogurt", "middle", "고구마사과요구르트", ["sweet-potato", "apple", "yogurt"], "snack", "으깬 간식", "책 p.167"),
  menu("middle-egg-finger", "middle", "계란지단 핑거푸드", ["egg"], "fingerFood", "손으로 집어 먹기", "책 p.173"),

  // 후기 9~11개월: 세 끼의 무른밥·덮밥·반찬과 하루 2~3회의 작은 간식을 구성합니다.
  menu("late-rice-three-veg", "late", "3배죽과 삼색 채소 반찬", ["rice", "cabbage", "bokchoy", "carrot"], "ricePlate", "무른밥과 반찬을 분리 제공", "책 p.182~183"),
  menu("late-oat-rice", "late", "오트밀진밥", ["rice", "oatmeal"], "softRice", "진밥", "책 p.184"),
  menu("late-multigrain", "late", "잡곡밥", ["rice", "brown-rice", "barley", "oatmeal"], "softRice", "무른 잡곡밥", "책 p.185"),
  menu("late-beef-mushroom", "late", "소고기버섯무른밥", ["rice", "beef", "mushroom", "onion"], "softRice", "재료를 섞은 무른밥", "책 p.187"),
  menu("late-chicken-veg", "late", "닭고기채소무른밥", ["rice", "chicken", "green-pea", "zucchini", "napa-cabbage", "onion"], "softRice", "재료를 섞은 무른밥", "책 p.188"),
  menu("late-pork-tofu-potato", "late", "돼지고기두부감자조림", ["pork", "tofu", "potato", "carrot"], "braise", "밥과 조림 반찬", "책 p.189"),
  menu("late-beef-tofu-rice", "late", "소고기두부밥", ["rice", "beef", "tofu", "zucchini", "onion"], "ricePlate", "밥과 부드러운 반찬", "책 p.190"),
  menu("late-tomato-fish", "late", "토마토흰살생선조림", ["tomato", "whitefish"], "braise", "밥과 조림 반찬", "책 p.191"),
  menu("late-beef-broccoli-ball", "late", "소고기브로콜리완자탕", ["beef", "broccoli", "onion", "napa-cabbage"], "soup", "무른 완자와 국물", "책 p.192"),
  menu("late-pork-carrot", "late", "돼지고기당근조림", ["pork", "carrot", "tofu", "onion"], "braise", "밥과 조림 반찬", "책 p.194"),
  menu("late-beef-bowl", "late", "소고기채소덮밥", ["rice", "beef", "cabbage", "bokchoy", "onion"], "ricePlate", "덮밥", "책 p.196"),
  menu("late-sweetpotato-veg", "late", "고구마채소무른밥", ["rice", "sweet-potato", "cabbage", "carrot"], "softRice", "재료를 섞은 무른밥", "책 p.197"),
  menu("late-brownrice-pumpkin", "late", "현미호박무른밥", ["rice", "brown-rice", "pumpkin"], "softRice", "무른 잡곡밥", "책 p.201"),
  menu("late-pea-chicken", "late", "완두콩닭살무른밥", ["rice", "green-pea", "chicken", "carrot", "spinach"], "softRice", "재료를 섞은 무른밥", "책 p.200"),
  menu("late-fish-rice", "late", "생선무른밥", ["rice", "whitefish", "carrot"], "softRice", "재료를 섞은 무른밥", "책 p.206"),
  menu("late-broccoli-pumpkin", "late", "브로콜리단호박무른밥", ["rice", "broccoli", "pumpkin"], "softRice", "재료를 섞은 무른밥", "책 p.210"),
  menu("late-egg-zucchini", "late", "달걀애호박찜", ["egg", "zucchini", "milk"], "toppings", "밥과 부드러운 달걀찜", "책 p.212"),
  menu("late-tofu-veg-ball", "late", "두부채소볼", ["tofu", "carrot", "spinach", "onion", "wheat"], "fingerFood", "손으로 집어 먹기", "책 p.213"),
  menu("late-apple-sweetpotato", "late", "사과고구마범벅", ["apple", "sweet-potato", "green-pea", "rice"], "snack", "으깬 간식", "책 p.215"),
  menu("late-french-toast", "late", "프렌치토스트", ["bread", "egg", "milk", "butter"], "fingerFood", "손으로 집어 먹기", "책 p.220"),
  menu("late-potato-pancake", "late", "감자전 핑거푸드", ["potato", "tofu", "spinach", "carrot"], "fingerFood", "손으로 집어 먹기", "책 p.221"),
  menu("late-fruit-yogurt", "late", "과일요구르트", ["avocado", "banana", "cottage-cheese", "yogurt"], "snack", "간식 접시에 분리 제공", "책 p.223"),

  // 완료기 12~18개월: 진밥·밥과 국/반찬을 분리하고 가족식의 무염 변형으로 진행합니다.
  menu("completion-rice-three-veg", "completion", "진밥과 삼색 채소볶음", ["rice", "zucchini", "carrot", "onion", "potato"], "ricePlate", "밥과 반찬을 분리 제공", "책 p.232~233"),
  menu("completion-barley-oat", "completion", "압맥귀리밥", ["rice", "barley", "oatmeal"], "softRice", "부드러운 잡곡밥", "책 p.234"),
  menu("completion-brown-multigrain", "completion", "현미잡곡밥", ["rice", "brown-rice", "barley", "oatmeal"], "softRice", "부드러운 잡곡밥", "책 p.235"),
  menu("completion-veg-omelet", "completion", "채소오믈렛", ["egg", "beef", "mushroom", "broccoli", "onion", "milk"], "fingerFood", "밥과 손으로 집는 반찬", "책 p.237"),
  menu("completion-sujebi", "completion", "채소수제비", ["wheat", "potato", "zucchini", "rice", "egg"], "soup", "짧고 부드러운 수제비", "책 p.238"),
  menu("completion-mushroom-bowl", "completion", "버섯덮밥", ["rice", "mushroom", "bokchoy", "onion"], "ricePlate", "덮밥", "책 p.239"),
  menu("completion-chicken-spinach", "completion", "닭고기시금치그라탕", ["chicken", "spinach", "carrot", "onion", "milk"], "ricePlate", "밥과 부드러운 그라탕", "책 p.240"),
  menu("completion-pork-mushroom-rice", "completion", "돼지고기버섯볶음밥", ["rice", "pork", "mushroom", "radish"], "ricePlate", "무염 볶음밥", "책 p.241"),
  menu("completion-fish-veg", "completion", "흰살생선채소조림", ["whitefish", "tomato", "radish", "tofu"], "braise", "밥과 조림 반찬", "책 p.247"),
  menu("completion-nutrition-rice", "completion", "고기채소영양밥", ["rice", "zucchini", "beef", "mushroom", "carrot", "egg"], "ricePlate", "재료를 섞은 영양밥", "책 p.244"),
  menu("completion-grilled-fish", "completion", "생선구이와 채소반찬", ["whitefish", "potato", "spinach", "carrot"], "ricePlate", "밥·생선·채소를 분리 제공", "책 p.245"),
  menu("completion-noodle", "completion", "잔치국수", ["noodle", "beef", "mushroom", "zucchini", "onion"], "soup", "짧게 자른 무염 국수", "책 p.246"),
  menu("completion-tofu-spinach", "completion", "두부시금치깨무침", ["tofu", "spinach", "carrot"], "toppings", "밥과 무친 반찬", "책 p.251"),
  menu("completion-tofu-spinach-rice", "completion", "유부시금치밥", ["rice", "tofu", "spinach", "potato"], "ricePlate", "재료를 섞은 밥", "책 p.252"),
  menu("completion-zucchini-shrimp", "completion", "애호박새우볶음", ["zucchini", "shrimp"], "toppings", "밥과 볶은 반찬", "책 p.253"),
  menu("completion-fish-tofu-ball", "completion", "흰살생선두부밥", ["rice", "whitefish", "tofu", "spinach"], "ricePlate", "재료를 섞은 밥", "책 p.254"),
  menu("completion-tofu-potato", "completion", "두부감자밥", ["rice", "tofu", "potato"], "ricePlate", "재료를 섞은 밥", "책 p.256"),
  menu("completion-chicken-tomato-radish", "completion", "닭고기토마토무조림", ["chicken", "tomato", "radish"], "braise", "밥과 조림 반찬", "책 p.257"),
  menu("completion-fish-potato", "completion", "생선감자조림", ["whitefish", "potato", "zucchini", "onion", "bell-pepper"], "braise", "밥과 조림 반찬", "책 p.258"),
  menu("completion-shrimp-scramble", "completion", "새우채소스크램블", ["shrimp", "egg", "mushroom", "bell-pepper", "carrot", "onion"], "toppings", "밥과 부드러운 스크램블", "책 p.259"),
  menu("completion-beef-napa", "completion", "배추당근소고기볶음", ["napa-cabbage", "carrot", "beef"], "toppings", "밥과 볶은 반찬", "책 p.260"),
  menu("completion-beef-potato", "completion", "소고기감자볶음", ["beef", "potato", "onion"], "toppings", "밥과 볶은 반찬", "책 p.261"),
  menu("completion-seafood-egg", "completion", "해물달걀찜", ["shrimp", "egg", "onion", "bokchoy"], "toppings", "밥과 부드러운 달걀찜", "책 p.262"),
  menu("completion-seaweed-tofu", "completion", "김말이채소두부", ["tofu", "carrot", "spinach", "onion", "wheat"], "fingerFood", "손으로 집는 반찬", "책 p.263"),
  menu("completion-cod-pancake", "completion", "대구전", ["whitefish", "egg", "wheat"], "fingerFood", "손으로 집는 반찬", "책 p.264"),
  menu("completion-beef-cream-soup", "completion", "소고기크림수프", ["beef", "carrot", "onion", "milk", "butter"], "soup", "밥과 되직한 수프", "책 p.267"),
  menu("completion-mushroom-seaweed-riceball", "completion", "버섯김주먹밥", ["rice", "beef", "mushroom", "cauliflower"], "fingerFood", "작고 부드러운 주먹밥", "책 p.271"),
  // p.272 also uses 마요네즈, which has no catalog entry; "egg" gates its egg allergen.
  menu("completion-potato-broccoli-sandwich", "completion", "감자브로콜리샌드위치", ["bread", "potato", "broccoli", "yogurt", "egg"], "fingerFood", "손으로 집는 한입 크기", "책 p.272"),
  menu("completion-tofu-tomato", "completion", "두부와 토마토", ["tofu", "tomato", "yogurt"], "toppings", "밥과 부드러운 반찬", "책 p.273"),
  menu("completion-soft-tofu-soup", "completion", "순두부찌개", ["tofu", "zucchini", "onion", "egg", "shrimp"], "soup", "밥과 무염 국", "책 p.275"),
];

export function menusForStage(stage: Exclude<WeaningStage, "prestart">): StageMenuTemplate[] {
  return stageMenuCatalog.filter((item) => item.stage === stage);
}

export function menuInstruction(kind: MenuKind, textureMm: number): string {
  switch (kind) {
    case "porridge":
      return `곡류와 익힌 재료를 함께 끓이되 ${textureMm}mm 안팎 입자가 남도록 으깨요.`;
    case "toppings":
      return `밥이나 죽과 반찬을 따로 준비해 각각의 맛을 볼 수 있게 놓아요.`;
    case "softRice":
      return `밥알이 잇몸으로 쉽게 으깨지도록 충분히 익히고 ${textureMm}mm 안팎 재료를 섞어요.`;
    case "ricePlate":
      return `밥·단백질·채소를 식판에 나누거나 일부만 섞어 선택할 수 있게 해요.`;
    case "braise":
      return `물을 조금 넣고 재료가 손가락으로 눌러 으깨질 때까지 조린 뒤 ${textureMm}mm 안팎으로 잘라요.`;
    case "soup":
      return `건더기를 충분히 익혀 ${textureMm}mm 안팎으로 자르고 국물보다 재료를 중심으로 제공해요.`;
    case "fingerFood":
      return `잇몸으로 쉽게 으깨지고 손에 잡히는 크기로 만들어 앉은 자세에서 지켜보며 제공해요.`;
    case "snack":
      return `다음 식사를 방해하지 않는 소량을 무가당·무염으로 준비해요.`;
  }
}
