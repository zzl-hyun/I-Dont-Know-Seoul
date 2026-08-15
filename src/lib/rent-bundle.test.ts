import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { DongScore } from "../types";
import { DEFAULT_WEIGHTS } from "./constants";
import { computeMultiCommute } from "./commute";
import { summarize } from "./explain";
import {
  applyRentSelection,
  DEFAULT_RENT_SELECTION,
  RENT_COMBO_KEYS,
  selectedRentVariant,
  type RentSelection,
} from "./rent-selection";
import { gradeAll } from "./score";

const bundle = JSON.parse(
  readFileSync(join(__dirname, "../../public/data/bundle.json"), "utf8")
);
const metrics = JSON.parse(
  readFileSync(join(__dirname, "../../data/dist/metrics.json"), "utf8")
);
const scoresDoc = JSON.parse(
  readFileSync(join(__dirname, "../../data/dist/scores.json"), "utf8")
);

describe("생성 월세 번들 계약", () => {
  it("556개 동 모두 15조합×2모드를 갖고 번들 기준 3종 환산값이 가격점수와 같다", () => {
    expect(bundle.dongs).toHaveLength(556);
    expect(bundle.meta.rentPeriod).toMatchObject({
      startDate: "20230101",
      endDate: "20251231",
      contractType: "신규",
      defaultTypes: ["house", "officetel", "apartment"],
      seoul: { records: 519_176, duplicatesRemoved: 150_582, invalidLocation: 2 },
      gyeonggi: { records: 130_565 },
    });
    expect(bundle.meta.rentPeriod.gyeonggi.calls).toBeGreaterThanOrEqual(1_296);
    expect(scoresDoc.rentPeriod).toEqual(metrics.rentPeriod);
    expect(bundle.meta.rentPeriod).toEqual(metrics.rentPeriod);

    for (const score of Object.values(bundle.scores) as DongScore[]) {
      expect(Object.keys(score.rentVariants?.converted ?? {}).sort()).toEqual(
        [...RENT_COMBO_KEYS].sort()
      );
      expect(Object.keys(score.rentVariants?.raw ?? {}).sort()).toEqual(
        [...RENT_COMBO_KEYS].sort()
      );
      const base = score.rentVariants?.converted["house+officetel+apartment"];
      expect(base?.medianMan).toBe(score.raw.monthlyRentMan);
      expect(base?.pct).toBe(score.price);
    }
  });

  it("빈 URL의 기본값인 단독·다가구 환산월세를 실제 가격점수에 적용한다", () => {
    const scores = new Map<string, DongScore>(Object.entries(bundle.scores));
    const target = bundle.dongs.find((dong: { dong: string }) => dong.dong === "문정1동");
    const selectedScores = applyRentSelection(scores, DEFAULT_RENT_SELECTION);
    const selectedScore = selectedScores.get(target.code)!;
    const variant = selectedRentVariant(selectedScore, DEFAULT_RENT_SELECTION)!;

    expect(DEFAULT_RENT_SELECTION).toEqual({ types: ["house"], mode: "converted" });
    expect(variant).toMatchObject({ medianMan: 59.58, samples: 312, pct: 16.1 });
    expect(selectedScore.price).toBe(16.1);
  });

  it("문정역·문정1동에서 단독·다가구 순수월세 선택이 점수·등급·요약에 함께 반영된다", () => {
    const scores = new Map<string, DongScore>(Object.entries(bundle.scores));
    const target = bundle.dongs.find((dong: { dong: string }) => dong.dong === "문정1동");
    expect(target).toBeDefined();

    const selection: RentSelection = { types: ["house"], mode: "raw" };
    const selectedScores = applyRentSelection(scores, selection);
    const selectedScore = selectedScores.get(target.code)!;
    const variant = selectedRentVariant(selectedScore, selection)!;
    const commute = computeMultiCommute(
      bundle.graph,
      bundle.dongs,
      [{ lat: 37.48603, lng: 127.12248 }],
      bundle.bus,
      bundle.residential
    );
    const commuteMin = new Map<string, number | null>();
    for (const [code, result] of commute.byDong) commuteMin.set(code, result.worstMin);
    const graded = gradeAll(selectedScores, DEFAULT_WEIGHTS, commuteMin);
    const grade = graded.byDong.get(target.code)!;
    const summary = summarize(
      selectedScore,
      bundle.pctKeys,
      grade.grade,
      DEFAULT_WEIGHTS,
      bundle.axisWeights,
      { monthlyRentMan: { pct: variant.pct, value: variant.medianMan } }
    );

    expect(commute.byDong.get(target.code)?.worstMin).toBeCloseTo(14.7, 1);
    expect(variant).toMatchObject({ medianMan: 50, samples: 312, pct: 25.7 });
    expect(selectedScore.price).toBe(25.7);
    expect(grade.score).toBeCloseTo(51.555, 3);
    expect(grade.rank).toBe(55);
    expect(grade.total).toBe(556);
    expect(grade.grade).toBe("best");
    expect(summary).toContain("50만원");
  });
});
