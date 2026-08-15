/**
 * Browser와 Node 데이터 파이프라인이 함께 쓰는 통근 번들 심층 검증.
 *
 * 이 파일은 브라우저 번들에도 포함되므로 `node:` 모듈이나 파일 시스템 API를
 * import하지 않는다. JSON 값만 받아 순수하게 검증한다.
 */

export const EXPECTED_RESIDENTIAL_DONGS = 556;
export const MAX_RESIDENTIAL_PROFILES = 100_000;
export const MIN_BUS_HEADWAY_MIN = 2;
export const MAX_BUS_HEADWAY_MIN = 60;
export const CURRENT_RESIDENTIAL_PROFILE_CAP = 24;
export const CURRENT_RESIDENTIAL_WEIGHT_SCALE = 10_000;

const DEFAULT_MAX_PROBLEMS = 20;
const MODEL_TOLERANCE_MIN = 0.51;
const BUS_STOP_SEARCH_RADIUS_M = 450;
const BUS_SPEED_KMH = 15;
const BUS_DWELL_MIN_PER_STOP = 0.2;
const BUS_MIN_WAIT_MIN = 2;
const BUS_MAX_WAIT_MIN = 8;
const WALK_SELECTION_WEIGHT = 1.4;
const WALK_DETOUR_FACTOR = 1.4;
const WALK_SPEED_M_PER_MIN = 67;
const EARTH_RADIUS_M = 6_371_008.8;

/**
 * 버스망과 거주 접근 프로필의 핵심 불변식을 검증한다.
 *
 * `required=false`는 구버전 번들처럼 두 데이터가 모두 없는 경우만 허용한다.
 * 하나만 있거나, 둘 중 하나라도 손상된 혼합 번들은 항상 거부한다.
 */
export function assertValidCommuteBundle(bundle, options = {}) {
  const problems = collectCommuteBundleProblems(bundle, options);
  if (problems.length > 0) {
    throw new Error(`통근 접근 데이터 검증 실패:\n  - ${problems.join("\n  - ")}`);
  }
}

/** 오류 목록이 필요한 생성기·테스트용 함수. */
export function collectCommuteBundleProblems(bundle, options = {}) {
  const required = options.required ?? false;
  const maxProfiles = positiveIntegerOr(
    options.maxResidentialProfiles,
    MAX_RESIDENTIAL_PROFILES,
  );
  const maxProblems = positiveIntegerOr(options.maxProblems, DEFAULT_MAX_PROBLEMS);
  const problems = [];
  const add = (message) => {
    if (problems.length < maxProblems) problems.push(message);
  };

  if (!isRecord(bundle)) {
    add("번들이 객체가 아님");
    return problems;
  }

  const bus = bundle.bus;
  const residential = bundle.residential;
  const hasBus = bus != null;
  const hasResidential = residential != null;

  if (hasBus !== hasResidential) {
    add("버스망과 거주인구 접근 데이터 중 하나만 존재함");
  }
  if (!hasBus && !hasResidential) {
    if (required) add("버스망과 거주인구 접근 데이터가 없음");
    validateAbsentCommuteMetadata(bundle.meta, add);
    return problems;
  }

  const stations = Array.isArray(bundle.graph?.stations) ? bundle.graph.stations : [];
  const dongs = Array.isArray(bundle.dongs) ? bundle.dongs : [];

  if (hasBus) validateBusNetwork(bus, add);
  if (hasResidential) {
    validateResidentialAccess(residential, dongs, stations, bus, maxProfiles, required, add);
  }
  validateCommuteMetadata(bundle.meta, bus, residential, add);

  return problems;
}

function validateBusNetwork(bus, add) {
  if (!isRecord(bus)) {
    add("버스망이 객체가 아님");
    return;
  }
  if (!isNonEmptyStringOrNumber(bus.version)) add("버스망 버전이 비어 있음");
  if (!isIsoDateTime(bus.generatedAt)) add("버스망 생성시각이 올바르지 않음");
  if (!isHeadway(bus.defaultHeadwayMin)) {
    add(
      `버스 기본 배차간격 범위 이상: ${String(bus.defaultHeadwayMin)} ` +
        `(${MIN_BUS_HEADWAY_MIN}..${MAX_BUS_HEADWAY_MIN}분 필요)`,
    );
  }

  const stops = bus.stops;
  if (!Array.isArray(stops) || stops.length === 0) {
    add("버스 정류장 데이터가 비어 있음");
  } else {
    for (let stopId = 0; stopId < stops.length; stopId += 1) {
      const stop = stops[stopId];
      if (!Array.isArray(stop) || stop.length !== 3) {
        add(`버스 정류장 ${stopId} 튜플 길이 이상`);
        continue;
      }
      const [name, lat, lng] = stop;
      if (!isNonEmptyString(name)) add(`버스 정류장 ${stopId} 이름이 비어 있음`);
      if (!isLatitude(lat) || !isLongitude(lng)) {
        add(`버스 정류장 ${stopId} 좌표 이상: lat=${String(lat)} lng=${String(lng)}`);
      }
    }
  }

  const routes = bus.routes;
  if (!Array.isArray(routes) || routes.length === 0) {
    add("버스 노선 데이터가 비어 있음");
    return;
  }

  const stopCount = Array.isArray(stops) ? stops.length : 0;
  for (let routeId = 0; routeId < routes.length; routeId += 1) {
    const route = routes[routeId];
    if (!Array.isArray(route) || route.length !== 4) {
      add(`버스 노선 ${routeId} 튜플 길이 이상`);
      continue;
    }
    const [name, headwayMin, stopIds, cumulativeMeters] = route;
    if (!isNonEmptyString(name)) add(`버스 노선 ${routeId} 이름이 비어 있음`);
    if (!isHeadway(headwayMin)) {
      add(
        `버스 노선 ${routeId} 배차간격 범위 이상: ${String(headwayMin)} ` +
          `(${MIN_BUS_HEADWAY_MIN}..${MAX_BUS_HEADWAY_MIN}분 필요)`,
      );
    }
    if (!Array.isArray(stopIds) || stopIds.length < 2) {
      add(`버스 노선 ${routeId} 정류장 순서가 비어 있거나 너무 짧음`);
      continue;
    }
    if (!Array.isArray(cumulativeMeters)) {
      add(`버스 노선 ${routeId} 누적거리 배열이 아님`);
      continue;
    }
    if (cumulativeMeters.length !== stopIds.length) {
      add(
        `버스 노선 ${routeId} 정류장·누적거리 길이 불일치: ` +
          `${stopIds.length}/${cumulativeMeters.length}`,
      );
    }

    for (let order = 0; order < stopIds.length; order += 1) {
      const stopId = stopIds[order];
      if (!Number.isInteger(stopId) || stopId < 0 || stopId >= stopCount) {
        add(`버스 노선 ${routeId}의 ${order}번째 정류장 id 범위 이상: ${String(stopId)}`);
      }
    }

    for (let order = 0; order < cumulativeMeters.length; order += 1) {
      const meters = cumulativeMeters[order];
      if (!isFiniteNonNegative(meters)) {
        add(`버스 노선 ${routeId}의 ${order}번째 누적거리 이상: ${String(meters)}`);
        continue;
      }
      if (order === 0 && meters !== 0) {
        add(`버스 노선 ${routeId} 누적거리가 0에서 시작하지 않음: ${String(meters)}`);
      } else if (
        order > 0 &&
        Number.isFinite(cumulativeMeters[order - 1]) &&
        meters <= cumulativeMeters[order - 1]
      ) {
        add(`버스 노선 ${routeId} 누적거리가 엄격히 증가하지 않음 (${order - 1}→${order})`);
      }
    }
  }
}

function validateResidentialAccess(
  residential,
  dongs,
  stations,
  bus,
  maxProfiles,
  requireAggregationMetadata,
  add,
) {
  if (!isRecord(residential)) {
    add("거주인구 접근 데이터가 객체가 아님");
    return;
  }
  if (!isNonEmptyString(residential.version)) add("거주인구 접근 버전이 비어 있음");
  const requiresCurrentSchema =
    isNonEmptyString(residential.version) && residential.version.endsWith("-bus-v4");
  const requiresCurrentAggregation = requireAggregationMetadata || requiresCurrentSchema;
  if (residential.source != null && !isNonEmptyString(residential.source)) {
    add("거주인구 접근 출처가 비어 있음");
  }
  if (requiresCurrentAggregation && !isNonEmptyString(residential.source)) {
    add("필수 거주인구 출처 표기가 없음");
  }
  const expectedBusVersion = isRecord(bus)
    ? (bus.generatedAt ?? bus.version)
    : null;
  if (requiresCurrentSchema && residential.busVersion == null) {
    add("버스 경로 참조용 버스망 버전이 없음");
  } else if (
    residential.busVersion != null &&
    !sameVersion(residential.busVersion, expectedBusVersion)
  ) {
    add(
      `거주 접근 버스망 버전 불일치: residential=${String(residential.busVersion)} ` +
        `bus=${String(expectedBusVersion)}`,
    );
  }
  if (!isIsoDateTime(residential.generatedAt)) add("거주인구 접근 생성시각이 올바르지 않음");
  if (!Number.isFinite(residential.resolutionM) || residential.resolutionM <= 0) {
    add(`거주인구 격자 해상도 이상: ${String(residential.resolutionM)}`);
  }
  if (
    !Number.isFinite(residential.percentile) ||
    residential.percentile < 0 ||
    residential.percentile > 1
  ) {
    add(`거주인구 분위수 이상: ${String(residential.percentile)}`);
  }
  const hasWeightScale = residential.weightScale != null;
  const hasProfileCap = residential.maxProfilesPerDong != null;
  if (hasWeightScale !== hasProfileCap) {
    add("거주 접근 집약 메타는 weightScale·maxProfilesPerDong이 함께 있어야 함");
  }
  if (requiresCurrentAggregation && (!hasWeightScale || !hasProfileCap)) {
    add("필수 거주 접근 집약 메타가 없음");
  }
  const weightScale = Number.isInteger(residential.weightScale) && residential.weightScale > 0
    ? residential.weightScale
    : null;
  const maxProfilesPerDong =
    Number.isInteger(residential.maxProfilesPerDong) && residential.maxProfilesPerDong > 0
      ? residential.maxProfilesPerDong
      : null;
  if (hasWeightScale && weightScale == null) {
    add(`거주 접근 가중치 눈금 이상: ${String(residential.weightScale)}`);
  }
  if (hasProfileCap && maxProfilesPerDong == null) {
    add(`동별 대표 프로필 상한 이상: ${String(residential.maxProfilesPerDong)}`);
  }
  if (
    requiresCurrentSchema &&
    residential.weightScale !== CURRENT_RESIDENTIAL_WEIGHT_SCALE
  ) {
    add(
      `현재 거주 접근 가중치 눈금 불일치: ` +
        `${String(residential.weightScale)}/${CURRENT_RESIDENTIAL_WEIGHT_SCALE}`,
    );
  }
  if (
    requiresCurrentSchema &&
    residential.maxProfilesPerDong !== CURRENT_RESIDENTIAL_PROFILE_CAP
  ) {
    add(
      `현재 동별 대표 프로필 상한 불일치: ` +
        `${String(residential.maxProfilesPerDong)}/${CURRENT_RESIDENTIAL_PROFILE_CAP}`,
    );
  }

  if (dongs.length !== EXPECTED_RESIDENTIAL_DONGS) {
    add(`행정동 수 이상: ${dongs.length}/${EXPECTED_RESIDENTIAL_DONGS}`);
  }
  const byDong = residential.byDong;
  if (!isRecord(byDong)) {
    add("거주인구 접근 byDong이 객체가 아님");
    return;
  }

  const dongCodes = new Set();
  for (const dong of dongs) {
    const code = dong?.code;
    if (!isNonEmptyString(code)) {
      add(`행정동 코드가 비어 있음: ${String(code)}`);
      continue;
    }
    if (dongCodes.has(code)) add(`행정동 코드 중복: ${code}`);
    dongCodes.add(code);
  }
  const profileCodes = Object.keys(byDong);
  if (profileCodes.length !== EXPECTED_RESIDENTIAL_DONGS) {
    add(`거주 접근 동 수 이상: ${profileCodes.length}/${EXPECTED_RESIDENTIAL_DONGS}`);
  }
  for (const code of profileCodes) {
    if (!dongCodes.has(code)) add(`거주 접근에 알 수 없는 행정동 코드가 있음: ${code}`);
  }

  let profileCount = 0;
  let profileLimitReported = false;
  for (const dong of dongs) {
    const code = dong?.code;
    if (!isNonEmptyString(code)) continue;
    const profiles = byDong[code];
    if (!Array.isArray(profiles) || profiles.length === 0) {
      add(`${dong.name ?? code}: 거주 접근 프로필이 비어 있음`);
      continue;
    }
    if (maxProfilesPerDong != null && profiles.length > maxProfilesPerDong) {
      add(
        `${dong.name ?? code}: 동별 대표 프로필 상한 초과 ` +
          `${profiles.length}/${maxProfilesPerDong}`,
      );
    }

    let dongWeight = 0;
    for (let profileIndex = 0; profileIndex < profiles.length; profileIndex += 1) {
      profileCount += 1;
      if (profileCount > maxProfiles) {
        if (!profileLimitReported) {
          add(`거주 접근 프로필 상한 초과: ${profileCount}>${maxProfiles}`);
          profileLimitReported = true;
        }
        continue;
      }

      const profile = profiles[profileIndex];
      const label = `${dong.name ?? code} 프로필 ${profileIndex}`;
      const expectedProfileLength = requiresCurrentSchema ? 2 : 4;
      if (!Array.isArray(profile) || profile.length !== expectedProfileLength) {
        add(`${label} 튜플 길이 이상`);
        continue;
      }
      const weight = profile[0];
      const accesses = requiresCurrentSchema ? profile[1] : profile[3];
      if (!Number.isInteger(weight) || weight <= 0) {
        add(`${label} 가중치가 양의 정수가 아님: ${String(weight)}`);
      } else {
        dongWeight += weight;
      }
      if (!requiresCurrentSchema) {
        const [, lng, lat] = profile;
        if (!isLongitude(lng) || !isLatitude(lat)) {
          add(`${label} 좌표 이상: lng=${String(lng)} lat=${String(lat)}`);
        }
      }
      if (!Array.isArray(accesses) || accesses.length === 0) {
        add(`${label} 역 접근 선택지가 비어 있음`);
        continue;
      }

      for (let accessIndex = 0; accessIndex < accesses.length; accessIndex += 1) {
        const access = accesses[accessIndex];
        const accessLabel = `${label} 접근 ${accessIndex}`;
        if (!Array.isArray(access) || (access.length !== 4 && access.length !== 5)) {
          add(`${accessLabel} 튜플 길이 이상`);
          continue;
        }
        const [stationId, realMinutes, selectionCost, mode, busRef] = access;
        if (
          !Number.isInteger(stationId) ||
          stationId < 0 ||
          stationId >= stations.length ||
          stations[stationId] == null
        ) {
          add(`${accessLabel} 역 id 범위 이상: ${String(stationId)}`);
        }
        if (!isFiniteNonNegative(realMinutes)) {
          add(`${accessLabel} 실제 접근시간 이상: ${String(realMinutes)}`);
        }
        if (!isFiniteNonNegative(selectionCost)) {
          add(`${accessLabel} 선택비용 이상: ${String(selectionCost)}`);
        } else if (
          isFiniteNonNegative(realMinutes) &&
          selectionCost + MODEL_TOLERANCE_MIN < realMinutes
        ) {
          add(
            `${accessLabel} 선택비용이 실제 접근시간보다 작음: ` +
              `${selectionCost}<${realMinutes}`,
          );
        }
        if (mode !== 0 && mode !== 1) {
          add(`${accessLabel} mode 이상: ${String(mode)}`);
        }
        if (mode === 1 && requiresCurrentSchema && busRef == null) {
          add(`${accessLabel} 버스 경로 참조가 없음`);
        }
        if (mode === 0 && busRef != null) {
          add(`${accessLabel} 도보 선택지에 버스 경로 참조가 있음`);
        }
        if (busRef != null) {
          validateResidentialBusReference(
            busRef,
            bus,
            stations[stationId],
            realMinutes,
            selectionCost,
            accessLabel,
            add,
          );
        }
      }
    }
    if (weightScale != null && dongWeight !== weightScale) {
      add(`${dong.name ?? code}: 거주 접근 가중치 합 불일치 ${dongWeight}/${weightScale}`);
    }
  }
}

function validateResidentialBusReference(
  reference,
  bus,
  station,
  realMinutes,
  selectionCost,
  label,
  add,
) {
  if (!Array.isArray(reference) || reference.length !== 4) {
    add(`${label} 버스 경로 참조 튜플 길이 이상`);
    return;
  }
  const [routeId, boardOrder, alightOrder, walkToBoardMin] = reference;
  const routes = Array.isArray(bus?.routes) ? bus.routes : [];
  if (!Number.isInteger(routeId) || routeId < 0 || routeId >= routes.length) {
    add(`${label} 버스 노선 id 범위 이상: ${String(routeId)}`);
    return;
  }
  const stopIds = routes[routeId]?.[2];
  const cumulative = routes[routeId]?.[3];
  if (
    !Array.isArray(stopIds) ||
    !Array.isArray(cumulative) ||
    !Number.isInteger(boardOrder) ||
    !Number.isInteger(alightOrder) ||
    boardOrder < 0 ||
    alightOrder <= boardOrder ||
    alightOrder >= stopIds.length
  ) {
    add(
      `${label} 버스 승하차 순번 이상: ` +
        `${String(boardOrder)}→${String(alightOrder)}`,
    );
    return;
  }
  if (!(cumulative[alightOrder] > cumulative[boardOrder])) {
    add(`${label} 버스 경로 거리가 양수가 아님`);
    return;
  }
  if (!isFiniteNonNegative(walkToBoardMin)) {
    add(`${label} 승차 정류장까지 도보시간 이상: ${String(walkToBoardMin)}`);
    return;
  }
  if (walkToBoardMin > walkMinutes(BUS_STOP_SEARCH_RADIUS_M) + MODEL_TOLERANCE_MIN) {
    add(`${label} 승차 정류장 도보 반경 초과: ${walkToBoardMin}분`);
  }
  if (!station || !isRecord(station)) return;

  const alightStopId = stopIds[alightOrder];
  const alightStop = bus.stops?.[alightStopId];
  if (!Array.isArray(alightStop) || alightStop.length !== 3) return;
  const alightDistanceM = haversineM(
    alightStop[1],
    alightStop[2],
    station.lat,
    station.lng,
  );
  if (alightDistanceM > BUS_STOP_SEARCH_RADIUS_M + 1) {
    add(`${label} 하차 정류장이 대상 역 반경 밖: ${alightDistanceM.toFixed(1)}m`);
  }

  const route = routes[routeId];
  const headwayMin = route[1];
  const waitMin = clamp(headwayMin / 2, BUS_MIN_WAIT_MIN, BUS_MAX_WAIT_MIN);
  const stops = alightOrder - boardOrder;
  const rideDistanceM = cumulative[alightOrder] - cumulative[boardOrder];
  const rideMin =
    rideDistanceM / ((BUS_SPEED_KMH * 1000) / 60) +
    stops * BUS_DWELL_MIN_PER_STOP;
  const walkFromAlightMin = walkMinutes(alightDistanceM);
  const expectedReal = walkToBoardMin + waitMin + rideMin + walkFromAlightMin;
  const expectedSelection =
    (walkToBoardMin + walkFromAlightMin) * WALK_SELECTION_WEIGHT + waitMin + rideMin;
  if (
    isFiniteNonNegative(realMinutes) &&
    Math.abs(realMinutes - expectedReal) > MODEL_TOLERANCE_MIN
  ) {
    add(
      `${label} 버스 실제시간 공식 불일치: ` +
        `${realMinutes}/${expectedReal.toFixed(2)}`,
    );
  }
  if (
    isFiniteNonNegative(selectionCost) &&
    Math.abs(selectionCost - expectedSelection) > MODEL_TOLERANCE_MIN
  ) {
    add(
      `${label} 버스 선택비용 공식 불일치: ` +
        `${selectionCost}/${expectedSelection.toFixed(2)}`,
    );
  }
}

function validateCommuteMetadata(meta, bus, residential, add) {
  if (!isRecord(meta)) {
    add("통근 데이터 메타가 없음");
    return;
  }
  if (isRecord(bus)) {
    const expectedBusVersion = isIsoDateTime(bus.generatedAt)
      ? bus.generatedAt.slice(0, 10)
      : bus.version;
    if (!sameVersion(meta.busVersion, expectedBusVersion)) {
      add(
        `버스 메타 버전 불일치: meta=${String(meta.busVersion)} ` +
          `data=${String(expectedBusVersion)}`,
      );
    }
  }
  if (isRecord(residential) && !sameVersion(meta.residentialVersion, residential.version)) {
    add(
      `거주 접근 메타 버전 불일치: meta=${String(meta.residentialVersion)} ` +
        `data=${String(residential.version)}`,
    );
  }
}

function validateAbsentCommuteMetadata(meta, add) {
  if (!isRecord(meta)) return;
  if (meta.busVersion != null || meta.residentialVersion != null) {
    add("통근 데이터는 없지만 버스·거주 접근 메타 버전이 남아 있음");
  }
}

function isRecord(value) {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function isNonEmptyStringOrNumber(value) {
  return isNonEmptyString(value) || (typeof value === "number" && Number.isFinite(value));
}

function isIsoDateTime(value) {
  return isNonEmptyString(value) && Number.isFinite(Date.parse(value));
}

function isLatitude(value) {
  return Number.isFinite(value) && value >= -90 && value <= 90;
}

function isLongitude(value) {
  return Number.isFinite(value) && value >= -180 && value <= 180;
}

function isFiniteNonNegative(value) {
  return Number.isFinite(value) && value >= 0;
}

function isHeadway(value) {
  return (
    Number.isFinite(value) &&
    value >= MIN_BUS_HEADWAY_MIN &&
    value <= MAX_BUS_HEADWAY_MIN
  );
}

function walkMinutes(straightM) {
  return (straightM * WALK_DETOUR_FACTOR) / WALK_SPEED_M_PER_MIN;
}

function haversineM(lat1, lng1, lat2, lng2) {
  const toRad = (degrees) => (degrees * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(a));
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function sameVersion(left, right) {
  return left != null && right != null && String(left) === String(right);
}

function positiveIntegerOr(value, fallback) {
  return Number.isInteger(value) && value > 0 ? value : fallback;
}
