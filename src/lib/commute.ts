import type {
  CommuteResult,
  DongMeta,
  RouteLeg,
  Station,
  SubwayGraph,
} from "../types";
import { multiSourceDijkstra, type Seed, type ShortestPaths } from "./dijkstra";
import { findNearbyStations } from "./geo";
import {
  DEST_STATION_RADIUS_M,
  DONG_STATION_RADIUS_M,
  FIRST_WAIT_MIN,
  TRANSFER_WAIT_MIN,
} from "./constants";

/**
 * 통근 계산 결과 묶음.
 *
 * 경로 복원에 필요한 재료(prev 배열, 목적지측 도보시간)를 함께 들고 있다가
 * 사용자가 동을 선택한 시점에 `buildRoute()` 로 하나만 되짚는다.
 * 427개 동의 경로를 미리 만들면 대부분 버려진다.
 */
export interface CommuteContext {
  byDong: Map<string, CommuteResult>;
  sp: ShortestPaths;
  /** 출발점(목적지측) 노드 → 목적지까지 도보(분) */
  destWalk: Map<number, number>;
}

/**
 * 목적지 좌표로부터 모든 행정동까지의 통근시간을 한 번에 계산한다.
 *
 * 총 통근시간 = 집→역 도보 + 승차대기 + 지하철 + 환승 + 역→목적지 도보
 *
 * 목적지 쪽에서 Dijkstra를 한 번만 돌리면 모든 역까지의 최단시간이 나오므로,
 * 동이 427개든 4,000개든 계산량이 늘지 않는다. 이게 이 서비스가 외부
 * 길찾기 API 없이 동작할 수 있는 이유다.
 */
export function computeCommute(
  graph: SubwayGraph,
  dongs: DongMeta[],
  dest: { lat: number; lng: number }
): CommuteContext {
  const byDong = new Map<string, CommuteResult>();
  const destWalk = new Map<number, number>();

  // 1) 목적지 근처 역들을 출발점으로 삼는다.
  //    "도보시간 + 첫 승차 대기"를 초기 비용으로 넣는다.
  const destStations = findNearbyStations(
    dest.lat,
    dest.lng,
    graph.stations,
    DEST_STATION_RADIUS_M
  );

  const emptySp: ShortestPaths = {
    dist: new Float64Array(graph.nodes.length).fill(Infinity),
    transfers: new Uint8Array(graph.nodes.length),
    estimated: new Uint8Array(graph.nodes.length),
    prev: new Int32Array(graph.nodes.length).fill(-1),
  };

  if (destStations.length === 0) {
    for (const d of dongs) byDong.set(d.code, unreachable());
    return { byDong, sp: emptySp, destWalk };
  }

  const seeds: Seed[] = [];
  for (const { station, walkMin } of destStations) {
    for (const nodeId of station.nodeIds) {
      seeds.push({ nodeId, cost: walkMin + FIRST_WAIT_MIN });
      destWalk.set(nodeId, walkMin);
    }
  }

  const sp = multiSourceDijkstra(graph, seeds);

  // 2) 역별 최단 도달시간을 물리 역 단위로 접는다.
  //    (환승역은 노선별 노드가 여러 개이므로 그중 최솟값을 쓴다)
  const perStation = graph.stations.map((st) => {
    let best = Infinity;
    let bestNode = -1;
    for (const nodeId of st.nodeIds) {
      if (sp.dist[nodeId] < best) {
        best = sp.dist[nodeId];
        bestNode = nodeId;
      }
    }
    return { min: best, node: bestNode };
  });

  // 3) 각 동에서 이용 가능한 역들 중 총 소요시간이 최소인 것을 고른다.
  for (const dong of dongs) {
    const nearby = findNearbyStations(
      dong.lat,
      dong.lng,
      graph.stations,
      DONG_STATION_RADIUS_M
    );

    let best: CommuteResult = unreachable();
    for (const { station, walkMin } of nearby) {
      const reach = perStation[station.id];
      if (!Number.isFinite(reach.min)) continue;
      const total = reach.min + walkMin;
      if (best.totalMin === null || total < best.totalMin) {
        best = {
          totalMin: total,
          viaStation: station.name,
          walkMin,
          transfers: sp.transfers[reach.node],
          hasEstimatedLeg: sp.estimated[reach.node] === 1,
          viaNodeId: reach.node,
        };
      }
    }
    byDong.set(dong.code, best);
  }

  return { byDong, sp, destWalk };
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
  dests: Array<{ lat: number; lng: number }>
): MultiCommute {
  const contexts = dests.map((d) => computeCommute(graph, dongs, d));
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
 */
export function buildRoute(
  graph: SubwayGraph,
  ctx: CommuteContext,
  result: CommuteResult
): RouteLeg[] {
  if (result.totalMin === null || result.viaNodeId < 0) return [];

  const { sp, destWalk } = ctx;
  const legs: RouteLeg[] = [];
  const stationOf = (nodeId: number): Station =>
    graph.stations[graph.nodes[nodeId].stationId];

  // 집 → 승차역, 그리고 최초 승차 대기.
  // 대기시간은 총 통근시간에 들어 있으므로 구간에도 드러내야 합이 맞는다.
  legs.push({
    kind: "walk",
    minutes: result.walkMin,
    to: stationOf(result.viaNodeId).name,
  });
  legs.push({
    kind: "wait",
    minutes: FIRST_WAIT_MIN,
    at: stationOf(result.viaNodeId).name,
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

  // 하차역 → 목적지
  const finalWalk = destWalk.get(cur);
  if (finalWalk != null) {
    legs.push({ kind: "walk", minutes: finalWalk, to: "목적지" });
  }

  return legs;
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
