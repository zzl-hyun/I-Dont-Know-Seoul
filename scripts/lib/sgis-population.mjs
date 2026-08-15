import proj4 from "proj4";
import { bbox, pointInGeometry } from "./geo.mjs";

export const SGIS_POPULATION_YEAR = 2024;
export const SGIS_POPULATION_METRIC = "to_in_001";
export const SGIS_CELL_SIZE_M = 100;

const EPSG_5179_DEFINITION =
  "+proj=tmerc +lat_0=38 +lon_0=127.5 +k=0.9996 " +
  "+x_0=1000000 +y_0=2000000 +ellps=GRS80 +units=m +no_defs";

const GRID_BASES = Object.freeze({
  "다바": [900000, 1800000],
  "다사": [900000, 1900000],
  "라사": [1000000, 1900000],
});

const DEFAULT_INDEX_CELL_DEGREES = 0.025;

proj4.defs("EPSG:5179", EPSG_5179_DEFINITION);

/** SGIS 원본 CSV(CP949/EUC-KR)를 한글 코드가 보존되도록 디코딩한다. */
export function decodePopulationCsvBuffer(buffer) {
  return new TextDecoder("euc-kr", { fatal: true }).decode(buffer);
}

/**
 * SGIS 100m 격자코드를 EPSG:5179 좌표로 푼다.
 * 반환 좌표에는 좌하단과 셀 중심을 모두 담아 해석의 여지를 없앤다.
 */
export function decodeGridCode(code) {
  if (typeof code !== "string") {
    throw new TypeError(`격자코드는 문자열이어야 합니다: ${String(code)}`);
  }

  const match = /^([^\d]+)(\d{3})(\d{3})$/u.exec(code.trim());
  if (!match) throw new Error(`알 수 없는 SGIS 100m 격자코드 형식: ${code}`);

  const [, prefix, xDigits, yDigits] = match;
  const base = GRID_BASES[prefix];
  if (!base) throw new Error(`지원하지 않는 SGIS 100m 격자 접두사: ${prefix}`);

  const lowerLeftX = base[0] + Number(xDigits) * SGIS_CELL_SIZE_M;
  const lowerLeftY = base[1] + Number(yDigits) * SGIS_CELL_SIZE_M;
  return {
    code: `${prefix}${xDigits}${yDigits}`,
    prefix,
    xIndex: Number(xDigits),
    yIndex: Number(yDigits),
    lowerLeftX,
    lowerLeftY,
    centerX: lowerLeftX + SGIS_CELL_SIZE_M / 2,
    centerY: lowerLeftY + SGIS_CELL_SIZE_M / 2,
  };
}

/** EPSG:5179 좌표를 [lng, lat] WGS84 좌표로 변환한다. */
export function project5179ToWgs84(x, y) {
  if (![x, y].every(Number.isFinite)) {
    throw new TypeError(`유효하지 않은 EPSG:5179 좌표: ${x}, ${y}`);
  }
  const [lng, lat] = proj4("EPSG:5179", "EPSG:4326", [x, y]);
  if (![lng, lat].every(Number.isFinite)) {
    throw new Error(`EPSG:5179 좌표 변환 실패: ${x}, ${y}`);
  }
  return [lng, lat];
}

/** SGIS 격자코드의 셀 중심을 [lng, lat]으로 변환한다. */
export function gridCodeCenterWgs84(code) {
  const decoded = decodeGridCode(code);
  return project5179ToWgs84(decoded.centerX, decoded.centerY);
}

function forEachLine(text, callback) {
  let lineNumber = 0;
  let start = 0;
  while (start < text.length) {
    let end = text.indexOf("\n", start);
    if (end === -1) end = text.length;
    lineNumber += 1;
    let line = text.slice(start, end);
    if (line.endsWith("\r")) line = line.slice(0, -1);
    if (line) callback(line, lineNumber);
    start = end + 1;
  }
}

/**
 * CSV를 순회하며 2024년 총인구(to_in_001) 양수 셀만 callback으로 넘긴다.
 * 원하는 지표의 양수 행에 미지원 코드가 나오면 조용히 버리지 않고 즉시 실패한다.
 */
export function visitPopulationCsv(
  text,
  {
    expectedPrefix,
    expectedYear = SGIS_POPULATION_YEAR,
    sourceLabel = "SGIS population CSV",
  } = {},
  callback = () => {},
) {
  if (typeof text !== "string") throw new TypeError("CSV 내용은 문자열이어야 합니다.");

  const stats = {
    rowCount: 0,
    targetMetricRows: 0,
    acceptedCellCount: 0,
    acceptedPopulation: 0,
    skippedOtherMetricRows: 0,
    skippedNonPositiveRows: 0,
  };

  forEachLine(text, (line, lineNumber) => {
    stats.rowCount += 1;
    const columns = line.split(",");
    if (columns.length !== 4) {
      throw new Error(`${sourceLabel}:${lineNumber} CSV 열이 4개가 아닙니다.`);
    }

    const [yearRaw, codeRaw, metricRaw, populationRaw] = columns.map((value) => value.trim());
    const year = yearRaw.replace(/^\uFEFF/u, "");
    if (metricRaw !== SGIS_POPULATION_METRIC) {
      stats.skippedOtherMetricRows += 1;
      return;
    }

    stats.targetMetricRows += 1;
    const population = Number(populationRaw);
    if (!Number.isFinite(population) || population <= 0) {
      stats.skippedNonPositiveRows += 1;
      return;
    }
    if (year !== String(expectedYear)) {
      throw new Error(`${sourceLabel}:${lineNumber} 예상하지 못한 연도: ${year}`);
    }

    let decoded;
    try {
      decoded = decodeGridCode(codeRaw);
    } catch (error) {
      throw new Error(`${sourceLabel}:${lineNumber} ${error.message}`, { cause: error });
    }
    if (expectedPrefix && decoded.prefix !== expectedPrefix) {
      throw new Error(
        `${sourceLabel}:${lineNumber} 파일 접두사 ${expectedPrefix}와 행 코드 ${decoded.code}가 다릅니다.`,
      );
    }

    const [lng, lat] = project5179ToWgs84(decoded.centerX, decoded.centerY);
    callback({ code: decoded.code, lng, lat, population });
    stats.acceptedCellCount += 1;
    stats.acceptedPopulation += population;
  });

  return stats;
}

/** 테스트와 소규모 호출용 수집형 래퍼. 대용량 변환은 visitPopulationCsv를 사용한다. */
export function parsePopulationCsv(text, options = {}) {
  const cells = [];
  const stats = visitPopulationCsv(text, options, (cell) => cells.push(cell));
  return { cells, stats };
}

function bucketKey(x, y) {
  return `${x}:${y}`;
}

function bucketCoordinate(value, cellSize) {
  return Math.floor(value / cellSize);
}

function readDong(feature) {
  const code = String(feature?.properties?.adm_cd2 ?? "");
  const name = String(feature?.properties?.adm_nm ?? "");
  if (!/^\d{10}$/u.test(code)) throw new Error(`행정동 코드가 올바르지 않습니다: ${code}`);
  if (!feature?.geometry || !["Polygon", "MultiPolygon"].includes(feature.geometry.type)) {
    throw new Error(`${code} 행정동 geometry가 Polygon/MultiPolygon이 아닙니다.`);
  }
  return { code, name, geometry: feature.geometry, bounds: bbox(feature.geometry) };
}

/** 행정동 bbox를 작은 타일에 등록해 점마다 556개 동을 전수 검사하지 않게 한다. */
export function createDongSpatialIndex(geojson, { cellSize = DEFAULT_INDEX_CELL_DEGREES } = {}) {
  if (geojson?.type !== "FeatureCollection" || !Array.isArray(geojson.features)) {
    throw new Error("행정동 경계는 GeoJSON FeatureCollection이어야 합니다.");
  }
  if (!Number.isFinite(cellSize) || cellSize <= 0) {
    throw new Error(`공간 인덱스 셀 크기가 올바르지 않습니다: ${cellSize}`);
  }

  const dongs = geojson.features.map(readDong).sort((a, b) => a.code.localeCompare(b.code));
  const duplicateCodes = dongs.filter((dong, index) => index > 0 && dong.code === dongs[index - 1].code);
  if (duplicateCodes.length) throw new Error(`중복 행정동 코드: ${duplicateCodes[0].code}`);

  const buckets = new Map();
  for (const dong of dongs) {
    const [minLng, minLat, maxLng, maxLat] = dong.bounds;
    const minX = bucketCoordinate(minLng, cellSize);
    const maxX = bucketCoordinate(maxLng, cellSize);
    const minY = bucketCoordinate(minLat, cellSize);
    const maxY = bucketCoordinate(maxLat, cellSize);
    for (let x = minX; x <= maxX; x += 1) {
      for (let y = minY; y <= maxY; y += 1) {
        const key = bucketKey(x, y);
        const candidates = buckets.get(key);
        if (candidates) candidates.push(dong);
        else buckets.set(key, [dong]);
      }
    }
  }
  return { cellSize, dongs, buckets };
}

/** 한 점과 겹치는 행정동을 코드 순으로 반환한다. 일반적인 경계에서는 0개 또는 1개다. */
export function findPointDongs(lng, lat, index) {
  if (![lng, lat].every(Number.isFinite)) throw new TypeError(`유효하지 않은 WGS84 점: ${lng}, ${lat}`);
  const x = bucketCoordinate(lng, index.cellSize);
  const y = bucketCoordinate(lat, index.cellSize);
  const candidates = index.buckets.get(bucketKey(x, y)) ?? [];
  return candidates.filter((dong) => {
    const [minLng, minLat, maxLng, maxLat] = dong.bounds;
    return (
      lng >= minLng &&
      lng <= maxLng &&
      lat >= minLat &&
      lat <= maxLat &&
      pointInGeometry(lng, lat, dong.geometry)
    );
  });
}

export function createPopulationAssignment(geojson, options = {}) {
  const index = createDongSpatialIndex(geojson, options);
  return {
    index,
    cellsByDong: new Map(index.dongs.map((dong) => [dong.code, []])),
    positiveCellCount: 0,
    positivePopulation: 0,
    assignedCellCount: 0,
    assignedPopulation: 0,
    outsideTargetCellCount: 0,
    outsideTargetPopulation: 0,
    ambiguousCellCount: 0,
  };
}

/** 양수 인구 셀 하나를 행정동에 배정하고 전체/배정/외부 집계를 동시에 유지한다. */
export function assignPopulationCell(state, cell) {
  if (![cell?.lng, cell?.lat, cell?.population].every(Number.isFinite) || cell.population <= 0) {
    throw new Error(`배정할 인구 셀이 올바르지 않습니다: ${JSON.stringify(cell)}`);
  }

  state.positiveCellCount += 1;
  state.positivePopulation += cell.population;
  // 저장 좌표와 배정 좌표를 같게 해야 경계에 아주 가까운 셀이 6자리 반올림 후
  // 소속 동 바깥으로 보이는 일을 막을 수 있다.
  const roundedLng = Number(cell.lng.toFixed(6));
  const roundedLat = Number(cell.lat.toFixed(6));
  const matches = findPointDongs(roundedLng, roundedLat, state.index);
  if (matches.length === 0) {
    state.outsideTargetCellCount += 1;
    state.outsideTargetPopulation += cell.population;
    return null;
  }

  // 경계 원본의 미세한 중첩이 있어도 결과는 코드 순으로 결정적이며, 중첩 수를 숨기지 않는다.
  if (matches.length > 1) state.ambiguousCellCount += 1;
  const dong = matches[0];
  state.cellsByDong.get(dong.code).push([
    roundedLng,
    roundedLat,
    cell.population,
  ]);
  state.assignedCellCount += 1;
  state.assignedPopulation += cell.population;
  return dong.code;
}

/** 정렬·회계 불변식을 확인하고 커밋 가능한 결정적 JSON 객체를 만든다. */
export function finalizePopulationSnapshot(state, metadata = {}) {
  if (state.assignedCellCount + state.outsideTargetCellCount !== state.positiveCellCount) {
    throw new Error("인구 셀 배정 수 회계가 맞지 않습니다.");
  }
  if (state.assignedPopulation + state.outsideTargetPopulation !== state.positivePopulation) {
    throw new Error("인구 합계 배정 회계가 맞지 않습니다.");
  }

  const dongs = {};
  const dongsWithoutPopulation = [];
  for (const dong of state.index.dongs) {
    const cells = state.cellsByDong.get(dong.code);
    cells.sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]);
    dongs[dong.code] = cells;
    if (cells.length === 0) dongsWithoutPopulation.push([dong.code, dong.name]);
  }

  return {
    schema: 1,
    source: {
      provider: "SGIS",
      dataset: "2024년 인구 100m 격자",
      year: SGIS_POPULATION_YEAR,
      metric: SGIS_POPULATION_METRIC,
      inputCrs: "EPSG:5179",
      outputCrs: "EPSG:4326",
      cellSizeM: SGIS_CELL_SIZE_M,
      ...metadata.source,
    },
    boundary: metadata.boundary ?? {},
    coverage: {
      positiveCellCount: state.positiveCellCount,
      positivePopulation: state.positivePopulation,
      assignedCellCount: state.assignedCellCount,
      assignedPopulation: state.assignedPopulation,
      outsideTargetCellCount: state.outsideTargetCellCount,
      outsideTargetPopulation: state.outsideTargetPopulation,
      ambiguousCellCount: state.ambiguousCellCount,
      dongCount: state.index.dongs.length,
      populatedDongCount: state.index.dongs.length - dongsWithoutPopulation.length,
      noPopulationDongCount: dongsWithoutPopulation.length,
      dongsWithoutPopulation,
    },
    dongs,
  };
}

export function buildPopulationSnapshot(cells, geojson, metadata = {}) {
  const state = createPopulationAssignment(geojson);
  for (const cell of cells) assignPopulationCell(state, cell);
  return finalizePopulationSnapshot(state, metadata);
}
