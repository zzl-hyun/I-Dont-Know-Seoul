import { describe, expect, it } from "vitest";
import { populationWalkByDong, weightedQuantile } from "./population-access.mjs";

describe("인구 분포 기반 역 도보", () => {
  it("좌표 평균이 아니라 인구 누적 50%를 넘는 실제 표본을 고른다", () => {
    expect(
      weightedQuantile(
        [
          { value: 2, weight: 20 },
          { value: 8, weight: 40 },
          { value: 30, weight: 40 },
        ],
        0.5,
      ),
    ).toBe(8);
  });

  it("100m 셀이 있으면 멀리 떨어진 동 대표점을 사용하지 않는다", () => {
    const dongs = [{ code: "1", lat: 37.5, lng: 126.9 }];
    const stations = [{ lat: 37.5, lng: 127 }];
    const population = { "1": [[126.999, 37.5, 100]] };
    const { values, fallbackCount } = populationWalkByDong(dongs, stations, population);
    expect(fallbackCount).toBe(0);
    expect(values.get("1")).toBeLessThan(3);
  });
});
