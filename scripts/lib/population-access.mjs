import { haversineM, walkMinutes } from "./geo.mjs";

/** 인구 가중 분위수. 각 표본은 { value, weight } 형태다. */
export function weightedQuantile(samples, percentile) {
  const sorted = samples
    .filter(
      ({ value, weight }) =>
        Number.isFinite(value) && Number.isFinite(weight) && weight > 0,
    )
    .sort((a, b) => a.value - b.value);
  if (sorted.length === 0) return null;
  const totalWeight = sorted.reduce((sum, sample) => sum + sample.weight, 0);
  const q = Number.isFinite(percentile) ? Math.max(0, Math.min(1, percentile)) : 0.5;
  const target = totalWeight * q;
  let cumulative = 0;
  for (const sample of sorted) {
    cumulative += sample.weight;
    if (cumulative >= target) return sample.value;
  }
  return sorted.at(-1).value;
}

/**
 * 동 대표점 하나가 아니라 각 100m 인구격자에서 최근접역까지의 도보시간을
 * 계산하고, 동별 인구 가중 분위수를 반환한다.
 */
export function populationWalkByDong(dongs, stations, populationByDong, percentile = 0.5) {
  if (!Array.isArray(dongs) || !Array.isArray(stations) || stations.length === 0) {
    throw new Error("행정동 또는 지하철역 데이터가 없습니다.");
  }
  const values = new Map();
  let cellCount = 0;
  let fallbackCount = 0;

  for (const dong of dongs) {
    const cells = populationByDong?.[dong.code] ?? [];
    const samples = cells.map(([lng, lat, population]) => {
      cellCount += 1;
      return {
        value: nearestStationWalk(lat, lng, stations),
        weight: population,
      };
    });
    const quantile = weightedQuantile(samples, percentile);
    if (quantile != null) {
      values.set(dong.code, quantile);
    } else {
      fallbackCount += 1;
      values.set(dong.code, nearestStationWalk(dong.lat, dong.lng, stations));
    }
  }
  return { values, cellCount, fallbackCount, percentile };
}

function nearestStationWalk(lat, lng, stations) {
  let bestM = Infinity;
  for (const station of stations) {
    bestM = Math.min(bestM, haversineM(lat, lng, station.lat, station.lng));
  }
  return walkMinutes(bestM);
}
