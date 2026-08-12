import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { assertValidBundle } from "./data";

/** 대상 동 최소 요건(400개)을 넘기는 최소한의 유효 번들 */
function validBundle(dongCount = 400) {
  const dongs = Array.from({ length: dongCount }, (_, i) => ({ code: String(i) }));
  const scores = Object.fromEntries(dongs.map((d) => [d.code, {}]));
  return {
    dongs,
    graph: { stations: [{ name: "강남" }] },
    scores,
    meta: { scoreVersion: "2026-08-10" },
  } as any;
}

/** 버스·거주 접근 심층 검증까지 통과하는 작은 현재 스키마 번들. */
function validCommuteBundle() {
  const bundle = validBundle(547);
  bundle.graph.stations = [{ id: 0, name: "강남", lat: 37.51, lng: 127.01 }];
  bundle.bus = {
    version: 1,
    generatedAt: "2026-08-12T00:00:00.000Z",
    defaultHeadwayMin: 15,
    sources: {},
    stops: [
      ["출발 정류장", 37.5, 127],
      ["도착 정류장", 37.51, 127.01],
    ],
    routes: [["테스트 버스", 10, [0, 1], [0, 1_500]]],
  };
  bundle.residential = {
    version: "sgis-test-bus-v4",
    source: "국가데이터처 통계지리정보서비스(SGIS), 2024년 인구 100m 격자",
    busVersion: "2026-08-12T00:00:00.000Z",
    generatedAt: "2026-08-12T00:00:00.000Z",
    resolutionM: 100,
    percentile: 0.5,
    weightScale: 10_000,
    maxProfilesPerDong: 24,
    byDong: Object.fromEntries(
      bundle.dongs.map((dong: { code: string }) => [
        dong.code,
        [[10_000, [[0, 0, 0, 0]]]],
      ])
    ),
  };
  bundle.meta.busVersion = "2026-08-12";
  bundle.meta.residentialVersion = "sgis-test-bus-v4";
  return bundle;
}

describe("assertValidBundle — /api/data 응답의 최상위 구조를 검증한다", () => {
  it("생성된 실제 번들이 버스망·547개 거주 접근을 포함해 통과한다", () => {
    const bundle = JSON.parse(
      readFileSync(join(__dirname, "../../public/data/bundle.json"), "utf8")
    );
    expect(() => assertValidBundle(bundle)).not.toThrow();
    expect(bundle.bus.routes.length).toBeGreaterThan(2_000);
    expect(Object.keys(bundle.residential.byDong)).toHaveLength(bundle.dongs.length);
  });

  it("정상 번들은 통과한다", () => {
    expect(() => assertValidBundle(validBundle())).not.toThrow();
  });

  it("행정동이 400개 미만이면 던진다", () => {
    const b = validBundle();
    b.dongs = b.dongs.slice(0, 10);
    expect(() => assertValidBundle(b)).toThrow(/행정동/);
  });

  it("지하철 그래프가 비어 있으면 던진다", () => {
    const b = validBundle();
    b.graph = { stations: [] };
    expect(() => assertValidBundle(b)).toThrow(/지하철/);
  });

  it("점수 개수가 동 개수와 다르면 던진다", () => {
    const b = validBundle();
    delete b.scores[b.dongs[0].code];
    expect(() => assertValidBundle(b)).toThrow(/점수 개수/);
  });

  it("버전 정보가 없으면 던진다", () => {
    const b = validBundle();
    b.meta = {};
    expect(() => assertValidBundle(b)).toThrow(/버전/);
  });

  it("선택적으로 실린 버스망의 정류장·노선이 비어 있으면 던진다", () => {
    const b = validCommuteBundle();
    b.bus.stops = [];
    expect(() => assertValidBundle(b)).toThrow(/버스 정류장/);
  });

  it("거주인구 접근 데이터에 누락된 동이 있으면 던진다", () => {
    const b = validCommuteBundle();
    delete b.residential.byDong[b.dongs[0].code];
    expect(() => assertValidBundle(b)).toThrow(/거주 접근 동 수|거주 접근 프로필/);
  });

  it("버스망과 거주인구 접근 중 하나만 있으면 혼합 버전으로 거부한다", () => {
    const b = validBundle();
    b.bus = {
      stops: [["정류장", 37.5, 127]],
      routes: [["노선", 10, [0, 0], [0, 1]]],
    };
    expect(() => assertValidBundle(b)).toThrow(/하나만 존재/);
  });

  it("존재하지 않는 버스 정류장 id를 클라이언트 경계에서 거부한다", () => {
    const b = validCommuteBundle();
    b.bus.routes[0][2][1] = 999_999;
    expect(() => assertValidBundle(b)).toThrow(/정류장 id 범위 이상/);
  });

  it("버스 누적거리가 0에서 시작해 엄격히 증가하지 않으면 거부한다", () => {
    const b = validCommuteBundle();
    b.bus.routes[0][3] = [10, 10];
    expect(() => assertValidBundle(b)).toThrow(/0에서 시작하지 않음|엄격히 증가하지 않음/);
  });

  it("빈 거주 프로필은 대표점 방식으로 조용히 폴백하지 않고 거부한다", () => {
    const b = validCommuteBundle();
    b.residential.byDong[b.dongs[0].code] = [];
    expect(() => assertValidBundle(b)).toThrow(/거주 접근 프로필이 비어 있음/);
  });

  it("손상된 역 접근 튜플의 id·시간·mode를 거부한다", () => {
    const b = validCommuteBundle();
    b.residential.byDong[b.dongs[0].code][0][1][0] = [99, -1, Infinity, 2];
    expect(() => assertValidBundle(b)).toThrow(/역 id 범위 이상/);
    expect(() => assertValidBundle(b)).toThrow(/실제 접근시간 이상/);
    expect(() => assertValidBundle(b)).toThrow(/mode 이상/);
  });

  it("메타 버전이 실제 통근 데이터 버전과 다르면 거부한다", () => {
    const b = validCommuteBundle();
    b.meta.residentialVersion = "sgis-stale-v0";
    expect(() => assertValidBundle(b)).toThrow(/거주 접근 메타 버전 불일치/);
  });
});
