import type {
  BusNetwork,
  CommuteResult,
  DongMeta,
  ResidentialAccess,
  ResidentialBusReference,
  ResidentialProfile,
  RouteLeg,
  Station,
  SubwayGraph,
} from "../types";
import { multiSourceDijkstra, type Seed, type ShortestPaths } from "./dijkstra";
import {
  findBestBusAccess,
  rebuildBusAccess,
  type BusAccess,
  type Coordinate,
} from "./bus";
import { findNearbyStations, haversineM, walkMinutes } from "./geo";
import {
  BUS_STATION_SEARCH_RADIUS_M,
  DEST_STATION_RADIUS_M,
  DONG_STATION_RADIUS_M,
  FIRST_WAIT_MIN,
  MAX_BUS_STATION_CANDIDATES,
  MAX_NEARBY_STATIONS,
  TRANSFER_WAIT_MIN,
  WALK_SELECTION_WEIGHT,
} from "./constants";

export interface StationEndpointAccess {
  station: Station;
  totalMin: number;
  selectionCost: number;
  mode: "walk" | "bus";
  bus?: BusAccess;
}

/**
 * 통근 계산 결과 묶음.
 *
 * 경로 복원에 필요한 재료(prev 배열, 목적지측 도보·버스 접근)를 함께 들고 있다가
 * 사용자가 동을 선택한 시점에 `buildRoute()` 로 하나만 되짚는다.
 * 547개 동의 경로를 미리 만들면 대부분 버려진다.
 */
export interface CommuteContext {
  byDong: Map<string, CommuteResult>;
  sp: ShortestPaths;
  /** 목적지측 그래프 노드 → 역에서 목적지까지 도보/버스 접근 */
  destAccess: Map<number, StationEndpointAccess>;
  /** 목적지 좌표. 마지막 도보 구간을 지도에 그릴 때 끝점으로 쓴다 */
  dest: { lat: number; lng: number };
  /** 정적 버스망이 있는 번들에서만 존재한다. */
  bus?: BusNetwork;
}

/**
 * 목적지 좌표로부터 모든 행정동까지의 통근시간을 한 번에 계산한다.
 *
 * 총 통근시간 = 집→역 접근 + 승차대기 + 지하철 + 환승 + 역→목적지 접근
 *
 * 역을 고를 때는 도보 구간에 WALK_SELECTION_WEIGHT를 곱해 비교하지만
 * (도보가 길어지는 걸 더 꺼리도록), 그렇게 뽑힌 역으로 계산한 위 합계
 * 자체는 가중치 없는 모델 시간이다. `real`이라는 내부 이름은 실측값이라는
 * 뜻이 아니라 선택 가중치를 제거한 화면 표시용 값이라는 뜻이다.
 *
 * 목적지 쪽에서 Dijkstra를 한 번만 돌리면 모든 역까지의 최단시간이 나오므로,
 * 지하철 Dijkstra 계산량은 동이 547개든 4,000개든 늘지 않는다. 각 동의
 * 거주인구 접근 프로필은 목적지별 최적 역과 중앙값을 고르는 데만 쓴다.
 */
export function computeCommute(
  graph: SubwayGraph,
  dongs: DongMeta[],
  dest: { lat: number; lng: number },
  bus?: BusNetwork,
  residential?: ResidentialAccess
): CommuteContext {
  const byDong = new Map<string, CommuteResult>();
  const destAccess = new Map<number, StationEndpointAccess>();

  // 1) 목적지 근처 역들을 출발점으로 삼는다.
  //    "도보시간 + 첫 승차 대기"를 초기 비용으로 넣는다.
  const destStations = findStationAccesses(
    dest,
    graph.stations,
    DEST_STATION_RADIUS_M,
    bus,
    "station-to-point"
  );

  const emptySp: ShortestPaths = {
    dist: new Float64Array(graph.nodes.length).fill(Infinity),
    real: new Float64Array(graph.nodes.length).fill(Infinity),
    transfers: new Uint8Array(graph.nodes.length),
    estimated: new Uint8Array(graph.nodes.length),
    prev: new Int32Array(graph.nodes.length).fill(-1),
  };

  if (destStations.length === 0) {
    for (const d of dongs) byDong.set(d.code, unreachable());
    return { byDong, sp: emptySp, destAccess, dest, bus };
  }

  // 도보 구간은 WALK_SELECTION_WEIGHT를 곱한 비용으로 역을 고르지만,
  // 화면에 보여줄 총 소요시간은 항상 가중치 없는 모델값을 쓴다 —
  // 두 값을 Dijkstra가 나란히 추적한다(dist=선택용, real=표시용).
  const seeds: Seed[] = [];
  for (const access of destStations) {
    const { station } = access;
    for (const nodeId of station.nodeIds) {
      seeds.push({
        nodeId,
        cost: access.selectionCost + FIRST_WAIT_MIN,
        realCost: access.totalMin + FIRST_WAIT_MIN,
      });
      destAccess.set(nodeId, access);
    }
  }

  const sp = multiSourceDijkstra(graph, seeds);

  // 2) 역별 최단 도달시간을 물리 역 단위로 접는다.
  //    (환승역은 노선별 노드가 여러 개이므로 그중 최솟값을 쓴다)
  const perStation = graph.stations.map((st) => {
    let bestRank = Infinity;
    let bestNode = -1;
    for (const nodeId of st.nodeIds) {
      if (sp.dist[nodeId] < bestRank) {
        bestRank = sp.dist[nodeId];
        bestNode = nodeId;
      }
    }
    return {
      rank: bestRank,
      real: bestNode >= 0 ? sp.real[bestNode] : Infinity,
      node: bestNode,
    };
  });

  // 3) 각 동에서 이용 가능한 역들 중 선택 비용(도보 가중치 반영)이 최소인
  //    것을 고르되, 기록하는 총 소요시간은 그 역의 가중치 없는 모델값이다.
  const residentialPercentile = residential?.percentile ?? 0.5;
  for (const dong of dongs) {
    const profiles = residential?.byDong[dong.code];
    const best = profiles?.length
      ? commuteFromResidentialProfiles(
          profiles,
          residentialPercentile,
          graph,
          perStation,
          sp
        )
      : commuteFromPoint(dong, graph, perStation, sp, bus);
    byDong.set(dong.code, best);
  }

  return { byDong, sp, destAccess, dest, bus };
}

interface StationReach {
  rank: number;
  real: number;
  node: number;
}

function commuteFromPoint(
  point: Coordinate,
  graph: SubwayGraph,
  perStation: StationReach[],
  sp: ShortestPaths,
  bus?: BusNetwork
): CommuteResult {
  const nearby = findStationAccesses(
    point,
    graph.stations,
    DONG_STATION_RADIUS_M,
    bus,
    "point-to-station"
  );

  let bestRank = Infinity;
  let best: CommuteResult = unreachable();
  for (const access of nearby) {
    const reach = perStation[access.station.id];
    if (!Number.isFinite(reach.rank)) continue;
    const rank = reach.rank + access.selectionCost;
    if (rank >= bestRank) continue;
    bestRank = rank;
    best = resultFromAccess(
      access.station,
      access.totalMin,
      access.mode,
      reach,
      sp,
      point
    );
  }
  return best;
}

function commuteFromResidentialProfiles(
  profiles: ResidentialProfile[],
  percentile: number,
  graph: SubwayGraph,
  perStation: StationReach[],
  sp: ShortestPaths
): CommuteResult {
  const rows: Array<{
    population: number;
    totalMin: number;
    station: Station;
    accessMin: number;
    accessMode: "walk" | "bus";
    accessBusRef?: ResidentialBusReference;
    reach: StationReach;
    origin?: Coordinate;
    profileIndex: number;
  }> = [];

  for (const [profileIndex, profile] of profiles.entries()) {
    const population = profile[0];
    const isCoordinateFree = profile.length === 2;
    const accesses = isCoordinateFree ? profile[1] : profile[3];
    const origin = isCoordinateFree
      ? undefined
      : { lng: profile[1], lat: profile[2] };
    if (!(population > 0) || !Array.isArray(accesses)) continue;
    if (
      origin &&
      (!Number.isFinite(origin.lat) || !Number.isFinite(origin.lng))
    ) {
      continue;
    }
    let chosen:
      | {
          rank: number;
          station: Station;
          accessMin: number;
          accessMode: "walk" | "bus";
          accessBusRef?: ResidentialBusReference;
          reach: StationReach;
        }
      | undefined;

    for (const [stationId, accessMin, selectionCost, mode, busRef] of accesses) {
      const station = graph.stations[stationId];
      const reach = perStation[stationId];
      if (!station || !reach || !Number.isFinite(reach.rank) || !(accessMin >= 0)) continue;
      const rank = reach.rank + selectionCost;
      if (chosen && rank >= chosen.rank) continue;
      chosen = {
        rank,
        station,
        accessMin,
        accessMode: mode === 1 ? "bus" : "walk",
        accessBusRef: mode === 1 ? busRef : undefined,
        reach,
      };
    }

    if (!chosen) continue;
    rows.push({
      population,
      totalMin: chosen.reach.real + chosen.accessMin,
      station: chosen.station,
      accessMin: chosen.accessMin,
      accessMode: chosen.accessMode,
      accessBusRef: chosen.accessBusRef,
      reach: chosen.reach,
      origin,
      profileIndex,
    });
  }

  if (rows.length === 0) return unreachable();
  rows.sort(
    (a, b) =>
      a.totalMin - b.totalMin ||
      a.station.id - b.station.id ||
      a.profileIndex - b.profileIndex
  );
  const totalPopulation = rows.reduce((sum, row) => sum + row.population, 0);
  const q = Number.isFinite(percentile) ? Math.max(0, Math.min(1, percentile)) : 0.5;
  const target = totalPopulation * q;
  let cumulative = 0;
  let selected = rows.at(-1)!;
  for (const row of rows) {
    cumulative += row.population;
    if (cumulative >= target) {
      selected = row;
      break;
    }
  }

  return {
    ...resultFromAccess(
      selected.station,
      selected.accessMin,
      selected.accessMode,
      selected.reach,
      sp,
      selected.origin,
      selected.accessBusRef
    ),
    populationPercentile: q,
  };
}

function resultFromAccess(
  station: Station,
  accessMin: number,
  accessMode: "walk" | "bus",
  reach: StationReach,
  sp: ShortestPaths,
  origin?: Coordinate,
  accessBusRef?: ResidentialBusReference
): CommuteResult {
  return {
    totalMin: reach.real + accessMin,
    viaStation: station.name,
    walkMin: accessMode === "walk" ? accessMin : 0,
    accessMin,
    accessMode,
    accessBusRef,
    origin,
    transfers: sp.transfers[reach.node],
    hasEstimatedLeg: sp.estimated[reach.node] === 1,
    viaNodeId: reach.node,
  };
}

function findStationAccesses(
  point: Coordinate,
  stations: Station[],
  legacyRadiusM: number,
  bus: BusNetwork | undefined,
  direction: "point-to-station" | "station-to-point"
): StationEndpointAccess[] {
  // 구 번들에는 버스망이 없다. 이때는 기존 후보 선정과 숫자를 완전히 보존한다.
  if (!bus) {
    return findNearbyStations(point.lat, point.lng, stations, legacyRadiusM).map(
      ({ station, walkMin }) => ({
        station,
        totalMin: walkMin,
        selectionCost: walkMin * WALK_SELECTION_WEIGHT,
        mode: "walk" as const,
      })
    );
  }

  const byDistance = stations
    .map((station) => ({
      station,
      distM: haversineM(point.lat, point.lng, station.lat, station.lng),
    }))
    .sort((a, b) => a.distM - b.distM || a.station.id - b.station.id);
  let candidates = byDistance.filter((x) => x.distM <= BUS_STATION_SEARCH_RADIUS_M);
  if (candidates.length === 0 && byDistance[0]) candidates = [byDistance[0]];
  candidates = candidates.slice(0, MAX_BUS_STATION_CANDIDATES);

  const accesses = candidates.map(({ station, distM }): StationEndpointAccess => {
    const directWalk = walkMinutes(distM);
    const busAccess =
      direction === "point-to-station"
        ? findBestBusAccess(bus, point, station)
        : findBestBusAccess(bus, station, point);
    if (busAccess) {
      return {
        station,
        totalMin: busAccess.totalMin,
        selectionCost: busAccess.selectionCost,
        mode: "bus",
        bus: busAccess,
      };
    }
    return {
      station,
      totalMin: directWalk,
      selectionCost: directWalk * WALK_SELECTION_WEIGHT,
      mode: "walk",
    };
  });

  accesses.sort(
    (a, b) => a.selectionCost - b.selectionCost || a.station.id - b.station.id
  );
  return accesses.slice(0, MAX_NEARBY_STATIONS);
}

/* ------------------------------------------------------------------ */
/* 목적지 여러 개                                                       */
/* ------------------------------------------------------------------ */

/** 목적지를 여러 개 둘 때 한 동의 통근 결과 */
export interface CombinedCommute {
  /**
   * 모든 목적지 중 **가장 오래 걸리는** 시간.
   * 하나라도 도달 불가면 null — "둘 다 40분 이내" 를 판정하려면 최악값을 봐야 한다.
   */
  worstMin: number | null;
  /** 목적지별 결과 (입력 순서와 같다) */
  per: CommuteResult[];
}

export interface MultiCommute {
  /** 목적지별 계산 맥락. 경로 복원에 필요한 prev 배열을 들고 있다 */
  contexts: CommuteContext[];
  byDong: Map<string, CombinedCommute>;
}

/**
 * 목적지 여러 곳에 대한 통근시간을 한 번에 계산한다.
 *
 * 커플이 각자 다른 회사에 다니거나 회사 + 학원처럼, "둘 다 40분 이내인 동네"를
 * 찾는 건 흔한 니즈인데 어떤 부동산 서비스도 잘 해주지 않는다. 그리고 이 앱의
 * 구조가 이걸 거의 공짜로 지원한다 — 목적지마다 Dijkstra 를 한 번씩 돌리면
 * 되고, 한 번이 1ms 미만이라 3개여도 5ms를 넘지 않는다.
 *
 * 판정은 **max** 다. 평균이나 합을 쓰면 "한 명은 20분, 다른 한 명은 90분" 인
 * 동네가 통과해버린다.
 */
export function computeMultiCommute(
  graph: SubwayGraph,
  dongs: DongMeta[],
  dests: Array<{ lat: number; lng: number }>,
  bus?: BusNetwork,
  residential?: ResidentialAccess
): MultiCommute {
  const contexts = dests.map((d) => computeCommute(graph, dongs, d, bus, residential));
  const byDong = new Map<string, CombinedCommute>();

  for (const dong of dongs) {
    const per = contexts.map((c) => c.byDong.get(dong.code) ?? unreachable());
    // 하나라도 못 가면 그 동은 조건을 만족하지 못한다
    const worstMin = per.some((r) => r.totalMin === null)
      ? null
      : Math.max(...per.map((r) => r.totalMin!));
    byDong.set(dong.code, { worstMin, per });
  }

  return { contexts, byDong };
}

const unreachable = (): CommuteResult => ({
  totalMin: null,
  viaStation: null,
  walkMin: 0,
  accessMin: 0,
  accessMode: "walk",
  transfers: 0,
  hasEstimatedLeg: false,
  viaNodeId: -1,
});

/* ------------------------------------------------------------------ */
/* 경로 복원                                                           */
/* ------------------------------------------------------------------ */

/**
 * 선택된 동 하나의 통근 경로를 구간(leg) 목록으로 되짚는다.
 *
 * `prev` 를 따라가면 목적지 방향으로 진행하므로 그대로 집 → 목적지 순서가 된다.
 * 같은 노선을 연속으로 타는 구간은 하나의 leg 로 접는다 — 사용자가 알고 싶은
 * 건 "2호선 8정거장"이지 "신림→봉천, 봉천→서울대입구, …" 가 아니다.
 *
 * @param origin 구 좌표 포함 번들이나 동 대표점 방식에서만 쓸 출발 표시 좌표.
 *   현재 좌표 없는 거주 프로필에서는 계산 좌표처럼 대신 쓰지 않는다.
 */
export function buildRoute(
  graph: SubwayGraph,
  ctx: CommuteContext,
  result: CommuteResult,
  origin?: { lat: number; lng: number }
): RouteLeg[] {
  if (result.totalMin === null || result.viaNodeId < 0) return [];

  const { sp, destAccess, dest, bus } = ctx;
  const legs: RouteLeg[] = [];
  const stationOf = (nodeId: number): Station =>
    graph.stations[graph.nodes[nodeId].stationId];

  // 현재 집약 프로필은 원 셀 좌표를 공개하지 않는다. 이 경우 호출부가 넘긴 동
  // 대표점을 계산 좌표처럼 그리지 않고, 첫 역/정류장까지의 선만 생략한다.
  const originPoint = result.populationPercentile == null
    ? result.origin ?? origin
    : result.origin;

  // 집 → 승차역, 그리고 최초 지하철 승차 대기.
  // 대기시간은 총 통근시간에 들어 있으므로 구간에도 드러내야 합이 맞는다.
  const boarding = stationOf(result.viaNodeId);
  if (result.accessMode === "bus") {
    const access = bus && result.accessBusRef
      ? rebuildBusAccess(bus, originPoint, boarding, result.accessBusRef)
      : bus && originPoint
        ? findBestBusAccess(bus, originPoint, boarding)
        : null;
    if (access) {
      appendBusAccessLegs(legs, access, result.accessMin, boarding.name, "station");
    } else {
      // precomputed 접근 프로필과 런타임 버스망이 어긋난 비정상 상황에서도
      // 도보라고 거짓 표시하지 않고, 합계가 맞는 보수적인 단일 구간을 남긴다.
      legs.push({
        kind: "bus",
        minutes: result.accessMin,
        routeName: "버스 접근(추정)",
        stops: 0,
        from: "거주지 인근",
        to: boarding.name,
        path: originPoint
          ? [
              [originPoint.lng, originPoint.lat],
              [boarding.lng, boarding.lat],
            ]
          : [],
      });
    }
  } else {
    legs.push({
      kind: "walk",
      minutes: result.accessMin,
      to: boarding.name,
      toType: "station",
      path: originPoint
        ? [
            [originPoint.lng, originPoint.lat],
            [boarding.lng, boarding.lat],
          ]
        : undefined,
    });
  }
  legs.push({
    kind: "wait",
    minutes: FIRST_WAIT_MIN,
    at: stationOf(result.viaNodeId).name,
    vehicle: "subway",
  });

  // 노드 체인을 훑으며 같은 노선 구간을 누적한다
  let cur = result.viaNodeId;
  let rideFrom: number | null = null;
  let rideMin = 0;
  let rideStops = 0;
  let ridePath: Array<[number, number]> = [];

  const flushRide = (endNode: number) => {
    if (rideFrom === null) return;
    legs.push({
      kind: "ride",
      minutes: rideMin,
      line: graph.nodes[rideFrom].line,
      stops: rideStops,
      from: stationOf(rideFrom).name,
      to: stationOf(endNode).name,
      path: ridePath,
    });
    rideFrom = null;
    rideMin = 0;
    rideStops = 0;
    ridePath = [];
  };

  // 무한루프 방어 — prev 가 깨져도 노드 수를 넘길 수 없다
  for (let guard = 0; guard <= graph.nodes.length; guard++) {
    const next = sp.prev[cur];
    if (next < 0) break;

    const edge = graph.edges[cur]?.find((e) => e.to === next);
    if (!edge) break; // 그래프와 prev 가 어긋난 경우 — 여기까지만 보여준다

    if (edge.kind === "ride") {
      if (rideFrom === null) {
        rideFrom = cur;
        ridePath = [[stationOf(cur).lng, stationOf(cur).lat]];
      }
      rideMin += edge.min;
      rideStops += 1;
      ridePath.push([stationOf(next).lng, stationOf(next).lat]);
    } else {
      flushRide(cur);
      legs.push({
        kind: "transfer",
        minutes: edge.min + TRANSFER_WAIT_MIN,
        at: stationOf(cur).name,
        fromLine: graph.nodes[cur].line,
        toLine: graph.nodes[next].line,
      });
    }
    cur = next;
  }
  flushRide(cur);

  // 하차역 → 목적지. 도보 15분 초과이며 실제 같은 노선이 이어질 때는
  // 정적 노선거리·배차간격으로 계산한 버스 접근을 그대로 복원한다.
  const finalAccess = destAccess.get(cur);
  if (finalAccess) {
    const alighting = stationOf(cur);
    if (finalAccess.mode === "bus" && finalAccess.bus) {
      appendBusAccessLegs(
        legs,
        finalAccess.bus,
        finalAccess.totalMin,
        "목적지",
        "destination"
      );
    } else {
      legs.push({
        kind: "walk",
        minutes: finalAccess.totalMin,
        to: "목적지",
        toType: "destination",
        path: [
          [alighting.lng, alighting.lat],
          [dest.lng, dest.lat],
        ],
      });
    }
  }

  return legs;
}

/** 버스 접근 하나를 도보 → 대기 → 승차 → 도보 구간으로 풀어 화면 합계를 맞춘다. */
function appendBusAccessLegs(
  legs: RouteLeg[],
  access: BusAccess,
  modeledTotalMin: number,
  finalLabel: string,
  finalType: "station" | "destination"
): void {
  legs.push({
    kind: "walk",
    minutes: access.walkToBoardMin,
    to: access.boardStop,
    toType: "busStop",
    path: access.walkToBoardPath,
  });
  legs.push({
    kind: "wait",
    minutes: access.waitMin,
    at: access.boardStop,
    vehicle: "bus",
    routeName: access.routeName,
  });

  // 100m 프로필은 크기를 줄이려고 시간을 반올림할 수 있다. 상세 구간 합이
  // 화면의 총 통근시간과 달라지지 않도록 그 오차를 승차 구간에 흡수한다.
  const rideMin = Math.max(
    0,
    modeledTotalMin -
      access.walkToBoardMin -
      access.waitMin -
      access.walkFromAlightMin
  );
  legs.push({
    kind: "bus",
    minutes: rideMin,
    routeName: access.routeName,
    stops: access.stops,
    from: access.boardStop,
    to: access.alightStop,
    path: access.ridePath,
  });
  legs.push({
    kind: "walk",
    minutes: access.walkFromAlightMin,
    to: finalLabel,
    toType: finalType,
    path: access.walkFromAlightPath,
  });
}

/**
 * 역 이름으로 좌표를 찾는다.
 * Kakao 키가 없을 때의 지오코딩 폴백이자, "강남역" 같은 입력의 빠른 경로.
 */
export function findStationByName(
  graph: SubwayGraph,
  query: string
): { name: string; lat: number; lng: number } | null {
  const q = query.trim().replace(/역$/, "");
  if (!q) return null;
  const exact = graph.stations.find((s) => s.name === q);
  if (exact) return { name: exact.name, lat: exact.lat, lng: exact.lng };
  const partial = graph.stations.find((s) => s.name.includes(q));
  return partial
    ? { name: partial.name, lat: partial.lat, lng: partial.lng }
    : null;
}
