-- Generated from lib/ingredient-catalog.ts by scripts/generate-ingredient-catalog-sql.ts. Do not edit by hand;
-- regenerate with: pnpm exec tsx scripts/generate-ingredient-catalog-sql.ts
--
-- Upserts all 61 built-in ingredients so meal_plan_items, child_ingredients and
-- ingredient_reactions can reference every catalog id. Run after schema.sql and book_engine_v2.sql.
-- Safe to re-run at any time: it only touches shared rows (household_id is null) and does not need a code deploy.

insert into public.ingredients
  (id, household_id, name, emoji, asset_id, category, food_group, introduction_group, minimum_stage, minimum_age_months, introduction_priority, color, allergen, frequency_cap_7d, preparation_constraints, choking_form_blacklist, book_guidance, source_pages, tags, book_edition, is_custom, is_active)
values
  ('rice', null, '쌀', '', 'rice', 'grain', 'grain', 'grain', 'initial', 6, 1, 'white', false, null, '[]'::jsonb, '[]'::jsonb, '첫 곡류로 사용하며 물처럼 거른 미음보다 질감 있는 죽으로 시작해요.', '["책 p.13-17","책 p.52-54","책 p.64-74"]'::jsonb, '[]'::jsonb, '2023 최신개정판', false, true),
  ('oatmeal', null, '오트밀', '', 'oatmeal', 'grain', 'grain', 'grain', 'initial', 6, 2, 'beige', false, null, '[]'::jsonb, '[]'::jsonb, '쌀과 동시에 시작할 수 있는 예외로, 쌀과 1:1까지 섞을 수 있어요.', '["책 p.16","책 p.32-35","책 p.64-74"]'::jsonb, '[]'::jsonb, '2023 최신개정판', false, true),
  ('beef', null, '소고기', '', 'beef', 'meat', 'redMeat', 'meat', 'initial', 6, 3, 'red', false, null, '["살코기 사용","속까지 완전 가열","육수만 주지 않기"]'::jsonb, '[]'::jsonb, '기름과 힘줄을 제거한 살코기 자체를 초기부터 매일 제공해요.', '["책 p.16-17","책 p.32-39","책 p.315-356"]'::jsonb, '[]'::jsonb, '2023 최신개정판', false, true),
  ('cabbage', null, '양배추', '', 'cabbage', 'vegetable', 'leafyVegetable', 'leafy', 'initial', 6, 4, 'green', false, null, '[]'::jsonb, '[]'::jsonb, '초기부터 가능한 이파리 채소로 충분히 부드럽게 익혀요.', '["책 p.32-39","책 p.350-365","책 p.379"]'::jsonb, '["constipationHelpful"]'::jsonb, '2023 최신개정판', false, true),
  ('bokchoy', null, '청경채', '', 'bokchoy', 'vegetable', 'leafyVegetable', 'leafy', 'initial', 6, 5, 'green', false, null, '[]'::jsonb, '[]'::jsonb, '초기부터 가능한 이파리 채소로 잎과 줄기를 단계에 맞게 부드럽게 조리해요.', '["책 p.32-39","책 p.350-365"]'::jsonb, '[]'::jsonb, '2023 최신개정판', false, true),
  ('pumpkin', null, '단호박', '', 'pumpkin', 'vegetable', 'yellowVegetable', 'yellow', 'initial', 6, 6, 'orange', false, null, '[]'::jsonb, '[]'::jsonb, '초기부터 가능한 노란 채소예요. 단맛 채소만 반복하지 않도록 색을 순환해요.', '["책 p.32-39","책 p.350-365"]'::jsonb, '["constipationCaution"]'::jsonb, '2023 최신개정판', false, true),
  ('zucchini', null, '애호박', '', 'zucchini', 'vegetable', 'otherVegetable', 'other', 'initial', 6, 7, 'lightGreen', false, null, '[]'::jsonb, '[]'::jsonb, '책에서 이파리·노란 채소와 구분하는 기타 녹색 채소예요. 초기부터 충분히 익혀 단계에 맞는 입자로 제공해요.', '["책 p.32-39","책 p.350-365","책 p.69"]'::jsonb, '[]'::jsonb, '2023 최신개정판', false, true),
  ('apple', null, '사과', '', 'apple', 'fruit', 'fruit', 'fruit', 'initial', 6, 8, 'red', false, null, '[]'::jsonb, '[]'::jsonb, '채소 식품군을 연 뒤 통과일 형태로 소량 제공하고 즙만 주지 않아요.', '["책 p.32-39","책 p.350-365"]'::jsonb, '["sweet","constipationCautionWhenCooked","acidic"]'::jsonb, '2023 최신개정판', false, true),
  ('pork', null, '돼지고기', '', 'pork', 'meat', 'redMeat', 'meat', 'initial', 6, 9, 'red', false, null, '["살코기 사용","속까지 완전 가열"]'::jsonb, '[]'::jsonb, '기름을 제거한 살코기를 완전히 익혀 매일 고기 후보로 사용할 수 있어요.', '["책 p.32-39","책 p.350-365"]'::jsonb, '[]'::jsonb, '2023 최신개정판', false, true),
  ('chicken', null, '닭고기', '', 'chicken', 'meat', 'poultry', 'meat', 'initial', 6, 10, 'white', false, null, '["껍질과 기름 제거","속까지 완전 가열"]'::jsonb, '[]'::jsonb, '초기부터 가능하지만 책의 기본 흐름에서는 붉은 살코기를 우선하고 다양화할 때 사용해요.', '["책 p.32-39","책 p.350-365"]'::jsonb, '[]'::jsonb, '2023 최신개정판', false, true),
  ('broccoli', null, '브로콜리', '', 'broccoli', 'vegetable', 'otherVegetable', 'other', 'initial', 6, 11, 'green', false, null, '[]'::jsonb, '[]'::jsonb, '책에서 이파리·노란 채소와 구분하는 기타 녹색 채소예요. 충분히 익혀 단계에 맞게 다져요.', '["책 p.32-39","책 p.350-365","책 p.69","책 p.379"]'::jsonb, '["constipationHelpful"]'::jsonb, '2023 최신개정판', false, true),
  ('carrot', null, '당근', '', 'carrot', 'vegetable', 'yellowVegetable', 'yellow', 'initial', 6, 12, 'orange', false, null, '[]'::jsonb, '[]'::jsonb, '만 6개월 이전에는 피하고 이후 충분히 익혀 제공해요.', '["책 p.32-39","책 p.350-365","책 p.378-379"]'::jsonb, '["constipationCaution"]'::jsonb, '2023 최신개정판', false, true),
  ('sweet-potato', null, '고구마', '', 'sweet-potato', 'vegetable', 'starchyFood', 'other', 'initial', 6, 13, 'yellow', false, null, '[]'::jsonb, '[]'::jsonb, '채소처럼 보이지만 쌀처럼 탄수화물 식품으로 계산하고, 초기 식품군을 여는 재료로 쓰지 않아요.', '["책 p.32-39","책 p.350-365","책 p.69","책 p.379"]'::jsonb, '["constipationHelpful","sweet"]'::jsonb, '2023 최신개정판', false, true),
  ('whitefish', null, '흰살생선', '', 'whitefish', 'fish', 'fish', 'other', 'initial', 6, 14, 'white', false, 2, '["가시·껍질 제거","속까지 완전 가열"]'::jsonb, '["가시가 남은 형태","날생선"]'::jsonb, '대구·도미 같은 흰살생선부터 시작할 수 있으며 주 2회를 넘기지 않아요.', '["책 p.32-39","책 p.350-365"]'::jsonb, '[]'::jsonb, '2023 최신개정판', false, true),
  ('egg', null, '완숙 계란', '', 'egg', 'egg', 'egg', 'other', 'initial', 6, 15, 'yellow', true, null, '["노른자·흰자 함께","완숙"]'::jsonb, '[]'::jsonb, '노른자와 흰자를 함께 소량 시작하고 반드시 완숙해요.', '["책 p.32-39","책 p.350-365"]'::jsonb, '[]'::jsonb, '2023 최신개정판', false, true),
  ('tofu', null, '두부', '', 'tofu', 'beans', 'legume', 'other', 'initial', 6, 16, 'white', true, null, '[]'::jsonb, '[]'::jsonb, '초기부터 가능한 단백질 다양화 재료이며 매일 고기의 기본 원칙을 완전히 대체하지는 않아요.', '["책 p.32-39","책 p.350-365"]'::jsonb, '[]'::jsonb, '2023 최신개정판', false, true),
  ('green-pea', null, '완두콩', '', 'legumes', 'beans', 'legume', 'other', 'initial', 6, 17, 'green', false, null, '[]'::jsonb, '[]'::jsonb, '초기부터 가능하며 껍질과 단단한 덩어리가 남지 않게 조리해요.', '["책 p.32-39","책 p.350-365"]'::jsonb, '["constipationHelpful"]'::jsonb, '2023 최신개정판', false, true),
  ('yogurt', null, '플레인 요구르트', '', 'yogurt', 'dairy', 'dairy', 'other', 'initial', 6, 18, 'white', true, null, '[]'::jsonb, '[]'::jsonb, '6개월부터 가능하며 당이 첨가되지 않은 플레인 제품을 선택해요.', '["책 p.32-39","책 p.350-365"]'::jsonb, '[]'::jsonb, '2023 최신개정판', false, true),
  ('peanut-butter', null, '100% 땅콩버터', '', 'peanut-butter', 'nutsOil', 'fat', 'other', 'initial', 6, 19, 'brown', true, null, '["100% 제품","뜨거운 물에 충분히 풀기"]'::jsonb, '["땅콩 알갱이","되직한 덩어리"]'::jsonb, '뜨거운 물에 충분히 풀어 묽은 소스로 소량 제공하고 덩어리째 주지 않아요.', '["책 p.32-39","책 p.350-365"]'::jsonb, '[]'::jsonb, '2023 최신개정판', false, true),
  ('wheat', null, '밀', '', null, 'grain', 'grain', 'other', 'initial', 6, 20, 'beige', true, null, '[]'::jsonb, '[]'::jsonb, '다섯 식품군을 확보한 뒤 이유식 초기, 가능하면 7개월 전에 소량 도입해요.', '["책 p.16","책 p.34","책 p.340-365"]'::jsonb, '[]'::jsonb, '2023 최신개정판', false, true),
  ('brown-rice', null, '현미', '', null, 'grain', 'grain', 'other', 'initial', 6, 21, 'brown', false, null, '[]'::jsonb, '[]'::jsonb, '초기부터 가능하나 통곡식만으로 구성하지 않고 백미·잡곡 비율 안에서 사용해요.', '["책 p.32-38","책 p.340-345"]'::jsonb, '[]'::jsonb, '2023 최신개정판', false, true),
  ('millet', null, '차조', '', null, 'grain', 'grain', 'other', 'middle', 7, 22, 'yellow', false, null, '[]'::jsonb, '[]'::jsonb, '책의 단계표에서 중기부터 쓰는 잡곡이에요. 한두 종류씩 늘리고 돌 전 총 곡류의 약 절반 범위에서 사용해요.', '["책 p.32","책 p.32-39","책 p.350-365"]'::jsonb, '[]'::jsonb, '2023 최신개정판', false, true),
  ('corn', null, '옥수수', '', null, 'grain', 'grain', 'other', 'middle', 7, 23, 'yellow', false, null, '[]'::jsonb, '["통옥수수 알갱이"]'::jsonb, '책의 단계표에서 중기부터 쓰는 곡류예요. 단단한 껍질과 알갱이가 남지 않게 갈거나 충분히 익혀요.', '["책 p.32","책 p.32-39","책 p.350-365"]'::jsonb, '[]'::jsonb, '2023 최신개정판', false, true),
  ('barley', null, '보리', '', null, 'grain', 'grain', 'other', 'initial', 6, 24, 'beige', false, null, '[]'::jsonb, '[]'::jsonb, '한두 종류의 잡곡부터 시작하고 질감 처리 능력에 맞춰 조리해요.', '["책 p.32-39","책 p.350-365"]'::jsonb, '[]'::jsonb, '2023 최신개정판', false, true),
  ('bread', null, '식빵', '', null, 'grain', 'grain', 'other', 'middle', 7, 25, 'beige', true, null, '["살짝 구워 한입 크기로 자르기","입천장에 붙는 큰 덩어리로 주지 않기"]'::jsonb, '["입천장에 붙는 큰 덩어리"]'::jsonb, '중기 이후 핑거푸드·간식으로 사용할 수 있으며 소금과 당이 적은 제품을 골라요.', '["책 p.226","책 p.327"]'::jsonb, '[]'::jsonb, '2023 최신개정판', false, true),
  ('noodle', null, '국수', '', null, 'grain', 'grain', 'other', 'late', 9, 26, 'white', true, null, '["무염 또는 저염","짧게 자르기"]'::jsonb, '[]'::jsonb, '후기 이후 부드럽게 익히고 짧게 잘라 제공해요.', '["책 p.32-39","책 p.350-365","책 p.243","책 p.246"]'::jsonb, '[]'::jsonb, '2023 최신개정판', false, true),
  ('spinach', null, '시금치', '', null, 'vegetable', 'leafyVegetable', 'leafy', 'initial', 6, 27, 'green', false, null, '[]'::jsonb, '[]'::jsonb, '만 6개월 이전에는 피하고 이후 충분히 익혀 사용할 수 있어요.', '["책 p.32-39","책 p.350-365","책 p.379"]'::jsonb, '["constipationHelpful"]'::jsonb, '2023 최신개정판', false, true),
  ('napa-cabbage', null, '배추', '', null, 'vegetable', 'leafyVegetable', 'leafy', 'initial', 6, 28, 'green', false, null, '[]'::jsonb, '[]'::jsonb, '만 6개월 이전에는 피하고 이후 간하지 않은 상태로 충분히 익혀요.', '["책 p.32-39","책 p.350-365"]'::jsonb, '[]'::jsonb, '2023 최신개정판', false, true),
  ('kale', null, '케일', '', null, 'vegetable', 'leafyVegetable', 'leafy', 'initial', 6, 29, 'green', false, null, '[]'::jsonb, '[]'::jsonb, '맛이 강하고 낯선 채소라 처음 넣는 채소로는 맞지 않아요. 익숙한 채소 뒤에 질긴 줄기와 섬유를 제거하고 부드럽게 조리해요.', '["책 p.32-39","책 p.350-365"]'::jsonb, '[]'::jsonb, '2023 최신개정판', false, true),
  ('cauliflower', null, '콜리플라워', '', null, 'vegetable', 'otherVegetable', 'other', 'initial', 6, 30, 'white', false, null, '[]'::jsonb, '[]'::jsonb, '손가락으로 쉽게 으깨질 만큼 익혀요.', '["책 p.69","책 p.125"]'::jsonb, '[]'::jsonb, '2023 최신개정판', false, true),
  ('potato', null, '감자', '', null, 'vegetable', 'starchyFood', 'other', 'initial', 6, 31, 'white', false, null, '["싹과 초록 부분 완전 제거"]'::jsonb, '["덜 익힌 단단한 조각"]'::jsonb, '쌀처럼 탄수화물 식품으로 계산하고 초기 식품군을 여는 재료로 쓰지 않아요. 싹이 난 감자는 사용하지 않아요.', '["책 p.32-39","책 p.350-365","책 p.45","책 p.69"]'::jsonb, '[]'::jsonb, '2023 최신개정판', false, true),
  ('onion', null, '양파', '', null, 'vegetable', 'otherVegetable', 'other', 'initial', 6, 32, 'white', false, null, '[]'::jsonb, '[]'::jsonb, '충분히 익혀 향과 단맛을 조리 재료로 활용해요.', '["책 p.32-39","책 p.350-365","책 p.46","책 p.113"]'::jsonb, '[]'::jsonb, '2023 최신개정판', false, true),
  ('radish', null, '무', '', null, 'vegetable', 'otherVegetable', 'other', 'initial', 6, 33, 'white', false, null, '[]'::jsonb, '[]'::jsonb, '충분히 익혀 부드럽게 만들고 고기를 촉촉하게 하는 조합에도 활용해요.', '["책 p.32-39","책 p.350-365","책 p.61","책 p.126","책 p.341"]'::jsonb, '[]'::jsonb, '2023 최신개정판', false, true),
  ('beet', null, '비트', '', null, 'vegetable', 'yellowVegetable', 'yellow', 'initial', 6, 34, 'purple', false, null, '[]'::jsonb, '[]'::jsonb, '만 6개월 이전에는 피하고 이후 색상 다양화 재료로 소량 사용해요.', '["책 p.32-39","책 p.350-365","책 p.126"]'::jsonb, '[]'::jsonb, '2023 최신개정판', false, true),
  ('bell-pepper', null, '파프리카', '', null, 'vegetable', 'yellowVegetable', 'yellow', 'initial', 6, 35, 'red', false, null, '[]'::jsonb, '[]'::jsonb, '초기부터 가능한 노란 채소예요. 껍질과 씨를 제거하고 충분히 익혀요.', '["책 p.46","책 p.69"]'::jsonb, '[]'::jsonb, '2023 최신개정판', false, true),
  ('mushroom', null, '버섯', '', null, 'vegetable', 'otherVegetable', 'other', 'middle', 7, 36, 'brown', false, null, '[]'::jsonb, '[]'::jsonb, '질긴 섬유가 남지 않도록 잘 익혀 단계에 맞게 잘라요.', '["책 p.32-39","책 p.350-365","책 p.46"]'::jsonb, '[]'::jsonb, '2023 최신개정판', false, true),
  ('pear', null, '배', '', null, 'fruit', 'fruit', 'fruit', 'initial', 6, 37, 'yellow', false, null, '[]'::jsonb, '[]'::jsonb, '과즙만 짜지 않고 섬유질을 포함한 형태로 제공해요. 변비에 도움이 되지만 많이 먹으면 변이 묽어질 수 있어요.', '["책 p.32-39","책 p.350-365","책 p.379"]'::jsonb, '["constipationHelpful","sweet"]'::jsonb, '2023 최신개정판', false, true),
  ('plum', null, '자두', '', null, 'fruit', 'fruit', 'fruit', 'initial', 6, 38, 'purple', false, null, '[]'::jsonb, '[]'::jsonb, '씨를 완전히 제거하고 단계에 맞는 통과일 형태로 제공해요. 변비에 도움이 되지만 많이 먹으면 변이 묽어질 수 있어요.', '["책 p.32-39","책 p.350-365","책 p.379"]'::jsonb, '["constipationHelpful","acidic"]'::jsonb, '2023 최신개정판', false, true),
  ('strawberry', null, '딸기', '', null, 'fruit', 'fruit', 'fruit', 'initial', 6, 39, 'red', false, null, '[]'::jsonb, '[]'::jsonb, '초기부터 가능하지만 알레르기 비슷한 반응이 흔한 과일이라 소량으로 시작해 입 주변·피부 반응을 살펴요.', '["책 p.32-39","책 p.350-365","책 p.370-372"]'::jsonb, '["acidic"]'::jsonb, '2023 최신개정판', false, true),
  ('tomato', null, '토마토', '', null, 'fruit', 'fruit', 'fruit', 'initial', 6, 40, 'red', false, null, '[]'::jsonb, '[]'::jsonb, '초기부터 가능하며 껍질과 단단한 심, 씨를 정리해요. 알레르기 비슷한 반응이 흔한 편이라 소량으로 시작해 입 주변·피부 반응을 살펴요.', '["책 p.32-39","책 p.350-365","책 p.46","책 p.370-372"]'::jsonb, '["acidic","lowSweetness"]'::jsonb, '2023 최신개정판', false, true),
  ('banana', null, '바나나', '', null, 'fruit', 'fruit', 'fruit', 'initial', 6, 41, 'yellow', false, null, '[]'::jsonb, '[]'::jsonb, '잘 익은 상태로 제공하며 단맛 과일만 반복하지 않아요.', '["책 p.32-39","책 p.350-365","책 p.128","책 p.378-379"]'::jsonb, '["sweet","constipationCautionWhenUnripe"]'::jsonb, '2023 최신개정판', false, true),
  ('avocado', null, '아보카도', '', null, 'fruit', 'fruit', 'fruit', 'initial', 6, 42, 'green', false, null, '[]'::jsonb, '[]'::jsonb, '충분히 익은 과육을 으깨거나 핑거푸드 형태로 제공해요.', '["책 p.32-39","책 p.350-365","책 p.46","책 p.129"]'::jsonb, '["lowSweetness"]'::jsonb, '2023 최신개정판', false, true),
  ('peach', null, '복숭아', '', null, 'fruit', 'fruit', 'fruit', 'initial', 6, 43, 'pink', true, null, '[]'::jsonb, '[]'::jsonb, '껍질과 씨를 제거하고 소량 시작해요.', '["책 p.32-39","책 p.350-365","책 p.369","책 p.379"]'::jsonb, '["constipationHelpful","sweet"]'::jsonb, '2023 최신개정판', false, true),
  ('apricot', null, '살구', '', null, 'fruit', 'fruit', 'fruit', 'initial', 6, 44, 'orange', false, null, '[]'::jsonb, '[]'::jsonb, '씨를 제거하고 부드러운 과육을 소량 제공해요. 변비에 도움이 되지만 많이 먹으면 변이 묽어질 수 있어요.', '["책 p.32-39","책 p.350-365","책 p.379"]'::jsonb, '["constipationHelpful"]'::jsonb, '2023 최신개정판', false, true),
  ('kiwi', null, '키위', '', null, 'fruit', 'fruit', 'fruit', 'initial', 6, 45, 'green', false, null, '[]'::jsonb, '[]'::jsonb, '산미와 입 주변 자극을 살피고 소량 제공해요.', '["책 p.32-39","책 p.350-365"]'::jsonb, '["acidic"]'::jsonb, '2023 최신개정판', false, true),
  ('blueberry', null, '블루베리', '', null, 'fruit', 'fruit', 'fruit', 'initial', 6, 46, 'purple', false, null, '[]'::jsonb, '["통알"]'::jsonb, '초기부터 익혀 으깨 줄 수 있어요. 통째로 주지 않고 눌러 터뜨리거나 단계에 맞게 잘라요.', '["책 p.32-39","책 p.350-365","책 p.121"]'::jsonb, '[]'::jsonb, '2023 최신개정판', false, true),
  ('grape', null, '포도', '', null, 'fruit', 'fruit', 'fruit', 'middle', 7, 47, 'purple', false, null, '[]'::jsonb, '["통포도","가로로만 자른 포도"]'::jsonb, '껍질과 씨를 제거하고 세로로 잘게 잘라요. 많이 먹으면 설사나 배앓이를 할 수 있어요.', '["책 p.32-39","책 p.350-365","책 p.341","책 p.379"]'::jsonb, '[]'::jsonb, '2023 최신개정판', false, true),
  ('mandarin', null, '귤', '', null, 'fruit', 'fruit', 'fruit', 'middle', 7, 48, 'orange', false, null, '[]'::jsonb, '[]'::jsonb, '질긴 막과 씨를 제거하고 산미를 살펴요.', '["책 p.32-39","책 p.350-365","책 p.341"]'::jsonb, '["acidic"]'::jsonb, '2023 최신개정판', false, true),
  ('salmon', null, '연어', '', null, 'fish', 'fish', 'other', 'initial', 6, 49, 'pink', false, 2, '["가시·껍질 제거","완전 가열"]'::jsonb, '[]'::jsonb, '생선 전체 주 2회 상한 안에서 가시와 껍질을 제거해 완전히 익혀요.', '["책 p.32-39","책 p.350-365"]'::jsonb, '[]'::jsonb, '2023 최신개정판', false, true),
  ('mackerel', null, '고등어', '', null, 'fish', 'fish', 'other', 'late', 9, 50, 'blue', false, 2, '["가시 제거","완전 가열"]'::jsonb, '[]'::jsonb, '생선은 흰살생선부터 시작하고 고등어 같은 등푸른생선은 후기부터 줘요. 생선 전체 주 2회 상한을 적용하고 가시를 철저히 제거해요.', '["책 p.32-39","책 p.350-365","책 p.358"]'::jsonb, '[]'::jsonb, '2023 최신개정판', false, true),
  ('shrimp', null, '새우', '', null, 'fish', 'fish', 'other', 'middle', 7, 51, 'pink', true, 2, '["껍질·내장 제거","완전 가열"]'::jsonb, '[]'::jsonb, '알레르기 반응과 오염에 특히 주의하며 껍질·내장을 제거하고 완전히 익혀요.', '["책 p.32-39","책 p.350-365","책 p.47","책 p.372"]'::jsonb, '[]'::jsonb, '2023 최신개정판', false, true),
  ('kidney-bean', null, '강낭콩', '', 'legumes', 'beans', 'legume', 'other', 'initial', 6, 52, 'red', false, null, '[]'::jsonb, '[]'::jsonb, '초기부터 가능하며 속까지 무르게 익혀 껍질과 덩어리를 처리해요.', '["책 p.32-39","책 p.350-365"]'::jsonb, '[]'::jsonb, '2023 최신개정판', false, true),
  ('soybean', null, '대두', '', 'legumes', 'beans', 'legume', 'other', 'initial', 6, 53, 'yellow', true, null, '[]'::jsonb, '[]'::jsonb, '완전히 익히고 초기에는 껍질과 단단한 알갱이가 남지 않게 해요.', '["책 p.32-39","책 p.350-365"]'::jsonb, '[]'::jsonb, '2023 최신개정판', false, true),
  ('lentil', null, '렌틸콩', '', 'legumes', 'beans', 'legume', 'other', 'initial', 6, 54, 'orange', false, null, '[]'::jsonb, '[]'::jsonb, '충분히 익혀 단계에 맞게 으깨거나 다져요.', '["책 p.32-39","책 p.350-365"]'::jsonb, '[]'::jsonb, '2023 최신개정판', false, true),
  ('kelp', null, '다시마', '', 'kelp', 'seaweed', 'otherVegetable', 'other', 'middle', 7, 55, 'green', false, null, '[]'::jsonb, '[]'::jsonb, '육수에 소량 사용할 수 있으며 해조류를 주식처럼 과다 사용하지 않아요.', '["책 p.32-39","책 p.350-365"]'::jsonb, '[]'::jsonb, '2023 최신개정판', false, true),
  ('seaweed', null, '미역', '', null, 'seaweed', 'otherVegetable', 'other', 'middle', 7, 56, 'green', false, null, '[]'::jsonb, '[]'::jsonb, '부드럽게 익히고 잘게 잘라 소량 사용해요.', '["책 p.32-39","책 p.350-365","책 p.47","책 p.379"]'::jsonb, '[]'::jsonb, '2023 최신개정판', false, true),
  ('cottage-cheese', null, '코티지치즈', '', null, 'dairy', 'dairy', 'other', 'late', 9, 57, 'white', true, null, '[]'::jsonb, '[]'::jsonb, '후기부터 가능한 유제품 후보로 염분이 낮은 제품을 선택해요.', '["책 p.32-39","책 p.350-365"]'::jsonb, '[]'::jsonb, '2023 최신개정판', false, true),
  ('milk', null, '생우유', '', null, 'dairy', 'dairy', 'other', 'completion', 12, 58, 'white', true, null, '[]'::jsonb, '[]'::jsonb, '음료는 돌 이후 제공하고 하루 유제품 총량 안에서 계산해요.', '["책 p.32-39","책 p.350-365"]'::jsonb, '[]'::jsonb, '2023 최신개정판', false, true),
  ('sesame-oil', null, '참기름', '', null, 'nutsOil', 'fat', 'other', 'middle', 7, 59, 'brown', false, null, '[]'::jsonb, '[]'::jsonb, '중기부터 필요한 경우 풍미를 위해 소량 사용해요.', '["책 p.32-39","책 p.350-365"]'::jsonb, '[]'::jsonb, '2023 최신개정판', false, true),
  ('olive-oil', null, '올리브유', '', null, 'nutsOil', 'fat', 'other', 'middle', 7, 60, 'green', false, null, '[]'::jsonb, '[]'::jsonb, '중기부터 필요한 경우 조리에 소량 사용해요.', '["책 p.32-39","책 p.350-365"]'::jsonb, '[]'::jsonb, '2023 최신개정판', false, true),
  ('butter', null, '버터', '', null, 'nutsOil', 'fat', 'other', 'middle', 7, 61, 'yellow', true, null, '[]'::jsonb, '[]'::jsonb, '중기부터 필요한 경우 무염 제품을 소량 사용해요.', '["책 p.32-39","책 p.350-365"]'::jsonb, '[]'::jsonb, '2023 최신개정판', false, true)
on conflict (id) do update set
  household_id = excluded.household_id,
  name = excluded.name,
  emoji = excluded.emoji,
  asset_id = excluded.asset_id,
  category = excluded.category,
  food_group = excluded.food_group,
  introduction_group = excluded.introduction_group,
  minimum_stage = excluded.minimum_stage,
  minimum_age_months = excluded.minimum_age_months,
  introduction_priority = excluded.introduction_priority,
  color = excluded.color,
  allergen = excluded.allergen,
  frequency_cap_7d = excluded.frequency_cap_7d,
  preparation_constraints = excluded.preparation_constraints,
  choking_form_blacklist = excluded.choking_form_blacklist,
  book_guidance = excluded.book_guidance,
  source_pages = excluded.source_pages,
  tags = excluded.tags,
  book_edition = excluded.book_edition,
  is_custom = excluded.is_custom,
  is_active = excluded.is_active
where public.ingredients.household_id is null;

-- Expected result: 61
select count(*) as built_in_ingredients
from public.ingredients
where household_id is null
  and is_custom = false
  and id in ('rice', 'oatmeal', 'beef', 'cabbage', 'bokchoy', 'pumpkin', 'zucchini', 'apple', 'pork', 'chicken', 'broccoli', 'carrot', 'sweet-potato', 'whitefish', 'egg', 'tofu', 'green-pea', 'yogurt', 'peanut-butter', 'wheat', 'brown-rice', 'millet', 'corn', 'barley', 'bread', 'noodle', 'spinach', 'napa-cabbage', 'kale', 'cauliflower', 'potato', 'onion', 'radish', 'beet', 'bell-pepper', 'mushroom', 'pear', 'plum', 'strawberry', 'tomato', 'banana', 'avocado', 'peach', 'apricot', 'kiwi', 'blueberry', 'grape', 'mandarin', 'salmon', 'mackerel', 'shrimp', 'kidney-bean', 'soybean', 'lentil', 'kelp', 'seaweed', 'cottage-cheese', 'milk', 'sesame-oil', 'olive-oil', 'butter');
