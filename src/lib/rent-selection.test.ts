import { describe, it, expect } from "vitest";
import type { DongScore, RentHousingType, RentVariants } from "../types";
import {
  applyRentSelection,
  DEFAULT_RENT_SELECTION,
  isScoreBaseRentSelection,
  rentComboKey,
  rentSelectionLabel,
  SCORE_BASE_RENT_SELECTION,
  selectedRentMedian,
  selectedRentVariant,
  sortRentTypes,
} from "./rent-selection";

/** 조합 15개 × 모드 2개를 채운 rentVariants 픽스처. */
function makeVariants(basePrice: number): RentVariants {
  const combos = [
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
  const build = (offset: number) =>
    Object.fromEntries(
      combos.map((key, i) => [
        key,
        { medianMan: basePrice + offset + i, samples: 5, pct: basePrice + offset + i },
      ])
    );
  return {
    converted: build(0) as RentVariants["converted"],
    raw: build(100) as RentVariants["raw"],
  };
}

const dong = (code: string, price: number, basePrice: number): [string, DongScore] => [
  code,
  {
    safety: 50,
    price,
    convenience: 50,
    pct: [],
    raw: {
      monthlyRentMan: price,
      rentSamples: 5,
      rentByType: null,
      cctvPerKm2: null,
      nightlifePerKm2: null,
      crimePer1k: null,
      trafficAccidentPerKm2: null,
      storePerKm2: null,
      foodPerKm2: null,
      medicalPerKm2: null,
      busStopPerKm2: null,
      walkToStationMin: null,
    },
    dataQuality: "ok",
    rentVariants: makeVariants(basePrice),
  },
];

describe("rentComboKey / sortRentTypes", () => {
  it("입력 순서와 무관하게 house→rowhouse→officetel→apartment 순으로 정렬한다", () => {
    expect(rentComboKey(["apartment", "house"])).toBe("house+apartment");
    expect(rentComboKey(["officetel", "house", "apartment"])).toBe(
      "house+officetel+apartment"
    );
    expect(sortRentTypes(["apartment", "officetel"])).toEqual(["officetel", "apartment"]);
    expect(sortRentTypes(["apartment", "house", "rowhouse"])).toEqual([
      "house",
      "rowhouse",
      "apartment",
    ]);
  });

  it("중복은 제거한다", () => {
    expect(rentComboKey(["house", "house", "apartment"])).toBe("house+apartment");
  });

  it("실제 번들이 만드는 15개 조합 키와 일치한다", () => {
    const expected = [
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
    const combos: RentHousingType[][] = [
      ["house"],
      ["rowhouse"],
      ["officetel"],
      ["apartment"],
      ["house", "rowhouse"],
      ["house", "officetel"],
      ["house", "apartment"],
      ["rowhouse", "officetel"],
      ["rowhouse", "apartment"],
      ["officetel", "apartment"],
      ["house", "rowhouse", "officetel"],
      ["house", "rowhouse", "apartment"],
      ["house", "officetel", "apartment"],
      ["rowhouse", "officetel", "apartment"],
      ["house", "rowhouse", "officetel", "apartment"],
    ];
    expect(combos.map(rentComboKey)).toEqual(expected);
  });
});

describe("isScoreBaseRentSelection", () => {
  it("3종 전체 + converted만 번들 기준값이다", () => {
    expect(isScoreBaseRentSelection(SCORE_BASE_RENT_SELECTION)).toBe(true);
    expect(
      isScoreBaseRentSelection({ types: ["apartment", "house", "officetel"], mode: "converted" })
    ).toBe(true); // 순서만 다름
    expect(isScoreBaseRentSelection(DEFAULT_RENT_SELECTION)).toBe(false);
    expect(
      isScoreBaseRentSelection({ types: ["house", "officetel", "apartment"], mode: "raw" })
    ).toBe(false);
  });
});

describe("applyRentSelection", () => {
  const scores = new Map([dong("a", 40, 1000), dong("b", 60, 2000)]);

  it("번들 기준 선택이면 입력 Map을 참조 그대로 반환한다 (React 메모이제이션 보존)", () => {
    const out = applyRentSelection(scores, SCORE_BASE_RENT_SELECTION);
    expect(out).toBe(scores);
  });

  it("화면 기본값인 단독·다가구 환산월세는 실제 house 가격점수를 적용한다", () => {
    const out = applyRentSelection(scores, DEFAULT_RENT_SELECTION);
    expect(out).not.toBe(scores);
    expect(out.get("a")!.price).toBe(1000);
    expect(out.get("b")!.price).toBe(2000);
  });

  it("다른 선택이면 새 Map을 만들고 .price만 그 조합·모드의 pct로 덮어쓴다", () => {
    const out = applyRentSelection(scores, { types: ["apartment"], mode: "converted" });
    expect(out).not.toBe(scores);

    const a = out.get("a")!;
    const originalA = scores.get("a")!;
    expect(a.price).toBe(originalA.rentVariants!.converted.apartment.pct);
    // 다른 필드는 그대로 유지
    expect(a.raw).toBe(originalA.raw);
    expect(a.safety).toBe(originalA.safety);
    expect(a.rentVariants).toBe(originalA.rentVariants);
  });

  it("raw 모드를 고르면 raw 쪽 pct를 쓴다", () => {
    const out = applyRentSelection(scores, { types: ["house"], mode: "raw" });
    // raw 빌더는 offset 100, house index 0 → basePrice + 100
    expect(out.get("a")!.price).toBe(1100);
    expect(out.get("b")!.price).toBe(2100);
  });

  it("pct가 null이면 50점으로 둔다 (축 전체 결측 관례)", () => {
    const [, s] = dong("c", 10, 5000);
    s.rentVariants!.converted["house"] = { medianMan: 30, samples: 0, pct: null };
    const map = new Map([["c", s]]);
    const out = applyRentSelection(map, { types: ["house"], mode: "converted" });
    expect(out.get("c")!.price).toBe(50);
  });

  it("rentVariants가 없는 구버전 번들은 원본 그대로 둔다", () => {
    const [, s] = dong("d", 77, 100);
    delete (s as { rentVariants?: unknown }).rentVariants;
    const map = new Map([["d", s]]);
    const out = applyRentSelection(map, { types: ["apartment"], mode: "raw" });
    expect(out.get("d")).toBe(s);
    expect(out.get("d")!.price).toBe(77);
  });
});

describe("selectedRentMedian", () => {
  const [, s] = dong("a", 40, 1000);

  it("선택된 조합·모드의 medianMan을 반환한다", () => {
    expect(selectedRentMedian(s, { types: ["apartment"], mode: "converted" })).toBe(1003);
    expect(selectedRentVariant(s, { types: ["rowhouse"], mode: "raw" })).toEqual(
      s.rentVariants!.raw.rowhouse
    );
  });

  it("rentVariants가 없거나 조회 실패하면 monthlyRentMan으로 폴백한다", () => {
    const bare: DongScore = { ...s, rentVariants: undefined };
    expect(selectedRentMedian(bare, { types: ["apartment"], mode: "converted" })).toBe(
      bare.raw.monthlyRentMan
    );
  });
});

describe("rentSelectionLabel", () => {
  it("유형·모드를 사람이 읽는 라벨로 만든다", () => {
    expect(rentSelectionLabel({ types: ["house", "apartment"], mode: "raw" })).toBe(
      "단독·다가구+아파트 순수월세"
    );
    expect(rentSelectionLabel({ types: ["rowhouse"], mode: "converted" })).toBe(
      "연립·다세대 환산월세"
    );
    expect(rentSelectionLabel(DEFAULT_RENT_SELECTION)).toBe(
      "단독·다가구 환산월세"
    );
  });
});
