import type { CommuteResult, DongMeta, SubwayGraph } from "../types";
import { multiSourceDijkstra, type Seed } from "./dijkstra";
import { findNearbyStations } from "./geo";
import {
  DEST_STATION_RADIUS_M,
  DONG_STATION_RADIUS_M,
  FIRST_WAIT_MIN,
} from "./constants";

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
): Map<string, CommuteResult> {
  const result = new Map<string, CommuteResult>();

  // 1) 목적지 근처 역들을 출발점으로 삼는다.
  //    "도보시간 + 첫 승차 대기"를 초기 비용으로 넣는다.
  const destStations = findNearbyStations(
    dest.lat,
    dest.lng,
    graph.stations,
    DEST_STATION_RADIUS_M
  );

  if (destStations.length === 0) {
    for (const d of dongs) result.set(d.code, unreachable());
    return result;
  }

  const seeds: Seed[] = [];
  for (const { station, walkMin } of destStations) {
    for (const nodeId of station.nodeIds) {
      seeds.push({ nodeId, cost: walkMin + FIRST_WAIT_MIN });
    }
  }

  const { dist, transfers, estimated } = multiSourceDijkstra(graph, seeds);

  // 2) 역별 최단 도달시간을 물리 역 단위로 접는다.
  //    (환승역은 노선별 노드가 여러 개이므로 그중 최솟값을 쓴다)
  const perStation = graph.stations.map((st) => {
    let best = Infinity;
    let bestNode = -1;
    for (const nodeId of st.nodeIds) {
      if (dist[nodeId] < best) {
        best = dist[nodeId];
        bestNode = nodeId;
      }
    }
    return {
      min: best,
      transfers: bestNode >= 0 ? transfers[bestNode] : 0,
      estimated: bestNode >= 0 ? estimated[bestNode] === 1 : false,
    };
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
          transfers: reach.transfers,
          hasEstimatedLeg: reach.estimated,
        };
      }
    }
    result.set(dong.code, best);
  }

  return result;
}

const unreachable = (): CommuteResult => ({
  totalMin: null,
  viaStation: null,
  walkMin: 0,
  transfers: 0,
  hasEstimatedLeg: false,
});

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
