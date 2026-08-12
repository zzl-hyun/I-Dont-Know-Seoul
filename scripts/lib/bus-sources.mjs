import { createReadStream, createWriteStream } from "node:fs";
import {
  access,
  mkdir,
  readFile,
  readdir,
  rename,
  stat,
  writeFile,
} from "node:fs/promises";
import { dirname, join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createInterface } from "node:readline";
import { haversineM } from "./geo.mjs";

export const BUS_NETWORK_VERSION = 1;
export const DEFAULT_HEADWAY_MIN = 15;
export const ROAD_DETOUR_FACTOR = 1.25;
export const TARGET_BOUNDS = Object.freeze({
  minLng: 126.65,
  maxLng: 127.3,
  minLat: 37.1,
  maxLat: 37.8,
});

const MIN_HEADWAY_MIN = 2;
// 한 시간보다 드문 노선은 일상 통근의 첫·마지막 구간 후보로 신뢰하지 않는다.
// 브라우저 소비자도 같은 2..60분 범위를 사용한다.
const MAX_HEADWAY_MIN = 60;
const MAX_SEGMENT_M = 30_000;
const SEOUL_PAGE_SIZE = 1_000;
const SEOUL_CACHE_SCHEMA = 1;
const FETCH_TIMEOUT_MS = 60_000;

const GBIS_BASE_INFO_URL =
  "https://apis.data.go.kr/6410000/baseinfoservice/v2/getBaseInfoItemv2";
const SEOUL_BUS_ROUTE_URL = "http://openapi.seoul.go.kr:8088";

/** `.env`를 읽되 키 값을 로그나 반환 객체 밖으로 직렬화하지 않는다. */
export async function loadEnvFile(path) {
  let text;
  try {
    text = await readFile(path, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") return {};
    throw error;
  }
  const values = {};
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    let value = match[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    values[match[1]] = value;
  }
  return values;
}

/** `^` 레코드, `|` 필드인 GBIS 기반정보 파일을 파싱한다. */
export function parseCaretTable(text) {
  const clean = text.replace(/^\uFEFF/, "").trim();
  if (!clean) return { header: [], rows: [] };
  const records = clean.split("^");
  const header = records.shift().split("|").map((value) => value.trim());
  const rows = records
    .map((record) => record.replace(/^\s+|\s+$/g, ""))
    .filter(Boolean)
    .map((record) => record.split("|"));
  return { header, rows };
}

function columnIndexes(header, required) {
  const indexes = {};
  for (const name of required) {
    const index = header.indexOf(name);
    if (index < 0) throw new Error(`필수 컬럼 없음: ${name}`);
    indexes[name] = index;
  }
  return indexes;
}

function stringAt(fields, index) {
  return String(fields[index] ?? "").trim();
}

function finiteNumber(value) {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function integerAt(fields, index) {
  const value = finiteNumber(fields[index]);
  return value !== null && Number.isInteger(value) ? value : null;
}

export function normalizeHeadway(...candidates) {
  for (const candidate of candidates) {
    const value = finiteNumber(candidate);
    if (value === null || value < MIN_HEADWAY_MIN || value > MAX_HEADWAY_MIN) continue;
    return Math.round(value);
  }
  return DEFAULT_HEADWAY_MIN;
}

function headwayCandidate(value) {
  const number = finiteNumber(value);
  if (number === null || number < MIN_HEADWAY_MIN || number > MAX_HEADWAY_MIN) return null;
  return Math.round(number);
}

export function parseGbisRouteInfo(text) {
  const { header, rows } = parseCaretTable(text);
  const i = columnIndexes(header, ["routeId", "routeName", "peekAlloc", "npeekAlloc"]);
  const byRouteId = new Map();
  for (const fields of rows) {
    const routeId = stringAt(fields, i.routeId);
    if (!routeId) continue;
    const routeName = stringAt(fields, i.routeName) || routeId;
    const peakHeadway = headwayCandidate(fields[i.peekAlloc]);
    const offPeakHeadway = headwayCandidate(fields[i.npeekAlloc]);
    byRouteId.set(routeId, {
      routeId,
      routeName,
      // 출근 추천 모델이므로 평일 첨두 배차를 우선하고, 없을 때 평일 비첨두를 쓴다.
      headwayMin: peakHeadway ?? offPeakHeadway ?? DEFAULT_HEADWAY_MIN,
      headwaySource: peakHeadway !== null ? "peekAlloc" : offPeakHeadway !== null ? "npeekAlloc" : "default",
    });
  }
  return { byRouteId, rowCount: rows.length };
}

export function parseGbisRouteStations(text) {
  const { header, rows } = parseCaretTable(text);
  const i = columnIndexes(header, [
    "routeId",
    "routeName",
    "upDown",
    "staOrder",
    "stationId",
    "stationName",
    "x",
    "y",
  ]);
  const parsed = [];
  let invalidRows = 0;
  for (const fields of rows) {
    const routeId = stringAt(fields, i.routeId);
    const stationId = stringAt(fields, i.stationId);
    const staOrder = integerAt(fields, i.staOrder);
    const lng = finiteNumber(fields[i.x]);
    const lat = finiteNumber(fields[i.y]);
    if (!routeId || !stationId || staOrder === null || lat === null || lng === null) {
      invalidRows += 1;
      continue;
    }
    parsed.push({
      routeId,
      routeName: stringAt(fields, i.routeName) || routeId,
      upDown: stringAt(fields, i.upDown),
      staOrder,
      stationId,
      stationName: stringAt(fields, i.stationName) || "이름 없는 정류소",
      lat,
      lng,
    });
  }
  return { rows: parsed, rawRowCount: rows.length, invalidRows };
}

/** RFC 4180의 따옴표와 이중 따옴표를 처리하는 한 줄 CSV 파서. */
export function parseCsvLine(line) {
  const fields = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (quoted) {
      if (char === '"' && line[index + 1] === '"') {
        value += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        value += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      fields.push(value);
      value = "";
    } else if (char !== "\r") {
      value += char;
    }
  }
  fields.push(value);
  return fields;
}

export function makeBmsKey(routeId, staOrder, stationId) {
  return `${routeId}\u0000${staOrder}\u0000${stationId}`;
}

function parseBmsHeader(headerFields) {
  const normalized = headerFields.map((value) => value.replace(/^\uFEFF/, "").trim());
  return columnIndexes(normalized, [
    "ROUTE_ID",
    "STTN_ORDR",
    "STTN_ID",
    "GIS_DSTN",
    "ACCMLT_DSTN",
    "REAL_DSTN",
    "DCSN_DSTN",
    "PROGRS_DIV_CD",
    "REGIST_DE",
    "ETL_LDADNG_DTM",
  ]);
}

function parseBmsRecord(fields, indexes) {
  const routeId = stringAt(fields, indexes.ROUTE_ID);
  const staOrder = integerAt(fields, indexes.STTN_ORDR);
  const stationId = stringAt(fields, indexes.STTN_ID);
  if (!routeId || staOrder === null || !stationId) return null;
  return {
    routeId,
    staOrder,
    stationId,
    gisMeters: finiteNumber(fields[indexes.GIS_DSTN]),
    cumulativeMeters: finiteNumber(fields[indexes.ACCMLT_DSTN]),
    realMeters: finiteNumber(fields[indexes.REAL_DSTN]),
    decidedMeters: finiteNumber(fields[indexes.DCSN_DSTN]),
    progressCode: stringAt(fields, indexes.PROGRS_DIV_CD),
    registeredAt: stringAt(fields, indexes.REGIST_DE).replace(/\D/g, ""),
    snapshotDate: stringAt(fields, indexes.ETL_LDADNG_DTM),
  };
}

function bmsFiniteScore(record) {
  return [
    record.gisMeters,
    record.cumulativeMeters,
    record.realMeters,
    record.decidedMeters,
  ].filter((value) => Number.isFinite(value)).length;
}

function bmsStableSignature(record) {
  return [
    record.routeId,
    record.staOrder,
    record.stationId,
    record.gisMeters ?? "",
    record.cumulativeMeters ?? "",
    record.realMeters ?? "",
    record.decidedMeters ?? "",
    record.progressCode,
    record.registeredAt,
  ].join("|");
}

/** 같은 정확 키가 여러 개인 BMS 행 중 사용할 행을 순서와 무관하게 고른다. */
export function preferBmsRecord(left, right) {
  const leftUsable = Number.isFinite(left.gisMeters) || Number.isFinite(left.cumulativeMeters);
  const rightUsable = Number.isFinite(right.gisMeters) || Number.isFinite(right.cumulativeMeters);
  if (leftUsable !== rightUsable) return leftUsable ? left : right;
  if (left.registeredAt !== right.registeredAt) {
    return left.registeredAt > right.registeredAt ? left : right;
  }
  const leftScore = bmsFiniteScore(left);
  const rightScore = bmsFiniteScore(right);
  if (leftScore !== rightScore) return leftScore > rightScore ? left : right;
  return bmsStableSignature(left) <= bmsStableSignature(right) ? left : right;
}

function createBmsAccumulator(wantedKeys) {
  const records = new Map();
  const snapshotDates = new Set();
  const stats = {
    totalRows: 0,
    invalidRows: 0,
    retainedRows: 0,
    duplicateExactRows: 0,
    realDistanceRows: 0,
  };
  return {
    add(record) {
      stats.totalRows += 1;
      if (!record) {
        stats.invalidRows += 1;
        return;
      }
      if (Number.isFinite(record.realMeters)) stats.realDistanceRows += 1;
      if (record.snapshotDate) snapshotDates.add(record.snapshotDate);
      const key = makeBmsKey(record.routeId, record.staOrder, record.stationId);
      if (wantedKeys && !wantedKeys.has(key)) return;
      stats.retainedRows += 1;
      const previous = records.get(key);
      if (previous) {
        stats.duplicateExactRows += 1;
        records.set(key, preferBmsRecord(previous, record));
      } else {
        records.set(key, record);
      }
    },
    finish() {
      return {
        records,
        stats: {
          ...stats,
          retainedUniqueKeys: records.size,
          snapshotDates: [...snapshotDates].sort(),
        },
      };
    },
  };
}

export function parseBmsCsvText(text, { wantedKeys } = {}) {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter(Boolean);
  if (lines.length === 0) throw new Error("BMS CSV가 비어 있습니다");
  const indexes = parseBmsHeader(parseCsvLine(lines.shift()));
  const accumulator = createBmsAccumulator(wantedKeys);
  for (const line of lines) accumulator.add(parseBmsRecord(parseCsvLine(line), indexes));
  return accumulator.finish();
}

export async function loadBmsCsv(path, { wantedKeys } = {}) {
  const input = createReadStream(path, { encoding: "utf8" });
  const lines = createInterface({ input, crlfDelay: Infinity });
  let indexes = null;
  const accumulator = createBmsAccumulator(wantedKeys);
  for await (const line of lines) {
    if (!indexes) {
      indexes = parseBmsHeader(parseCsvLine(line));
      continue;
    }
    if (!line.trim()) continue;
    accumulator.add(parseBmsRecord(parseCsvLine(line), indexes));
  }
  if (!indexes) throw new Error("BMS CSV가 비어 있습니다");
  return accumulator.finish();
}

export function parseSeoulRouteRows(rows) {
  const parsed = [];
  let invalidRows = 0;
  for (const row of rows ?? []) {
    const routeId = String(row.ROUTE_ID ?? "").trim();
    const sequence = finiteNumber(row.SN);
    const lng = finiteNumber(row.XCRD);
    const lat = finiteNumber(row.YCRD);
    if (!routeId || !Number.isInteger(sequence) || lat === null || lng === null) {
      invalidRows += 1;
      continue;
    }
    const nodeId = String(row.NODE_ID ?? row.ARS_ID ?? "").trim();
    parsed.push({
      routeId,
      routeName: String(row.RTE_NM ?? routeId).trim() || routeId,
      staOrder: sequence,
      stationId: nodeId || `${routeId}:${sequence}`,
      stationName: String(row.STATION_NM ?? "이름 없는 정류소").trim(),
      lat,
      lng,
    });
  }
  return { rows: parsed, rawRowCount: rows?.length ?? 0, invalidRows };
}

export function isInsideBounds(point, bounds = TARGET_BOUNDS) {
  return (
    point.lng >= bounds.minLng &&
    point.lng <= bounds.maxLng &&
    point.lat >= bounds.minLat &&
    point.lat <= bounds.maxLat
  );
}

/** 첫/마지막 범위 내 정류소 사이의 전 순서를 보존한다. */
export function clipOrderedStops(stops, bounds = TARGET_BOUNDS, paddingStops = 1) {
  const insideIndexes = [];
  for (let index = 0; index < stops.length; index += 1) {
    if (isInsideBounds(stops[index], bounds)) insideIndexes.push(index);
  }
  if (insideIndexes.length < 2) return null;
  const first = Math.max(0, insideIndexes[0] - paddingStops);
  const last = Math.min(stops.length - 1, insideIndexes.at(-1) + paddingStops);
  return stops.slice(first, last + 1);
}

function normalizeRouteOrder(rows) {
  const sorted = [...rows].sort(
    (left, right) => left.staOrder - right.staOrder || left.stationId.localeCompare(right.stationId)
  );
  const exact = new Set();
  const byOrder = new Map();
  let exactDuplicates = 0;
  let conflictingOrders = 0;
  for (const row of sorted) {
    const exactKey = `${row.staOrder}\u0000${row.stationId}`;
    if (exact.has(exactKey)) {
      exactDuplicates += 1;
      continue;
    }
    exact.add(exactKey);
    if (byOrder.has(row.staOrder)) {
      // 한 순번에 여러 정류소가 있으면 단일 순서 그래프로 표현할 수 없다.
      // 정류소 ID 사전순 첫 행을 고정해 빌드를 결정적으로 만들고 통계에 남긴다.
      conflictingOrders += 1;
      continue;
    }
    byOrder.set(row.staOrder, row);
  }
  return {
    stops: [...byOrder.values()],
    exactDuplicates,
    conflictingOrders,
  };
}

function groupByRoute(rows) {
  const grouped = new Map();
  for (const row of rows) {
    if (!grouped.has(row.routeId)) grouped.set(row.routeId, []);
    grouped.get(row.routeId).push(row);
  }
  return grouped;
}

function isSaneRoadDistance(distance, straightMeters) {
  if (!Number.isFinite(distance) || distance <= 0 || distance > MAX_SEGMENT_M) return false;
  const minimum = Math.max(1, straightMeters * 0.7);
  const maximum = Math.min(MAX_SEGMENT_M, Math.max(5_000, straightMeters * 8));
  return distance >= minimum && distance <= maximum;
}

export function resolveGbisSegmentMeters(
  previous,
  current,
  bmsRecords,
  roadDetourFactor = ROAD_DETOUR_FACTOR
) {
  const straightMeters = haversineM(previous.lat, previous.lng, current.lat, current.lng);
  const previousBms = bmsRecords.get(
    makeBmsKey(previous.routeId, previous.staOrder, previous.stationId)
  );
  const currentBms = bmsRecords.get(
    makeBmsKey(current.routeId, current.staOrder, current.stationId)
  );

  // 양 끝이 모두 현재 routeStation의 정확 키로 매칭돼야 오래된 BMS 구간을 쓴다.
  if (previousBms && currentBms && current.staOrder > previous.staOrder) {
    const cumulativeDelta =
      Number.isFinite(previousBms.cumulativeMeters) &&
      Number.isFinite(currentBms.cumulativeMeters)
        ? currentBms.cumulativeMeters - previousBms.cumulativeMeters
        : null;
    if (isSaneRoadDistance(cumulativeDelta, straightMeters)) {
      return { meters: Math.round(cumulativeDelta), source: "bms-cumulative" };
    }
    if (isSaneRoadDistance(currentBms.gisMeters, straightMeters)) {
      return { meters: Math.round(currentBms.gisMeters), source: "bms-gis" };
    }
  }

  return {
    meters: Math.max(1, Math.round(straightMeters * roadDetourFactor)),
    source: "haversine-detour",
  };
}

function buildCumulative(stops, segmentDistance) {
  const cumulativeMeters = [0];
  const distanceSources = {};
  for (let index = 1; index < stops.length; index += 1) {
    const segment = segmentDistance(stops[index - 1], stops[index]);
    const meters = Math.max(1, Math.round(segment.meters));
    cumulativeMeters.push(cumulativeMeters.at(-1) + meters);
    distanceSources[segment.source] = (distanceSources[segment.source] ?? 0) + 1;
  }
  return { cumulativeMeters, distanceSources };
}

function mergeCounts(target, source) {
  for (const [key, value] of Object.entries(source)) {
    target[key] = (target[key] ?? 0) + value;
  }
}

export function buildGyeonggiRoutes({
  routeStations,
  routeInfoById,
  bmsRecords,
  bounds = TARGET_BOUNDS,
  paddingStops = 1,
  roadDetourFactor = ROAD_DETOUR_FACTOR,
}) {
  const grouped = groupByRoute(routeStations);
  const routes = [];
  const stats = {
    sourceRoutes: grouped.size,
    includedRoutes: 0,
    exactDuplicates: 0,
    conflictingOrders: 0,
    distanceSources: {},
    headwaySources: {},
  };

  for (const [routeId, rawStops] of grouped) {
    const normalized = normalizeRouteOrder(rawStops);
    stats.exactDuplicates += normalized.exactDuplicates;
    stats.conflictingOrders += normalized.conflictingOrders;
    const clipped = clipOrderedStops(normalized.stops, bounds, paddingStops);
    if (!clipped) continue;

    const routeInfo = routeInfoById.get(routeId);
    const headwayMin = routeInfo?.headwayMin ?? DEFAULT_HEADWAY_MIN;
    const headwaySource = routeInfo?.headwaySource ?? "default";
    const { cumulativeMeters, distanceSources } = buildCumulative(clipped, (previous, current) =>
      resolveGbisSegmentMeters(previous, current, bmsRecords, roadDetourFactor)
    );
    mergeCounts(stats.distanceSources, distanceSources);
    stats.headwaySources[headwaySource] = (stats.headwaySources[headwaySource] ?? 0) + 1;

    routes.push({
      source: "gyeonggi",
      sourceRouteId: routeId,
      name: routeInfo?.routeName ?? clipped[0].routeName ?? routeId,
      headwayMin,
      stops: clipped.map((stop) => ({
        key: `gyeonggi:${stop.stationId}`,
        name: stop.stationName,
        lat: stop.lat,
        lng: stop.lng,
      })),
      cumulativeMeters,
    });
  }
  stats.includedRoutes = routes.length;
  return { routes, stats };
}

export function buildSeoulRoutes({
  routeStations,
  bounds = TARGET_BOUNDS,
  paddingStops = 1,
  roadDetourFactor = ROAD_DETOUR_FACTOR,
  defaultHeadwayMin = DEFAULT_HEADWAY_MIN,
}) {
  const grouped = groupByRoute(routeStations);
  const routes = [];
  const stats = {
    sourceRoutes: grouped.size,
    includedRoutes: 0,
    exactDuplicates: 0,
    conflictingOrders: 0,
    distanceSources: {},
  };
  for (const [routeId, rawStops] of grouped) {
    const normalized = normalizeRouteOrder(rawStops);
    stats.exactDuplicates += normalized.exactDuplicates;
    stats.conflictingOrders += normalized.conflictingOrders;
    const clipped = clipOrderedStops(normalized.stops, bounds, paddingStops);
    if (!clipped) continue;
    const { cumulativeMeters, distanceSources } = buildCumulative(clipped, (previous, current) => ({
      meters:
        haversineM(previous.lat, previous.lng, current.lat, current.lng) * roadDetourFactor,
      source: "haversine-detour",
    }));
    mergeCounts(stats.distanceSources, distanceSources);
    routes.push({
      source: "seoul",
      sourceRouteId: routeId,
      name: clipped[0].routeName ?? routeId,
      headwayMin: normalizeHeadway(defaultHeadwayMin),
      stops: clipped.map((stop) => ({
        key: `seoul:${stop.stationId}`,
        name: stop.stationName,
        lat: stop.lat,
        lng: stop.lng,
      })),
      cumulativeMeters,
    });
  }
  stats.includedRoutes = routes.length;
  return { routes, stats };
}

function round6(value) {
  return Math.round(value * 1_000_000) / 1_000_000;
}

export function encodeBusNetwork(
  routes,
  {
    sources,
    generatedAt = new Date().toISOString(),
    defaultHeadwayMin = DEFAULT_HEADWAY_MIN,
  } = {}
) {
  const sortedRoutes = [...routes].sort(
    (left, right) =>
      left.source.localeCompare(right.source) ||
      left.sourceRouteId.localeCompare(right.sourceRouteId)
  );
  const stops = [];
  const stopIndexByKey = new Map();
  const encodedRoutes = [];

  for (const route of sortedRoutes) {
    const stopIndexes = route.stops.map((stop) => {
      let index = stopIndexByKey.get(stop.key);
      if (index !== undefined) return index;
      index = stops.length;
      stopIndexByKey.set(stop.key, index);
      stops.push([stop.name, round6(stop.lat), round6(stop.lng)]);
      return index;
    });
    encodedRoutes.push([
      route.name,
      normalizeHeadway(route.headwayMin, defaultHeadwayMin),
      stopIndexes,
      route.cumulativeMeters.map((value) => Math.round(value)),
    ]);
  }

  const network = {
    version: BUS_NETWORK_VERSION,
    generatedAt,
    defaultHeadwayMin,
    sources: sources ?? {},
    stops,
    routes: encodedRoutes,
  };
  validateBusNetwork(network);
  return network;
}

export function validateBusNetwork(network) {
  if (!network || typeof network !== "object") throw new Error("버스 네트워크가 객체가 아님");
  if (network.version !== BUS_NETWORK_VERSION) throw new Error("버스 네트워크 버전 불일치");
  if (!Array.isArray(network.stops) || !Array.isArray(network.routes)) {
    throw new Error("버스 네트워크 stops/routes 형식 오류");
  }
  for (const [index, stop] of network.stops.entries()) {
    if (
      !Array.isArray(stop) ||
      stop.length !== 3 ||
      typeof stop[0] !== "string" ||
      !Number.isFinite(stop[1]) ||
      !Number.isFinite(stop[2])
    ) {
      throw new Error(`정류소 ${index} 형식 오류`);
    }
  }
  for (const [routeIndex, route] of network.routes.entries()) {
    if (!Array.isArray(route) || route.length !== 4) {
      throw new Error(`노선 ${routeIndex} 형식 오류`);
    }
    const [name, headwayMin, stopIndexes, cumulativeMeters] = route;
    if (typeof name !== "string" || !Number.isFinite(headwayMin)) {
      throw new Error(`노선 ${routeIndex} 이름/배차 형식 오류`);
    }
    if (
      !Array.isArray(stopIndexes) ||
      !Array.isArray(cumulativeMeters) ||
      stopIndexes.length < 2 ||
      stopIndexes.length !== cumulativeMeters.length
    ) {
      throw new Error(`노선 ${routeIndex} 정류소/거리 길이 오류`);
    }
    if (cumulativeMeters[0] !== 0) throw new Error(`노선 ${routeIndex} 누적거리 시작 오류`);
    for (let index = 0; index < stopIndexes.length; index += 1) {
      if (
        !Number.isInteger(stopIndexes[index]) ||
        stopIndexes[index] < 0 ||
        stopIndexes[index] >= network.stops.length
      ) {
        throw new Error(`노선 ${routeIndex} 정류소 인덱스 오류`);
      }
      if (
        !Number.isFinite(cumulativeMeters[index]) ||
        (index > 0 && cumulativeMeters[index] < cumulativeMeters[index - 1])
      ) {
        throw new Error(`노선 ${routeIndex} 누적거리 단조성 오류`);
      }
    }
  }
  return true;
}

export function findForwardCandidates(network, from, to, radiusMeters = 400) {
  validateBusNetwork(network);
  const candidates = [];
  for (const [routeIndex, route] of network.routes.entries()) {
    const [routeName, headwayMin, stopIndexes, cumulativeMeters] = route;
    const fromIndexes = [];
    const toIndexes = [];
    for (let sequence = 0; sequence < stopIndexes.length; sequence += 1) {
      const stop = network.stops[stopIndexes[sequence]];
      const fromDistance = haversineM(from.lat, from.lng, stop[1], stop[2]);
      const toDistance = haversineM(to.lat, to.lng, stop[1], stop[2]);
      if (fromDistance <= radiusMeters) fromIndexes.push({ sequence, distance: fromDistance });
      if (toDistance <= radiusMeters) toIndexes.push({ sequence, distance: toDistance });
    }
    let best = null;
    for (const start of fromIndexes) {
      for (const end of toIndexes) {
        if (end.sequence <= start.sequence) continue;
        const routeMeters = cumulativeMeters[end.sequence] - cumulativeMeters[start.sequence];
        const score = start.distance + routeMeters + end.distance;
        if (!best || score < best.score) best = { start, end, routeMeters, score };
      }
    }
    if (!best) continue;
    const boardStop = network.stops[stopIndexes[best.start.sequence]];
    const alightStop = network.stops[stopIndexes[best.end.sequence]];
    candidates.push({
      routeIndex,
      routeName,
      headwayMin,
      boardStop: boardStop[0],
      alightStop: alightStop[0],
      boardWalkMeters: Math.round(best.start.distance),
      alightWalkMeters: Math.round(best.end.distance),
      routeMeters: Math.round(best.routeMeters),
    });
  }
  return candidates.sort(
    (left, right) =>
      left.routeMeters + left.boardWalkMeters + left.alightWalkMeters -
        (right.routeMeters + right.boardWalkMeters + right.alightWalkMeters) ||
      left.routeName.localeCompare(right.routeName)
  );
}

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function isValidCaretCache(path, expectedHeader) {
  try {
    const text = await readFile(path, "utf8");
    if (!text.startsWith(expectedHeader)) return false;
    const table = parseCaretTable(text);
    if (table.header.length < 2 || table.rows.length === 0) return false;
    return table.rows.every((row) => row.length === table.header.length);
  } catch {
    return false;
  }
}

function compareVersion(left, right) {
  if (left.length !== right.length) return left.length - right.length;
  return left.localeCompare(right);
}

async function validVersionedCaches(rawDir, pattern, expectedHeader) {
  let entries;
  try {
    entries = await readdir(rawDir, { withFileTypes: true });
  } catch {
    return [];
  }
  const candidates = entries
    .filter((entry) => entry.isFile() || entry.isSymbolicLink())
    .map((entry) => ({ name: entry.name, match: entry.name.match(pattern) }))
    .filter(({ match }) => match)
    .map(({ name, match }) => ({
      version: match[1],
      path: join(rawDir, name),
    }));
  const checked = await Promise.all(
    candidates.map(async (candidate) => ({
      ...candidate,
      valid: await isValidCaretCache(candidate.path, expectedHeader),
    }))
  );
  return checked
    .filter((candidate) => candidate.valid)
    .sort((left, right) => compareVersion(right.version, left.version));
}

/**
 * 네트워크 없이도 재현할 수 있도록 data/raw에서 가장 최신인 유효 GBIS 파일 쌍을 찾는다.
 * 같은 버전 쌍을 우선하고, API처럼 두 항목 버전이 독립적으로 갱신된 경우에만
 * 각 종류의 최신 유효 파일을 한 쌍으로 사용한다. `.part`와 헤더만 남은 손상 파일은 제외한다.
 */
export async function findLatestCachedGbisPair(rawDir) {
  const [routes, routeStations] = await Promise.all([
    validVersionedCaches(rawDir, /^gbis-route-(\d+)\.txt$/, "routeId|adminName|"),
    validVersionedCaches(
      rawDir,
      /^gbis-route-station-(\d+)\.txt$/,
      "routeId|routeName|upDown|staOrder|"
    ),
  ]);
  if (routes.length === 0 || routeStations.length === 0) return null;

  const stationByVersion = new Map(routeStations.map((candidate) => [candidate.version, candidate]));
  const sameVersionRoute = routes.find((candidate) => stationByVersion.has(candidate.version));
  const route = sameVersionRoute ?? routes[0];
  const routeStation = sameVersionRoute
    ? stationByVersion.get(sameVersionRoute.version)
    : routeStations[0];
  const [routeStat, routeStationStat] = await Promise.all([
    stat(route.path),
    stat(routeStation.path),
  ]);
  return {
    mode: "offline-cache",
    routeVersion: route.version,
    routeStationVersion: routeStation.version,
    versionsAligned: route.version === routeStation.version,
    routePath: route.path,
    routeStationPath: routeStation.path,
    downloads: {
      route: { path: route.path, reused: true, bytes: routeStat.size },
      routeStation: {
        path: routeStation.path,
        reused: true,
        bytes: routeStationStat.size,
      },
    },
  };
}

async function cachedGbisOrThrow(rawDir, reason, originalError) {
  const cached = await findLatestCachedGbisPair(rawDir);
  if (cached) return { ...cached, fallbackReason: reason };
  throw new Error(`${originalError.message}; 유효한 GBIS 오프라인 캐시 쌍도 없습니다`);
}

async function writeJsonAtomic(path, value) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value)}\n`);
  await rename(temporary, path);
}

async function downloadToCache({
  url,
  path,
  expectedHeader,
  label,
  refresh = false,
  fetchImpl = fetch,
}) {
  if (!refresh && (await isValidCaretCache(path, expectedHeader))) {
    return { path, reused: true, bytes: (await stat(path)).size };
  }
  await mkdir(dirname(path), { recursive: true });
  const partialPath = `${path}.part`;
  let offset = 0;
  if (!refresh && (await exists(partialPath))) offset = (await stat(partialPath)).size;
  const headers = offset > 0 ? { Range: `bytes=${offset}-` } : {};
  let response;
  try {
    response = await fetchImpl(url, {
      headers,
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
  } catch {
    throw new Error(`${label} 다운로드 연결 실패`);
  }
  if (!response.ok) throw new Error(`${label} 다운로드 실패 (HTTP ${response.status})`);
  const append = offset > 0 && response.status === 206;
  if (!response.body) throw new Error(`${label} 다운로드 본문 없음`);
  await pipeline(
    Readable.fromWeb(response.body),
    createWriteStream(partialPath, { flags: append ? "a" : "w" })
  );
  if (!(await isValidCaretCache(partialPath, expectedHeader))) {
    throw new Error(`${label} 캐시 구조 검증 실패`);
  }
  await rename(partialPath, path);
  return { path, reused: false, bytes: (await stat(path)).size };
}

export async function fetchGbisSources({
  serviceKey,
  rawDir,
  refresh = false,
  offline = false,
  fetchImpl = fetch,
}) {
  if (offline) {
    return cachedGbisOrThrow(
      rawDir,
      "offline-requested",
      new Error("GBIS 오프라인 모드")
    );
  }
  if (!serviceKey) {
    return cachedGbisOrThrow(
      rawDir,
      "missing-key",
      new Error("DATA_GO_KR_KEY가 필요합니다")
    );
  }
  const metadataUrl = new URL(GBIS_BASE_INFO_URL);
  metadataUrl.searchParams.set("serviceKey", serviceKey);
  metadataUrl.searchParams.set("format", "json");
  let item;
  try {
    const response = await fetchImpl(metadataUrl, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!response.ok) {
      throw new Error(`GBIS 기반정보 조회 실패 (HTTP ${response.status})`);
    }
    const payload = await response.json();
    const header = payload?.response?.msgHeader;
    item = payload?.response?.msgBody?.baseInfoItem;
    if (Number(header?.resultCode) !== 0 || !item) {
      throw new Error(
        `GBIS 기반정보 조회 오류: ${header?.resultMessage ?? "응답 형식 오류"}`
      );
    }
  } catch (error) {
    const safeError =
      error instanceof Error && error.message.startsWith("GBIS 기반정보")
        ? error
        : new Error("GBIS 기반정보 조회 연결 실패");
    return cachedGbisOrThrow(rawDir, "metadata-unavailable", safeError);
  }

  const routeVersion = String(item.routeVersion ?? "");
  const routeStationVersion = String(item.routeStationVersion ?? "");
  if (!routeVersion || !routeStationVersion) {
    return cachedGbisOrThrow(
      rawDir,
      "version-unavailable",
      new Error("GBIS 버전 정보가 없습니다")
    );
  }

  const routePath = join(rawDir, `gbis-route-${routeVersion}.txt`);
  const routeStationPath = join(
    rawDir,
    `gbis-route-station-${routeStationVersion}.txt`
  );
  let routeDownload;
  let routeStationDownload;
  try {
    routeDownload = await downloadToCache({
      url: item.routeDownloadUrl,
      path: routePath,
      expectedHeader: "routeId|adminName|",
      label: "GBIS route",
      refresh,
      fetchImpl,
    });
    routeStationDownload = await downloadToCache({
      url: item.routeStationDownloadUrl,
      path: routeStationPath,
      expectedHeader: "routeId|routeName|upDown|staOrder|",
      label: "GBIS routeStation",
      refresh,
      fetchImpl,
    });
  } catch (error) {
    const safeError = error instanceof Error ? error : new Error("GBIS 다운로드 실패");
    return cachedGbisOrThrow(rawDir, "download-unavailable", safeError);
  }
  return {
    mode: "online",
    routeVersion,
    routeStationVersion,
    versionsAligned: routeVersion === routeStationVersion,
    routePath,
    routeStationPath,
    downloads: { route: routeDownload, routeStation: routeStationDownload },
  };
}

function seoulPagePath(cacheDir, start) {
  return join(cacheDir, `page-${String(start).padStart(6, "0")}.json`);
}

async function readJsonIfValid(path) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    return null;
  }
}

async function fetchSeoulPage({ serviceKey, start, end, fetchImpl }) {
  // 키가 URL path에 들어가므로 URL 자체는 오류나 진행 로그에 절대 넣지 않는다.
  const url = `${SEOUL_BUS_ROUTE_URL}/${encodeURIComponent(serviceKey)}/json/busRteInfo/${start}/${end}/`;
  let response;
  try {
    response = await fetchImpl(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  } catch {
    throw new Error(`서울 busRteInfo ${start}-${end} 연결 실패`);
  }
  if (!response.ok) {
    throw new Error(`서울 busRteInfo ${start}-${end} 실패 (HTTP ${response.status})`);
  }
  const payload = await response.json();
  const body = payload?.busRteInfo;
  if (!body || body.RESULT?.CODE !== "INFO-000") {
    const message = body?.RESULT?.MESSAGE ?? payload?.RESULT?.MESSAGE ?? "응답 형식 오류";
    throw new Error(`서울 busRteInfo ${start}-${end} 오류: ${message}`);
  }
  return {
    schema: SEOUL_CACHE_SCHEMA,
    start,
    end,
    total: Number(body.list_total_count),
    rows: body.row ?? [],
  };
}

function validSeoulPage(page, start, end, total) {
  if (
    !page ||
    page.schema !== SEOUL_CACHE_SCHEMA ||
    page.start !== start ||
    page.end !== end ||
    !Array.isArray(page.rows)
  ) {
    return false;
  }
  return total === undefined || page.total === total;
}

export async function fetchSeoulRouteRows({
  serviceKey,
  rawDir,
  refresh = false,
  offline = false,
  fetchImpl = fetch,
  onPage = () => {},
}) {
  if (offline && refresh) throw new Error("서울 버스 캐시는 --offline에서 갱신할 수 없습니다");
  if (!serviceKey && !offline) throw new Error("SEOUL_OPEN_DATA_KEY가 필요합니다");
  const cacheDir = join(rawDir, `seoul-bus-rte-info-v${SEOUL_CACHE_SCHEMA}`);
  const manifestPath = join(cacheDir, "manifest.json");
  await mkdir(cacheDir, { recursive: true });
  let manifest = refresh ? null : await readJsonIfValid(manifestPath);
  let firstPage = null;
  let total =
    manifest?.schema === SEOUL_CACHE_SCHEMA && Number.isInteger(manifest.total)
      ? manifest.total
      : null;

  if (total === null) {
    const firstPath = seoulPagePath(cacheDir, 1);
    firstPage = refresh ? null : await readJsonIfValid(firstPath);
    if (!validSeoulPage(firstPage, 1, SEOUL_PAGE_SIZE)) {
      if (offline) throw new Error("서울 busRteInfo 첫 페이지 오프라인 캐시가 없습니다");
      firstPage = await fetchSeoulPage({
        serviceKey,
        start: 1,
        end: SEOUL_PAGE_SIZE,
        fetchImpl,
      });
      await writeJsonAtomic(firstPath, firstPage);
      onPage({ start: 1, end: SEOUL_PAGE_SIZE, reused: false });
    } else {
      onPage({ start: 1, end: SEOUL_PAGE_SIZE, reused: true });
    }
    total = firstPage.total;
    manifest = { schema: SEOUL_CACHE_SCHEMA, total, complete: false };
    await writeJsonAtomic(manifestPath, manifest);
  }

  const rows = [];
  for (let start = 1; start <= total; start += SEOUL_PAGE_SIZE) {
    const end = Math.min(total, start + SEOUL_PAGE_SIZE - 1);
    const path = seoulPagePath(cacheDir, start);
    let page = start === 1 && firstPage ? firstPage : refresh ? null : await readJsonIfValid(path);
    if (!validSeoulPage(page, start, end, total)) {
      if (offline) {
        throw new Error(`서울 busRteInfo ${start}-${end} 오프라인 캐시가 없습니다`);
      }
      page = await fetchSeoulPage({ serviceKey, start, end, fetchImpl });
      if (page.total !== total) {
        throw new Error(`서울 busRteInfo 전체 건수가 수집 중 변경됨 (${total} → ${page.total})`);
      }
      await writeJsonAtomic(path, page);
      onPage({ start, end, reused: false });
    } else if (!(start === 1 && firstPage)) {
      onPage({ start, end, reused: true });
    }
    rows.push(...page.rows);
    await writeJsonAtomic(manifestPath, {
      schema: SEOUL_CACHE_SCHEMA,
      total,
      complete: end >= total,
      completedThrough: end,
    });
  }
  if (rows.length !== total) {
    throw new Error(`서울 busRteInfo 행 수 불일치 (${rows.length}/${total})`);
  }
  return { rows, total, cacheDir };
}

export async function writeBusNetwork(path, network) {
  validateBusNetwork(network);
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(network)}\n`);
  await rename(temporary, path);
  return stat(path);
}
