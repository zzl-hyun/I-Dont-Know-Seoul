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
    for (const [axis, ws] of Object.entries(bundle.axisWeights)) {
      if (ws.length === 0) continue;
      for (const [, s] of scores) {
        const expected = ws.reduce((acc, w) => {
          const i = bundle.pctKeys.indexOf(w.key);
          return acc + (s.pct[i] ?? 50) * w.w;
        }, 0);
        expect(s[axis as "safety"]).toBeCloseTo(expected, 0);
      }
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
  it("신림동: 유흥업소 0개인데 치안 100점이 아닌 이유가 드러난다", () => {
    const { score } = dongByName("관악구", "신림동");
    expect(score.raw.nightlifePerKm2).toBe(0);

    const dist = dists.get("nightlifePerKm2")!;
    const tied = sameValueShare(dist, 0);

    // 서울 동의 상당수가 0개라서 동점 평균 순위가 매겨진다.
    // 이 비율이 없으면 "0개인데 왜 100점이 아니지?" 를 설명할 방법이 없다.
    expect(tied).toBeGreaterThan(0.2);

    const i = bundle.pctKeys.indexOf("nightlifePerKm2");
    expect(score.pct[i]).toBeLessThan(100);
    expect(score.pct[i]).toBeGreaterThan(50);
    // 지표가 하나뿐인 축이므로 축 점수 = 그 지표 백분위
    expect(score.safety).toBeCloseTo(score.pct[i]!, 1);
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
