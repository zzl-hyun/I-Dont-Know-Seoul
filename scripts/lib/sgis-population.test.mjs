import { describe, expect, it } from "vitest";
import {
  assignPopulationCell,
  buildPopulationSnapshot,
  createDongSpatialIndex,
  createPopulationAssignment,
  decodeGridCode,
  findPointDongs,
  gridCodeCenterWgs84,
  parsePopulationCsv,
  project5179ToWgs84,
} from "./sgis-population.mjs";

function squareFeature(code, name, minLng, minLat, maxLng, maxLat) {
  return {
    type: "Feature",
    properties: { adm_cd2: code, adm_nm: name },
    geometry: {
      type: "Polygon",
      coordinates: [[
        [minLng, minLat],
        [maxLng, minLat],
        [maxLng, maxLat],
        [minLng, maxLat],
        [minLng, minLat],
      ]],
    },
  };
}

describe("SGIS 100m 격자코드", () => {
  it("접두사 기준점과 여섯 자리 인덱스를 정확히 푼다", () => {
    expect(decodeGridCode("다바000277")).toMatchObject({
      prefix: "다바",
      xIndex: 0,
      yIndex: 277,
      lowerLeftX: 900000,
      lowerLeftY: 1827700,
      centerX: 900050,
      centerY: 1827750,
    });
    expect(decodeGridCode("다사123456")).toMatchObject({
      lowerLeftX: 912300,
      lowerLeftY: 1945600,
    });
    expect(decodeGridCode("라사001002")).toMatchObject({
      lowerLeftX: 1000100,
      lowerLeftY: 1900200,
    });
  });

  it("모르는 접두사와 정확히 여섯 자리가 아닌 코드는 거부한다", () => {
    expect(() => decodeGridCode("마사000277")).toThrow("지원하지 않는");
    expect(() => decodeGridCode("다바00277")).toThrow("알 수 없는");
    expect(() => decodeGridCode("다바0002770")).toThrow("알 수 없는");
  });
});

describe("EPSG:5179 변환", () => {
  it("SGIS 공식 다바000277 폴리곤 통제값과 일치한다", () => {
    const [lowerLng, lowerLat] = project5179ToWgs84(900000, 1827700);
    expect(lowerLng).toBeCloseTo(126.3842285, 6);
    expect(lowerLat).toBeCloseTo(36.4416581, 6);

    const [centerLng, centerLat] = gridCodeCenterWgs84("다바000277");
    expect(centerLng).toBeGreaterThan(126.3842285);
    expect(centerLng).toBeLessThan(126.3853441);
    expect(centerLat).toBeGreaterThan(36.4416581);
    expect(centerLat).toBeLessThan(36.4425698);
  });
});

describe("SGIS 인구 CSV 필터", () => {
  it("2024년 to_in_001의 양수 유한값만 읽는다", () => {
    const csv = [
      "2024,다바000277,to_in_001,5",
      "2024,다바000278,to_in_007,99",
      "2024,다바000279,to_in_001,0",
      "2024,다바000280,to_in_001,-2",
      "2024,다바000281,to_in_001,NaN",
      "2024,다바000282,to_in_001,2.5",
      "",
    ].join("\n");
    const { cells, stats } = parsePopulationCsv(csv, { expectedPrefix: "다바" });

    expect(cells.map((cell) => [cell.code, cell.population])).toEqual([
      ["다바000277", 5],
      ["다바000282", 2.5],
    ]);
    expect(stats).toEqual({
      rowCount: 6,
      targetMetricRows: 5,
      acceptedCellCount: 2,
      acceptedPopulation: 7.5,
      skippedOtherMetricRows: 1,
      skippedNonPositiveRows: 3,
    });
  });

  it("양수 대상 행의 미지원 접두사·파일 접두사 불일치를 숨기지 않는다", () => {
    expect(() => parsePopulationCsv("2024,마사000277,to_in_001,5")).toThrow("지원하지 않는");
    expect(() =>
      parsePopulationCsv("2024,다사000277,to_in_001,5", { expectedPrefix: "다바" }),
    ).toThrow("파일 접두사");
  });
});

describe("행정동 공간 배정", () => {
  const geojson = {
    type: "FeatureCollection",
    features: [
      squareFeature("0000000002", "둘째동", 1, 0, 2, 1),
      squareFeature("0000000001", "첫째동", 0, 0, 1, 1),
      squareFeature("0000000003", "빈동", 0, 1, 1, 2),
    ],
  };

  it("bbox 타일 후보에만 pointInGeometry를 적용해 내부/외부를 구분한다", () => {
    const index = createDongSpatialIndex(geojson, { cellSize: 0.5 });
    expect(findPointDongs(0.25, 0.25, index).map((dong) => dong.code)).toEqual(["0000000001"]);
    expect(findPointDongs(1.25, 0.25, index).map((dong) => dong.code)).toEqual(["0000000002"]);
    expect(findPointDongs(9, 9, index)).toEqual([]);
  });

  it("전체=배정+대상 밖 회계와 무인구 동 보고를 보존한다", () => {
    const cells = [
      { code: "test-a", lng: 0.25, lat: 0.25, population: 4 },
      { code: "test-b", lng: 1.25, lat: 0.25, population: 6 },
      { code: "test-c", lng: 9, lat: 9, population: 10 },
    ];
    const snapshot = buildPopulationSnapshot(cells, geojson);

    expect(snapshot.coverage.positiveCellCount).toBe(
      snapshot.coverage.assignedCellCount + snapshot.coverage.outsideTargetCellCount,
    );
    expect(snapshot.coverage.positivePopulation).toBe(
      snapshot.coverage.assignedPopulation + snapshot.coverage.outsideTargetPopulation,
    );
    expect(snapshot.coverage).toMatchObject({
      positiveCellCount: 3,
      assignedCellCount: 2,
      outsideTargetCellCount: 1,
      dongCount: 3,
      populatedDongCount: 2,
      noPopulationDongCount: 1,
      dongsWithoutPopulation: [["0000000003", "빈동"]],
    });
    expect(Object.keys(snapshot.dongs)).toEqual(["0000000001", "0000000002", "0000000003"]);
    expect(snapshot.dongs["0000000003"]).toEqual([]);
  });

  it("증분 배정도 같은 회계 규칙을 따른다", () => {
    const state = createPopulationAssignment(geojson, { cellSize: 0.5 });
    expect(assignPopulationCell(state, { lng: 0.1, lat: 0.1, population: 3 })).toBe("0000000001");
    expect(assignPopulationCell(state, { lng: -5, lat: -5, population: 7 })).toBeNull();
    expect(state.positivePopulation).toBe(10);
    expect(state.assignedPopulation).toBe(3);
    expect(state.outsideTargetPopulation).toBe(7);
  });
});
