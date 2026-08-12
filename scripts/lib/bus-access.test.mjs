import { describe, expect, it } from "vitest";
import {
  MAX_RESIDENTIAL_PROFILES_PER_DONG,
  RESIDENTIAL_WEIGHT_SCALE,
  buildResidentialAccess,
  compressResidentialProfiles,
  createBusIndex,
  nearbyBusStops,
  stationAccessesFromPoint,
} from "./bus-access.mjs";

const network = {
  version: "test",
  generatedAt: "2026-08-12T00:00:00.000Z",
  defaultHeadwayMin: 8,
  sources: {},
  stops: [
    ["집앞", 37.5, 126.98],
    ["중간", 37.5, 126.99],
    ["역앞", 37.5, 127],
  ],
  routes: [["마을버스", 8, [0, 1, 2], [0, 1100, 2200]]],
};

const graph = {
  stations: [
    { id: 0, name: "가까운역", lat: 37.5, lng: 127, nodeIds: [0], lines: ["T"] },
    { id: 1, name: "먼역", lat: 37.5, lng: 127.1, nodeIds: [1], lines: ["T"] },
  ],
};

describe("파이프라인 버스 접근", () => {
  it("정방향 버스가 15분 초과 도보보다 빠르면 mode=1로 저장한다", () => {
    const index = createBusIndex(network);
    const point = { lat: 37.5, lng: 126.98 };
    const stationStops = graph.stations.map((station) =>
      nearbyBusStops(network, index, station),
    );
    const accesses = stationAccessesFromPoint(
      network,
      index,
      point,
      [{ station: graph.stations[0], distM: 1765 }],
      stationStops,
    );
    expect(accesses).toHaveLength(1);
    expect(accesses[0][0]).toBe(0);
    expect(accesses[0][3]).toBe(1);
    expect(accesses[0][4]).toEqual([0, 0, 2, 0]);
    expect(accesses[0][1]).toBeLessThan(20);
  });

  it("원 인구 합은 통계로 보존하고 출력은 정규화 가중치로 바꾼다", () => {
    const population = {
      source: { year: 2024, cellSizeM: 100 },
      dongs: {
        "1111111111": [
          [126.98, 37.5, 60],
          [126.98, 37.5, 40],
        ],
      },
    };
    const { residential, stats } = buildResidentialAccess(population, graph, network, {
      generatedAt: "2026-08-12T00:00:00.000Z",
    });
    expect(stats.inputCells).toBe(2);
    expect(stats.populationTotal).toBe(100);
    expect(stats.profiles).toBe(1);
    expect(residential.source).toMatch(/국가데이터처.*SGIS.*2024년/);
    expect(residential.busVersion).toBe(network.generatedAt);
    expect(residential.byDong["1111111111"][0][0]).toBe(RESIDENTIAL_WEIGHT_SCALE);
    expect(residential.byDong["1111111111"][0][1][0][3]).toBe(1);
  });

  it("동별 프로필 수를 제한하고 가중치 합과 결정성을 보존한다", () => {
    const accesses = [[0, 5, 7, 0]];
    const profiles = Array.from({ length: 40 }, (_, index) => ({
      population: index + 1,
      lng: 126.9 + index * 0.001,
      lat: 37.4 + (index % 5) * 0.001,
      accesses,
    }));
    const first = compressResidentialProfiles(profiles);
    const second = compressResidentialProfiles([...profiles].reverse());

    expect(first).toHaveLength(MAX_RESIDENTIAL_PROFILES_PER_DONG);
    expect(first.reduce((sum, [weight]) => sum + weight, 0)).toBe(
      RESIDENTIAL_WEIGHT_SCALE,
    );
    expect(first).toEqual(second);
    expect(first.every(([weight]) => weight > 0)).toBe(true);
  });

  it("공개 프로필에는 원 셀 좌표를 전혀 남기지 않는다", () => {
    const accesses = [[0, 5, 7, 0]];
    const profiles = [
      { population: 30, lng: 126.9001, lat: 37.4001, accesses },
      { population: 70, lng: 126.9029, lat: 37.4029, accesses },
    ];
    const [profile] = compressResidentialProfiles(profiles, { maxProfiles: 1 });

    expect(profile).toHaveLength(2);
    expect(profile[0]).toBe(RESIDENTIAL_WEIGHT_SCALE);
    expect(profile[1]).toEqual(accesses);
    expect(JSON.stringify(profile)).not.toContain("126.9");
    expect(JSON.stringify(profile)).not.toContain("37.4");
  });

  it("동일한 원 셀은 입력 순서를 뒤집어도 같은 공개 산출물을 만든다", () => {
    const population = {
      source: { year: 2024, cellSizeM: 100 },
      dongs: {
        "1111111111": [
          [126.98, 37.5, 50],
          [126.981, 37.501, 50],
        ],
      },
    };
    const reversed = {
      ...population,
      dongs: { "1111111111": [...population.dongs["1111111111"]].reverse() },
    };

    const first = buildResidentialAccess(population, graph, network, {
      generatedAt: "2026-08-12T00:00:00.000Z",
    }).residential;
    const second = buildResidentialAccess(reversed, graph, network, {
      generatedAt: "2026-08-12T00:00:00.000Z",
    }).residential;

    expect(first).toEqual(second);
  });
});
