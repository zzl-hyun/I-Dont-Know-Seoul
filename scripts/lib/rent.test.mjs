import { describe, it, expect } from "vitest";
import { RENT_TYPES, typeBreakdown } from "./rent.mjs";

describe("typeBreakdown", () => {
  it("유형별로 정확히 나눠 중앙값·표본수를 계산한다", () => {
    const pool = [
      { value: 60, type: "house" },
      { value: 70, type: "house" },
      { value: 80, type: "house" },
      { value: 85, type: "rowhouse" },
      { value: 95, type: "rowhouse" },
      { value: 90, type: "officetel" },
      { value: 100, type: "officetel" },
      { value: 130, type: "apartment" },
      { value: 140, type: "apartment" },
      { value: 150, type: "apartment" },
    ];
    const result = typeBreakdown(pool);
    expect(result.house).toEqual({ medianMan: 70, samples: 3 });
    expect(result.rowhouse).toEqual({ medianMan: 90, samples: 2 });
    expect(result.officetel).toEqual({ medianMan: 95, samples: 2 });
    expect(result.apartment).toEqual({ medianMan: 140, samples: 3 });
  });

  it("표본이 없는 유형은 medianMan이 null이고 samples는 0이다", () => {
    const pool = [{ value: 60, type: "house" }];
    const result = typeBreakdown(pool);
    expect(result.rowhouse).toEqual({ medianMan: null, samples: 0 });
    expect(result.officetel).toEqual({ medianMan: null, samples: 0 });
    expect(result.apartment).toEqual({ medianMan: null, samples: 0 });
  });

  it("빈 입력이면 네 유형 모두 표본 없음이다", () => {
    const result = typeBreakdown([]);
    for (const type of RENT_TYPES) {
      expect(result[type]).toEqual({ medianMan: null, samples: 0 });
    }
  });

  it("유형별 표본수 합이 전체 입력 개수와 같다 — 어느 레코드도 잃어버리거나 중복 집계하지 않는다", () => {
    const pool = [
      { value: 50, type: "house" },
      { value: 60, type: "house" },
      { value: 70, type: "rowhouse" },
      { value: 80, type: "officetel" },
      { value: 90, type: "apartment" },
      { value: 100, type: "apartment" },
    ];
    const result = typeBreakdown(pool);
    const totalSamples = RENT_TYPES.reduce((sum, type) => sum + result[type].samples, 0);
    expect(totalSamples).toBe(pool.length);
  });

  it("RENT_TYPES 밖의 태그가 섞여도 정의된 네 유형끼리는 서로 안 섞인다", () => {
    const pool = [
      { value: 100, type: "house" },
      { value: 999, type: "unknown-type" },
    ];
    const result = typeBreakdown(pool);
    expect(result.house).toEqual({ medianMan: 100, samples: 1 });
    expect(result.rowhouse.samples).toBe(0);
    expect(result.officetel.samples).toBe(0);
    expect(result.apartment.samples).toBe(0);
  });
});
