import type { DongScore, Grade, Weights } from "../types";
import { GRADE_CUT } from "./constants";

/**
 * 가중합으로 종합 점수를 낸다.
 *
 * 각 축은 이미 서울 427개 동 내 백분위(0~100)라서 단위가 통일되어 있고,
 * 여기서는 곱셈과 덧셈만 하면 된다. 그래서 사용자가 가중치 슬라이더를
 * 움직여도 서버 왕복 없이 즉시 재계산된다 (427회 곱셈 ≈ 0.01ms).
 */
export function compositeScore(score: DongScore, w: Weights): number {
  return (
    score.safety * w.safety +
    score.price * w.price +
    score.convenience * w.convenience
  );
}

/**
 * 종합 점수를 Best/Normal/Bad로 나눈다.
 *
 * 절대 컷(예: 70점 이상 Best)이 아니라 **서울 전체 분포 기준 상대 컷**을 쓴다.
 * 가중치를 바꾸면 점수 분포 자체가 통째로 이동하기 때문에, 절대 컷으로는
 * "가격 100%"로 놓는 순간 대부분이 한 등급으로 몰려 지도가 무의미해진다.
 *
 * @param scores 전체 동의 점수 (분포 기준을 잡기 위해 필요)
 */
export interface GradeInfo {
  score: number;
  grade: Grade;
  rank: number;
  total: number;
}

export interface GradeResult {
  byDong: Map<string, GradeInfo>;
  /**
   * 등급을 가르는 **종합 점수**. 가중치를 바꾸면 점수 분포가 통째로 이동하므로
   * 이 값도 함께 움직인다. "68.4점 이상이면 Best" 처럼 컷을 화면에 보여주려면
   * 순위가 아니라 이 점수가 필요하다.
   */
  cuts: { best: number; normal: number };
}

export function gradeAll(scores: Map<string, DongScore>, w: Weights): GradeResult {
  const entries = [...scores.entries()].map(([code, s]) => ({
    code,
    score: compositeScore(s, w),
  }));

  // 점수 높은 순 정렬 → 순위로 등급을 가른다
  entries.sort((a, b) => b.score - a.score);

  const total = entries.length;
  const bestCut = Math.round(total * GRADE_CUT.best);
  const normalCut = Math.round(total * GRADE_CUT.normal);

  const byDong = new Map<string, GradeInfo>();
  entries.forEach((e, i) => {
    const grade: Grade = i < bestCut ? "best" : i < normalCut ? "normal" : "bad";
    byDong.set(e.code, { score: e.score, grade, rank: i + 1, total });
  });

  return {
    byDong,
    cuts: {
      best: entries[Math.min(total - 1, bestCut)]?.score ?? 0,
      normal: entries[Math.min(total - 1, normalCut)]?.score ?? 0,
    },
  };
}

/** 가중치 하나를 바꿀 때 나머지를 비례 조정해 합을 1로 유지한다. */
export function rebalanceWeights(
  current: Weights,
  key: keyof Weights,
  value: number
): Weights {
  const v = Math.min(1, Math.max(0, value));
  const others = (Object.keys(current) as (keyof Weights)[]).filter(
    (k) => k !== key
  );
  const otherSum = others.reduce((s, k) => s + current[k], 0);
  const remaining = 1 - v;

  const next = { ...current, [key]: v } as Weights;
  if (otherSum === 0) {
    // 나머지가 전부 0이면 균등 분배 외에 답이 없다
    for (const k of others) next[k] = remaining / others.length;
  } else {
    for (const k of others) next[k] = (current[k] / otherSum) * remaining;
  }
  return next;
}

/** 0~100 백분위를 5칸 막대로 (▓▓▓░░) */
export function scoreBar(v: number, width = 5): string {
  const filled = Math.round((v / 100) * width);
  return "▓".repeat(filled) + "░".repeat(width - filled);
}
