import type { BusNetwork, ResidentialBusReference } from "../types";
import {
  BUS_DEFAULT_HEADWAY_MIN,
  BUS_DWELL_MIN_PER_STOP,
  BUS_MAX_WAIT_MIN,
  BUS_MIN_SAVING_MIN,
  BUS_MIN_WAIT_MIN,
  BUS_SPEED_KMH,
  BUS_STOP_SEARCH_RADIUS_M,
  BUS_TRIGGER_WALK_MIN,
  MAX_NEARBY_BUS_STOPS,
  WALK_SELECTION_WEIGHT,
} from "./constants";
import { haversineM, walkMinutes } from "./geo";

export interface Coordinate {
  lat: number;
  lng: number;
}

/** 한 번 환승 없이 이동하는 첫·마지막 버스 접근 구간. */
export interface BusAccess {
  totalMin: number;
  selectionCost: number;
  routeName: string;
  headwayMin: number;
  waitMin: number;
  rideMin: number;
  rideDistanceM: number;
  stops: number;
  boardStop: string;
  alightStop: string;
  walkToBoardMin: number;
  walkFromAlightMin: number;
  /** 출발점 → 승차 정류장 */
  walkToBoardPath?: Array<[lng: number, lat: number]>;
  /** 승차 정류장 → 하차 정류장 (노선 정류장 순서) */
  ridePath: Array<[lng: number, lat: number]>;
  /** 하차 정류장 → 도착점 */
  walkFromAlightPath: Array<[lng: number, lat: number]>;
}

interface StopOccurrence {
  route: number;
  order: number;
}

interface BusIndex {
  cells: Map<string, number[]>;
  occurrences: StopOccurrence[][];
}

interface NearbyStop {
  id: number;
  walkMin: number;
}

const CELL_DEG = 0.01;
const indexCache = new WeakMap<BusNetwork, BusIndex>();

/**
 * 도보 15분을 넘는 두 점 사이에 실제 같은 노선·정방향 버스가 있을 때만
 * 정적 접근시간을 계산한다. 실시간 도착정보는 호출하지 않는다.
 */
export function findBestBusAccess(
  network: BusNetwork,
  from: Coordinate,
  to: Coordinate
): BusAccess | null {
  const directWalkMin = walkMinutes(haversineM(from.lat, from.lng, to.lat, to.lng));
  if (directWalkMin <= BUS_TRIGGER_WALK_MIN) return null;

  const index = getBusIndex(network);
  const boards = nearbyStops(network, index, from);
  const alights = nearbyStops(network, index, to);
  if (boards.length === 0 || alights.length === 0) return null;

  const alightById = new Map(alights.map((s) => [s.id, s]));
  let best: BusAccess | null = null;

  for (const board of boards) {
    for (const occurrence of index.occurrences[board.id] ?? []) {
      const route = network.routes[occurrence.route];
      if (!route) continue;
      const [routeName, rawHeadway, stopIds, cumulative] = route;
      if (stopIds.length !== cumulative.length) continue;

      for (let end = occurrence.order + 1; end < stopIds.length; end++) {
        const alight = alightById.get(stopIds[end]);
        if (!alight) continue;

        const rideDistanceM = cumulative[end] - cumulative[occurrence.order];
        if (!(rideDistanceM > 0)) continue;

        const stops = end - occurrence.order;
        const headwayMin = saneHeadway(rawHeadway, network.defaultHeadwayMin);
        const waitMin = clamp(headwayMin / 2, BUS_MIN_WAIT_MIN, BUS_MAX_WAIT_MIN);
        const rideMin =
          rideDistanceM / ((BUS_SPEED_KMH * 1000) / 60) +
          stops * BUS_DWELL_MIN_PER_STOP;
        const totalMin = board.walkMin + waitMin + rideMin + alight.walkMin;
        const selectionCost =
          (board.walkMin + alight.walkMin) * WALK_SELECTION_WEIGHT + waitMin + rideMin;

        if (totalMin + BUS_MIN_SAVING_MIN >= directWalkMin) continue;
        if (best && selectionCost >= best.selectionCost) continue;

        const boardStop = network.stops[board.id];
        const alightStop = network.stops[alight.id];
        const ridePath = stopIds
          .slice(occurrence.order, end + 1)
          .map((id): [number, number] => [network.stops[id][2], network.stops[id][1]]);

        best = {
          totalMin,
          selectionCost,
          routeName,
          headwayMin,
          waitMin,
          rideMin,
          rideDistanceM,
          stops,
          boardStop: boardStop[0],
          alightStop: alightStop[0],
          walkToBoardMin: board.walkMin,
          walkFromAlightMin: alight.walkMin,
          walkToBoardPath: [
            [from.lng, from.lat],
            [boardStop[2], boardStop[1]],
          ],
          ridePath,
          walkFromAlightPath: [
            [alightStop[2], alightStop[1]],
            [to.lng, to.lat],
          ],
        };
      }
    }
  }

  return best;
}

/**
 * 파이프라인이 고른 집→역 버스를 노선·승하차 순번으로 정확히 복원한다.
 * 현재 공개 프로필에는 거주 좌표가 없으므로 정류장을 재탐색하지 않고 저장된
 * 정방향 구간과 승차 정류장까지의 도보시간을 사용한다.
 */
export function rebuildBusAccess(
  network: BusNetwork,
  from: Coordinate | undefined,
  to: Coordinate,
  [routeId, boardOrder, alightOrder, storedWalkToBoardMin]: ResidentialBusReference
): BusAccess | null {
  const route = network.routes[routeId];
  if (!route) return null;
  const [routeName, rawHeadway, stopIds, cumulative] = route;
  if (
    !Number.isInteger(boardOrder) ||
    !Number.isInteger(alightOrder) ||
    boardOrder < 0 ||
    alightOrder <= boardOrder ||
    alightOrder >= stopIds.length ||
    stopIds.length !== cumulative.length
  ) {
    return null;
  }

  const boardStop = network.stops[stopIds[boardOrder]];
  const alightStop = network.stops[stopIds[alightOrder]];
  const rideDistanceM = cumulative[alightOrder] - cumulative[boardOrder];
  if (!boardStop || !alightStop || !(rideDistanceM > 0)) return null;

  if (!Number.isFinite(storedWalkToBoardMin) || storedWalkToBoardMin < 0) return null;
  const walkToBoardMin = storedWalkToBoardMin;
  const walkFromAlightMin = walkMinutes(
    haversineM(alightStop[1], alightStop[2], to.lat, to.lng)
  );
  const stops = alightOrder - boardOrder;
  const headwayMin = saneHeadway(rawHeadway, network.defaultHeadwayMin);
  const waitMin = clamp(headwayMin / 2, BUS_MIN_WAIT_MIN, BUS_MAX_WAIT_MIN);
  const rideMin =
    rideDistanceM / ((BUS_SPEED_KMH * 1000) / 60) +
    stops * BUS_DWELL_MIN_PER_STOP;

  return {
    totalMin: walkToBoardMin + waitMin + rideMin + walkFromAlightMin,
    selectionCost:
      (walkToBoardMin + walkFromAlightMin) * WALK_SELECTION_WEIGHT + waitMin + rideMin,
    routeName,
    headwayMin,
    waitMin,
    rideMin,
    rideDistanceM,
    stops,
    boardStop: boardStop[0],
    alightStop: alightStop[0],
    walkToBoardMin,
    walkFromAlightMin,
    walkToBoardPath: from
      ? [
          [from.lng, from.lat],
          [boardStop[2], boardStop[1]],
        ]
      : undefined,
    ridePath: stopIds
      .slice(boardOrder, alightOrder + 1)
      .map((id): [number, number] => [network.stops[id][2], network.stops[id][1]]),
    walkFromAlightPath: [
      [alightStop[2], alightStop[1]],
      [to.lng, to.lat],
    ],
  };
}

function getBusIndex(network: BusNetwork): BusIndex {
  const cached = indexCache.get(network);
  if (cached) return cached;

  const cells = new Map<string, number[]>();
  network.stops.forEach(([, lat, lng], id) => {
    const key = cellKey(lat, lng);
    const bucket = cells.get(key);
    if (bucket) bucket.push(id);
    else cells.set(key, [id]);
  });

  const occurrences: StopOccurrence[][] = Array.from(
    { length: network.stops.length },
    () => []
  );
  network.routes.forEach(([, , stopIds], route) => {
    stopIds.forEach((id, order) => {
      if (id >= 0 && id < occurrences.length) occurrences[id].push({ route, order });
    });
  });

  const built = { cells, occurrences };
  indexCache.set(network, built);
  return built;
}

function nearbyStops(
  network: BusNetwork,
  index: BusIndex,
  point: Coordinate
): NearbyStop[] {
  const y = Math.floor(point.lat / CELL_DEG);
  const x = Math.floor(point.lng / CELL_DEG);
  const out: Array<NearbyStop & { distM: number }> = [];

  // 0.01도는 수도권에서 동서 약 880m·남북 약 1.1km다. 인접 셀까지 보면
  // 반경 450m 후보를 경계에서 놓치지 않는다.
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      for (const id of index.cells.get(`${y + dy},${x + dx}`) ?? []) {
        const [, lat, lng] = network.stops[id];
        const distM = haversineM(point.lat, point.lng, lat, lng);
        if (distM <= BUS_STOP_SEARCH_RADIUS_M) {
          out.push({ id, distM, walkMin: walkMinutes(distM) });
        }
      }
    }
  }

  out.sort((a, b) => a.distM - b.distM || a.id - b.id);
  return out.slice(0, MAX_NEARBY_BUS_STOPS).map(({ id, walkMin }) => ({ id, walkMin }));
}

function cellKey(lat: number, lng: number): string {
  return `${Math.floor(lat / CELL_DEG)},${Math.floor(lng / CELL_DEG)}`;
}

function saneHeadway(value: number, fallback: number): number {
  if (Number.isFinite(value) && value >= 2 && value <= 60) return value;
  if (Number.isFinite(fallback) && fallback >= 2 && fallback <= 60) return fallback;
  return BUS_DEFAULT_HEADWAY_MIN;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
