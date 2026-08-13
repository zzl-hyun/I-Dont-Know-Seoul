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
  /** 통근·인구 계산 폴백용 대표점 — 반드시 폴리곤 내부 */
  lng: number;
  lat: number;
  /**
   * 지도 마커(등급 아이콘) 전용 좌표 — 동별 최대 인구 100m 셀의 중심.
   * `lng`/`lat`(mapshaper `-points inner` 대표점)는 산·녹지가 넓은 동에서
   * 사람이 안 사는 곳에 찍히는 경우가 있어(예: 용인 동천동, 서초 양재2동)
   * 지도 표시만 이 필드로 분리했다. 없으면(이론상 발생하지 않지만 방어적으로)
   * 지도가 `lng`/`lat`로 폴백한다.
   */
  markerLng?: number;
  markerLat?: number;
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

/**
 * 정적 버스망. 원천의 긴 필드명을 4개짜리 튜플로 접어 KV 번들 크기를 줄인다.
 * 노선의 정류장 배열은 운행 방향 순서이며 같은 노선에서도 역방향 이동은 허용하지 않는다.
 */
export interface BusNetwork {
  version: string | number;
  generatedAt: string;
  defaultHeadwayMin: number;
  sources: Record<string, unknown>;
  /** [정류장명, 위도, 경도] — 배열 인덱스가 정류장 id다. */
  stops: Array<[name: string, lat: number, lng: number]>;
  /** [노선명, 평일 배차간격, 정류장 id 순서, 누적 운행거리(m)] */
  routes: Array<[
    name: string,
    headwayMin: number,
    stopIds: number[],
    cumulativeMeters: number[],
  ]>;
}

/**
 * 100m 거주인구 지점들을 좌표 없이 같은 접근 선택지 묶음으로 압축한 프로필.
 *
 * option = [역 id, 실제 접근시간, 역 선택용 비용, 0=도보/1=버스, busRef?]
 * busRef = [버스 노선 id, 승차 순번, 하차 순번, 승차 정류장까지 도보시간]
 * profile = [동별 정규화 가중치, option 목록]
 */
export type ResidentialBusReference = [
  routeId: number,
  boardOrder: number,
  alightOrder: number,
  walkToBoardMin: number,
];

export type ResidentialStationAccess = [
  stationId: number,
  realMinutes: number,
  selectionCost: number,
  mode: 0 | 1,
  busRef?: ResidentialBusReference,
];

export type ResidentialProfileV4 = [
  weight: number,
  accesses: ResidentialStationAccess[],
];

/** 배포 전 정확도 비교와 구 데이터 호환에만 쓰는 과거 좌표 포함 형식. */
export type LegacyResidentialProfile = [
  weight: number,
  lng: number,
  lat: number,
  accesses: ResidentialStationAccess[],
];

export type ResidentialProfile = ResidentialProfileV4 | LegacyResidentialProfile;

export interface ResidentialAccess {
  version: string;
  /** 공개 산출물에서 분리되어도 유지되는 필수 출처표시. */
  source?: string;
  /** 인덱스 기반 busRef를 만들 때 사용한 정확한 버스망 버전. */
  busVersion?: string | number;
  generatedAt: string;
  resolutionM: number;
  percentile: number;
  /** 원 인구수 대신 동마다 합을 같게 만든 정규화 가중치 눈금. */
  weightScale?: number;
  /** 원 100m 셀을 그대로 노출하지 않기 위한 동별 대표 프로필 상한. */
  maxProfilesPerDong?: number;
  byDong: Record<string, ResidentialProfile[]>;
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
  /**
   * measured = 공공데이터 실측값, estimated = 거리 기반 추정값.
   *
   * **현재 파이프라인은 `estimated` 만 만듭니다** — `2-subway.mjs` 에 실측
   * 소요시간을 붙이는 경로가 아직 없습니다. `measured` 는 나중에 역간 실측
   * 데이터를 넣을 자리로 남겨둔 것이고, 지금 이 값으로 분기하는 코드를 쓰면
   * 항상 한쪽만 타므로 테스트에서 안 걸립니다.
   */
  source: "measured" | "estimated";
}

/** 동별 평판 점수 (전부 대상 547개 동 내 백분위, 0~100) */
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
  /**
   * 주택유형 조합(7) × 환산모드(2) 사전계산 — 사용자가 유형을 고르면 클라이언트
   * 재계산 없이 여기서 바로 조회한다(백분위는 파이프라인 값만 쓴다는 원칙 —
   * 클라이언트가 다시 계산하면 동점 처리가 미세하게 어긋난다). 파이프라인이
   * 아직 안 채웠으면(구버전 번들) undefined.
   */
  rentVariants?: RentVariants;
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

/** 주택유형 하나의 환산월세 중앙값·표본수 */
export interface RentTypeStat {
  medianMan: number | null;
  samples: number;
}

/**
 * 환산월세를 이루는 세 주택유형별 분해.
 *
 * `monthlyRentMan`은 이 셋을 합쳐 계산한 단일 중앙값이다(점수·등급은 이
 * 값만 쓰고, 유형을 나눠 다시 채점하지 않는다 — 등급 분포를 안 흔들기
 * 위해서). 3개 구 표본조사 결과 같은 소형(10~40/60㎡) 기준이어도 아파트가
 * 단독·다가구보다 1.4~2.0배 비쌌다(강남 75.5→135.8만원, 마포 68.7→137.1만원,
 * 노원 49.3→90.2만원). 동마다 주택유형 재고 비중이 달라 합산 중앙값만으로는
 * "이 동은 원룸이 비싼가 아파트가 비싼가"를 구분할 수 없어서, 상세 패널에
 * 근거로 함께 보여주려고 별도로 남긴다.
 */
export interface RentByType {
  /** 단독·다가구 (10~40㎡) */
  house: RentTypeStat;
  /** 오피스텔 (10~40㎡) */
  officetel: RentTypeStat;
  /** 소형아파트 (10~60㎡) */
  apartment: RentTypeStat;
}

export type RentHousingType = "house" | "officetel" | "apartment";

/**
 * 정렬된 조합 키. 예: "house", "house+officetel", "house+officetel+apartment".
 * 타입은 항상 이 순서로 정렬해서 합친다: house, officetel, apartment
 * (`scripts/lib/rent.mjs`의 `RENT_COMBOS`와 동일한 순서).
 */
export type RentComboKey = string;

export interface RentVariantStat {
  medianMan: number | null;
  samples: number;
  /**
   * 이 조합·모드 안에서 547개 동 기준 백분위(0~100). 월세가 낮을수록 높은
   * 점수(기존 monthlyRentMan의 dir=-1 관례와 동일). 값이 없으면(전 동
   * 표본 0 등) null.
   */
  pct: number | null;
}

/**
 * 주택유형 조합 7개(비어있지 않은 부분집합) × 환산모드 2개(converted=보증금
 * 환산 포함, raw=순수 월세)를 전부 담는다.
 *
 * `converted["house+officetel+apartment"]`가 기존 `monthlyRentMan`/
 * `rentSamples`와 같은 조합이다 — 사용자가 직접 주택유형을 골라 가격 축을
 * 다시 계산하는 UI는 이 데이터 계약을 그대로 소비하는 별도 작업이다(여기서는
 * 손대지 않는다).
 */
export interface RentVariants {
  converted: Record<RentComboKey, RentVariantStat>;
  raw: Record<RentComboKey, RentVariantStat>;
}

export interface DongRawMetrics {
  /** 환산월세 중앙값 (만원, 단독·다가구·오피스텔·소형아파트) */
  monthlyRentMan: number | null;
  /** 실거래 표본 수 */
  rentSamples: number;
  /** 주택유형별 분해 — monthlyRentMan 계산에는 안 쓰고 상세 패널 표시용 */
  rentByType: RentByType | null;
  /** CCTV 밀도 (대/km²) */
  cctvPerKm2: number | null;
  /** 일반·무도 유흥주점 밀도 (개/km²) */
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
  /** 100m 거주인구 분포에서 최근접 지하철역까지 도보시간의 중앙값(분) */
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
  /** 집 → 그 역 중 실제 걷는 시간. 버스 접근 상세가 없던 구버전 호환 필드다. */
  walkMin: number;
  /** 집 → 역 전체 접근시간(도보 또는 도보+대기+버스). */
  accessMin: number;
  /** 15분 초과 도보를 실제 같은 노선의 버스로 대체했는지. */
  accessMode: "walk" | "bus";
  /** 집→역 버스 경로를 거주 좌표 없이 같은 노선으로 복원하기 위한 정적 참조. */
  accessBusRef?: ResidentialBusReference;
  /** 구 좌표 포함 프로필 또는 동 대표점 방식에서만 있는 출발 표시 좌표. */
  origin?: { lat: number; lng: number };
  /** 거주인구 분포를 쓴 결과면 그 분위수(현재 0.5). */
  populationPercentile?: number;
  /** 환승 횟수 */
  transfers: number;
  /**
   * 경로에 추정 구간이 포함되었는지.
   *
   * **지금은 도달 가능한 모든 경로에서 항상 true 입니다** — 위 `Edge.source`
   * 설명대로 실측 엣지가 아직 없기 때문입니다. 그래서 상세 패널은 경로별
   * "추정" 배지 대신 "역간 소요시간은 실측이 아니라 거리와 노선 특성으로
   * 계산한 값" 이라는 **일괄 문구**를 씁니다(`DongDetail.tsx`). 실측 엣지가
   * 생기면 그때 이 값으로 경로별 표기를 나누면 됩니다.
   */
  hasEstimatedLeg: boolean;
  /**
   * 이 동이 실제로 이용한 그래프 노드. 경로를 되짚는 출발점이다.
   * 547개 동의 경로를 미리 만들지 않고, 사용자가 선택한 동만 이 값으로 복원한다.
   */
  viaNodeId: number;
}

/** 통근 경로의 한 구간 */
export type RouteLeg =
  | {
      kind: "walk";
      minutes: number;
      to: string;
      toType?: "station" | "busStop" | "destination";
      /**
       * 도보 구간의 양 끝 좌표 (지도에 선으로 그릴 때 사용).
       *
       * 실제 보행로가 아니라 **직선**이다 — 통근 계산 자체가 도보를
       * 직선거리 × WALK_DETOUR_FACTOR 로 잡으므로, 직선으로 긋는 게 우리가
       * 계산한 것과 정확히 일치한다. 도로를 따라가는 선을 그리면 소요시간
       * 숫자보다 그림이 더 정밀해 보이는 역전이 생긴다.
       *
       * 현재 거주 프로필은 좌표를 공개하지 않아 첫 집 쪽 도보선에는 이 값이 없다.
       * 구 좌표 포함 번들이나 동 대표점 방식에서는 호출부가 채울 수 있어 optional 이다.
       */
      path?: Array<[lng: number, lat: number]>;
    }
  /** 최초 승차 대기 — 이걸 빼면 구간 합이 총 통근시간과 안 맞아 보인다 */
  | {
      kind: "wait";
      minutes: number;
      at: string;
      vehicle?: "subway" | "bus";
      routeName?: string;
    }
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
  | {
      kind: "bus";
      minutes: number;
      routeName: string;
      stops: number;
      from: string;
      to: string;
      path: Array<[lng: number, lat: number]>;
    }
  | { kind: "transfer"; minutes: number; at: string; fromLine: string; toLine: string };
