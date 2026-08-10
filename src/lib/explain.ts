import type {
  AxisName,
  AxisWeight,
  DongScore,
  Grade,
  MetricKey,
  Weights,
} from "../types";

/**
 * 등급의 근거를 설명하는 모듈.
 *
 * 이 앱의 점수는 `원지표 → 서울 내 백분위 → 축 점수 → 가중합 → 상대 컷` 순으로
 * 만들어진다. 화면에 축 점수만 보여주면 그 사슬이 통째로 숨어서, 사용자는
 * 숫자가 무엇을 뜻하는지 알 수 없고 때로는 버그로 오해한다.
 *
 * 대표 사례: 관악구 신림동은 유흥업소가 **0개/km² 인데 치안 점수가 77.6** 이다.
 * 서울 동의 상당수가 0개라 동점 평균 순위가 매겨진 결과인데, 설명이 없으면
 * "0개인데 왜 100점이 아니지?" 가 된다. 여기서 그 맥락을 만들어낸다.
 *
 * 전부 규칙 기반이라 출력이 예측 가능하고 테스트로 고정할 수 있다.
 */

/* ------------------------------------------------------------------ */
/* 분포 통계                                                           */
/* ------------------------------------------------------------------ */

export interface MetricDistribution {
  median: number;
  p10: number;
  p90: number;
  /** 값이 있는 동의 수 */
  n: number;
  /** 값 → 그 값을 가진 동의 수. 동점 비율을 O(1)로 얻기 위한 것 */
  counts: Map<number, number>;
}

/**
 * 지표별 서울 전체 분포를 구한다.
 *
 * 파이프라인에서 미리 계산해 번들에 싣지 않는 이유: 모든 동의 원지표가 이미
 * 번들에 있으므로 여기서 한 번 만들면 되고, 같은 통계를 양쪽에 두면 언젠가
 * 어긋난다. 427개 × 6지표 정렬은 1ms 미만이다.
 */
export function buildDistributions(
  scores: Map<string, DongScore>,
  keys: MetricKey[]
): Map<MetricKey, MetricDistribution> {
  const out = new Map<MetricKey, MetricDistribution>();

  for (const key of keys) {
    const values: number[] = [];
    const counts = new Map<number, number>();
    for (const s of scores.values()) {
      const v = s.raw[key];
      if (typeof v !== "number" || !Number.isFinite(v)) continue;
      values.push(v);
      counts.set(v, (counts.get(v) ?? 0) + 1);
    }
    if (values.length === 0) continue;
    values.sort((a, b) => a - b);
    const at = (q: number) => values[Math.min(values.length - 1, Math.floor(values.length * q))];
    out.set(key, {
      median: at(0.5),
      p10: at(0.1),
      p90: at(0.9),
      n: values.length,
      counts,
    });
  }
  return out;
}

/** 이 값과 똑같은 값을 가진 동의 비율 (0~1). 동점 때문에 백분위가 튀는 걸 설명한다. */
export function sameValueShare(dist: MetricDistribution, value: number): number {
  return (dist.counts.get(value) ?? 0) / dist.n;
}

/* ------------------------------------------------------------------ */
/* 지표 표시 정보                                                      */
/* ------------------------------------------------------------------ */

interface MetricCopy {
  /** 화면에 쓰는 짧은 이름 */
  label: string;
  /** 값 포맷 (단위 포함) */
  format: (v: number) => string;
  /**
   * 요약 문장 조각 — 연결형 / 역접형 / 종결형.
   * `{v}` 를 쓰면 그 자리에 실제 수치가 들어간다. 수치 자체가 설득력을 갖는
   * 지표(월세)에만 쓴다 — 전부 넣으면 문장이 숫자로 뒤덮인다.
   */
  positive: Fragment;
  negative: Fragment;
}

interface Fragment {
  conn: string;
  but: string;
  end: string;
}

const METRIC_COPY: Record<MetricKey, MetricCopy> = {
  monthlyRentMan: {
    label: "환산월세",
    format: (v) => `${Math.round(v)}만원`,
    positive: {
      conn: "월세가 {v}으로 싸고",
      but: "월세는 {v}으로 싸지만",
      end: "월세가 {v}으로 쌉니다",
    },
    negative: {
      conn: "월세가 {v}으로 비싸고",
      but: "월세는 {v}으로 비싸지만",
      end: "월세가 {v}으로 비쌉니다",
    },
  },
  nightlifePerKm2: {
    label: "유흥업소 밀도",
    format: (v) => `${fmt(v)}개/km²`,
    positive: {
      conn: "유흥업소가 거의 없고",
      but: "유흥업소는 거의 없지만",
      end: "유흥업소가 거의 없습니다",
    },
    negative: {
      conn: "유흥업소가 밀집해 있고",
      but: "유흥업소가 밀집해 있지만",
      end: "유흥업소가 밀집해 있습니다",
    },
  },
  storePerKm2: {
    label: "편의점·마트 밀도",
    format: (v) => `${fmt(v)}개/km²`,
    positive: {
      conn: "편의점·마트가 많고",
      but: "편의점·마트는 많지만",
      end: "편의점·마트가 많습니다",
    },
    negative: {
      conn: "편의점·마트가 적고",
      but: "편의점·마트는 적지만",
      end: "편의점·마트가 적습니다",
    },
  },
  foodPerKm2: {
    label: "음식점 밀도",
    format: (v) => `${fmt(v)}개/km²`,
    positive: { conn: "음식점이 많고", but: "음식점은 많지만", end: "음식점이 많습니다" },
    negative: { conn: "음식점이 적고", but: "음식점은 적지만", end: "음식점이 적습니다" },
  },
  medicalPerKm2: {
    label: "병원·약국 밀도",
    format: (v) => `${fmt(v)}개/km²`,
    positive: {
      conn: "병원·약국이 가깝고",
      but: "병원·약국은 가깝지만",
      end: "병원·약국이 가깝습니다",
    },
    negative: {
      conn: "병원·약국이 드물고",
      but: "병원·약국은 드물지만",
      end: "병원·약국이 드뭅니다",
    },
  },
  walkToStationMin: {
    label: "최근접역 도보",
    format: (v) => `도보 ${Math.round(v)}분`,
    positive: { conn: "역이 가깝고", but: "역은 가깝지만", end: "역이 가깝습니다" },
    negative: { conn: "역이 멀고", but: "역은 멀지만", end: "역이 멉니다" },
  },
  busStopPerKm2: {
    label: "버스 정류장 밀도",
    format: (v) => `${fmt(v)}개/km²`,
    positive: {
      conn: "버스 정류장이 많고",
      but: "버스 정류장은 많지만",
      end: "버스 정류장이 많습니다",
    },
    negative: {
      conn: "버스 정류장이 적고",
      but: "버스 정류장은 적지만",
      end: "버스 정류장이 적습니다",
    },
  },
  cctvPerKm2: {
    label: "CCTV 밀도",
    format: (v) => `${fmt(v)}대/km²`,
    positive: { conn: "CCTV가 많고", but: "CCTV는 많지만", end: "CCTV가 많습니다" },
    negative: { conn: "CCTV가 적고", but: "CCTV는 적지만", end: "CCTV가 적습니다" },
  },
  crimePer1k: {
    label: "5대범죄",
    format: (v) => `${v.toFixed(1)}건/천명`,
    positive: { conn: "범죄가 적고", but: "범죄는 적지만", end: "범죄가 적습니다" },
    negative: { conn: "범죄가 많고", but: "범죄는 많지만", end: "범죄가 많습니다" },
  },
  trafficAccidentPerKm2: {
    label: "교통사고 다발지역",
    format: (v) => `${fmt(v)}건/km²`,
    positive: {
      conn: "교통사고 다발지점이 적고",
      but: "교통사고 다발지점은 적지만",
      end: "교통사고 다발지점이 적습니다",
    },
    negative: {
      conn: "교통사고 다발지점이 많고",
      but: "교통사고 다발지점은 많지만",
      end: "교통사고 다발지점이 많습니다",
    },
  },
};

export const metricLabel = (key: MetricKey) => METRIC_COPY[key].label;
export const formatMetric = (key: MetricKey, v: number) => METRIC_COPY[key].format(v);

/* ------------------------------------------------------------------ */
/* 요약 문장                                                           */
/* ------------------------------------------------------------------ */

/**
 * 요약 문장에 넣을지 가르는 백분위 문턱.
 * 백분위는 이미 방향이 보정된 값이라(월세는 쌀수록 높음) 클수록 좋다.
 * 38~62 구간은 "서울 평균과 비슷"이라 할 말이 없으므로 문장에서 뺀다.
 */
const WEAK_GOOD = 62;
const WEAK_BAD = 38;

interface Candidate {
  key: MetricKey;
  pct: number;
  /** 문장에 넣을 우선순위 — 극단성 × 그 지표가 최종 점수에 갖는 영향력 */
  weightedStrength: number;
  good: boolean;
}

/**
 * "왜 이 등급인지"를 한 문장으로 만든다.
 *
 * 백분위가 극단인 지표를 최대 3개 골라 조립한다. 좋은 점만 나열하면 광고가
 * 되고 나쁜 점만 나열하면 낙인이 되므로, 양쪽이 다 있으면 섞어서 쓴다.
 * 등급이 Bad면 부정 요인을 먼저 보여준다 — 사용자가 실제로 궁금해하는 건
 * "왜 낮은지" 이기 때문이다.
 *
 * 고를 때 극단성만 보면 안 된다. 신림동은 병원 밀도가 상위 11%, 월세가 상위
 * 29%인데, 극단성만으로 뽑으면 "병원·약국이 가깝고" 가 먼저 나오고 정작
 * 자취방을 찾는 사람에게 제일 중요한 월세가 밀린다. 그래서 극단성에
 * **그 지표가 최종 점수에 실제로 기여하는 비중**(사용자 축 가중치 × 축 내
 * 지표 가중치)을 곱해 우선순위를 정한다. 가중치 슬라이더를 움직이면 요약
 * 문장도 따라 바뀌는데, 그게 맞는 동작이다.
 */
export function summarize(
  score: DongScore,
  pctKeys: MetricKey[],
  grade: Grade,
  weights: Weights,
  axisWeights: Record<AxisName, AxisWeight[]>
): string {
  // 지표 → 최종 점수 기여 비중
  const influence = new Map<MetricKey, number>();
  for (const axis of ["safety", "price", "convenience"] as AxisName[]) {
    for (const aw of axisWeights[axis] ?? []) {
      influence.set(aw.key, weights[axis] * aw.w);
    }
  }

  const cands: Candidate[] = [];
  pctKeys.forEach((key, i) => {
    const p = score.pct[i];
    if (p == null) return;
    if (p < WEAK_GOOD && p > WEAK_BAD) return; // 서울 평균과 비슷 — 할 말이 없다
    cands.push({
      key,
      pct: p,
      weightedStrength: Math.abs(p - 50) * (influence.get(key) ?? 0),
      good: p >= WEAK_GOOD,
    });
  });

  if (cands.length === 0) {
    return "서울 평균과 크게 다르지 않은 지역입니다.";
  }

  cands.sort((a, b) => b.weightedStrength - a.weightedStrength);
  const goods = cands.filter((c) => c.good);
  const bads = cands.filter((c) => !c.good);

  // Bad 등급이면 부정 요인을 앞에 둔다 — 사용자가 궁금한 건 "왜 낮은지"다.
  const [primary, secondary] = grade === "bad" ? [bads, goods] : [goods, bads];

  // 최대 3개. 양쪽이 다 있으면 주 2 + 반대 1 로 섞어 균형을 맞춘다.
  const head = primary.slice(0, secondary.length > 0 ? 2 : 3);
  const tail = secondary.slice(0, head.length < 3 && secondary.length > 0 ? 1 : 0);

  const parts: string[] = [];
  const push = (c: Candidate, form: keyof Fragment) => {
    const copy = METRIC_COPY[c.key];
    const frag = c.good ? copy.positive : copy.negative;
    parts.push(withValue(frag[form], c, score));
  };

  head.forEach((c, i) => {
    const last = i === head.length - 1;
    push(c, !last ? "conn" : tail.length > 0 ? "but" : "end");
  });
  tail.forEach((c, i) => push(c, i === tail.length - 1 ? "end" : "conn"));

  // 역접이 들어가는 자리에만 쉼표를 넣는다
  const body =
    tail.length > 0
      ? parts.slice(0, head.length).join(" ") + ", " + parts.slice(head.length).join(" ")
      : parts.join(" ");
  return body + ".";
}

/** 조각의 `{v}` 자리에 실제 수치를 넣는다. 값이 없으면 자리표시자를 지운다. */
function withValue(text: string, c: Candidate, score: DongScore): string {
  if (!text.includes("{v}")) return text;
  const v = score.raw[c.key];
  if (typeof v !== "number") return text.replace(/\s*\{v\}으?로?\s*/, " ");
  return text.replace("{v}", METRIC_COPY[c.key].format(v));
}

/* ------------------------------------------------------------------ */
/* 계산 과정                                                           */
/* ------------------------------------------------------------------ */

export interface MetricExplanation {
  key: MetricKey;
  label: string;
  /** 이 동의 값 (포맷된 문자열) */
  value: string;
  rawValue: number | null;
  /** 서울 중앙값 (포맷된 문자열) */
  median: string;
  /** 이 동의 백분위 (0~100, 방향 보정 후) */
  pct: number | null;
  /** 축 점수에 곱해지는 가중치 */
  weight: number;
  /** 같은 값을 가진 동의 비율 — 0.1 이상이면 동점 때문에 백분위가 뭉친 것 */
  tiedShare: number;
  /** 높을수록 좋은 지표인지 */
  higherIsBetter: boolean;
}

export interface AxisExplanation {
  axis: AxisName;
  score: number;
  metrics: MetricExplanation[];
  /** 지표가 하나뿐이면 축 점수가 곧 그 지표의 백분위다 */
  singleMetric: boolean;
}

export function explainAxis(
  axis: AxisName,
  score: DongScore,
  pctKeys: MetricKey[],
  axisWeights: AxisWeight[],
  dists: Map<MetricKey, MetricDistribution>
): AxisExplanation {
  const metrics: MetricExplanation[] = axisWeights.map((aw) => {
    const idx = pctKeys.indexOf(aw.key);
    const rawValue = (score.raw[aw.key] ?? null) as number | null;
    const dist = dists.get(aw.key);
    return {
      key: aw.key,
      label: aw.label,
      value: rawValue == null ? "데이터 없음" : formatMetric(aw.key, rawValue),
      rawValue,
      median: dist ? formatMetric(aw.key, dist.median) : "—",
      pct: idx >= 0 ? score.pct[idx] : null,
      weight: aw.w,
      tiedShare: dist && rawValue != null ? sameValueShare(dist, rawValue) : 0,
      higherIsBetter: aw.dir > 0,
    };
  });

  return {
    axis,
    score: score[axis],
    metrics,
    singleMetric: metrics.length === 1,
  };
}

/** 종합 점수 계산식 — "75.2 = 78×0.40 + 71×0.35 + 77×0.25" */
export interface CompositeExplanation {
  total: number;
  terms: Array<{ axis: AxisName; label: string; score: number; weight: number; contribution: number }>;
  /** 이 가중치에서 Best/Normal 을 가르는 종합 점수 */
  bestCut: number;
  normalCut: number;
  grade: Grade;
  rank: number;
  totalDongs: number;
}

const AXIS_LABEL: Record<AxisName, string> = {
  safety: "치안",
  price: "가격",
  convenience: "생활편의",
};

export function explainComposite(
  score: DongScore,
  weights: Weights,
  grade: Grade,
  rank: number,
  totalDongs: number,
  cuts: { best: number; normal: number }
): CompositeExplanation {
  const axes: AxisName[] = ["safety", "price", "convenience"];
  const terms = axes.map((axis) => ({
    axis,
    label: AXIS_LABEL[axis],
    score: score[axis],
    weight: weights[axis],
    contribution: score[axis] * weights[axis],
  }));
  return {
    total: terms.reduce((s, t) => s + t.contribution, 0),
    terms,
    bestCut: cuts.best,
    normalCut: cuts.normal,
    grade,
    rank,
    totalDongs,
  };
}

/* ------------------------------------------------------------------ */

/** 백분위를 사람 말로 — "상위 8%" / "하위 12%" */
export function pctPhrase(pct: number): string {
  const top = 100 - pct;
  return top <= 50 ? `상위 ${Math.max(1, Math.round(top))}%` : `하위 ${Math.round(pct)}%`;
}

const fmt = (v: number) => (v >= 100 ? v.toFixed(0) : v >= 10 ? v.toFixed(1) : v.toFixed(2));
