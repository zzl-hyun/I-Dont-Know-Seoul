import type { DongScore, Grade, Weights } from "../types";
import {
  COMMUTE_DECAY_POWER,
  COMMUTE_DECAY_WIDTH_MIN,
  COMMUTE_FREE_MIN,
  GRADE_CUT,
} from "./constants";

/**
 * 가중합으로 종합 점수를 낸다.
 *
 * 각 축은 이미 대상 556개 동 내 백분위(0~100)라서 단위가 통일되어 있고,
 * 여기서는 곱셈과 덧셈만 하면 된다. 그래서 사용자가 가중치 슬라이더를
 * 움직여도 서버 왕복 없이 즉시 재계산된다 (556회 곱셈 — 사실상 즉시).
 */
/**
 * compositeScore 가 실제로 읽는 것. 원지표(raw)나 백분위(pct)까지 갖춘
 * DongScore 를 요구하면, 축 점수만 들고 있는 쪽(랜딩의 가중치 데모)이
 * 쓸 데 없는 필드를 지어내야 한다.
 */
export type AxisScores = Pick<DongScore, "safety" | "price" | "convenience">;

export function compositeScore(score: AxisScores, w: Weights): number {
  return (
    score.safety * w.safety +
    score.price * w.price +
    score.convenience * w.convenience
  );
}

/**
 * 통근시간 페널티 Φ(t) — 종합 점수에 곱하는 비보상적 감쇠. 상수·근거는
 * `constants.ts` 참고.
 *
 * `min === null` 은 이 함수 안에서는 "통근 제약이 없다"(Φ=1, 감점 없음)는
 * 뜻으로만 처리한다 — 목적지를 아직 안 고른 경우가 여기 해당한다.
 *
 * "목적지는 있는데 그 동에서 아예 도달이 안 되는" 경우도 통근시간이 없다는
 * 점에서 신호로는 `null`과 똑같지만, 뜻은 정반대다(Φ=0 이어야 한다). 이 함수는
 * 그 둘을 구분할 방법이 없다 — 그래서 구분 책임을 호출부로 넘긴다: 목적지
 * 미선택이면 호출부가 이 함수를 아예 안 부르고(또는 이 함수의 기본값인 1을
 * 그대로 쓰고), 도달 불가면 호출부가 `commutePenalty(null)` 을 부르는 대신
 * 0을 직접 대입한다. `gradeAll` 이 그 경계를 나누는 실제 코드다.
 */
export function commutePenalty(min: number | null): number {
  if (min === null) return 1;
  if (min <= COMMUTE_FREE_MIN) return 1;
  const x = (min - COMMUTE_FREE_MIN) / COMMUTE_DECAY_WIDTH_MIN;
  return 1 / (1 + Math.pow(x, COMMUTE_DECAY_POWER));
}

/**
 * 종합 점수를 Best/Normal/Bad로 나눈다.
 *
 * 절대 컷(예: 70점 이상 Best)이 아니라 **대상 지역 전체 분포 기준 상대 컷**을 쓴다.
 * 가중치를 바꾸면 점수 분포 자체가 통째로 이동하기 때문에, 절대 컷으로는
 * "가격 100%"로 놓는 순간 대부분이 한 등급으로 몰려 지도가 무의미해진다.
 *
 * @param scores 전체 동의 점수 (분포 기준을 잡기 위해 필요)
 * @param commuteMin 동 코드 → worstMin(가장 나쁜 목적지까지 통근시간, 분).
 *   생략(`undefined`)하면 기존과 완전히 동일하게 동작한다(회귀 없음) — 목적지를
 *   아직 안 고른 화면이 이 경로를 탄다. 넘기면 각 동의 종합 점수에
 *   `commutePenalty` 를 곱해 정렬·등급을 매긴다. **등급 컷의 기준 모집단은
 *   여전히 556개 동 전체다** — 통근 가능한 동만 추려 상대평가하지 않는다.
 *   맵에 값이 있는데 `null`이면 그 동에서 목적지 도달이 아예 불가능하다는
 *   뜻이라 페널티를 `commutePenalty(null)`(=1, "제약 없음")이 아니라 **0을
 *   직접 대입**해 처리한다 — 도달 불가능한 곳을 다른 축 점수로 상쇄해
 *   추천하지 않기 위해서다. 자연히 점수가 0에 수렴해 하위권/Bad로 몰린다.
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

export function gradeAll(
  scores: Map<string, DongScore>,
  w: Weights,
  commuteMin?: Map<string, number | null>
): GradeResult {
  const entries = [...scores.entries()].map(([code, s]) => {
    const base = compositeScore(s, w);
    if (!commuteMin) return { code, score: base };
    // map에 있는데 값이 null(또는 아예 없는 동) = 도달 불가 → 0을 직접 대입한다.
    // commutePenalty(null)을 호출하지 않는 이유는 위 JSDoc과 commutePenalty 참고.
    const t = commuteMin.get(code) ?? null;
    const penalty = t === null ? 0 : commutePenalty(t);
    return { code, score: base * penalty };
  });

  // 점수 높은 순 정렬 → 순위로 등급을 가른다.
  // 동점이면 동 코드 오름차순으로 가른다 — 명시하지 않으면 JS 엔진이
  // 객체 키를 정수처럼 재정렬하는 특성에 우연히 기대게 되어(동 코드가
  // 전부 숫자 문자열이라 실제로 그렇게 되어 있었다), 데이터 소스가
  // 조금만 달라져도 동점 처리가 조용히 바뀔 수 있었다.
  entries.sort((a, b) => b.score - a.score || a.code.localeCompare(b.code));

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
