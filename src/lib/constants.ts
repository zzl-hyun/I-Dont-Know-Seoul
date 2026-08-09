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
 * 격자형 도로망에서 경험적으로 1.2~1.4 범위이며 1.3을 쓴다.
 */
export const WALK_DETOUR_FACTOR = 1.3;

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
 * 실측 소요시간이 없는 노선(9호선·신분당선·경의중앙선 등)의 역간 시간을
 * 거리로 추정할 때 쓰는 표정속도 (km/h). 정차시간 포함.
 * 서울 지하철 표정속도는 대체로 30~35 km/h.
 */
export const ESTIMATED_SPEED_KMH = 32;

/** 통근시간 슬라이더 기본값(분) */
export const DEFAULT_MAX_COMMUTE_MIN = 40;

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

/** 월세 상한 슬라이더 범위 (만원). 서울 원룸 환산월세 실측 41~120 을 감싼다. */
export const BUDGET_MIN = 40;
export const BUDGET_MAX = 125;
/** 이 값이면 "제한 없음" 으로 취급한다 */
export const BUDGET_OFF = BUDGET_MAX;
