import type { IngredientDefinition } from "./domain";

type IngredientSeed = Omit<
  IngredientDefinition,
  "emoji" | "minimumStage" | "introductionPriority"
> & {
  emoji?: string;
  minimumStage?: IngredientDefinition["minimumStage"];
  introductionPriority?: number;
};

const COMMON_FOOD_PAGES = ["책 p.32-39", "책 p.350-365"];

function ingredient(seed: IngredientSeed): IngredientDefinition {
  return {
    emoji: "",
    minimumStage: "initial",
    introductionPriority: 100,
    minimumAgeMonths: 6,
    sourcePages: COMMON_FOOD_PAGES,
    ...seed,
  };
}

export const ingredientCatalog: IngredientDefinition[] = [
  ingredient({
    id: "rice", name: "쌀", assetId: "rice", category: "grain", foodGroup: "grain",
    introductionGroup: "grain", introductionPriority: 1, color: "white",
    bookGuidance: "첫 곡류로 사용하며 물처럼 거른 미음보다 질감 있는 죽으로 시작해요.",
    sourcePages: ["책 p.13-17", "책 p.52-54", "책 p.64-74"],
  }),
  ingredient({
    id: "oatmeal", name: "오트밀", assetId: "oatmeal", category: "grain", foodGroup: "grain",
    introductionGroup: "grain", introductionPriority: 2, color: "beige",
    bookGuidance: "쌀과 동시에 시작할 수 있는 예외로, 쌀과 1:1까지 섞을 수 있어요.",
    sourcePages: ["책 p.16", "책 p.32-35", "책 p.64-74"],
  }),
  ingredient({
    id: "beef", name: "소고기", assetId: "beef", category: "meat", foodGroup: "redMeat",
    introductionGroup: "meat", introductionPriority: 3, color: "red",
    bookGuidance: "기름과 힘줄을 제거한 살코기 자체를 초기부터 매일 제공해요.",
    preparationConstraints: ["살코기 사용", "속까지 완전 가열", "육수만 주지 않기"],
    sourcePages: ["책 p.16-17", "책 p.32-39", "책 p.315-356"],
  }),
  ingredient({
    id: "cabbage", name: "양배추", assetId: "cabbage", category: "vegetable", foodGroup: "leafyVegetable",
    introductionGroup: "leafy", introductionPriority: 4, color: "green",
    bookGuidance: "초기부터 가능한 이파리 채소로 충분히 부드럽게 익혀요.",
    tags: ["constipationHelpful"],
  }),
  ingredient({
    id: "bokchoy", name: "청경채", assetId: "bokchoy", category: "vegetable", foodGroup: "leafyVegetable",
    introductionGroup: "leafy", introductionPriority: 5, color: "green",
    bookGuidance: "초기부터 가능한 이파리 채소로 잎과 줄기를 단계에 맞게 부드럽게 조리해요.",
  }),
  ingredient({
    id: "pumpkin", name: "단호박", assetId: "pumpkin", category: "vegetable", foodGroup: "yellowVegetable",
    introductionGroup: "yellow", introductionPriority: 6, color: "orange",
    bookGuidance: "초기부터 가능한 노란 채소예요. 단맛 채소만 반복하지 않도록 색을 순환해요.",
    tags: ["constipationCaution"],
  }),
  ingredient({
    id: "zucchini", name: "애호박", assetId: "zucchini", category: "vegetable", foodGroup: "yellowVegetable",
    introductionGroup: "yellow", introductionPriority: 7, color: "lightGreen",
    bookGuidance: "초기부터 가능하며 충분히 익혀 단계에 맞는 입자로 제공해요.",
  }),
  ingredient({
    id: "apple", name: "사과", assetId: "apple", category: "fruit", foodGroup: "fruit",
    introductionGroup: "fruit", introductionPriority: 8, color: "red",
    bookGuidance: "채소 식품군을 연 뒤 통과일 형태로 소량 제공하고 즙만 주지 않아요.",
    tags: ["sweet", "constipationCautionWhenCooked", "acidic"],
  }),

  ingredient({ id: "pork", name: "돼지고기", assetId: "pork", category: "meat", foodGroup: "redMeat", introductionGroup: "meat", introductionPriority: 9, color: "red", bookGuidance: "기름을 제거한 살코기를 완전히 익혀 매일 고기 후보로 사용할 수 있어요.", preparationConstraints: ["살코기 사용", "속까지 완전 가열"] }),
  ingredient({ id: "chicken", name: "닭고기", assetId: "chicken", category: "meat", foodGroup: "poultry", introductionGroup: "meat", introductionPriority: 10, color: "white", bookGuidance: "초기부터 가능하지만 책의 기본 흐름에서는 붉은 살코기를 우선하고 다양화할 때 사용해요.", preparationConstraints: ["껍질과 기름 제거", "속까지 완전 가열"] }),
  ingredient({ id: "broccoli", name: "브로콜리", assetId: "broccoli", category: "vegetable", foodGroup: "leafyVegetable", introductionGroup: "leafy", introductionPriority: 11, color: "green", tags: ["constipationHelpful"] }),
  ingredient({ id: "carrot", name: "당근", assetId: "carrot", category: "vegetable", foodGroup: "yellowVegetable", introductionGroup: "yellow", introductionPriority: 12, color: "orange", minimumAgeMonths: 6, bookGuidance: "만 6개월 이전에는 피하고 이후 충분히 익혀 제공해요.", tags: ["constipationCaution"] }),
  ingredient({ id: "sweet-potato", name: "고구마", assetId: "sweet-potato", category: "vegetable", foodGroup: "starchyFood", introductionGroup: "yellow", introductionPriority: 13, color: "yellow", bookGuidance: "채소처럼 보이지만 식단 균형에서는 탄수화물 식품으로 계산해요.", tags: ["constipationHelpful", "sweet"] }),
  ingredient({ id: "whitefish", name: "흰살생선", assetId: "whitefish", category: "fish", foodGroup: "fish", introductionGroup: "other", introductionPriority: 14, color: "white", frequencyCap7Days: 2, bookGuidance: "대구·도미 같은 흰살생선부터 시작할 수 있으며 주 2회를 넘기지 않아요.", preparationConstraints: ["가시·껍질 제거", "속까지 완전 가열"], chokingFormBlacklist: ["가시가 남은 형태", "날생선"] }),
  ingredient({ id: "egg", name: "완숙 계란", assetId: "egg", category: "egg", foodGroup: "egg", introductionGroup: "other", introductionPriority: 15, color: "yellow", allergen: true, allergenGroup: "egg", bookGuidance: "노른자와 흰자를 함께 소량 시작하고 반드시 완숙해요.", preparationConstraints: ["노른자·흰자 함께", "완숙"] }),
  ingredient({ id: "tofu", name: "두부", assetId: "tofu", category: "beans", foodGroup: "legume", introductionGroup: "other", introductionPriority: 16, color: "white", allergen: true, allergenGroup: "soy", bookGuidance: "초기부터 가능한 단백질 다양화 재료이며 매일 고기의 기본 원칙을 완전히 대체하지는 않아요." }),
  ingredient({ id: "green-pea", name: "완두콩", assetId: "legumes", category: "beans", foodGroup: "legume", introductionGroup: "other", introductionPriority: 17, color: "green", bookGuidance: "초기부터 가능하며 껍질과 단단한 덩어리가 남지 않게 조리해요.", tags: ["constipationHelpful"] }),
  ingredient({ id: "yogurt", name: "플레인 요구르트", assetId: "yogurt", category: "dairy", foodGroup: "dairy", introductionGroup: "other", introductionPriority: 18, color: "white", allergen: true, allergenGroup: "milk", bookGuidance: "6개월부터 가능하며 당이 첨가되지 않은 플레인 제품을 선택해요." }),
  ingredient({ id: "peanut-butter", name: "100% 땅콩버터", assetId: "peanut-butter", category: "nutsOil", foodGroup: "fat", introductionGroup: "other", introductionPriority: 19, color: "brown", allergen: true, allergenGroup: "peanut", bookGuidance: "뜨거운 물에 충분히 풀어 묽은 소스로 소량 제공하고 덩어리째 주지 않아요.", preparationConstraints: ["100% 제품", "뜨거운 물에 충분히 풀기"], chokingFormBlacklist: ["땅콩 알갱이", "되직한 덩어리"] }),
  ingredient({ id: "wheat", name: "밀", category: "grain", foodGroup: "grain", introductionGroup: "other", introductionPriority: 20, color: "beige", allergen: true, allergenGroup: "wheat", bookGuidance: "다섯 식품군을 확보한 뒤 이유식 초기, 가능하면 7개월 전에 소량 도입해요.", sourcePages: ["책 p.16", "책 p.34", "책 p.340-365"] }),

  ingredient({ id: "brown-rice", name: "현미", category: "grain", foodGroup: "grain", introductionGroup: "other", introductionPriority: 21, color: "brown", bookGuidance: "초기부터 가능하나 통곡식만으로 구성하지 않고 백미·잡곡 비율 안에서 사용해요.", sourcePages: ["책 p.32-38", "책 p.340-345"] }),
  ingredient({ id: "millet", name: "차조", category: "grain", foodGroup: "grain", introductionGroup: "other", introductionPriority: 22, color: "yellow", bookGuidance: "잡곡은 한두 종류씩 늘리고 돌 전 총 곡류의 약 절반 범위에서 사용해요." }),
  ingredient({ id: "corn", name: "옥수수", category: "grain", foodGroup: "grain", introductionGroup: "other", introductionPriority: 23, color: "yellow", bookGuidance: "단단한 껍질과 알갱이가 남지 않게 갈거나 충분히 익혀요.", chokingFormBlacklist: ["통옥수수 알갱이"] }),
  ingredient({ id: "barley", name: "보리", category: "grain", foodGroup: "grain", introductionGroup: "other", introductionPriority: 24, color: "beige", bookGuidance: "한두 종류의 잡곡부터 시작하고 질감 처리 능력에 맞춰 조리해요." }),
  ingredient({ id: "bread", name: "식빵", category: "grain", foodGroup: "grain", introductionGroup: "other", introductionPriority: 25, color: "beige", allergen: true, allergenGroup: "wheat", minimumStage: "middle", minimumAgeMonths: 7, bookGuidance: "중기 이후 핑거푸드·간식으로 사용할 수 있으며 소금과 당이 적은 제품을 골라요.", chokingFormBlacklist: ["입천장에 붙는 큰 덩어리"] }),
  ingredient({ id: "noodle", name: "국수", category: "grain", foodGroup: "grain", introductionGroup: "other", introductionPriority: 26, color: "white", allergen: true, allergenGroup: "wheat", minimumStage: "late", minimumAgeMonths: 9, bookGuidance: "후기 이후 부드럽게 익히고 짧게 잘라 제공해요.", preparationConstraints: ["무염 또는 저염", "짧게 자르기"] }),

  ingredient({ id: "spinach", name: "시금치", category: "vegetable", foodGroup: "leafyVegetable", introductionGroup: "leafy", introductionPriority: 27, color: "green", minimumAgeMonths: 6, bookGuidance: "만 6개월 이전에는 피하고 이후 충분히 익혀 사용할 수 있어요.", tags: ["constipationHelpful"] }),
  ingredient({ id: "napa-cabbage", name: "배추", category: "vegetable", foodGroup: "leafyVegetable", introductionGroup: "leafy", introductionPriority: 28, color: "green", minimumAgeMonths: 6, bookGuidance: "만 6개월 이전에는 피하고 이후 간하지 않은 상태로 충분히 익혀요." }),
  ingredient({ id: "kale", name: "케일", category: "vegetable", foodGroup: "leafyVegetable", introductionGroup: "leafy", introductionPriority: 29, color: "green", bookGuidance: "질긴 줄기와 섬유를 제거하고 단계에 맞게 부드럽게 조리해요." }),
  ingredient({ id: "cauliflower", name: "콜리플라워", category: "vegetable", foodGroup: "otherVegetable", introductionGroup: "other", introductionPriority: 30, color: "white", bookGuidance: "손가락으로 쉽게 으깨질 만큼 익혀요." }),
  ingredient({ id: "potato", name: "감자", category: "vegetable", foodGroup: "starchyFood", introductionGroup: "yellow", introductionPriority: 31, color: "white", bookGuidance: "탄수화물 식품으로 계산하며 싹이 난 감자는 사용하지 않아요.", preparationConstraints: ["싹과 초록 부분 완전 제거"], chokingFormBlacklist: ["덜 익힌 단단한 조각"] }),
  ingredient({ id: "onion", name: "양파", category: "vegetable", foodGroup: "otherVegetable", introductionGroup: "other", introductionPriority: 32, color: "white", bookGuidance: "충분히 익혀 향과 단맛을 조리 재료로 활용해요." }),
  ingredient({ id: "radish", name: "무", category: "vegetable", foodGroup: "otherVegetable", introductionGroup: "other", introductionPriority: 33, color: "white", bookGuidance: "충분히 익혀 부드럽게 만들고 고기를 촉촉하게 하는 조합에도 활용해요." }),
  ingredient({ id: "beet", name: "비트", category: "vegetable", foodGroup: "yellowVegetable", introductionGroup: "yellow", introductionPriority: 34, color: "purple", minimumAgeMonths: 6, bookGuidance: "만 6개월 이전에는 피하고 이후 색상 다양화 재료로 소량 사용해요." }),
  ingredient({ id: "bell-pepper", name: "파프리카", category: "vegetable", foodGroup: "yellowVegetable", introductionGroup: "yellow", introductionPriority: 35, color: "red", minimumStage: "middle", minimumAgeMonths: 7, bookGuidance: "껍질과 씨를 제거하고 충분히 익혀 색상 다양화에 활용해요." }),
  ingredient({ id: "mushroom", name: "버섯", category: "vegetable", foodGroup: "otherVegetable", introductionGroup: "other", introductionPriority: 36, color: "brown", minimumStage: "middle", minimumAgeMonths: 7, bookGuidance: "질긴 섬유가 남지 않도록 잘 익혀 단계에 맞게 잘라요." }),

  ingredient({ id: "pear", name: "배", category: "fruit", foodGroup: "fruit", introductionGroup: "fruit", introductionPriority: 37, color: "yellow", bookGuidance: "과즙만 짜지 않고 섬유질을 포함한 형태로 제공해요.", tags: ["constipationHelpful", "sweet"] }),
  ingredient({ id: "plum", name: "자두", category: "fruit", foodGroup: "fruit", introductionGroup: "fruit", introductionPriority: 38, color: "purple", bookGuidance: "씨를 완전히 제거하고 단계에 맞는 통과일 형태로 제공해요.", tags: ["constipationHelpful", "acidic"] }),
  ingredient({ id: "strawberry", name: "딸기", category: "fruit", foodGroup: "fruit", introductionGroup: "fruit", introductionPriority: 39, color: "red", bookGuidance: "초기부터 가능하며 알맞은 크기와 질감으로 소량 시작해요.", tags: ["acidic"] }),
  ingredient({ id: "tomato", name: "토마토", category: "fruit", foodGroup: "fruit", introductionGroup: "fruit", introductionPriority: 40, color: "red", bookGuidance: "초기부터 가능하며 껍질과 큰 씨를 정리하고 산미 반응을 살펴요.", tags: ["acidic", "lowSweetness"] }),
  ingredient({ id: "banana", name: "바나나", category: "fruit", foodGroup: "fruit", introductionGroup: "fruit", introductionPriority: 41, color: "yellow", bookGuidance: "잘 익은 상태로 제공하며 단맛 과일만 반복하지 않아요.", tags: ["sweet", "constipationCautionWhenUnripe"] }),
  ingredient({ id: "avocado", name: "아보카도", category: "fruit", foodGroup: "fruit", introductionGroup: "fruit", introductionPriority: 42, color: "green", bookGuidance: "충분히 익은 과육을 으깨거나 핑거푸드 형태로 제공해요.", tags: ["lowSweetness"] }),
  ingredient({ id: "peach", name: "복숭아", category: "fruit", foodGroup: "fruit", introductionGroup: "fruit", introductionPriority: 43, color: "pink", allergen: true, allergenGroup: "peach", bookGuidance: "껍질과 씨를 제거하고 소량 시작해요.", tags: ["constipationHelpful", "sweet"] }),
  ingredient({ id: "apricot", name: "살구", category: "fruit", foodGroup: "fruit", introductionGroup: "fruit", introductionPriority: 44, color: "orange", bookGuidance: "씨를 제거하고 부드러운 과육을 소량 제공해요.", tags: ["constipationHelpful"] }),
  ingredient({ id: "kiwi", name: "키위", category: "fruit", foodGroup: "fruit", introductionGroup: "fruit", introductionPriority: 45, color: "green", bookGuidance: "산미와 입 주변 자극을 살피고 소량 제공해요.", tags: ["acidic"] }),
  ingredient({ id: "blueberry", name: "블루베리", category: "fruit", foodGroup: "fruit", introductionGroup: "fruit", introductionPriority: 46, color: "purple", minimumStage: "middle", minimumAgeMonths: 7, bookGuidance: "통째로 주지 않고 눌러 터뜨리거나 단계에 맞게 잘라요.", chokingFormBlacklist: ["통알"] }),
  ingredient({ id: "grape", name: "포도", category: "fruit", foodGroup: "fruit", introductionGroup: "fruit", introductionPriority: 47, color: "purple", minimumStage: "middle", minimumAgeMonths: 7, bookGuidance: "껍질과 씨를 제거하고 세로로 잘게 잘라요.", chokingFormBlacklist: ["통포도", "가로로만 자른 포도"] }),
  ingredient({ id: "mandarin", name: "귤", category: "fruit", foodGroup: "fruit", introductionGroup: "fruit", introductionPriority: 48, color: "orange", minimumStage: "middle", minimumAgeMonths: 7, bookGuidance: "질긴 막과 씨를 제거하고 산미를 살펴요.", tags: ["acidic"] }),

  ingredient({ id: "salmon", name: "연어", category: "fish", foodGroup: "fish", introductionGroup: "other", introductionPriority: 49, color: "pink", frequencyCap7Days: 2, bookGuidance: "생선 전체 주 2회 상한 안에서 가시와 껍질을 제거해 완전히 익혀요.", preparationConstraints: ["가시·껍질 제거", "완전 가열"] }),
  ingredient({ id: "mackerel", name: "고등어", category: "fish", foodGroup: "fish", introductionGroup: "other", introductionPriority: 50, color: "blue", frequencyCap7Days: 2, bookGuidance: "등푸른생선도 가능하지만 생선 전체 주 2회 상한을 적용하고 가시를 철저히 제거해요.", preparationConstraints: ["가시 제거", "완전 가열"] }),
  ingredient({ id: "shrimp", name: "새우", category: "fish", foodGroup: "fish", introductionGroup: "other", introductionPriority: 51, color: "pink", allergen: true, allergenGroup: "crustacean", frequencyCap7Days: 2, minimumStage: "middle", minimumAgeMonths: 7, bookGuidance: "알레르기 반응과 오염에 특히 주의하며 껍질·내장을 제거하고 완전히 익혀요.", preparationConstraints: ["껍질·내장 제거", "완전 가열"] }),

  ingredient({ id: "kidney-bean", name: "강낭콩", assetId: "legumes", category: "beans", foodGroup: "legume", introductionGroup: "other", introductionPriority: 52, color: "red", bookGuidance: "초기부터 가능하며 속까지 무르게 익혀 껍질과 덩어리를 처리해요." }),
  ingredient({ id: "soybean", name: "대두", assetId: "legumes", category: "beans", foodGroup: "legume", introductionGroup: "other", introductionPriority: 53, color: "yellow", allergen: true, allergenGroup: "soy", bookGuidance: "완전히 익히고 초기에는 껍질과 단단한 알갱이가 남지 않게 해요." }),
  ingredient({ id: "lentil", name: "렌틸콩", assetId: "legumes", category: "beans", foodGroup: "legume", introductionGroup: "other", introductionPriority: 54, color: "orange", bookGuidance: "충분히 익혀 단계에 맞게 으깨거나 다져요." }),
  ingredient({ id: "kelp", name: "다시마", assetId: "kelp", category: "seaweed", foodGroup: "otherVegetable", introductionGroup: "other", introductionPriority: 55, color: "green", minimumStage: "middle", minimumAgeMonths: 7, bookGuidance: "육수에 소량 사용할 수 있으며 해조류를 주식처럼 과다 사용하지 않아요." }),
  ingredient({ id: "seaweed", name: "미역", category: "seaweed", foodGroup: "otherVegetable", introductionGroup: "other", introductionPriority: 56, color: "green", minimumStage: "middle", minimumAgeMonths: 7, bookGuidance: "부드럽게 익히고 잘게 잘라 소량 사용해요." }),
  ingredient({ id: "cottage-cheese", name: "코티지치즈", category: "dairy", foodGroup: "dairy", introductionGroup: "other", introductionPriority: 57, color: "white", allergen: true, allergenGroup: "milk", minimumStage: "late", minimumAgeMonths: 9, bookGuidance: "후기부터 가능한 유제품 후보로 염분이 낮은 제품을 선택해요." }),
  ingredient({ id: "milk", name: "생우유", category: "dairy", foodGroup: "dairy", introductionGroup: "other", introductionPriority: 58, color: "white", allergen: true, allergenGroup: "milk", minimumStage: "completion", minimumAgeMonths: 12, bookGuidance: "음료는 돌 이후 제공하고 하루 유제품 총량 안에서 계산해요." }),
  ingredient({ id: "sesame-oil", name: "참기름", category: "nutsOil", foodGroup: "fat", introductionGroup: "other", introductionPriority: 59, color: "brown", minimumStage: "middle", minimumAgeMonths: 7, bookGuidance: "중기부터 필요한 경우 풍미를 위해 소량 사용해요." }),
  ingredient({ id: "olive-oil", name: "올리브유", category: "nutsOil", foodGroup: "fat", introductionGroup: "other", introductionPriority: 60, color: "green", minimumStage: "middle", minimumAgeMonths: 7, bookGuidance: "중기부터 필요한 경우 조리에 소량 사용해요." }),
  ingredient({ id: "butter", name: "버터", category: "nutsOil", foodGroup: "fat", introductionGroup: "other", introductionPriority: 61, color: "yellow", allergen: true, allergenGroup: "milk", minimumStage: "middle", minimumAgeMonths: 7, bookGuidance: "중기부터 필요한 경우 무염 제품을 소량 사용해요." }),
];

export const ingredientById = new Map(
  ingredientCatalog.map((item) => [item.id, item]),
);
