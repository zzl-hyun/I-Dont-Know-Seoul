import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { AxisName, AxisWeight, DongMeta, DongScore, MetricKey, Grade } from "../types";
import {
  buildDistributions,
  sameValueShare,
  summarize,
  explainAxis,
  explainComposite,
  pctPhrase,
} from "./explain";
import { gradeAll } from "./score";
import { DEFAULT_WEIGHTS } from "./constants";

const bundle: {
  pctKeys: MetricKey[];
  axisWeights: Record<AxisName, AxisWeight[]>;
  dongs: DongMeta[];
  scores: Record<string, DongScore>;
} = JSON.parse(
  readFileSync(join(__dirname, "../../public/data/bundle.json"), "utf8")
);

const scores = new Map(Object.entries(bundle.scores));
const W = { ...DEFAULT_WEIGHTS };
const dists = buildDistributions(scores, bundle.pctKeys);

const dongByName = (gu: string, dong: string) => {
  const d = bundle.dongs.find((x) => x.gu === gu && x.dong === dong);
  if (!d) throw new Error(`동을 찾을 수 없음: ${gu} ${dong}`);
  return { meta: d, score: bundle.scores[d.code] };
};

describe("번들에 설명용 데이터가 실려 있다", () => {
  it("pctKeys 와 각 동의 pct 길이가 맞는다", () => {
    expect(bundle.pctKeys.length).toBeGreaterThan(0);
    for (const s of scores.values()) {
      expect(s.pct).toHaveLength(bundle.pctKeys.length);
    }
  });

  it("축 내부 가중치의 합이 1이다", () => {
    for (const [axis, ws] of Object.entries(bundle.axisWeights)) {
      if (ws.length === 0) continue;
      const sum = ws.reduce((s, w) => s + w.w, 0);
      expect(sum, `${axis} 가중치 합`).toBeCloseTo(1, 2);
    }
  });

  it("축 점수가 하위 지표 백분위의 가중합과 일치한다", () => {
    // 계산 과정을 화면에 보여줄 것이므로, 보여주는 식과 실제 점수가 어긋나면 안 된다.
    //
    // 허용 오차 0.1은 화면 표시를 위해 소수 1자리로 반올림해 저장하는
    // pct·축점수 각각에서 최대 0.05씩 생기는 반올림 오차다(가중치 자체는
    // 4-score.mjs가 반올림 없이 저장하므로 그쪽에서는 오차가 없다 —
    // 예전엔 가중치도 소수 3자리로 반올림해서 저장했는데, 축이 3개
    // 이상이면 합이 1에서 벗어나 최대 0.15점까지 어긋났었다. 그때 이
    // 테스트의 허용 오차가 0.5로 느슨해서 그 오차를 못 잡고 있었다).
    const TOLERANCE = 0.1;
    for (const [axis, ws] of Object.entries(bundle.axisWeights)) {
      if (ws.length === 0) continue;
      for (const [, s] of scores) {
        const expected = ws.reduce((acc, w) => {
          const i = bundle.pctKeys.indexOf(w.key);
          return acc + (s.pct[i] ?? 50) * w.w;
        }, 0);
        const actual = s[axis as "safety"];
        expect(Math.abs(actual - expected), `${axis}: ${actual} vs ${expected}`).toBeLessThan(
          TOLERANCE
        );
      }
    }
  });
});

describe("치안 축 — 5대범죄·교통사고 보강", () => {
  it("같은 자치구에 속한 동들은 crimePer1k 가 동일하다", () => {
    // 5대범죄는 자치구 단위 CSV를 조인해서 채운다. 조인이 깨지면(예: 정부
    // CSV 특유의 트레일링 \r 때문에 마지막 자치구만 값이 안 붙는 식으로)
    // 같은 구 안에서 동마다 값이 달라지거나 null 이 섞이는데, 이 테스트가
    // 그걸 잡아준다.
    const byGu = new Map<string, Set<number | null>>();
    for (const d of bundle.dongs) {
      const raw = bundle.scores[d.code]?.raw.crimePer1k ?? null;
      if (!byGu.has(d.gu)) byGu.set(d.gu, new Set());
      byGu.get(d.gu)!.add(raw);
    }
    for (const [gu, values] of byGu) {
      expect(values.size, `${gu} 안에서 crimePer1k 값이 갈림`).toBe(1);
    }
  });

  it("모든 동에 crimePer1k, trafficAccidentPerKm2 값이 있다", () => {
    // toBeNull() 만 쓰면 4-score.mjs 의 raw 객체 리터럴에 필드를 안 넣어
    // undefined 가 나오는 실수를 못 잡는다(undefined !== null 이라 통과해
    // 버린다) — toBeTypeOf("number")로 실제로 값이 있는지까지 확인한다.
    for (const d of bundle.dongs) {
      const raw = bundle.scores[d.code]!.raw;
      expect(raw.crimePer1k, d.name).toBeTypeOf("number");
      expect(raw.trafficAccidentPerKm2, d.name).toBeTypeOf("number");
    }
  });

  it("AXES 에 있는 모든 지표 키가 raw 객체에도 실린다", () => {
    // 4-score.mjs 의 raw 객체 리터럴은 AXES 와 별개로 손으로 나열한
    // 목록이라, 새 지표를 AXES 에는 추가하고 여기 안 넣는 실수가 가능하다
    // (trafficAccidentPerKm2 를 실제로 이렇게 빠뜨렸었다). pctKeys 는
    // AXES 에서 실제로 쓰인 지표 키 전체이므로 이걸 기준으로 순회한다.
    const sample = bundle.scores[bundle.dongs[0].code]!.raw;
    for (const key of bundle.pctKeys) {
      expect(Object.hasOwn(sample, key), key).toBe(true);
    }
  });
});

describe("교통 접근성 — 지하철 + 버스", () => {
  const transitKeys = ["walkToStationMin", "busStopPerKm2"] as const;

  it("교통 두 지표의 합이 0.25 이고 지하철이 더 무겁다", () => {
    const w = Object.fromEntries(
      bundle.axisWeights.convenience.map((x) => [x.key, x.w])
    );
    const subway = w.walkToStationMin;
    const bus = w.busStopPerKm2;
    expect(subway + bus, "교통 총합").toBeCloseTo(0.25, 3);
    // 통근 계산 자체가 지하철만 쓰므로 버스는 보완재다
    expect(subway).toBeGreaterThan(bus);
    expect(subway / (subway + bus)).toBeCloseTo(0.7, 2);
  });

  it("모든 동에 버스 정류장 밀도 값이 있다", () => {
    for (const [, s] of scores) {
      expect(typeof s.raw.busStopPerKm2).toBe("number");
    }
  });

  it("역이 멀어도 버스가 촘촘하면 편의 점수가 보완된다", () => {
    // 이 지표를 넣은 이유가 바로 이것이다 — 역 소외 지역의 편향 교정
    const far = bundle.dongs
      .map((d) => ({ d, s: bundle.scores[d.code] }))
      .filter((x) => (x.s.raw.walkToStationMin ?? 0) >= 15);
    expect(far.length).toBeGreaterThan(50);

    const busRich = [...far].sort(
      (a, b) => (b.s.raw.busStopPerKm2 ?? 0) - (a.s.raw.busStopPerKm2 ?? 0)
    );
    const top5 = busRich.slice(0, 5);
    const bottom5 = busRich.slice(-5);
    const avg = (xs: typeof top5) =>
      xs.reduce((s, x) => s + x.s.convenience, 0) / xs.length;

    // 역 접근성이 비슷하게 나쁜 동들끼리 비교하면, 버스가 촘촘한 쪽이 높아야 한다
    expect(avg(top5)).toBeGreaterThan(avg(bottom5));
  });

  for (const key of transitKeys) {
    it(`${key} 가 pctKeys 에 실린다`, () => {
      expect(bundle.pctKeys).toContain(key);
    });
  }
});

describe("동점 때문에 백분위가 뭉치는 것을 설명할 수 있다", () => {
  it("유흥업소 0개인 동도 동점 평균 순위 때문에 100점이 아니다", () => {
    const zeroDong = bundle.dongs.find(
      (d) => bundle.scores[d.code].raw.nightlifePerKm2 === 0
    );
    expect(zeroDong, "유흥업소 0개인 동이 없음").toBeDefined();
    const score = bundle.scores[zeroDong!.code];

    const dist = dists.get("nightlifePerKm2")!;
    const tied = sameValueShare(dist, 0);

    // 서울 동의 상당수가 0개라서 동점 평균 순위가 매겨진다.
    // 이 비율이 없으면 "0개인데 왜 100점이 아니지?" 를 설명할 방법이 없다.
    expect(tied).toBeGreaterThan(0.2);

    const i = bundle.pctKeys.indexOf("nightlifePerKm2");
    expect(score.pct[i]).toBeLessThan(100);
    expect(score.pct[i]).toBeGreaterThan(50);
    // 치안 축 자체는 유흥업소·5대범죄·교통사고 세 지표의 가중합이라 이
    // 지표 백분위 하나와 축 점수가 같지 않다 — 그건 위 "축 점수가 하위
    // 지표 백분위의 가중합과 일치한다" 테스트가 이미 모든 동에 대해 검증한다.
  });

  it("유흥업소 밀도는 427개 동에서 유효한 비음수 값이다", () => {
    const values = bundle.dongs.map(
      (d) => bundle.scores[d.code].raw.nightlifePerKm2
    );
    expect(values).toHaveLength(427);
    expect(values.every((v) => typeof v === "number" && Number.isFinite(v) && v >= 0)).toBe(true);
    expect(values.filter((v) => (v ?? 0) > 0).length).toBeGreaterThan(200);
  });
});

describe("요약 문장", () => {
  const grades = gradeAll(scores, { ...DEFAULT_WEIGHTS }).byDong;

  it("모든 동에서 문장이 만들어진다", () => {
    for (const d of bundle.dongs) {
      const s = bundle.scores[d.code];
      const g = grades.get(d.code)!;
      const text = summarize(s, bundle.pctKeys, g.grade, W, bundle.axisWeights);
      expect(text.length, `${d.name} 요약이 비었음`).toBeGreaterThan(5);
      expect(text.endsWith("다.") || text.endsWith("."), `${d.name}: ${text}`).toBe(true);
    }
  });

  it("신림동은 저렴함과 접근성이 언급된다", () => {
    const { meta, score } = dongByName("관악구", "신림동");
    const text = summarize(score, bundle.pctKeys, grades.get(meta.code)!.grade, W, bundle.axisWeights);
    expect(text).toMatch(/월세/);
    expect(text).toMatch(/\d+만원/); // 월세는 실제 수치를 함께 보여준다
  });

  it("비싸고 유흥이 밀집한 동은 부정 요인이 드러난다", () => {
    const { meta, score } = dongByName("마포구", "합정동");
    const g = grades.get(meta.code)!;
    const text = summarize(score, bundle.pctKeys, g.grade, W, bundle.axisWeights);
    expect(g.grade).toBe("bad");
    // 좋은 점만 늘어놓아 광고가 되면 안 된다
    expect(text).toMatch(/비싸|밀집|적습니다|멉니다|드뭅니다/);
  });

  it("긍정과 부정이 함께 있으면 역접으로 잇는다", () => {
    // 양쪽 특징이 다 있는 동을 하나 찾아 문장 구조를 확인한다
    const mixed = bundle.dongs.find((d) => {
      const s = bundle.scores[d.code];
      const hasGood = s.pct.some((p) => p != null && p >= 62);
      const hasBad = s.pct.some((p) => p != null && p <= 38);
      return hasGood && hasBad;
    });
    expect(mixed, "긍정·부정이 섞인 동이 없음").toBeDefined();
    const s = bundle.scores[mixed!.code];
    const text = summarize(s, bundle.pctKeys, grades.get(mixed!.code)!.grade, W, bundle.axisWeights);
    expect(text, text).toMatch(/지만,/);
  });
});

describe("계산 과정", () => {
  it("축 설명이 지표·중앙값·백분위·가중치를 모두 담는다", () => {
    const { score } = dongByName("관악구", "신림동");
    const ex = explainAxis(
      "convenience",
      score,
      bundle.pctKeys,
      bundle.axisWeights.convenience,
      dists
    );
    // 지표 개수를 박아두면 축 구성이 바뀔 때마다 깨진다. 개수 대신 구조를 본다.
    expect(ex.metrics.length).toBe(bundle.axisWeights.convenience.length);
    expect(ex.metrics.reduce((s, m) => s + m.weight, 0)).toBeCloseTo(1, 2);
    for (const m of ex.metrics) {
      expect(m.value).not.toBe("");
      expect(m.median).not.toBe("—");
      expect(m.pct).not.toBeNull();
      expect(m.weight).toBeGreaterThan(0);
    }
    // 가중합이 축 점수와 맞아야 화면의 식이 거짓말을 하지 않는다
    const recomputed = ex.metrics.reduce((s, m) => s + (m.pct ?? 50) * m.weight, 0);
    expect(recomputed).toBeCloseTo(ex.score, 0);
  });

  it("종합 계산식의 합이 등급 산정에 쓰인 점수와 같다", () => {
    const w = { ...DEFAULT_WEIGHTS };
    const { byDong: grades } = gradeAll(scores, w);
    const { meta, score } = dongByName("관악구", "신림동");
    const g = grades.get(meta.code)!;
    const ex = explainComposite(score, w, g.grade as Grade, g.rank, g.total, {
      best: 0,
      normal: 0,
    });
    expect(ex.total).toBeCloseTo(g.score, 5);
    expect(ex.terms).toHaveLength(3);
  });
});

describe("백분위 표현", () => {
  it("상위/하위를 올바르게 뒤집는다", () => {
    expect(pctPhrase(92)).toBe("상위 8%");
    expect(pctPhrase(29)).toBe("하위 29%");
    expect(pctPhrase(100)).toBe("상위 1%");
  });
});
