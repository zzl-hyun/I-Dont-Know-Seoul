import type { FeatureCollection, Feature, MultiLineString, Point } from "geojson";
import type { SubwayGraph } from "../types";

/**
 * 지하철 노선도 오버레이용 GeoJSON 생성.
 *
 * 추가로 받아오는 데이터가 없다. 역 좌표(623개)와 노선 연결 관계는 이미 통근
 * 계산용으로 번들에 실려 있어서, 그대로 다시 읽어 그리기만 한다.
 */

/**
 * 한국 지하철 공식 노선색.
 *
 * 임의 팔레트를 쓰면 안 된다 — 사용자가 색만 보고 "저건 2호선" 이라고 아는 게
 * 이 오버레이의 거의 전부이기 때문이다. 키는 그래프의 노선 식별자
 * (`graph.nodes[].line`)와 같아야 한다.
 */
export const LINE_COLOR: Record<string, string> = {
  "1": "#0052A4",
  "2": "#00A84D",
  "3": "#EF7C1C",
  "4": "#00A5DE",
  "5": "#996CAC",
  "6": "#CD7C2F",
  "7": "#747F00",
  "8": "#E6186C",
  "9": "#BDB092",
  신분당: "#D4003B",
  공항철도: "#0090D2",
  AREX: "#0090D2",
  "경의·중앙": "#77C4A3",
  "수인·분당": "#F5A200",
  경춘: "#0C8E72",
  서해: "#81A914",
  경강: "#003DA5",
  W: "#B7C452", // 우이신설선
  Silim: "#6789CA", // 신림선
  "김포 골드라인": "#A17E46",
  인천1: "#7CA8D5",
  I2: "#ED8B00", // 인천 2호선
  "GTX-A": "#9A6292",
};

/** 색 테이블에 없는 노선의 폴백. 이 색이 화면에 보이면 테이블에 빠진 노선이 있다는 뜻이다. */
export const UNKNOWN_LINE_COLOR = "#8b93a1";

/** 그래프의 노선 식별자를 사람이 읽는 이름으로. */
export function lineName(line: string): string {
  if (/^\d+$/.test(line)) return `${line}호선`;
  const alias: Record<string, string> = {
    W: "우이신설선",
    Silim: "신림선",
    AREX: "공항철도",
    인천1: "인천 1호선",
    I2: "인천 2호선",
  };
  return alias[line] ?? `${line}선`.replace(/선선$/, "선");
}

export interface StationProps {
  name: string;
  isTransfer: boolean;
  color: string;
  lineCount: number;
  /**
   * 단일 노선 역이 속한 노선. 노선별 on/off 필터에 쓴다.
   * 환승역은 노선이 여럿이라 하나로 정할 수 없으므로 `isTransfer` 로 걸러
   * 항상 남긴다 — 다른 노선이 살아 있는 한 그 역은 지도에 있어야 한다.
   */
  primaryLine: string;
}

export interface SubwayLayers {
  /** 노선별 MultiLineString — 노선 수만큼의 피처 */
  lines: FeatureCollection<MultiLineString, { line: string; color: string }>;
  /** 역 Point */
  stations: FeatureCollection<Point, StationProps>;
  /** 그래프에 있었지만 LINE_COLOR 에 없는 노선 — 테스트가 여기를 검사한다 */
  missingColors: string[];
}

export function buildSubwayLayers(graph: SubwayGraph): SubwayLayers {
  /* ---- 노선별 구간 ---- */
  const byLine = new Map<string, Array<[number, number][]>>();
  // 엣지는 양방향으로 들어 있으므로 한 번만 그린다
  const seen = new Set<string>();

  graph.edges.forEach((outgoing, from) => {
    for (const e of outgoing ?? []) {
      if (e.kind !== "ride") continue;
      const key = from < e.to ? `${from}|${e.to}` : `${e.to}|${from}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const line = graph.nodes[from].line;
      const a = graph.stations[graph.nodes[from].stationId];
      const b = graph.stations[graph.nodes[e.to].stationId];
      if (!a || !b) continue;

      if (!byLine.has(line)) byLine.set(line, []);
      byLine.get(line)!.push([
        [a.lng, a.lat],
        [b.lng, b.lat],
      ]);
    }
  });

  const missingColors: string[] = [];
  const lineFeatures: Feature<MultiLineString, { line: string; color: string }>[] = [];

  for (const [line, segments] of byLine) {
    const color = LINE_COLOR[line];
    if (!color) missingColors.push(line);
    lineFeatures.push({
      type: "Feature",
      geometry: { type: "MultiLineString", coordinates: segments },
      properties: { line, color: color ?? UNKNOWN_LINE_COLOR },
    });
  }

  /* ---- 역 ---- */
  const stationFeatures = graph.stations.map((s): Feature<Point, StationProps> => {
    const isTransfer = s.lines.length > 1;
    return {
      type: "Feature",
      geometry: { type: "Point", coordinates: [s.lng, s.lat] },
      properties: {
        name: s.name,
        isTransfer,
        // 환승역은 노선이 여럿이라 색을 하나로 정할 수 없다. 실제 노선도 관례대로
        // 흰 점으로 그려 구분하고, 단일 노선 역만 노선색을 쓴다.
        color: isTransfer ? "#ffffff" : (LINE_COLOR[s.lines[0]] ?? UNKNOWN_LINE_COLOR),
        lineCount: s.lines.length,
        primaryLine: s.lines[0] ?? "",
      },
    };
  });

  return {
    lines: { type: "FeatureCollection", features: lineFeatures },
    stations: { type: "FeatureCollection", features: stationFeatures },
    missingColors,
  };
}
