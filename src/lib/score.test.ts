import { describe, it, expect } from "vitest";
import { commutePenalty, gradeAll } from "./score";
import { DEFAULT_WEIGHTS } from "./constants";
import type { DongScore } from "../types";

const dong = (safety: number, price: number, convenience: number): DongScore => ({
  safety,
  price,
  convenience,
  pct: [],
  raw: {} as DongScore["raw"],
  dataQuality: "ok",
});

describe("gradeAll — 동점 처리", () => {
  it("동점인 동들의 등급이 동 코드 오름차순으로 일관되게 갈린다", () => {
    // 전부 같은 점수라 등급은 순전히 tie-break로만 갈린다.
    const scores = new Map<string, DongScore>([
      ["b", dong(50, 50, 50)],
      ["a", dong(50, 50, 50)],
      ["d", dong(50, 50, 50)],
      ["c", dong(50, 50, 50)],
    ]);

    const run = () => gradeAll(scores, DEFAULT_WEIGHTS);
    const first = run();
    const second = run();

    // 여러 번 돌려도(입력 순서와 무관하게) 항상 같은 결과 — 진짜 결정적인지 확인
    for (const code of ["a", "b", "c", "d"]) {
      expect(second.byDong.get(code)).toEqual(first.byDong.get(code));
    }

    // 동점이면 동 코드 오름차순이 더 높은 순위(=더 낮은 rank 숫자)를 갖는다
    const ranks = ["a", "b", "c", "d"].map((c) => first.byDong.get(c)!.rank);
    expect(ranks).toEqual([1, 2, 3, 4]);
  });

  it("입력 Map의 삽입 순서를 바꿔도 결과가 같다", () => {
    const make = (order: string[]) =>
      new Map(order.map((code) => [code, dong(50, 50, 50)] as const));

    const a = gradeAll(make(["x", "y", "z"]), DEFAULT_WEIGHTS);
    const b = gradeAll(make(["z", "x", "y"]), DEFAULT_WEIGHTS);

    for (const code of ["x", "y", "z"]) {
      expect(b.byDong.get(code)).toEqual(a.byDong.get(code));
    }
  });
});

describe("commutePenalty — Φ(통근)", () => {
  it("30분 이하는 감점이 없다", () => {
    expect(commutePenalty(0)).toBe(1);
    expect(commutePenalty(15)).toBe(1);
    expect(commutePenalty(30)).toBe(1);
  });

  it("30분 초과부터 공식대로 감쇠한다 — constants.ts 주석의 검산표와 일치", () => {
    // constants.ts COMMUTE_FREE_MIN/WIDTH/POWER(30/40/2.8)를 그대로 계산한 값.
    // 이 상수를 바꾸면 이 표도 같이 갱신해야 한다.
    expect(commutePenalty(40)).toBeCloseTo(0.98, 2);
    expect(commutePenalty(50)).toBeCloseTo(0.874, 3);
    expect(commutePenalty(60)).toBeCloseTo(0.691, 3);
    expect(commutePenalty(75)).toBeCloseTo(0.418, 3);
    expect(commutePenalty(90)).toBeCloseTo(0.243, 3);
  });

  it("null은 '제약 없음'(Φ=1)이다 — 도달 불가와는 다른 의미이므로 호출부가 구분해야 한다", () => {
    expect(commutePenalty(null)).toBe(1);
  });
});

describe("gradeAll — 통근 페널티 반영", () => {
  const scores = new Map<string, DongScore>([
    ["near", dong(60, 60, 60)], // 종합 60 — 통근이 가까움
    ["far", dong(90, 90, 90)], // 종합 90 — 통근이 멀지만 다른 축이 훨씬 좋음
  ]);

  it("commuteMin을 생략하면 3번째 인자를 아예 안 준 것과 완전히 같다 (회귀 없음)", () => {
    const withoutArg = gradeAll(scores, DEFAULT_WEIGHTS);
    const withUndefined = gradeAll(scores, DEFAULT_WEIGHTS, undefined);
    expect(withUndefined).toEqual(withoutArg);
  });

  it("먼 동이 종합점수가 높아도, 통근 페널티가 크면 가까운 동에 순위가 밀린다", () => {
    // far: 90분 통근 → Φ≈0.243 → 90×0.243≈21.9
    // near: 0분 통근 → Φ=1 → 60×1=60
    const commuteMin = new Map([
      ["near", 0],
      ["far", 90],
    ]);
    const result = gradeAll(scores, DEFAULT_WEIGHTS, commuteMin);
    const near = result.byDong.get("near")!;
    const far = result.byDong.get("far")!;
    expect(near.score).toBeCloseTo(60, 5);
    expect(far.score).toBeCloseTo(90 * commutePenalty(90), 5);
    expect(near.rank).toBeLessThan(far.rank); // near가 더 앞순위(더 좋은 등급)
  });

  it("도달 불가(null)면 점수가 0으로 수렴해 최하위로 몰린다", () => {
    const commuteMin = new Map([
      ["near", 20],
      ["far", null], // 목적지는 있지만 이 동에서 도달 불가
    ]);
    const result = gradeAll(scores, DEFAULT_WEIGHTS, commuteMin);
    expect(result.byDong.get("far")!.score).toBe(0);
    expect(result.byDong.get("near")!.rank).toBeLessThan(result.byDong.get("far")!.rank);
  });

  it("맵에 아예 없는 동도 도달 불가와 동일하게(Φ=0) 처리한다", () => {
    const commuteMin = new Map([["near", 20]]); // "far"는 맵에 없음
    const result = gradeAll(scores, DEFAULT_WEIGHTS, commuteMin);
    expect(result.byDong.get("far")!.score).toBe(0);
  });
});
