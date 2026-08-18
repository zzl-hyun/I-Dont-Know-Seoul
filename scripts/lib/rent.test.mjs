import { describe, it, expect } from "vitest";
import {
  RENT_CONVERSION_RATE,
  RENT_TYPES,
  isPublicRentalName,
  rentConversionRate,
  toConvertedMonthly,
} from "./rent.mjs";
import { typeBreakdown } from "./rent.mjs";

describe("rentConversionRate", () => {
  it("아파트는 시군구 값을 쓴다 — 유일하게 시군구까지 공표되는 유형이다", () => {
    expect(rentConversionRate("apartment", "41135")).toBe(0.0449); // 성남 분당
    expect(rentConversionRate("apartment", "11710")).toBe(0.0438); // 서울 송파
  });

  it("시군구 값이 없는 유형은 시도로 떨어진다", () => {
    expect(rentConversionRate("house", "41135")).toBe(RENT_CONVERSION_RATE.house[41]);
    expect(rentConversionRate("house", "11710")).toBe(RENT_CONVERSION_RATE.house[11]);
    expect(rentConversionRate("rowhouse", "41597")).toBe(RENT_CONVERSION_RATE.rowhouse[41]);
  });

  // 이 앱은 서울과 경기를 한 상대 척도에 올려 비교한다. 두 지역에 같은 계수를
  // 쓰면 경기 환산월세가 체계적으로 과소평가된다 — 이게 상수를 바꾼 이유다.
  it("경기 전환율이 서울보다 높다는 관계가 유지된다", () => {
    for (const type of ["house", "rowhouse", "officetel", "apartment"]) {
      expect(RENT_CONVERSION_RATE[type][41]).toBeGreaterThan(RENT_CONVERSION_RATE[type][11]);
    }
  });

  it("대상 지역 35개 구 전부 값이 있다", () => {
    const gus = [
      11110, 11140, 11170, 11200, 11215, 11230, 11260, 11290, 11305, 11320, 11350, 11380,
      11410, 11440, 11470, 11500, 11530, 11545, 11560, 11590, 11620, 11650, 11680, 11710,
      11740, 41111, 41113, 41115, 41117, 41131, 41133, 41135, 41463, 41465, 41597,
    ];
    for (const gu of gus) {
      for (const type of RENT_TYPES) {
        expect(rentConversionRate(type, String(gu))).toBeGreaterThan(0);
      }
    }
  });

  // 조용히 기본값으로 때우면 그 지역만 다른 계수로 환산되는데, 결측이 아니라
  // 그럴듯한 숫자라 눈으로 못 잡는다. 대상을 넓힐 때 반드시 걸리게 둔다.
  it("대상 밖 지역은 조용히 넘어가지 않고 던진다", () => {
    expect(() => rentConversionRate("house", "26110")).toThrow(/전월세전환율이 없는 지역/);
    expect(() => rentConversionRate("villa", "11110")).toThrow(/알 수 없는 주택유형/);
  });
});

describe("toConvertedMonthly", () => {
  it("보증금을 연 전환율로 나눠 월세에 더한다", () => {
    // 보증금 1,200만 × 6% ÷ 12 = 6만
    expect(toConvertedMonthly(1_200, 50, 0.06)).toBeCloseTo(56, 10);
  });

  it("전환율이 높을수록 같은 보증금이 더 비싸게 환산된다", () => {
    const seoul = toConvertedMonthly(2_000, 50, RENT_CONVERSION_RATE.house[11]);
    const gyeonggi = toConvertedMonthly(2_000, 50, RENT_CONVERSION_RATE.house[41]);
    expect(gyeonggi).toBeGreaterThan(seoul);
  });
});

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
