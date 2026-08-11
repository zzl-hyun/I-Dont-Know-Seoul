import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { SBIZ_GROUPS, isSbizNightlifeClass } from "./sbiz.mjs";

describe("소상공인 유흥업소 분류", () => {
  it("일반·무도 유흥 주점만 포함한다", () => {
    expect(isSbizNightlifeClass("I21101")).toBe(true);
    expect(isSbizNightlifeClass("I21102")).toBe(true);
    expect(isSbizNightlifeClass("I21103")).toBe(false);
    expect(isSbizNightlifeClass("I21104")).toBe(false);
    expect(isSbizNightlifeClass("I20101")).toBe(false);
  });
});

describe("소상공인 업종 → 지표 분류", () => {
  it("store 는 종합 소매만 잡는다", () => {
    for (const c of ["G20405", "G20404", "G20499"]) expect(SBIZ_GROUPS.store(c), c).toBe(true);
    // 의약·화장품 소매(G215)·식료품 소매(G205)는 종합 소매가 아니다
    for (const c of ["G21501", "G20503", "I20101", "Q10201"]) expect(SBIZ_GROUPS.store(c), c).toBe(false);
  });

  it("food 는 음식 전체에서 주점만 뺀다", () => {
    for (const c of ["I20101", "I21201", "I21007", "I20301"]) expect(SBIZ_GROUPS.food(c), c).toBe(true);
    for (const c of ["I21101", "I21102", "I21103", "I21104"]) expect(SBIZ_GROUPS.food(c), c).toBe(false);
    expect(SBIZ_GROUPS.food("I10101"), "숙박(I1)은 음식이 아니다").toBe(false);
  });

  it("medical 은 보건의료에 약국을 더한다", () => {
    for (const c of ["Q10201", "Q10101", "Q10402"]) expect(SBIZ_GROUPS.medical(c), c).toBe(true);
    expect(SBIZ_GROUPS.medical("G21501"), "약국은 원 분류가 소매지만 의료로 센다").toBe(true);
    expect(SBIZ_GROUPS.medical("G21502"), "의료기기 소매는 의료 접근성이 아니다").toBe(false);
  });

  /*
   * 이 테스트가 이 파일의 존재 이유다.
   *
   * 주점은 소상공인 분류상 음식(I2) 밑에 있다. food 에서 I211 을 빼는 규칙이
   * 사라지면 같은 업소를 편의 축에서 가점하고 치안 축에서 감점하게 되는데,
   * 예외도 안 나고 숫자도 그럴듯해서 눈으로는 못 잡는다. 등급 분포만 조용히
   * 움직인다.
   */
  it("food 와 nightlife 는 절대 겹치지 않는다", () => {
    const codes = ["I21101", "I21102", "I21103", "I21104", "I20101", "I21201"];
    for (const c of codes) {
      expect(SBIZ_GROUPS.food(c) && SBIZ_GROUPS.nightlife(c), `${c} 가 양쪽에 걸림`).toBe(false);
    }
  });

  it("실제 업종코드 전수에서도 어느 코드든 food·nightlife 양쪽에 안 걸린다", () => {
    // 캐시가 있으면 실제 코드 전수로 검증한다 (없으면 위 표본 테스트로 충분)
    let codes;
    try {
      const raw = JSON.parse(
        readFileSync(join(process.cwd(), "data/raw/sbiz-seoul.json"), "utf8")
      );
      codes = Object.keys(raw.names ?? {});
    } catch {
      return; // 캐시 없음 — 스킵
    }
    expect(codes.length).toBeGreaterThan(0);
    const both = codes.filter((c) => SBIZ_GROUPS.food(c) && SBIZ_GROUPS.nightlife(c));
    expect(both, "food 와 nightlife 에 동시에 걸리는 코드").toEqual([]);
    // 유흥주점 2종이 실제 데이터에 존재하는지도 같이 확인한다
    expect(codes).toContain("I21101");
  });
});
