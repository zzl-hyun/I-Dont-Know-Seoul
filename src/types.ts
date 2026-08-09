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
  /** UI에 "왜 이 등급인지" 근거로 보여줄 실제 수치 */
  raw: DongRawMetrics;
  /** 표본이 부족해 대체값을 쓴 경우 */
  dataQuality: "ok" | "low";
}

export interface DongRawMetrics {
  /** 원룸 환산월세 중앙값 (만원) */
  monthlyRentMan: number | null;
  /** 실거래 표본 수 */
  rentSamples: number;
  /** CCTV 밀도 (대/km²) */
  cctvPerKm2: number | null;
  /** 유흥·단란주점 밀도 (개/km²) */
  nightlifePerKm2: number | null;
  /** 자치구 5대범죄 발생 (건/천명) — 경찰서 단위라 구 해상도가 한계 */
  crimePer1k: number | null;
  /** 편의점·마트 밀도 (개/km²) */
  storePerKm2: number | null;
  /** 음식점 밀도 (개/km²) */
  foodPerKm2: number | null;
  /** 병원·약국 밀도 (개/km²) */
  medicalPerKm2: number | null;
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
}
