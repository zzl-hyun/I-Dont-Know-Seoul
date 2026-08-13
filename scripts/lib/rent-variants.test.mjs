import { describe, it, expect } from "vitest";
import { RENT_COMBOS, buildRentVariants } from "./rent.mjs";

/** 주택유형별 n개를 만든다. monthly/converted는 값을 살짝 다르게 둬서
 * raw 모드와 converted 모드가 서로 다른 계산 결과를 낸다는 것도 함께 확인한다. */
function makePool({ house = 0, rowhouse = 0, officetel = 0, apartment = 0 } = {}, offset = 0) {
  const pool = [];
  let i = 0;
  const push = (type, count) => {
    for (let k = 0; k < count; k++) {
      i++;
      pool.push({ monthly: 50 + i, converted: 50 + i + offset, type });
    }
  };
  push("house", house);
  push("rowhouse", rowhouse);
  push("officetel", officetel);
  push("apartment", apartment);
  return pool;
}

describe("buildRentVariants", () => {
  it("15가지 조합 × 2가지 모드를 전부 만든다", () => {
    const dongPool = makePool({ house: 6, rowhouse: 6, officetel: 6, apartment: 6 });
    const result = buildRentVariants(dongPool, [], { minSamples: 5 });
    const expectedKeys = RENT_COMBOS.map((c) => c.join("+"));
    expect(expectedKeys).toHaveLength(15);
    expect(Object.keys(result.converted).sort()).toEqual([...expectedKeys].sort());
    expect(Object.keys(result.raw).sort()).toEqual([...expectedKeys].sort());
  });

  it("조합이 넓을수록 표본수가 많아진다 (부분집합 관계)", () => {
    const dongPool = makePool({ house: 6, rowhouse: 6, officetel: 6, apartment: 6 });
    const result = buildRentVariants(dongPool, [], { minSamples: 5 });
    expect(result.converted["house"].samples).toBe(6);
    expect(result.converted["house+rowhouse"].samples).toBe(12);
    expect(result.converted["house+officetel+apartment"].samples).toBe(18);
    expect(result.converted["house+rowhouse+officetel+apartment"].samples).toBe(24);
    // 좁은 조합 <= 넓은 조합, 항상
    for (const combo of RENT_COMBOS) {
      const key = combo.join("+");
      expect(result.converted[key].samples).toBeLessThanOrEqual(
        result.converted["house+rowhouse+officetel+apartment"].samples
      );
    }
  });

  it("동 표본이 minSamples 미만이면 자치구(district) 표본으로 대체하고 samples: 0을 찍는다", () => {
    // house 3개뿐 → minSamples(5) 미달, apartment/officetel은 아예 없음
    const dongPool = makePool({ house: 3 });
    const districtPool = makePool({ house: 6, rowhouse: 6, officetel: 6, apartment: 6 }, 1000);
    const result = buildRentVariants(dongPool, districtPool, { minSamples: 5 });

    // house 조합 - district 대체가 일어난다
    expect(result.converted["house"].samples).toBe(0);
    expect(result.converted["house"].medianMan).not.toBeNull();
    // district pool의 house만 골라 중앙값을 낸 것과 같아야 한다
    const districtHouseValues = districtPool.filter((p) => p.type === "house").map((p) => p.converted);
    districtHouseValues.sort((a, b) => a - b);
    const mid = districtHouseValues.length >> 1;
    const expectedMedian =
      districtHouseValues.length % 2
        ? districtHouseValues[mid]
        : (districtHouseValues[mid - 1] + districtHouseValues[mid]) / 2;
    expect(result.converted["house"].medianMan).toBeCloseTo(expectedMedian, 2);
  });

  it("동·자치구 모두 표본 부족이면 medianMan: null, samples: 0", () => {
    const dongPool = makePool({ house: 1 });
    const districtPool = makePool({ house: 2 });
    const result = buildRentVariants(dongPool, districtPool, { minSamples: 5 });
    expect(result.converted["house"]).toEqual({ medianMan: null, samples: 0 });
    expect(result.raw["house"]).toEqual({ medianMan: null, samples: 0 });
  });

  it("빈 pool이면 전부 null/0이다", () => {
    const result = buildRentVariants([], [], { minSamples: 5 });
    for (const combo of RENT_COMBOS) {
      const key = combo.join("+");
      expect(result.converted[key]).toEqual({ medianMan: null, samples: 0 });
      expect(result.raw[key]).toEqual({ medianMan: null, samples: 0 });
    }
  });

  it("raw 모드는 monthly를, converted 모드는 converted를 쓴다 — 서로 다른 값이면 결과도 다르다", () => {
    const dongPool = makePool({ house: 6 }, 1000); // converted = monthly + 1000
    const result = buildRentVariants(dongPool, [], { minSamples: 5 });
    expect(result.converted["house"].medianMan).not.toBeCloseTo(result.raw["house"].medianMan, 2);
    expect(result.converted["house"].medianMan - result.raw["house"].medianMan).toBeCloseTo(1000, 2);
  });

  it("4종 전체/converted 조합은 pool 전체를 그대로 쓴 것과 같다", () => {
    const dongPool = makePool({ house: 4, rowhouse: 4, officetel: 4, apartment: 4 });
    const result = buildRentVariants(dongPool, [], { minSamples: 5 });
    const allValues = dongPool.map((p) => p.converted).sort((a, b) => a - b);
    const mid = allValues.length >> 1;
    const expectedMedian =
      allValues.length % 2 ? allValues[mid] : (allValues[mid - 1] + allValues[mid]) / 2;
    const allKey = "house+rowhouse+officetel+apartment";
    expect(result.converted[allKey].samples).toBe(dongPool.length);
    expect(result.converted[allKey].medianMan).toBeCloseTo(expectedMedian, 2);
  });
});
