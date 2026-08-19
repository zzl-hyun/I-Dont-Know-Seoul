import type { DongScore, RentComboKey, RentHousingType, RentVariantStat } from "../types";
import { translate, type Locale } from "./locale";

/**
 * 사용자가 가격 축을 다시 계산할 때 고르는 선택 상태.
 *
 * 파이프라인은 이미 주택유형 조합 15가지 × 환산모드 2가지를 `rentVariants`로
 * 사전계산해 번들에 싣고 있다(`types.ts`의 `RentVariants` 참고). 이 모듈은
 * 그 사전계산 결과를 사용자의 선택에 맞게 조회·적용하는 순수 함수만 모은다 —
 * 클라이언트에서 백분위를 다시 계산하지 않는다(이 프로젝트의 원칙, `4-score.mjs`
 * 산출물만 신뢰한다).
 */
export interface RentSelection {
  /** 최소 1개. 항상 house → rowhouse → officetel → apartment 순으로 정렬해 둔다. */
  types: RentHousingType[];
  mode: "converted" | "raw";
}

/** 빈 URL과 새 세션에서 사용자가 처음 보게 되는 화면 기본값. */
export const DEFAULT_RENT_SELECTION: RentSelection = {
  types: ["house"],
  mode: "converted",
};

/**
 * 파이프라인의 `monthlyRentMan`·`score.price`에 저장된 기준 조합.
 * 화면 기본값과 분리해야 단독·다가구만 선택된 빈 URL에서도 실제 가격점수를
 * 다시 적용할 수 있다.
 */
export const SCORE_BASE_RENT_SELECTION: RentSelection = {
  types: ["house", "officetel", "apartment"],
  mode: "converted",
};

/** `scripts/lib/rent.mjs`의 `RENT_COMBOS`와 동일한 우선순위. */
const TYPE_ORDER: RentHousingType[] = ["house", "rowhouse", "officetel", "apartment"];

/** 생성 번들과 런타임 검증이 공유하는 4종의 비어 있지 않은 15개 조합. */
export const RENT_COMBO_KEYS: RentComboKey[] = [
  "house",
  "rowhouse",
  "officetel",
  "apartment",
  "house+rowhouse",
  "house+officetel",
  "house+apartment",
  "rowhouse+officetel",
  "rowhouse+apartment",
  "officetel+apartment",
  "house+rowhouse+officetel",
  "house+rowhouse+apartment",
  "house+officetel+apartment",
  "rowhouse+officetel+apartment",
  "house+rowhouse+officetel+apartment",
];

export const RENT_TYPE_LABEL: Record<RentHousingType, string> = {
  house: "단독·다가구",
  rowhouse: "연립·다세대",
  officetel: "오피스텔",
  apartment: "아파트",
};

/** 중복을 없애고 TYPE_ORDER 순서로 정렬한다. */
export function sortRentTypes(types: RentHousingType[]): RentHousingType[] {
  const set = new Set(types);
  return TYPE_ORDER.filter((t) => set.has(t));
}

/**
 * 정렬된 조합 키를 만든다. `scripts/lib/rent.mjs`의 `RENT_COMBOS`가 만드는
 * 키(`combo.join("+")`, house→rowhouse→officetel→apartment 순)와 바이트 단위로
 * 같아야 `rentVariants` 룩업이 맞는다.
 */
export function rentComboKey(types: RentHousingType[]): RentComboKey {
  return sortRentTypes(types).join("+");
}

export function isScoreBaseRentSelection(selection: RentSelection): boolean {
  return (
    selection.mode === SCORE_BASE_RENT_SELECTION.mode &&
    rentComboKey(selection.types) === rentComboKey(SCORE_BASE_RENT_SELECTION.types)
  );
}

/**
 * 선택에 맞춰 `.price`(가격 축 점수)만 덮어쓴 파생 Map을 만든다.
 *
 * `gradeAll`/`explainAxis`는 건드리지 않는다 — 이 두 함수는 `DongScore.price`를
 * 그대로 읽으므로, 여기서 그 필드만 선택된 조합·모드의 백분위로 바꿔치기하면
 * 나머지 계산 사슬은 자연히 선택을 반영한다.
 *
 * 번들 기준 조합(3종 전체 + converted)과 같으면 **입력을 그대로 반환한다** — 새
 * Map을 만들면 참조 동일성이 깨져 React 메모이제이션이 매번 무효화된다.
 */
export function applyRentSelection(
  scores: Map<string, DongScore>,
  selection: RentSelection
): Map<string, DongScore> {
  if (isScoreBaseRentSelection(selection)) return scores;

  const comboKey = rentComboKey(selection.types);
  const out = new Map<string, DongScore>();
  for (const [code, s] of scores) {
    const variant = s.rentVariants?.[selection.mode]?.[comboKey];
    // rentVariants가 아예 없는 구버전 번들이면(이론상) 원본을 그대로 둔다 —
    // 조용히 잘못된 점수를 만드는 것보다 선택이 안 먹히는 게 낫다.
    if (!variant) {
      out.set(code, s);
      continue;
    }
    // pct가 null이면(이 조합·모드가 전 동에서 표본 0) 이 프로젝트가 축 전체
    // 결측일 때 쓰는 관례대로 50점으로 둔다 (4-score.mjs 참고).
    out.set(code, { ...s, price: variant.pct ?? 50 });
  }
  return out;
}

/**
 * 월세 예산 필터가 참조할 대표값. 선택된 조합·모드의 중앙값을 우선 쓰고,
 * (구버전 번들 등으로) 없으면 기존 `monthlyRentMan`으로 폴백한다.
 */
export function selectedRentMedian(
  score: DongScore,
  selection: RentSelection
): number | null {
  const variant = selectedRentVariant(score, selection);
  return variant?.medianMan ?? score.raw.monthlyRentMan;
}

/** 선택한 조합의 중앙값·표본수·백분위를 한 번에 조회한다. */
export function selectedRentVariant(
  score: DongScore,
  selection: RentSelection
): RentVariantStat | undefined {
  const comboKey = rentComboKey(selection.types);
  return score.rentVariants?.[selection.mode]?.[comboKey];
}

/** "단독·다가구+아파트 순수월세" 같은 화면 라벨. */
export function rentSelectionLabel(selection: RentSelection, locale: Locale = "ko"): string {
  const typesLabel = sortRentTypes(selection.types)
    .map((t) => translate(locale, RENT_TYPE_LABEL[t]))
    .join(locale === "en" ? " + " : "+");
  const modeLabel = translate(locale, selection.mode === "raw" ? "순수월세" : "환산월세");
  return `${typesLabel} ${modeLabel}`;
}
