/** 행정동 메타데이터 (경계 파이프라인 산출물) */
export interface DongMeta {
  /** 10자리 행정동 코드 (adm_cd2). 전 파이프라인의 조인 키. */
  code: string;
  /** "관악구 신림동" */
  name: string;
  /** "신림동" */
  dong: string;
  /** "관악구" */
  gu: string;
  /** 5자리 시군구 코드 */
  guCode: string;
  areaKm2: number;
  /** 아이콘을 찍을 대표점 — 반드시 폴리곤 내부 */
  lng: number;
  lat: number;
}

/**
 * 지하철 그래프.
 *
 * 노드는 "역"이 아니라 "(역, 노선)" 쌍이다. 강남역은 2호선 노드와 신분당선
 * 노드로 나뉘고, 둘 사이를 환승 엣지가 잇는다. 이렇게 해야 환승 비용이
 * 경로에 자연스럽게 반영된다. 역 단위 노드 하나로 두면 Dijkstra 상태에
 * "지금 몇 호선을 타고 있는지"를 따로 들고 다녀야 한다.
 */
export interface SubwayGraph {
  version: string;
  generatedAt: string;
  /** 물리적 역. 좌표 기반 최근접 탐색은 이쪽을 쓴다. */
  stations: Station[];
  /** (역, 노선) 노드. 그래프 탐색은 이쪽을 쓴다. */
  nodes: GraphNode[];
  /** 인접 리스트. edges[nodeId] = 해당 노드에서 나가는 엣지들 */
  edges: Edge[][];
}

export interface Station {
  id: number;
  name: string;
  lat: number;
  lng: number;
  /** 이 역에 속한 노드 id들 (환승역이면 여러 개) */
  nodeIds: number[];
  lines: string[];
}

export interface GraphNode {
  id: number;
  stationId: number;
  line: string;
}

export interface Edge {
  to: number;
  /** 소요시간(분) */
  min: number;
  kind: "ride" | "transfer";
  /** measured = 공공데이터 실측값, estimated = 거리 기반 추정값 */
  source: "measured" | "estimated";
}

/** 동별 평판 점수 (전부 서울 427개 동 내 백분위, 0~100) */
export interface DongScore {
  safety: number;
  price: number;
  convenience: number;
  /**
   * 지표별 백분위. 순서는 번들의 `pctKeys` 가 정한다. 결측이면 null.
   *
   * 축 점수만으로는 "치안 78" 이 어디서 왔는지 설명할 수 없다. 실제로 유흥업소가
   * 0개인데 78점인 동이 있는데(서울 동 다수가 0개라 동점 평균 순위), 이 배열이
   * 있어야 그 계산을 화면에서 되짚을 수 있다.
   */
  pct: (number | null)[];
  /** UI에 "왜 이 등급인지" 근거로 보여줄 실제 수치 */
  raw: DongRawMetrics;
  /** 표본이 부족해 대체값을 쓴 경우 */
  dataQuality: "ok" | "low";
}

/** 원지표 키 — `pctKeys` 와 `axisWeights[].key` 가 쓰는 이름 */
export type MetricKey =
  | "monthlyRentMan"
  | "nightlifePerKm2"
  | "cctvPerKm2"
  | "crimePer1k"
  | "trafficAccidentPerKm2"
  | "storePerKm2"
  | "foodPerKm2"
  | "medicalPerKm2"
  | "busStopPerKm2"
  | "walkToStationMin";

/** 축을 구성하는 하위 지표와 그 가중치 (결측 지표를 뺀 뒤 재정규화된 값) */
export interface AxisWeight {
  key: MetricKey;
  label: string;
  /** +1 = 높을수록 좋음, -1 = 높을수록 나쁨 */
  dir: 1 | -1;
  w: number;
}

export type AxisName = "safety" | "price" | "convenience";

export interface DongRawMetrics {
  /** 환산월세 중앙값 (만원, 단독·다가구·오피스텔·소형아파트) */
  monthlyRentMan: number | null;
  /** 실거래 표본 수 */
  rentSamples: number;
  /** CCTV 밀도 (대/km²) */
  cctvPerKm2: number | null;
  /** 유흥·단란주점 밀도 (개/km²) */
  nightlifePerKm2: number | null;
  /** 자치구 5대범죄 발생 (건/천명) — 경찰서 단위라 구 해상도가 한계 */
  crimePer1k: number | null;
  /** 교통사고 다발지점 사고건수 밀도 (건/km², 취약계층 다발지점 기준) */
  trafficAccidentPerKm2: number | null;
  /** 편의점·마트 밀도 (개/km²) */
  storePerKm2: number | null;
  /** 음식점 밀도 (개/km²) */
  foodPerKm2: number | null;
  /** 병원·약국 밀도 (개/km²) */
  medicalPerKm2: number | null;
  /**
   * 버스 정류장 밀도 (개/km²).
   * "정류장이 많다"를 재는 것이지 "노선이 다양하다"를 재지 않는다.
   */
  busStopPerKm2: number | null;
  /** 대표점에서 최근접 지하철역까지 도보(분) */
  walkToStationMin: number | null;
}

export type Grade = "best" | "normal" | "bad";

/** 사용자가 조절하는 가중치. 합은 1. */
export interface Weights {
  safety: number;
  price: number;
  convenience: number;
}

/** 목적지 (지오코딩 결과) */
export interface Destination {
  name: string;
  address: string;
  lat: number;
  lng: number;
}

/** 한 행정동의 통근 계산 결과 */
export interface CommuteResult {
  /** 총 통근시간(분). 도달 불가면 null */
  totalMin: number | null;
  /** 집에서 이용하게 되는 역 */
  viaStation: string | null;
  /** 집 → 그 역 도보(분) */
  walkMin: number;
  /** 환승 횟수 */
  transfers: number;
  /** 경로에 추정 구간이 포함되었는지 (UI에 "추정" 표기) */
  hasEstimatedLeg: boolean;
  /**
   * 이 동이 실제로 이용한 그래프 노드. 경로를 되짚는 출발점이다.
   * 427개 동의 경로를 미리 만들지 않고, 사용자가 선택한 동만 이 값으로 복원한다.
   */
  viaNodeId: number;
}

/** 통근 경로의 한 구간 */
export type RouteLeg =
  | {
      kind: "walk";
      minutes: number;
      to: string;
      /**
       * 도보 구간의 양 끝 좌표 (지도에 선으로 그릴 때 사용).
       *
       * 실제 보행로가 아니라 **직선**이다 — 통근 계산 자체가 도보를
       * 직선거리 × WALK_DETOUR_FACTOR 로 잡으므로, 직선으로 긋는 게 우리가
       * 계산한 것과 정확히 일치한다. 도로를 따라가는 선을 그리면 소요시간
       * 숫자보다 그림이 더 정밀해 보이는 역전이 생긴다.
       *
       * 집 쪽 좌표(동 대표점)는 buildRoute 가 모르므로 호출부가 채운다.
       * 그래서 optional 이다.
       */
      path?: Array<[lng: number, lat: number]>;
    }
  /** 최초 승차 대기 — 이걸 빼면 구간 합이 총 통근시간과 안 맞아 보인다 */
  | { kind: "wait"; minutes: number; at: string }
  | {
      kind: "ride";
      minutes: number;
      line: string;
      stops: number;
      from: string;
      to: string;
      /** 역 좌표 순서 (지도에 선으로 그릴 때 사용) */
      path: Array<[lng: number, lat: number]>;
    }
  | { kind: "transfer"; minutes: number; at: string; fromLine: string; toLine: string };
