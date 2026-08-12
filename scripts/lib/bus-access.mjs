import { haversineM, walkMinutes } from "./geo.mjs";

// src/lib/constants.ts 와 반드시 함께 바꾼다. 회귀 테스트가 두 모듈을 대조한다.
export const BUS_TRIGGER_WALK_MIN = 15;
export const BUS_STOP_SEARCH_RADIUS_M = 450;
export const MAX_NEARBY_BUS_STOPS = 24;
export const BUS_SPEED_KMH = 15;
export const BUS_DWELL_MIN_PER_STOP = 0.2;
export const BUS_DEFAULT_HEADWAY_MIN = 15;
export const BUS_MIN_WAIT_MIN = 2;
export const BUS_MAX_WAIT_MIN = 8;
export const BUS_MIN_SAVING_MIN = 1;
export const BUS_STATION_SEARCH_RADIUS_M = 5000;
export const MAX_BUS_STATION_CANDIDATES = 12;
export const MAX_NEARBY_STATIONS = 6;
export const WALK_SELECTION_WEIGHT = 1.4;

const CELL_DEG = 0.01;
const ACCESS_TIME_STEP_MIN = 0.25;
export const MAX_RESIDENTIAL_PROFILES_PER_DONG = 24;
export const RESIDENTIAL_WEIGHT_SCALE = 10_000;
const K_MEDOIDS_ITERATIONS = 4;

/** 정류장 좌표·노선 등장 위치를 한 번만 인덱싱한다. */
export function createBusIndex(network) {
  validateNetwork(network);
  const cells = new Map();
  network.stops.forEach(([, lat, lng], id) => {
    const key = cellKey(lat, lng);
    const bucket = cells.get(key);
    if (bucket) bucket.push(id);
    else cells.set(key, [id]);
  });

  const occurrences = Array.from({ length: network.stops.length }, () => []);
  network.routes.forEach(([, , stopIds], route) => {
    stopIds.forEach((id, order) => occurrences[id].push({ route, order }));
  });
  return { cells, occurrences };
}

/** 한 점 반경 450m의 정류장을 가까운 순으로 반환한다. */
export function nearbyBusStops(network, index, point) {
  const y = Math.floor(point.lat / CELL_DEG);
  const x = Math.floor(point.lng / CELL_DEG);
  const out = [];

  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
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
  return out.slice(0, MAX_NEARBY_BUS_STOPS);
}

/**
 * 한 거주지에서 후보 역 여러 개까지의 최적 접근을 동시에 계산한다.
 * 각 결과는 [역 id, 실제 분, 선택 비용, 0=도보/1=버스, 버스 경로 참조?] 튜플이다.
 */
export function stationAccessesFromPoint(
  network,
  index,
  point,
  candidateStations,
  stationNearbyStops,
) {
  const candidates = candidateStations.map(({ station, distM }) => {
    const directWalk = walkMinutes(distM);
    return {
      station,
      directWalk,
      real: directWalk,
      selection: directWalk * WALK_SELECTION_WEIGHT,
      mode: 0,
    };
  });
  const busTargets = candidates
    .map((candidate, index) => ({ candidate, index }))
    .filter(({ candidate }) => candidate.directWalk > BUS_TRIGGER_WALK_MIN);
  if (busTargets.length === 0) return compactAccesses(candidates);

  const boards = nearbyBusStops(network, index, point);
  if (boards.length === 0) return compactAccesses(candidates);

  // 하차 정류장 하나가 여러 역의 반경에 들 수 있으므로 배열로 둔다.
  const targetsByStop = new Map();
  for (const { candidate, index: candidateIndex } of busTargets) {
    for (const alight of stationNearbyStops[candidate.station.id] ?? []) {
      const bucket = targetsByStop.get(alight.id);
      const target = { candidateIndex, walkMin: alight.walkMin };
      if (bucket) bucket.push(target);
      else targetsByStop.set(alight.id, [target]);
    }
  }
  if (targetsByStop.size === 0) return compactAccesses(candidates);

  for (const board of boards) {
    for (const occurrence of index.occurrences[board.id] ?? []) {
      const route = network.routes[occurrence.route];
      if (!route) continue;
      const [, rawHeadway, stopIds, cumulative] = route;
      if (stopIds.length !== cumulative.length) continue;
      const headway = saneHeadway(rawHeadway, network.defaultHeadwayMin);
      const waitMin = clamp(headway / 2, BUS_MIN_WAIT_MIN, BUS_MAX_WAIT_MIN);

      for (let end = occurrence.order + 1; end < stopIds.length; end += 1) {
        const targets = targetsByStop.get(stopIds[end]);
        if (!targets) continue;
        const rideDistanceM = cumulative[end] - cumulative[occurrence.order];
        if (!(rideDistanceM > 0)) continue;
        const stops = end - occurrence.order;
        const rideMin =
          rideDistanceM / ((BUS_SPEED_KMH * 1000) / 60) +
          stops * BUS_DWELL_MIN_PER_STOP;

        for (const target of targets) {
          const candidate = candidates[target.candidateIndex];
          const totalMin = board.walkMin + waitMin + rideMin + target.walkMin;
          const selection =
            (board.walkMin + target.walkMin) * WALK_SELECTION_WEIGHT + waitMin + rideMin;
          if (totalMin + BUS_MIN_SAVING_MIN >= candidate.directWalk) continue;
          if (selection >= candidate.selection) continue;
          candidate.real = totalMin;
          candidate.selection = selection;
          candidate.mode = 1;
          candidate.busRef = [
            occurrence.route,
            occurrence.order,
            end,
            quantize(board.walkMin),
          ];
        }
      }
    }
  }
  return compactAccesses(candidates);
}

/**
 * 100m 셀을 목적지와 무관한 역 접근 프로필로 바꾼다. 같은 접근 선택지는
 * 인구를 합치고, 공개 산출물에는 셀 좌표를 전혀 넣지 않는다.
 */
export function buildResidentialAccess(population, graph, network, options = {}) {
  if (!population?.dongs || typeof population.dongs !== "object") {
    throw new Error("100m 인구격자 스냅샷에 dongs가 없습니다.");
  }
  if (!Array.isArray(graph?.stations) || graph.stations.length === 0) {
    throw new Error("지하철역 데이터가 없습니다.");
  }

  const generatedAt = options.generatedAt ?? new Date().toISOString();
  const percentile = options.percentile ?? 0.5;
  const maxProfilesPerDong =
    options.maxProfilesPerDong ?? MAX_RESIDENTIAL_PROFILES_PER_DONG;
  const weightScale = options.weightScale ?? RESIDENTIAL_WEIGHT_SCALE;
  const aggregateProfiles = options.aggregateProfiles ?? true;
  const index = createBusIndex(network);
  const stationNearbyStops = graph.stations.map((station) =>
    nearbyBusStops(network, index, station),
  );
  const byDong = {};
  let inputCells = 0;
  let rawProfiles = 0;
  let profiles = 0;
  let populationTotal = 0;
  let busProfilePopulation = 0;
  let maxProfilesInDong = 0;

  for (const code of Object.keys(population.dongs).sort()) {
    const groups = new Map();
    const cells = [...population.dongs[code]].sort(
      (a, b) => a[1] - b[1] || a[0] - b[0] || a[2] - b[2],
    );
    for (const [lng, lat, cellPopulation] of cells) {
      if (!(cellPopulation > 0)) continue;
      inputCells += 1;
      populationTotal += cellPopulation;
      const point = { lat, lng };
      const candidates = nearestStationCandidates(point, graph.stations);
      const accesses = stationAccessesFromPoint(
        network,
        index,
        point,
        candidates,
        stationNearbyStops,
      );
      if (accesses.length === 0) continue;

      const signature = JSON.stringify(accesses);
      const existing = groups.get(signature);
      if (existing) {
        existing.population += cellPopulation;
        existing.weightedLng += lng * cellPopulation;
        existing.weightedLat += lat * cellPopulation;
      } else {
        groups.set(signature, {
          population: cellPopulation,
          weightedLng: lng * cellPopulation,
          weightedLat: lat * cellPopulation,
          accesses,
        });
      }
    }

    const sourceProfiles = [...groups.values()]
      .map(({ population: pop, weightedLng, weightedLat, accesses }) => ({
        population: pop,
        lng: weightedLng / pop,
        lat: weightedLat / pop,
        accesses,
      }))
      .sort(profileOrder);
    rawProfiles += sourceProfiles.length;
    for (const profile of sourceProfiles) {
      if (profile.accesses.some(([, , , mode]) => mode === 1)) {
        busProfilePopulation += profile.population;
      }
    }

    byDong[code] = aggregateProfiles
      ? compressResidentialProfiles(sourceProfiles, {
          maxProfiles: maxProfilesPerDong,
          weightScale,
        })
      : sourceProfiles.map(({ population: pop, accesses }) => [pop, accesses]);
    profiles += byDong[code].length;
    maxProfilesInDong = Math.max(maxProfilesInDong, byDong[code].length);
  }

  return {
    residential: {
      version: aggregateProfiles
        ? `sgis-${population.source?.year ?? 2024}-100m-bus-v4`
        : `sgis-${population.source?.year ?? 2024}-100m-exact-local`,
      source:
        "국가데이터처 통계지리정보서비스(SGIS), 2024년 인구 100m 격자",
      busVersion: network.generatedAt ?? network.version,
      generatedAt,
      resolutionM: population.source?.cellSizeM ?? 100,
      percentile,
      ...(aggregateProfiles ? { weightScale, maxProfilesPerDong } : {}),
      byDong,
    },
    stats: {
      inputCells,
      rawProfiles,
      profiles,
      populationTotal,
      busProfilePopulation,
      dongCount: Object.keys(byDong).length,
      maxProfilesInDong,
    },
  };
}

/**
 * 100m 셀을 그대로 공개하지 않도록 동별 공간 분포를 대표 medoid로 접는다.
 *
 * - 공개 프로필에는 가중치와 접근 선택지만 남기고 좌표는 완전히 제거한다.
 * - 가중치는 동마다 합이 같은 10,000 단위로 다시 배분해 원 인구수를 직접 싣지 않는다.
 * - 고정된 초기화와 tie-break를 써 같은 입력은 byte 단위로 같은 결과를 만든다.
 */
export function compressResidentialProfiles(
  profiles,
  {
    maxProfiles = MAX_RESIDENTIAL_PROFILES_PER_DONG,
    weightScale = RESIDENTIAL_WEIGHT_SCALE,
  } = {},
) {
  if (!Number.isInteger(maxProfiles) || maxProfiles < 1) {
    throw new Error(`대표 프로필 상한이 올바르지 않습니다: ${maxProfiles}`);
  }
  if (!Number.isInteger(weightScale) || weightScale < maxProfiles) {
    throw new Error(`거주 가중치 눈금이 올바르지 않습니다: ${weightScale}`);
  }
  const source = profiles
    .filter((profile) => profile.population > 0 && profile.accesses?.length > 0)
    .map((profile) => ({
      ...profile,
      accessSignature: JSON.stringify(profile.accesses),
    }))
    .sort(profileOrder);
  if (source.length === 0) return [];

  const medoids = chooseSpatialMedoids(source, Math.min(maxProfiles, source.length));
  let assignments = assignToMedoids(source, medoids);
  for (let iteration = 0; iteration < K_MEDOIDS_ITERATIONS; iteration += 1) {
    const next = recenterMedoids(source, assignments, medoids);
    if (next.every((value, index) => value === medoids[index])) break;
    medoids.splice(0, medoids.length, ...next);
    assignments = assignToMedoids(source, medoids);
  }
  assignments = assignToMedoids(source, medoids);

  const clusters = medoids.map((medoidIndex, clusterIndex) => ({
    representative: source[medoidIndex],
    population: 0,
    clusterIndex,
  }));
  source.forEach((profile, index) => {
    const cluster = clusters[assignments[index]];
    cluster.population += profile.population;
  });
  const weights = normalizeWeights(
    clusters.map((cluster) => cluster.population),
    weightScale,
  );

  return clusters
    .map((cluster, index) => [weights[index], cluster.representative.accesses])
    .sort(
      (a, b) =>
        JSON.stringify(a[1]).localeCompare(JSON.stringify(b[1])) || a[0] - b[0],
    );
}

function chooseSpatialMedoids(profiles, count) {
  // profileOrder 로 정렬된 남쪽 대표점에서 시작하면 초기값까지 완전히 결정적이다.
  // 이후 가장 먼 인구 가중 지점을 차례로 뽑아 동 전체 공간 범위를 덮는다.
  const selected = [0];
  const selectedSet = new Set(selected);
  while (selected.length < count) {
    let bestIndex = -1;
    let bestScore = -1;
    for (let index = 0; index < profiles.length; index += 1) {
      if (selectedSet.has(index)) continue;
      let nearest = Infinity;
      for (const medoid of selected) {
        nearest = Math.min(nearest, spatialDistanceSquared(profiles[index], profiles[medoid]));
      }
      // 멀리 떨어진 소수 셀 하나보다 실제 거주 비중이 있는 생활권을 먼저 보존한다.
      const score = nearest * Math.sqrt(profiles[index].population);
      if (score > bestScore || (score === bestScore && index < bestIndex)) {
        bestScore = score;
        bestIndex = index;
      }
    }
    if (bestIndex < 0) break;
    selected.push(bestIndex);
    selectedSet.add(bestIndex);
  }
  return selected.sort((a, b) => profileOrder(profiles[a], profiles[b]));
}

function assignToMedoids(profiles, medoids) {
  return profiles.map((profile) => {
    let bestCluster = 0;
    let bestDistance = Infinity;
    medoids.forEach((medoidIndex, clusterIndex) => {
      const distance = spatialDistanceSquared(profile, profiles[medoidIndex]);
      if (distance < bestDistance || (distance === bestDistance && clusterIndex < bestCluster)) {
        bestDistance = distance;
        bestCluster = clusterIndex;
      }
    });
    return bestCluster;
  });
}

function recenterMedoids(profiles, assignments, medoids) {
  return medoids.map((currentMedoid, clusterIndex) => {
    const members = [];
    let total = 0;
    let lat = 0;
    let lng = 0;
    profiles.forEach((profile, index) => {
      if (assignments[index] !== clusterIndex) return;
      members.push(index);
      total += profile.population;
      lat += profile.lat * profile.population;
      lng += profile.lng * profile.population;
    });
    if (!(total > 0) || members.length === 0) return currentMedoid;
    const centroid = { lat: lat / total, lng: lng / total };
    return members.reduce((best, index) => {
      const distance = spatialDistanceSquared(profiles[index], centroid);
      const bestDistance = spatialDistanceSquared(profiles[best], centroid);
      return distance < bestDistance || (distance === bestDistance && index < best)
        ? index
        : best;
    }, members[0]);
  });
}

function normalizeWeights(populations, scale) {
  const total = populations.reduce((sum, value) => sum + value, 0);
  if (!(total > 0)) throw new Error("대표 프로필의 인구 합이 0입니다.");
  const remaining = scale - populations.length;
  const allocated = populations.map((population, index) => {
    const exact = (population / total) * remaining;
    return { index, weight: 1 + Math.floor(exact), remainder: exact - Math.floor(exact) };
  });
  let left = scale - allocated.reduce((sum, item) => sum + item.weight, 0);
  allocated
    .sort((a, b) => b.remainder - a.remainder || a.index - b.index)
    .slice(0, left)
    .forEach((item) => {
      item.weight += 1;
    });
  return allocated.sort((a, b) => a.index - b.index).map((item) => item.weight);
}

function spatialDistanceSquared(left, right) {
  const meanLatRad = (((left.lat + right.lat) / 2) * Math.PI) / 180;
  const dy = (left.lat - right.lat) * 111_320;
  const dx = (left.lng - right.lng) * 111_320 * Math.cos(meanLatRad);
  return dx * dx + dy * dy;
}

function profileOrder(left, right) {
  return (
    left.lat - right.lat ||
    left.lng - right.lng ||
    right.population - left.population ||
    (left.accessSignature ?? JSON.stringify(left.accesses)).localeCompare(
      right.accessSignature ?? JSON.stringify(right.accesses),
    )
  );
}

function nearestStationCandidates(point, stations) {
  const all = stations.map((station) => ({
    station,
    distM: haversineM(point.lat, point.lng, station.lat, station.lng),
  }));
  all.sort((a, b) => a.distM - b.distM || a.station.id - b.station.id);
  const nearby = all.filter((entry) => entry.distM <= BUS_STATION_SEARCH_RADIUS_M);
  return (nearby.length ? nearby : all.slice(0, 1)).slice(0, MAX_BUS_STATION_CANDIDATES);
}

function compactAccesses(candidates) {
  return candidates
    .sort((a, b) => a.selection - b.selection || a.station.id - b.station.id)
    .slice(0, MAX_NEARBY_STATIONS)
    .map(({ station, real, selection, mode, busRef }) => {
      const access = [station.id, quantize(real), quantize(selection), mode];
      if (mode === 1 && busRef) access.push(busRef);
      return access;
    });
}

function quantize(value) {
  return Math.round(value / ACCESS_TIME_STEP_MIN) * ACCESS_TIME_STEP_MIN;
}

function saneHeadway(value, fallback) {
  if (Number.isFinite(value) && value >= 2 && value <= 60) return value;
  if (Number.isFinite(fallback) && fallback >= 2 && fallback <= 60) return fallback;
  return BUS_DEFAULT_HEADWAY_MIN;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function cellKey(lat, lng) {
  return `${Math.floor(lat / CELL_DEG)},${Math.floor(lng / CELL_DEG)}`;
}

function validateNetwork(network) {
  if (!Array.isArray(network?.stops) || !Array.isArray(network?.routes)) {
    throw new Error("버스망 stops/routes가 없습니다.");
  }
  for (const [routeIndex, route] of network.routes.entries()) {
    const [, , stopIds, cumulative] = route;
    if (!Array.isArray(stopIds) || !Array.isArray(cumulative) || stopIds.length !== cumulative.length) {
      throw new Error(`버스 노선 ${routeIndex}의 정류장·거리 배열 길이가 다릅니다.`);
    }
    for (const id of stopIds) {
      if (!Number.isInteger(id) || id < 0 || id >= network.stops.length) {
        throw new Error(`버스 노선 ${routeIndex}의 정류장 id가 범위를 벗어납니다: ${id}`);
      }
    }
  }
}
