import { describe, it, expect } from "vitest";
import type { DongScore, RentVariants } from "../types";
import {
  applyRentSelection,
  DEFAULT_RENT_SELECTION,
  isDefaultRentSelection,
  rentComboKey,
  rentSelectionLabel,
  selectedRentMedian,
  sortRentTypes,
} from "./rent-selection";

/** 조합 7개 × 모드 2개를 채운 rentVariants 픽스처. 값은 조합마다 다르게 둬서 룩업 오류를 잡는다. */
function makeVariants(basePrice: number): RentVariants {
  const combos = [
    "house",
    "officetel",
    "apartment",
    "house+officetel",
    "house+apartment",
    "officetel+apartment",
    "house+officetel+apartment",
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
  it("입력 순서와 무관하게 house→officetel→apartment 순으로 정렬한다", () => {
    expect(rentComboKey(["apartment", "house"])).toBe("house+apartment");
    expect(rentComboKey(["officetel", "house", "apartment"])).toBe(
      "house+officetel+apartment"
    );
    expect(sortRentTypes(["apartment", "officetel"])).toEqual(["officetel", "apartment"]);
  });

  it("중복은 제거한다", () => {
    expect(rentComboKey(["house", "house", "apartment"])).toBe("house+apartment");
  });

  it("실제 번들이 만드는 7개 조합 키와 일치한다 (scripts/lib/rent.mjs의 RENT_COMBOS)", () => {
    const expected = [
      "house",
      "officetel",
      "apartment",
      "house+officetel",
      "house+apartment",
      "officetel+apartment",
      "house+officetel+apartment",
    ];
    const combos: Array<Array<"house" | "officetel" | "apartment">> = [
      ["house"],
      ["officetel"],
      ["apartment"],
      ["house", "officetel"],
      ["house", "apartment"],
      ["officetel", "apartment"],
      ["house", "officetel", "apartment"],
    ];
    expect(combos.map(rentComboKey)).toEqual(expected);
  });
});

describe("isDefaultRentSelection", () => {
  it("3종 전체 + converted만 기본값이다", () => {
    expect(isDefaultRentSelection(DEFAULT_RENT_SELECTION)).toBe(true);
    expect(
      isDefaultRentSelection({ types: ["apartment", "house", "officetel"], mode: "converted" })
    ).toBe(true); // 순서만 다름
    expect(isDefaultRentSelection({ types: ["apartment"], mode: "converted" })).toBe(false);
    expect(
      isDefaultRentSelection({ types: ["house", "officetel", "apartment"], mode: "raw" })
    ).toBe(false);
  });
});

describe("applyRentSelection", () => {
  const scores = new Map([dong("a", 40, 1000), dong("b", 60, 2000)]);

  it("기본 선택이면 입력 Map을 참조 그대로 반환한다 (React 메모이제이션 보존)", () => {
    const out = applyRentSelection(scores, DEFAULT_RENT_SELECTION);
    expect(out).toBe(scores);
  });

  it("다른 선택이면 새 Map을 만들고 .price만 그 조합·모드의 pct로 덮어쓴다", () => {
    const out = applyRentSelection(scores, { types: ["apartment"], mode: "converted" });
    expect(out).not.toBe(scores);

    const a = out.get("a")!;
    const originalA = scores.get("a")!;
    // apartment 단독 조합의 pct (basePrice 1000 + 2, index apartment=2)
    expect(a.price).toBe(1002);
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
    // apartment 단독, converted: basePrice + 2 = 1002
    expect(selectedRentMedian(s, { types: ["apartment"], mode: "converted" })).toBe(1002);
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
    expect(rentSelectionLabel(DEFAULT_RENT_SELECTION)).toBe(
      "단독·다가구+오피스텔+아파트 환산월세"
    );
  });
});
