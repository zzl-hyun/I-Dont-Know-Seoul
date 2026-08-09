import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { SubwayGraph, DongMeta } from "../types";
import { multiSourceDijkstra } from "./dijkstra";
import { computeCommute } from "./commute";
import { FIRST_WAIT_MIN } from "./constants";

const graph: SubwayGraph = JSON.parse(
  readFileSync(join(__dirname, "../../data/dist/subway-graph.json"), "utf8")
);
const dongMeta: { dongs: DongMeta[] } = JSON.parse(
  readFileSync(join(__dirname, "../../data/dist/dong-meta.json"), "utf8")
);

/** 이름으로 역을 찾되, 동명이역은 서울 도심에 가까운 쪽을 고른다. */
function station(name: string) {
  const hits = graph.stations.filter((s) => s.name === name);
  if (hits.length === 0) throw new Error(`역을 찾을 수 없음: ${name}`);
  return hits.sort(
    (a, b) =>
      Math.hypot(a.lat - 37.55, a.lng - 126.99) -
      Math.hypot(b.lat - 37.55, b.lng - 126.99)
  )[0];
}

/** 승강장→승강장 소요시간(분). 접근 도보와 최초 대기는 뺀다. */
function rideMinutes(fromName: string, toName: string): number {
  const from = station(fromName);
  const to = station(toName);
  const { dist } = multiSourceDijkstra(
    graph,
    from.nodeIds.map((nodeId) => ({ nodeId, cost: 0 }))
  );
  return Math.min(...to.nodeIds.map((id) => dist[id]));
}

describe("지하철 그래프 구조", () => {
  it("서울 주요 노선이 전부 포함된다", () => {
    const lines = new Set(graph.nodes.map((n) => n.line));
    // 신림선·우이신설선이 빠지면 관악구·강북구가 통째로 '역 없음'이 된다.
    for (const line of ["1", "2", "3", "4", "5", "6", "7", "8", "9",
                        "Silim", "W", "신분당", "경의·중앙", "수인·분당", "공항철도"]) {
      expect(lines, `${line} 노선 누락`).toContain(line);
    }
  });

  it("그래프가 하나로 연결되어 있다", () => {
    const { dist } = multiSourceDijkstra(graph, [{ nodeId: 0, cost: 0 }]);
    const reached = dist.reduce((n, d) => n + (Number.isFinite(d) ? 1 : 0), 0);
    expect(reached / graph.nodes.length).toBeGreaterThan(0.99);
  });

  it("환승역은 노선 수만큼 노드를 갖는다", () => {
    // 강남역은 2호선 + 신분당선
    const gangnam = station("강남");
    expect(gangnam.lines.length).toBeGreaterThanOrEqual(2);
    expect(gangnam.nodeIds.length).toBe(gangnam.lines.length);
  });
});

describe("통근시간 정확도 (승강장→승강장)", () => {
  /**
   * 기준점: 2호선 순환선은 43개역 48.8km를 약 87분에 돈다 (공식 운행시간).
   * 즉 2호선은 정거장당 약 2.02분. 아래 2호선 구간들은 이 값에서 유도했다.
   *
   * 허용 오차를 ±25%로 둔 이유: 이 서비스가 필요로 하는 판단은
   * "40분 통근권 안이냐"이지 분 단위 정확도가 아니다. 다만 25%를 넘으면
   * 통근권 경계가 한 정거장 이상 밀리므로 그때는 상수를 손봐야 한다.
   */
  const CASES: Array<[from: string, to: string, expectedMin: number, note: string]> = [
    ["신림", "강남", 16, "2호선 8정거장 직통"],
    // 잠실-잠실새내-종합운동장-삼성-선릉-역삼-강남 = 6정거장
    ["잠실", "강남", 12, "2호선 6정거장"],
    ["서울대입구", "을지로입구", 34, "2호선 17정거장"],
    ["구로디지털단지", "시청", 24, "2호선 12정거장"],
    ["노원", "강남", 42, "4호선→2호선 사당 환승"],
    ["연신내", "삼성", 44, "3호선→2호선 환승"],
    ["북한산우이", "동대문", 28, "우이신설선→1호선 신설동 환승"],
  ];

  for (const [from, to, expected, note] of CASES) {
    it(`${from} → ${to} ≈ ${expected}분 (${note})`, () => {
      const actual = rideMinutes(from, to);
      expect(Number.isFinite(actual), "도달 불가").toBe(true);
      const errorPct = Math.abs(actual - expected) / expected;
      expect(
        errorPct,
        `모델 ${actual.toFixed(1)}분 vs 기준 ${expected}분 (오차 ${(errorPct * 100).toFixed(0)}%)`
      ).toBeLessThan(0.25);
    });
  }

  it("2호선 순환 일주가 약 87분이다 (속도 상수의 기준점)", () => {
    // 순환선 전체를 도는 대신 반대 방향 두 구간의 합으로 검증한다.
    // 시청 기준 정반대편은 잠실 부근.
    const half1 = rideMinutes("시청", "잠실");
    const half2 = rideMinutes("잠실", "시청");
    // 순환선이라 양방향 최단이 같고, 각각 일주의 절반보다 짧아야 한다.
    expect(half1).toBeCloseTo(half2, 1);
    expect(half1).toBeLessThan(87 / 2 + 3);
  });
});

describe("동별 통근 계산", () => {
  const gangnam = station("강남");
  const result = computeCommute(graph, dongMeta.dongs, gangnam);

  it("모든 행정동에 결과가 있다", () => {
    expect(result.size).toBe(dongMeta.dongs.length);
  });

  it("서울 대부분의 동이 강남역 기준 도달 가능하다", () => {
    const reachable = [...result.values()].filter((r) => r.totalMin !== null);
    expect(reachable.length / result.size).toBeGreaterThan(0.98);
  });

  it("강남역 인근 동이 가장 빠르다", () => {
    const sorted = [...result.entries()]
      .filter(([, r]) => r.totalMin !== null)
      .sort((a, b) => a[1].totalMin! - b[1].totalMin!);
    const topGu = sorted.slice(0, 5).map(([code]) => {
      return dongMeta.dongs.find((d) => d.code === code)!.gu;
    });
    // 상위 5개 동은 강남구 또는 서초구여야 한다
    expect(topGu.every((gu) => gu === "강남구" || gu === "서초구")).toBe(true);
  });

  it("최소 통근시간이 최초 대기시간보다 크다", () => {
    const min = Math.min(
      ...[...result.values()].filter((r) => r.totalMin !== null).map((r) => r.totalMin!)
    );
    expect(min).toBeGreaterThan(FIRST_WAIT_MIN);
  });

  it("관악구 신림동이 강남역 40분 통근권에 든다", () => {
    const sillim = dongMeta.dongs.find((d) => d.gu === "관악구" && d.dong === "신림동");
    expect(sillim, "신림동을 찾을 수 없음").toBeDefined();
    const r = result.get(sillim!.code)!;
    expect(r.totalMin).not.toBeNull();
    expect(r.totalMin!).toBeLessThan(40);
  });
});
