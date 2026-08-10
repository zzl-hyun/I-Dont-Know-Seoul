import { describe, it, expect } from "vitest";
import { gradeAll } from "./score";
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
