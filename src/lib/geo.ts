import {
  WALK_SPEED_M_PER_MIN,
  WALK_DETOUR_FACTOR,
  MAX_NEARBY_STATIONS,
} from "./constants";
import type { Station } from "../types";

const EARTH_R = 6371008.8; // m (IUGG 평균 반지름)
const toRad = (d: number) => (d * Math.PI) / 180;

/** 두 좌표 사이 대권거리 (m) */
export function haversineM(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_R * Math.asin(Math.sqrt(a));
}

/**
 * 직선거리(m) → 도보 소요시간(분).
 * 도로가 직선이 아닌 것을 보정 계수로 반영한다.
 */
export function walkMinutes(straightM: number): number {
  return (straightM * WALK_DETOUR_FACTOR) / WALK_SPEED_M_PER_MIN;
}

export interface NearbyStation {
  station: Station;
  distM: number;
  walkMin: number;
}

/**
 * 좌표 기준 반경 내 가장 가까운 역들.
 *
 * 반경 안에 역이 하나도 없으면(서울 외곽 일부 동) 반경을 무시하고
 * 최근접 1개는 돌려준다. 빈 배열을 주면 그 동은 영영 도달 불가로
 * 표시되는데, 실제로는 버스로 접근 가능하므로 "멀다"로 표현하는 편이 낫다.
 */
export function findNearbyStations(
  lat: number,
  lng: number,
  stations: Station[],
  radiusM: number,
  limit: number = MAX_NEARBY_STATIONS
): NearbyStation[] {
  const scored: NearbyStation[] = [];
  let nearest: NearbyStation | null = null;

  for (const station of stations) {
    const distM = haversineM(lat, lng, station.lat, station.lng);
    const entry = { station, distM, walkMin: walkMinutes(distM) };
    if (!nearest || distM < nearest.distM) nearest = entry;
    if (distM <= radiusM) scored.push(entry);
  }

  if (scored.length === 0) return nearest ? [nearest] : [];

  scored.sort((a, b) => a.distM - b.distM);
  return scored.slice(0, limit);
}
