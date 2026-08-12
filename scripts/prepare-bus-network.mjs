/**
 * 서울 + 경기 정적 버스 네트워크 생성기.
 *
 * 런타임 API 없이 역/목적지 양쪽 400m 안의 정류소를 같은 노선의 순방향으로
 * 연결하기 위한 최소 정보만 압축한다. 원천 파일과 API 페이지는 data/raw 아래에
 * 체크포인트로 보관하며, 키는 요청 메모리에서만 쓰고 파일·로그에 남기지 않는다.
 *
 * 실행:
 *   node scripts/prepare-bus-network.mjs
 *   node scripts/prepare-bus-network.mjs --refresh  # 같은 버전 캐시도 다시 받음
 *   node scripts/prepare-bus-network.mjs --offline  # 공식 API를 호출하지 않고 캐시만 사용
 */
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_HEADWAY_MIN,
  ROAD_DETOUR_FACTOR,
  TARGET_BOUNDS,
  buildGyeonggiRoutes,
  buildSeoulRoutes,
  encodeBusNetwork,
  fetchGbisSources,
  fetchSeoulRouteRows,
  findForwardCandidates,
  loadBmsCsv,
  loadEnvFile,
  makeBmsKey,
  parseGbisRouteInfo,
  parseGbisRouteStations,
  parseSeoulRouteRows,
  writeBusNetwork,
} from "./lib/bus-sources.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const RAW_DIR = join(ROOT, "data/raw");
const BMS_CSV = join(RAW_DIR, "BMS_info.csv");
const SUBWAY_GRAPH = join(ROOT, "data/dist/subway-graph.json");
const OUTPUT = join(ROOT, "data/dist/bus-network.json");
const SK_AX = { name: "SK AX 판교캠퍼스 B", lat: 37.40587, lng: 127.09981 };
const PANGYO_RADIUS_M = 400;

function ratio(numerator, denominator) {
  return denominator > 0 ? Math.round((numerator / denominator) * 1_000_000) / 1_000_000 : 0;
}

function percent(value) {
  return `${(value * 100).toFixed(1)}%`;
}

function sourceLabel(source) {
  return source === "gyeonggi" ? "경기" : "서울";
}

async function main() {
  const refresh = process.argv.includes("--refresh");
  const offline = process.argv.includes("--offline");
  const unknownFlags = process.argv
    .slice(2)
    .filter((flag) => flag !== "--refresh" && flag !== "--offline");
  if (unknownFlags.length > 0) throw new Error(`알 수 없는 옵션: ${unknownFlags.join(", ")}`);
  if (refresh && offline) throw new Error("--refresh와 --offline은 함께 쓸 수 없습니다");

  const env = await loadEnvFile(join(ROOT, ".env"));
  console.log(`버스 네트워크 범위: ${JSON.stringify(TARGET_BOUNDS)}`);
  console.log(`도로거리 폴백: 직선거리 × ${ROAD_DETOUR_FACTOR}`);

  console.log("\n[1/5] 경기 GBIS 오늘자 기반정보 확인");
  const gbisSources = await fetchGbisSources({
    serviceKey: env.DATA_GO_KR_KEY,
    rawDir: RAW_DIR,
    refresh,
    offline,
  });
  if (gbisSources.mode === "offline-cache") {
    console.log(
      `  온라인 조회 대신 최신 유효 캐시 사용 (${gbisSources.fallbackReason})` +
        (gbisSources.versionsAligned ? "" : " · route/routeStation 버전 다름")
    );
  }
  console.log(
    `  route v${gbisSources.routeVersion}: ${gbisSources.downloads.route.reused ? "캐시" : "다운로드"} ` +
      `${(gbisSources.downloads.route.bytes / 1024 / 1024).toFixed(1)} MB`
  );
  console.log(
    `  routeStation v${gbisSources.routeStationVersion}: ` +
      `${gbisSources.downloads.routeStation.reused ? "캐시" : "다운로드"} ` +
      `${(gbisSources.downloads.routeStation.bytes / 1024 / 1024).toFixed(1)} MB`
  );

  const [routeText, routeStationText] = await Promise.all([
    readFile(gbisSources.routePath, "utf8"),
    readFile(gbisSources.routeStationPath, "utf8"),
  ]);
  const routeInfo = parseGbisRouteInfo(routeText);
  const gyeonggiStations = parseGbisRouteStations(routeStationText);
  console.log(
    `  노선 ${routeInfo.rowCount.toLocaleString()}개 · 정류 순서 ` +
      `${gyeonggiStations.rows.length.toLocaleString()}행` +
      (gyeonggiStations.invalidRows ? ` · 무효 ${gyeonggiStations.invalidRows.toLocaleString()}행` : "")
  );

  console.log("\n[2/5] 2023 BMS를 현재 정확 키에만 결합");
  const currentKeys = new Set(
    gyeonggiStations.rows.map((row) => makeBmsKey(row.routeId, row.staOrder, row.stationId))
  );
  const bms = await loadBmsCsv(BMS_CSV, { wantedKeys: currentKeys });
  const matchedCurrentRows = gyeonggiStations.rows.reduce(
    (count, row) =>
      count + (bms.records.has(makeBmsKey(row.routeId, row.staOrder, row.stationId)) ? 1 : 0),
    0
  );
  const matchedCurrentUniqueKeys = [...currentKeys].reduce(
    (count, key) => count + (bms.records.has(key) ? 1 : 0),
    0
  );
  const currentExactMatchRate = ratio(matchedCurrentRows, gyeonggiStations.rows.length);
  console.log(
    `  현재 행 정확 매칭 ${matchedCurrentRows.toLocaleString()}/` +
      `${gyeonggiStations.rows.length.toLocaleString()} (${percent(currentExactMatchRate)})`
  );
  console.log(
    `  BMS 원본 ${bms.stats.totalRows.toLocaleString()}행 · REAL_DSTN 유효 ` +
      `${bms.stats.realDistanceRows.toLocaleString()}행 ` +
      `(${percent(ratio(bms.stats.realDistanceRows, bms.stats.totalRows))})`
  );

  console.log("\n[3/5] 서울 busRteInfo 수집/재개");
  const seoulPageStats = { downloaded: 0, reused: 0 };
  const seoulSource = await fetchSeoulRouteRows({
    serviceKey: env.SEOUL_OPEN_DATA_KEY,
    rawDir: RAW_DIR,
    refresh,
    offline,
    onPage: ({ start, end, reused }) => {
      seoulPageStats[reused ? "reused" : "downloaded"] += 1;
      if (!reused) console.log(`  ${start.toLocaleString()}-${end.toLocaleString()} 다운로드 완료`);
    },
  });
  const seoulStations = parseSeoulRouteRows(seoulSource.rows);
  console.log(
    `  ${seoulSource.total.toLocaleString()}행 · 페이지 캐시 ${seoulPageStats.reused}개 · ` +
      `신규 ${seoulPageStats.downloaded}개`
  );

  console.log("\n[4/5] 범위 절단 및 정적 네트워크 압축");
  const gyeonggi = buildGyeonggiRoutes({
    routeStations: gyeonggiStations.rows,
    routeInfoById: routeInfo.byRouteId,
    bmsRecords: bms.records,
  });
  const seoul = buildSeoulRoutes({ routeStations: seoulStations.rows });
  const internalRoutes = [...gyeonggi.routes, ...seoul.routes];
  const snapshotDates = bms.stats.snapshotDates;
  const sources = {
    model: {
      bounds: TARGET_BOUNDS,
      paddingStops: 1,
      roadDetourFactor: ROAD_DETOUR_FACTOR,
      distancePrecedence:
        "Gyeonggi exact routeId+staOrder+stationId BMS cumulative delta, then BMS GIS segment, then consecutive haversine times roadDetourFactor; Seoul uses the same haversine fallback",
    },
    gyeonggi: {
      dataset: "GBIS baseinfoservice v2 route and routeStation",
      acquisitionMode: gbisSources.mode,
      cacheFallbackReason: gbisSources.fallbackReason ?? null,
      versionsAligned: gbisSources.versionsAligned,
      routeVersion: gbisSources.routeVersion,
      routeStationVersion: gbisSources.routeStationVersion,
      sourceRouteRows: routeInfo.rowCount,
      sourceRouteStationRows: gyeonggiStations.rawRowCount,
      includedRoutes: gyeonggi.stats.includedRoutes,
      headwayPolicy:
        "weekday peekAlloc, then weekday npeekAlloc, then defaultHeadwayMin; accepted commuter range 2..60 minutes",
      headwaySources: gyeonggi.stats.headwaySources,
      bms: {
        dataset: "Gyeonggi BMS route-stop snapshot",
        snapshotDates,
        joinKey: "routeId+staOrder+stationId",
        sourceRows: bms.stats.totalRows,
        currentExactMatchedRows: matchedCurrentRows,
        currentRouteStationRows: gyeonggiStations.rows.length,
        currentExactMatchRate,
        currentExactMatchedUniqueKeys: matchedCurrentUniqueKeys,
        currentUniqueKeys: currentKeys.size,
        retainedDuplicateExactRows: bms.stats.duplicateExactRows,
        realDistanceCoverage: ratio(bms.stats.realDistanceRows, bms.stats.totalRows),
        realDistancePolicy: "reported for coverage only; never primary",
        usedSegmentSources: gyeonggi.stats.distanceSources,
      },
      routeOrderConflicts: gyeonggi.stats.conflictingOrders,
    },
    seoul: {
      dataset: "Seoul Open Data busRteInfo",
      sourceRows: seoulSource.total,
      sourceRoutes: seoul.stats.sourceRoutes,
      includedRoutes: seoul.stats.includedRoutes,
      headwayPolicy:
        `busRteInfo has no current headway field; conservative default ${DEFAULT_HEADWAY_MIN} minutes`,
      usedSegmentSources: seoul.stats.distanceSources,
      routeOrderConflicts: seoul.stats.conflictingOrders,
    },
  };
  const network = encodeBusNetwork(internalRoutes, { sources });
  const outputStat = await writeBusNetwork(OUTPUT, network);
  console.log(
    `  경기 ${gyeonggi.routes.length.toLocaleString()}노선 + ` +
      `서울 ${seoul.routes.length.toLocaleString()}노선`
  );
  console.log(
    `  정류소 ${network.stops.length.toLocaleString()}개 · 노선 ${network.routes.length.toLocaleString()}개`
  );
  console.log(`  출력 ${(outputStat.size / 1024 / 1024).toFixed(2)} MB: data/dist/bus-network.json`);

  console.log("\n[5/5] 판교역 → SK AX 400m 양끝 순방향 후보");
  const subway = JSON.parse(await readFile(SUBWAY_GRAPH, "utf8"));
  const pangyo = subway.stations.find((station) => station.name === "판교");
  if (!pangyo) throw new Error("subway-graph.json에서 판교역을 찾지 못했습니다");
  const orderedInternalRoutes = [...internalRoutes].sort(
    (left, right) =>
      left.source.localeCompare(right.source) ||
      left.sourceRouteId.localeCompare(right.sourceRouteId)
  );
  const pangyoCandidates = findForwardCandidates(network, pangyo, SK_AX, PANGYO_RADIUS_M).map(
    (candidate) => ({
      source: sourceLabel(orderedInternalRoutes[candidate.routeIndex].source),
      sourceRouteId: orderedInternalRoutes[candidate.routeIndex].sourceRouteId,
      ...candidate,
    })
  );
  if (pangyoCandidates.length === 0) {
    console.log("  후보 없음");
  } else {
    for (const candidate of pangyoCandidates) {
      console.log(
        `  ${candidate.source} ${candidate.routeName} (${candidate.sourceRouteId}) · ` +
          `${candidate.boardStop} → ${candidate.alightStop} · ` +
          `노선 ${candidate.routeMeters.toLocaleString()}m · 배차 ${candidate.headwayMin}분 · ` +
          `접근 ${candidate.boardWalkMeters}m/${candidate.alightWalkMeters}m`
      );
    }
  }
  console.log(`\n완료: 판교 후보 ${pangyoCandidates.length}개`);
}

main().catch((error) => {
  // 요청 URL과 키는 오류 객체에 포함시키지 않도록 하위 fetch 함수에서 이미 정제한다.
  console.error(`버스 네트워크 생성 실패: ${error.message}`);
  process.exitCode = 1;
});
