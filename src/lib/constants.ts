/**
 * 통근시간 모델의 상수들.
 *
 * 이 값들이 통근시간 추정의 정확도를 좌우한다. 실제 경로와 대조하는
 * 스팟체크 테스트(src/lib/commute.test.ts)가 이 값들을 검증한다.
 * 값을 바꾸면 반드시 테스트를 다시 돌릴 것.
 */

/** 도보 속도 (m/분). 4 km/h — 국내 길찾기 서비스들이 쓰는 표준값. */
export const WALK_SPEED_M_PER_MIN = 67;

/**
 * 직선거리 → 실제 보행거리 보정 계수.
 * 도로는 직선이 아니므로 haversine 거리를 그대로 쓰면 과소추정된다.
 *
 * **서울 보행 도로망 실측값이다.** `scripts/calibrate-walk.mjs` 가 OSM 보행
 * 도로망(노드 89.7만·링크 100.8만) 위에서 모델이 실제로 평가하는 쌍
 * (동 대표점 → 반경 1.5km 내 후보역) 1,686개의 최단 보행거리를 재서 뽑았다.
 *
 * 1.4 를 고른 근거 — 후보 전체의 중앙값은 1.338 이지만:
 *   - 총거리 기준(Σ보행÷Σ직선) 1.397 로, 이 값에서 편향이 0 이 된다.
 *     1.3 에서는 도보의 58%를 과소추정했다(평균 -1.37분).
 *   - 화면에 실제로 나오는 건 대부분 **최근접역**까지의 도보인데, 그 부분집합의
 *     중앙값은 1.403 이다. 가까울수록 우회 비율이 높기 때문이다
 *     (0~300m 1.597 → 1200~1500m 1.294).
 *   - 분 단위 평균절대오차는 1.30~1.40 구간에서 2.60~2.80분으로 거의 평평하다.
 *     정확도를 거의 잃지 않고 편향만 없앨 수 있다는 뜻이다.
 *
 * **서울시 공식 보행 네트워크(TbTraficWlkNet, 횡단보도·육교·지하철통로 포함)로
 * 교차검증했다** (`npm run data:calibrate-walk -- --source=seoul`). 같은
 * 1,659쌍을 공식망에서 다시 재니 총거리 기준 1.418 — OSM 기준 1.397 대비
 * +1.5%p 뿐이었다. "OSM은 횡단보도 우회가 빠져 하한일 것"이라는 가설은
 * 방향은 맞았지만 크기가 무시할 만큼 작았다. 1.4를 유지한다 — 이 차이는
 * 동 대표점이 실제 위치와 최대 500m(≈7분) 어긋나는 오차에 비하면 의미가 없다.
 *
 * 주의: `scripts/lib/geo.mjs` 에 같은 값이 있다. 파이프라인의 최근접역 도보시간
 * 지표가 그걸 쓰므로 **양쪽을 같이 바꿔야** 지표와 모델이 어긋나지 않는다.
 */
export const WALK_DETOUR_FACTOR = 1.4;

/** 첫 승차 대기 (분). 배차간격의 절반 정도. */
export const FIRST_WAIT_MIN = 3;

/**
 * 환승 시 열차 대기 (분). 환승 통로 도보시간은 별도로 엣지에 들어있고,
 * 여기에 더해지는 순수 대기시간이다. 이걸 빼면 통근시간이 체계적으로
 * 과소추정된다.
 */
export const TRANSFER_WAIT_MIN = 3;

/** 목적지에서 이 거리(m) 안의 역만 출발 후보로 삼는다. */
export const DEST_STATION_RADIUS_M = 1500;

/** 동 대표점에서 이 거리(m) 안의 역만 이용 후보로 삼는다. */
export const DONG_STATION_RADIUS_M = 1500;

/** 목적지/동 하나당 고려할 최대 역 개수. 성능과 정확도의 타협점. */
export const MAX_NEARBY_STATIONS = 6;

/**
 * 역 선택 비교에서만 쓰는 도보 가중치. 후보 역들을 비교할 때 도보 1분을
 * 이 배수만큼 쳐서 계산한다 — 화면에 표시되는 총 소요시간에는 적용하지
 * 않는다(그건 항상 실측 그대로). 도보를 더 꺼리는 체감을 반영하되
 * "표시된 시간이 진짜 소요시간"이라는 원칙은 지키기 위한 분리.
 * 값을 바꾸면 npm test 필수.
 */
export const WALK_SELECTION_WEIGHT = 1.4;

/**
 * 실측 소요시간이 없는 노선(9호선·신분당선·경의중앙선 등)의 역간 시간을
 * 거리로 추정할 때 쓰는 표정속도 (km/h). 정차시간 포함.
 * 서울 지하철 표정속도는 대체로 30~35 km/h.
 */
export const ESTIMATED_SPEED_KMH = 32;

/** 통근시간 슬라이더 기본값(분) */
export const DEFAULT_MAX_COMMUTE_MIN = 40;

/**
 * 목적지 상한. UI(App.tsx)의 추가 버튼뿐 아니라 shareUrl.ts의 URL 디코더도
 * 이 값으로 잘라야 한다 — 안 그러면 "to" 파라미터를 4개 이상 넣은 링크로
 * UI가 강제하는 상한을 그냥 우회할 수 있다.
 */
export const MAX_DESTINATIONS = 3;

/** 가중치 기본값. 합이 1이어야 한다. */
export const DEFAULT_WEIGHTS = {
  safety: 0.4,
  price: 0.35,
  convenience: 0.25,
} as const;

/**
 * 등급 구간 — 서울 전체 분포 기준 상대 컷.
 * 절대 컷(예: 70점 이상 Best)을 쓰면 "서울 전체가 Bad" 같은 무의미한
 * 화면이 나올 수 있다. 상대 컷은 항상 의미 있는 대비를 만든다.
 */
export const GRADE_CUT = {
  /** 상위 30% → Best */
  best: 0.3,
  /** 다음 40% → Normal, 나머지 하위 30% → Bad */
  normal: 0.7,
} as const;

export const GRADE_COLOR = {
  best: "#2e9e5b",
  normal: "#e0a52b",
  bad: "#c2504a",
} as const;

export const GRADE_LABEL = {
  best: "Best",
  normal: "Normal",
  bad: "Bad",
} as const;

/** 통근 불가 지역 색 (저채도 회색 — 숨기지 않고 "못 간다"는 정보를 남긴다) */
export const OUT_OF_RANGE_COLOR = "#c9ccd1";

/**
 * 통근시간 밴드.
 *
 * 등급 색(초록–노랑–빨강)과 겹치지 않게 **파랑 단색 농담**을 쓴다. 같은 계열을
 * 쓰면 "빨간 동네가 나쁜 건지 먼 건지"를 구분할 수 없다.
 * 어두운 배경이라 밝을수록 눈에 띄므로, 가까울수록 밝게 둔다.
 */
export const COMMUTE_BANDS = [
  { maxMin: 20, color: "#a8d5ff", label: "20분 이내" },
  { maxMin: 30, color: "#74b3f5", label: "30분" },
  { maxMin: 40, color: "#4a8ad4", label: "40분" },
  { maxMin: 60, color: "#2f5f9e", label: "60분" },
  { maxMin: Infinity, color: "#22406b", label: "60분 초과" },
] as const;

/** 통근시간(분) → 밴드 인덱스 */
export function commuteBand(min: number): number {
  return COMMUTE_BANDS.findIndex((b) => min <= b.maxMin);
}

/**
 * 월세 상한 슬라이더 범위 (만원). 소형아파트 포함 후 실측 44~325 — 상한
 * 근처 100~125 구간이 실사용 범위이고, 최댓값(325, 한남동 등 초고가 소형
 * 아파트)까지는 굳이 안 늘렸다. BUDGET_MAX가 곧 BUDGET_OFF(제한 없음)라
 * 그 이상 동도 필터에서 빠지지 않는다 — 슬라이더로 "200만원 이하"처럼
 * 중간값은 못 고르고 바로 무제한으로 건너뛴다는 뜻일 뿐, 데이터가
 * 잘리는 건 아니다.
 */
export const BUDGET_MIN = 40;
export const BUDGET_MAX = 125;
/** 이 값이면 "제한 없음" 으로 취급한다 */
export const BUDGET_OFF = BUDGET_MAX;
