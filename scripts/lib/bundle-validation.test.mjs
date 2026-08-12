import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import {
  EXPECTED_RESIDENTIAL_DONGS,
  assertValidCommuteBundle,
  collectCommuteBundleProblems,
} from "./bundle-validation.mjs";

const MAX_PUBLIC_BUNDLE_BYTES = 8 * 1024 * 1024;
const MAX_PUBLIC_BUNDLE_GZIP_BYTES = 2.5 * 1024 * 1024;

function validCommuteBundle() {
  const dongs = Array.from({ length: EXPECTED_RESIDENTIAL_DONGS }, (_, index) => ({
    code: String(index).padStart(10, "0"),
    name: `테스트동 ${index}`,
  }));
  return {
    meta: {
      busVersion: "2026-08-12",
      residentialVersion: "sgis-test-bus-v4",
    },
    dongs,
    graph: {
      stations: [{ id: 0, name: "테스트역", lat: 37.51, lng: 127.01 }],
    },
    bus: {
      version: 1,
      generatedAt: "2026-08-12T00:00:00.000Z",
      defaultHeadwayMin: 15,
      sources: {},
      stops: [
        ["출발 정류장", 37.5, 127],
        ["도착 정류장", 37.51, 127.01],
      ],
      routes: [["테스트 버스", 10, [0, 1], [0, 1_500]]],
    },
    residential: {
      version: "sgis-test-bus-v4",
      source: "국가데이터처 통계지리정보서비스(SGIS), 2024년 인구 100m 격자",
      busVersion: "2026-08-12T00:00:00.000Z",
      generatedAt: "2026-08-12T00:00:00.000Z",
      resolutionM: 100,
      percentile: 0.5,
      weightScale: 10_000,
      maxProfilesPerDong: 24,
      byDong: Object.fromEntries(
        dongs.map((dong) => [dong.code, [[10_000, [[0, 0, 0, 0]]]]]),
      ),
    },
  };
}

function messages(bundle, options) {
  return collectCommuteBundleProblems(bundle, options).join("\n");
}

describe("통근 번들 공용 심층 검증", () => {
  it("브라우저에서도 쓸 수 있게 검증 모듈 자체는 Node API를 import하지 않는다", () => {
    const source = readFileSync(fileURLToPath(new URL("./bundle-validation.mjs", import.meta.url)), "utf8");
    expect(source).not.toMatch(/(?:from|import\s*)\s*[('\"]node:/);
  });

  it("정상 버스망과 547개 동 거주 프로필은 통과한다", () => {
    expect(() => assertValidCommuteBundle(validCommuteBundle(), { required: true })).not.toThrow();
  });

  it("필수 경계에서는 버스·거주 데이터가 모두 없는 번들을 거부한다", () => {
    const bundle = validCommuteBundle();
    delete bundle.bus;
    delete bundle.residential;
    delete bundle.meta.busVersion;
    delete bundle.meta.residentialVersion;
    expect(messages(bundle, { required: true })).toMatch(/데이터가 없음/);
  });

  it("정류장 튜플의 길이·이름·좌표를 검증한다", () => {
    const tuple = validCommuteBundle();
    tuple.bus.stops[0] = ["정류장", 37.5];
    expect(messages(tuple)).toMatch(/정류장 0 튜플 길이/);

    const values = validCommuteBundle();
    values.bus.stops[0] = [" ", 91, 127];
    expect(messages(values)).toMatch(/정류장 0 이름/);
    expect(messages(values)).toMatch(/정류장 0 좌표/);
  });

  it("노선 튜플 길이와 배차간격 범위를 검증한다", () => {
    const tuple = validCommuteBundle();
    tuple.bus.routes[0] = ["버스", 10, [0, 1]];
    expect(messages(tuple)).toMatch(/노선 0 튜플 길이/);

    const headway = validCommuteBundle();
    headway.bus.defaultHeadwayMin = 61;
    headway.bus.routes[0][1] = Number.NaN;
    expect(messages(headway)).toMatch(/기본 배차간격 범위/);
    expect(messages(headway)).toMatch(/노선 0 배차간격 범위/);
  });

  it("노선 정류장 id가 정류장 배열 범위 안인지 검증한다", () => {
    const bundle = validCommuteBundle();
    bundle.bus.routes[0][2][1] = 999_999;
    expect(messages(bundle)).toMatch(/정류장 id 범위 이상/);
  });

  it("누적거리 배열의 길이·0 시작·엄격 단조 증가를 검증한다", () => {
    const length = validCommuteBundle();
    length.bus.routes[0][3] = [0];
    expect(messages(length)).toMatch(/길이 불일치/);

    const start = validCommuteBundle();
    start.bus.routes[0][3] = [10, 1_500];
    expect(messages(start)).toMatch(/0에서 시작하지 않음/);

    const monotonic = validCommuteBundle();
    monotonic.bus.routes[0][3] = [0, 0];
    expect(messages(monotonic)).toMatch(/엄격히 증가하지 않음/);
  });

  it("547개 행정동 각각의 거주 프로필이 비어 있지 않아야 한다", () => {
    const bundle = validCommuteBundle();
    bundle.residential.byDong[bundle.dongs[0].code] = [];
    expect(messages(bundle)).toMatch(/거주 접근 프로필이 비어 있음/);

    delete bundle.residential.byDong[bundle.dongs[1].code];
    expect(messages(bundle)).toMatch(/거주 접근 동 수 이상/);
  });

  it("현재 프로필은 좌표 없이 양수 가중치·접근 목록만 허용한다", () => {
    const bundle = validCommuteBundle();
    bundle.residential.byDong[bundle.dongs[0].code][0] = [0, []];
    const result = messages(bundle);
    expect(result).toMatch(/가중치가 양의 정수가 아님/);
    expect(result).toMatch(/역 접근 선택지가 비어 있음/);

    const coordinateLeak = validCommuteBundle();
    coordinateLeak.residential.byDong[coordinateLeak.dongs[0].code][0] = [
      10_000,
      127,
      37.5,
      [[0, 0, 0, 0]],
    ];
    expect(messages(coordinateLeak)).toMatch(/튜플 길이 이상/);
  });

  it("원자료 비노출 집약 메타·동별 프로필 상한·정규화 가중치 합을 검증한다", () => {
    const missing = validCommuteBundle();
    delete missing.residential.weightScale;
    delete missing.residential.maxProfilesPerDong;
    delete missing.residential.source;
    expect(messages(missing)).toMatch(/필수 거주 접근 집약 메타/);
    expect(messages(missing)).toMatch(/필수 거주인구 출처 표기/);

    const corrupt = validCommuteBundle();
    corrupt.residential.maxProfilesPerDong = 1;
    corrupt.residential.byDong[corrupt.dongs[0].code] = [
      [4_000, [[0, 0, 0, 0]]],
      [4_000, [[0, 1, 1.4, 0]]],
    ];
    const result = messages(corrupt);
    expect(result).toMatch(/동별 대표 프로필 상한 초과/);
    expect(result).toMatch(/현재 동별 대표 프로필 상한 불일치/);
    expect(result).toMatch(/가중치 합 불일치/);

    const scale = validCommuteBundle();
    scale.residential.weightScale = 9_999;
    expect(messages(scale)).toMatch(/현재 거주 접근 가중치 눈금 불일치/);
  });

  it("역 접근 튜플의 역 id·시간·선택비용·mode를 검증한다", () => {
    const bundle = validCommuteBundle();
    bundle.residential.byDong[bundle.dongs[0].code][0][1][0] = [1, -1, Infinity, 2];
    const result = messages(bundle);
    expect(result).toMatch(/역 id 범위 이상/);
    expect(result).toMatch(/실제 접근시간 이상/);
    expect(result).toMatch(/선택비용 이상/);
    expect(result).toMatch(/mode 이상/);
  });

  it("v4 버스 접근은 노선·승하차 순번과 시간 공식까지 검증한다", () => {
    const missing = validCommuteBundle();
    missing.residential.byDong[missing.dongs[0].code][0][1][0] = [0, 11.25, 11.25, 1];
    expect(messages(missing)).toMatch(/버스 경로 참조가 없음/);

    const invalid = validCommuteBundle();
    invalid.residential.byDong[invalid.dongs[0].code][0][1][0] = [
      0,
      11.25,
      11.25,
      1,
      [0, 1, 0, 0],
    ];
    expect(messages(invalid)).toMatch(/버스 승하차 순번 이상/);

    const formula = validCommuteBundle();
    formula.residential.byDong[formula.dongs[0].code][0][1][0] = [
      0,
      2,
      2,
      1,
      [0, 0, 1, 0],
    ];
    expect(messages(formula)).toMatch(/버스 실제시간 공식 불일치/);

    const stale = validCommuteBundle();
    stale.residential.busVersion = "2026-08-11T00:00:00.000Z";
    expect(messages(stale)).toMatch(/거주 접근 버스망 버전 불일치/);
  });

  it("선택비용은 실제 접근시간보다 작을 수 없다", () => {
    const bundle = validCommuteBundle();
    bundle.residential.byDong[bundle.dongs[0].code][0][1][0] = [0, 5, 0, 0];
    expect(messages(bundle)).toMatch(/선택비용이 실제 접근시간보다 작음/);
  });

  it("총 프로필 상한을 넘으면 번들을 거부한다", () => {
    const bundle = validCommuteBundle();
    expect(messages(bundle, { maxResidentialProfiles: 546 })).toMatch(/프로필 상한 초과/);
  });

  it("생성된 공개 번들이 브라우저 로딩 용량 예산 안에 머문다", () => {
    const raw = readFileSync(
      fileURLToPath(new URL("../../public/data/bundle.json", import.meta.url)),
    );
    expect(raw.byteLength).toBeLessThan(MAX_PUBLIC_BUNDLE_BYTES);
    expect(gzipSync(raw).byteLength).toBeLessThan(MAX_PUBLIC_BUNDLE_GZIP_BYTES);
  });

  it("메타 버전이 실제 버스 스냅샷·거주 프로필 버전과 일치해야 한다", () => {
    const bundle = validCommuteBundle();
    bundle.meta.busVersion = "2026-08-11";
    bundle.meta.residentialVersion = "sgis-stale-v0";
    const result = messages(bundle);
    expect(result).toMatch(/버스 메타 버전 불일치/);
    expect(result).toMatch(/거주 접근 메타 버전 불일치/);
  });
});
