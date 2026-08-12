import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  DEFAULT_HEADWAY_MIN,
  ROAD_DETOUR_FACTOR,
  buildGyeonggiRoutes,
  buildSeoulRoutes,
  clipOrderedStops,
  encodeBusNetwork,
  fetchGbisSources,
  findLatestCachedGbisPair,
  findForwardCandidates,
  makeBmsKey,
  normalizeHeadway,
  parseBmsCsvText,
  parseCaretTable,
  parseCsvLine,
  parseGbisRouteInfo,
  parseGbisRouteStations,
  parseSeoulRouteRows,
  preferBmsRecord,
  resolveGbisSegmentMeters,
  validateBusNetwork,
} from "./bus-sources.mjs";

const SMALL_BOUNDS = { minLng: 126.9, maxLng: 127.1, minLat: 37.4, maxLat: 37.6 };
const temporaryDirs = [];

afterEach(async () => {
  await Promise.all(temporaryDirs.splice(0).map((path) => rm(path, { recursive: true })));
});

async function temporaryRawDir() {
  const path = await mkdtemp(join(tmpdir(), "oneday-gbis-cache-"));
  temporaryDirs.push(path);
  return path;
}

const ROUTE_FIXTURE = [
  "routeId|adminName|routeName|peekAlloc|npeekAlloc",
  "r1|경기도|15|10|20",
].join("^");
const ROUTE_STATION_FIXTURE = [
  "routeId|routeName|upDown|staOrder|stationId|stationName|x|y",
  "r1|15|상행|1|s1|A|127.0|37.5",
  "r1|15|상행|2|s2|B|127.01|37.5",
].join("^");

async function writeGbisPair(rawDir, version) {
  await Promise.all([
    writeFile(join(rawDir, `gbis-route-${version}.txt`), ROUTE_FIXTURE),
    writeFile(
      join(rawDir, `gbis-route-station-${version}.txt`),
      ROUTE_STATION_FIXTURE
    ),
  ]);
}

function stop(overrides = {}) {
  return {
    routeId: "r1",
    routeName: "테스트",
    staOrder: 1,
    stationId: "s1",
    stationName: "정류소 1",
    lat: 37.5,
    lng: 127,
    ...overrides,
  };
}

function bms(overrides = {}) {
  return {
    routeId: "r1",
    staOrder: 1,
    stationId: "s1",
    gisMeters: 300,
    cumulativeMeters: 1_000,
    realMeters: null,
    decidedMeters: 300,
    progressCode: "F",
    registeredAt: "20230324153831",
    snapshotDate: "2023-09-25",
    ...overrides,
  };
}

describe("GBIS 기반정보 파서", () => {
  it("^/| 표와 UTF-8 이름을 보존한다", () => {
    const table = parseCaretTable("a|b^1|서울^2|판교^");
    expect(table.header).toEqual(["a", "b"]);
    expect(table.rows).toEqual([
      ["1", "서울"],
      ["2", "판교"],
    ]);
  });

  it("평일 첨두 배차를 우선하고 비정상값은 순서대로 폴백한다", () => {
    const text = [
      "routeId|routeName|peekAlloc|npeekAlloc",
      "r1|15번|15|30",
      "r2|20번|0|22",
      "r3|30번|999|0",
    ].join("^");
    const parsed = parseGbisRouteInfo(text).byRouteId;
    expect(parsed.get("r1")).toMatchObject({ headwayMin: 15, headwaySource: "peekAlloc" });
    expect(parsed.get("r2")).toMatchObject({ headwayMin: 22, headwaySource: "npeekAlloc" });
    expect(parsed.get("r3")).toMatchObject({
      headwayMin: DEFAULT_HEADWAY_MIN,
      headwaySource: "default",
    });
    expect(normalizeHeadway(1, 61, 12)).toBe(12);
  });

  it("노선 정류소의 좌표와 순번을 숫자로 바꾼다", () => {
    const text = [
      "routeId|routeName|upDown|staOrder|stationId|stationName|x|y",
      "r1|15|상행|1|s1|판교역|127.11|37.39",
      "r1|15|상행|x|s2|잘못된행|127.12|37.40",
    ].join("^");
    const result = parseGbisRouteStations(text);
    expect(result.rows).toHaveLength(1);
    expect(result.invalidRows).toBe(1);
    expect(result.rows[0]).toMatchObject({ staOrder: 1, stationName: "판교역" });
  });
});

describe("GBIS 오프라인 캐시 폴백", () => {
  it("버전 조회 연결 실패 시 깨진 최신 파일을 건너뛰고 최신 유효 동일 버전 쌍을 쓴다", async () => {
    const rawDir = await temporaryRawDir();
    await writeGbisPair(rawDir, "20260101");
    await writeGbisPair(rawDir, "20260202");
    await writeFile(join(rawDir, "gbis-route-20260303.txt"), ROUTE_FIXTURE);
    await writeFile(
      join(rawDir, "gbis-route-station-20260303.txt"),
      "routeId|routeName|upDown|staOrder|"
    );

    const result = await fetchGbisSources({
      serviceKey: "test-secret-never-log",
      rawDir,
      fetchImpl: async () => {
        throw new TypeError("network disabled");
      },
    });

    expect(result).toMatchObject({
      mode: "offline-cache",
      fallbackReason: "metadata-unavailable",
      routeVersion: "20260202",
      routeStationVersion: "20260202",
      versionsAligned: true,
    });
    expect(result.downloads.route.reused).toBe(true);
    expect(result.downloads.routeStation.reused).toBe(true);
  });

  it("명시적 오프라인 모드는 키나 fetch 없이 최신 유효 캐시를 쓴다", async () => {
    const rawDir = await temporaryRawDir();
    await writeGbisPair(rawDir, "20260404");
    let calls = 0;
    const result = await fetchGbisSources({
      rawDir,
      offline: true,
      fetchImpl: async () => {
        calls += 1;
        throw new Error("호출되면 안 됨");
      },
    });
    expect(calls).toBe(0);
    expect(result).toMatchObject({
      mode: "offline-cache",
      fallbackReason: "offline-requested",
      routeVersion: "20260404",
      routeStationVersion: "20260404",
    });
  });

  it("공통 버전 쌍이 없으면 각 항목의 최신 유효 버전을 결정적으로 고른다", async () => {
    const rawDir = await temporaryRawDir();
    await writeFile(join(rawDir, "gbis-route-20260505.txt"), ROUTE_FIXTURE);
    await writeFile(
      join(rawDir, "gbis-route-station-20260404.txt"),
      ROUTE_STATION_FIXTURE
    );
    const result = await findLatestCachedGbisPair(rawDir);
    expect(result).toMatchObject({
      routeVersion: "20260505",
      routeStationVersion: "20260404",
      versionsAligned: false,
    });
  });

  it("유효 캐시 쌍이 없으면 원인을 숨기지 않고 실패한다", async () => {
    const rawDir = await temporaryRawDir();
    await writeFile(join(rawDir, "gbis-route-20260101.txt"), ROUTE_FIXTURE);
    await expect(
      fetchGbisSources({
        serviceKey: "test-secret-never-log",
        rawDir,
        fetchImpl: async () => {
          throw new TypeError("network disabled");
        },
      })
    ).rejects.toThrow(/유효한 GBIS 오프라인 캐시 쌍도 없습니다/);
  });
});

describe("BMS CSV 정확 키와 중복 제거", () => {
  it("따옴표 안 쉼표와 이중 따옴표를 처리한다", () => {
    expect(parseCsvLine('"a,b","c""d",e')).toEqual(["a,b", 'c"d', "e"]);
  });

  it("거리 값이 있는 최신 행을 정확 키 단위로 결정적으로 고른다", () => {
    const csv = [
      "ROUTE_ID,STTN_ORDR,STTN_ID,GIS_DSTN,ACCMLT_DSTN,REAL_DSTN,DCSN_DSTN,PROGRS_DIV_CD,REGIST_DE,ETL_LDADNG_DTM",
      "r1,2,s2,250,1250,,250,F,20220101000000,2023-09-25",
      "r1,2,s2,260,1260,,260,F,20230301000000,2023-09-25",
      "r1,2,s2,,,999,,F,20240101000000,2023-09-25",
      "r2,2,s2,500,500,,500,F,20230301000000,2023-09-25",
    ].join("\n");
    const wanted = new Set([makeBmsKey("r1", 2, "s2")]);
    const result = parseBmsCsvText(csv, { wantedKeys: wanted });
    expect(result.records).toHaveLength(1);
    expect(result.records.get(makeBmsKey("r1", 2, "s2"))).toMatchObject({
      gisMeters: 260,
      cumulativeMeters: 1260,
      registeredAt: "20230301000000",
    });
    expect(result.stats).toMatchObject({
      totalRows: 4,
      retainedRows: 3,
      retainedUniqueKeys: 1,
      duplicateExactRows: 2,
      realDistanceRows: 1,
    });
  });

  it("동률도 입력 순서와 무관하게 같은 행을 고른다", () => {
    const left = bms({ gisMeters: 200, cumulativeMeters: 1_200 });
    const right = bms({ gisMeters: 210, cumulativeMeters: 1_210 });
    expect(preferBmsRecord(left, right)).toEqual(preferBmsRecord(right, left));
  });
});

describe("거리 우선순위", () => {
  const previous = stop();
  const current = stop({
    staOrder: 2,
    stationId: "s2",
    stationName: "정류소 2",
    lng: 127.003,
  });

  it("정확 매칭된 단조 누적거리 차이를 가장 먼저 쓴다", () => {
    const records = new Map([
      [makeBmsKey("r1", 1, "s1"), bms()],
      [
        makeBmsKey("r1", 2, "s2"),
        bms({ staOrder: 2, stationId: "s2", gisMeters: 350, cumulativeMeters: 1_320 }),
      ],
    ]);
    expect(resolveGbisSegmentMeters(previous, current, records)).toEqual({
      meters: 320,
      source: "bms-cumulative",
    });
  });

  it("누적거리가 역행하면 정확 행의 GIS 구간거리를 쓴다", () => {
    const records = new Map([
      [makeBmsKey("r1", 1, "s1"), bms()],
      [
        makeBmsKey("r1", 2, "s2"),
        bms({ staOrder: 2, stationId: "s2", gisMeters: 350, cumulativeMeters: 900 }),
      ],
    ]);
    expect(resolveGbisSegmentMeters(previous, current, records)).toEqual({
      meters: 350,
      source: "bms-gis",
    });
  });

  it("같은 순번이어도 정류소 ID가 다르면 오래된 BMS를 결합하지 않는다", () => {
    const records = new Map([
      [makeBmsKey("r1", 1, "s1"), bms()],
      [
        makeBmsKey("r1", 2, "old-s2"),
        bms({ staOrder: 2, stationId: "old-s2", gisMeters: 9_000, cumulativeMeters: 10_000 }),
      ],
    ]);
    const result = resolveGbisSegmentMeters(previous, current, records);
    expect(result.source).toBe("haversine-detour");
    expect(result.meters).toBeGreaterThan(250);
    expect(result.meters).toBeLessThan(500);
  });
});

describe("노선 절단과 압축 네트워크 불변식", () => {
  it("범위 안 첫/마지막 정류소 사이를 보존하고 한 정류소씩 패딩한다", () => {
    const stops = [
      stop({ staOrder: 1, stationId: "s1", lng: 126.8 }),
      stop({ staOrder: 2, stationId: "s2", lng: 126.95 }),
      stop({ staOrder: 3, stationId: "s3", lng: 127 }),
      stop({ staOrder: 4, stationId: "s4", lng: 127.05 }),
      stop({ staOrder: 5, stationId: "s5", lng: 127.2 }),
    ];
    expect(clipOrderedStops(stops, SMALL_BOUNDS, 1).map((item) => item.stationId)).toEqual([
      "s1",
      "s2",
      "s3",
      "s4",
      "s5",
    ]);
    expect(
      clipOrderedStops(
        stops.map((item, index) => ({ ...item, lng: index === 2 ? 127 : 127.2 })),
        SMALL_BOUNDS,
        1
      )
    ).toBeNull();
  });

  it("경기와 서울 노선을 만들고 누적거리를 0부터 단조 증가시킨다", () => {
    const routeStations = [
      stop({ staOrder: 1, stationId: "s1", lng: 126.95 }),
      stop({ staOrder: 2, stationId: "s2", lng: 127 }),
      stop({ staOrder: 3, stationId: "s3", lng: 127.05 }),
    ];
    const gyeonggi = buildGyeonggiRoutes({
      routeStations,
      routeInfoById: new Map([
        ["r1", { routeName: "15", headwayMin: 8, headwaySource: "peekAlloc" }],
      ]),
      bmsRecords: new Map(),
      bounds: SMALL_BOUNDS,
      paddingStops: 0,
    });
    const seoul = buildSeoulRoutes({
      routeStations: routeStations.map((item) => ({ ...item, routeId: "s-route" })),
      bounds: SMALL_BOUNDS,
      paddingStops: 0,
    });
    expect(gyeonggi.routes).toHaveLength(1);
    expect(seoul.routes).toHaveLength(1);
    for (const route of [...gyeonggi.routes, ...seoul.routes]) {
      expect(route.cumulativeMeters[0]).toBe(0);
      expect(route.cumulativeMeters[1]).toBeGreaterThan(route.cumulativeMeters[0]);
      expect(route.cumulativeMeters[2]).toBeGreaterThan(route.cumulativeMeters[1]);
    }
  });

  it("정류소를 인덱스로 압축하고 잘못된 누적거리를 거부한다", () => {
    const routes = [
      {
        source: "seoul",
        sourceRouteId: "r1",
        name: "테스트",
        headwayMin: 10,
        stops: [
          { key: "a", name: "A", lat: 37.5, lng: 127 },
          { key: "b", name: "B", lat: 37.5, lng: 127.01 },
        ],
        cumulativeMeters: [0, 1_100],
      },
      {
        source: "seoul",
        sourceRouteId: "r2",
        name: "테스트2",
        headwayMin: 12,
        stops: [
          { key: "b", name: "B", lat: 37.5, lng: 127.01 },
          { key: "c", name: "C", lat: 37.5, lng: 127.02 },
        ],
        cumulativeMeters: [0, 1_100],
      },
    ];
    const network = encodeBusNetwork(routes, { generatedAt: "2026-08-12T00:00:00.000Z" });
    expect(network.stops).toHaveLength(3);
    expect(network.routes[0][2][1]).toBe(network.routes[1][2][0]);
    expect(validateBusNetwork(network)).toBe(true);
    const broken = structuredClone(network);
    broken.routes[0][3] = [0, -1];
    expect(() => validateBusNetwork(broken)).toThrow(/단조성/);
  });
});

describe("서울 행과 순방향 후보", () => {
  it("서울 Open API 행을 정규화한다", () => {
    const result = parseSeoulRouteRows([
      {
        ROUTE_ID: "100",
        RTE_NM: "01",
        SN: "2",
        NODE_ID: "node",
        STATION_NM: "정류소",
        XCRD: "127.1",
        YCRD: "37.5",
      },
    ]);
    expect(result.rows[0]).toMatchObject({ routeId: "100", staOrder: 2, stationId: "node" });
  });

  it("같은 노선에서 출발 정류소가 먼저 나올 때만 후보로 만든다", () => {
    const network = {
      version: 1,
      generatedAt: "2026-08-12T00:00:00.000Z",
      defaultHeadwayMin: 15,
      sources: {},
      stops: [
        ["A", 37.5, 127],
        ["B", 37.5, 127.005],
        ["C", 37.5, 127.01],
      ],
      routes: [["01", 10, [0, 1, 2], [0, 500, 1_000]]],
    };
    const forward = findForwardCandidates(
      network,
      { lat: 37.5, lng: 127 },
      { lat: 37.5, lng: 127.01 },
      100
    );
    expect(forward).toHaveLength(1);
    expect(forward[0]).toMatchObject({ boardStop: "A", alightStop: "C", routeMeters: 1_000 });
    expect(
      findForwardCandidates(
        network,
        { lat: 37.5, lng: 127.01 },
        { lat: 37.5, lng: 127 },
        100
      )
    ).toEqual([]);
  });
});

describe("모델 상수", () => {
  it("서울·경기 haversine 폴백이 동일한 계수를 공유한다", () => {
    expect(ROAD_DETOUR_FACTOR).toBe(1.25);
  });
});
