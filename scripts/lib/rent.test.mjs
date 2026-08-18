import { describe, it, expect } from "vitest";
import { RENT_TYPES, isPublicRentalName, typeBreakdown } from "./rent.mjs";

describe("isPublicRentalName", () => {
  // 실제로 표본을 오염시킨 단지들이다. 전부 대상 지역 원자료에서 확인했다.
  it.each([
    "성남판교경기행복주택",
    "봇들마을6단지(주공)임대",
    "백현마을3단지(주공)임대",
    "판교제2테크노밸리LH1단지",
    "휴먼시아섬마을9단지(임대)",
    "LH동분당센트럴파크",
    "수원광교행복주택",
  ])("공공임대를 걸러낸다: %s", (name) => {
    expect(isPublicRentalName(name)).toBe(true);
  });

  // 여기 있는 이름이 하나라도 true 가 되면 일반 물건이 표본에서 사라진다.
  // 봇들마을3·4단지(주공)는 분양 단지라 삼평동 표본에 반드시 남아야 한다 —
  // 이게 빠지면 삼평동에 일반 물건이 0건이 되어 자치구 중앙값으로 넘어간다.
  it.each([
    "봇들마을3단지(주공)",
    "봇들마을4단지(주공)",
    "광교역참누리포레스트",
    "장안타운(건영)",
    "정자동3차 푸르지오 시티",
    "래미안강남포레스트",
  ])("분양 단지는 남긴다: %s", (name) => {
    expect(isPublicRentalName(name)).toBe(false);
  });

  it("이름이 없어도 터지지 않는다 — 단독·다가구는 단지명 필드 자체가 없다", () => {
    expect(isPublicRentalName(undefined)).toBe(false);
    expect(isPublicRentalName(null)).toBe(false);
    expect(isPublicRentalName("")).toBe(false);
  });
});

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
