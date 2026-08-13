import type {
  AxisName,
  AxisWeight,
  BusNetwork,
  DongMeta,
  DongScore,
  MetricKey,
  ResidentialAccess,
  RentHousingType,
  SubwayGraph,
} from "../types";
// 이 모듈은 Node API를 import하지 않는 순수 ESM이며 데이터 생성기·시드도 함께 쓴다.
// @ts-expect-error 파이프라인용 .mjs의 별도 타입 선언을 브라우저 소스에 중복하지 않는다.
import { assertValidCommuteBundle } from "../../scripts/lib/bundle-validation.mjs";
import { RENT_COMBO_KEYS, SCORE_BASE_RENT_SELECTION } from "./rent-selection";

export interface AppData {
  dongs: DongMeta[];
  graph: SubwayGraph;
  /** 새 번들이 제공할 때만 활성화한다. 구 KV·브라우저 캐시는 도보 모델로 폴백한다. */
  bus?: BusNetwork;
  /** 100m 거주인구 분포 기반 집→역 접근 프로필. */
  residential?: ResidentialAccess;
  scores: Map<string, DongScore>;
  /** `DongScore.pct` 배열의 순서를 정하는 지표 키 목록 */
  pctKeys: MetricKey[];
  /** 축을 구성하는 하위 지표와 가중치 — 계산 과정을 화면에 보여주는 데 쓴다 */
  axisWeights: Record<AxisName, AxisWeight[]>;
  meta: {
    boundaryVersion: string;
    graphVersion: string;
    busVersion?: string | number;
    residentialVersion?: string;
    scoreVersion: string;
    rentPeriod?: {
      startDate: string;
      endDate: string;
      contractType: "신규";
      defaultTypes: RentHousingType[];
      seoul: {
        source: string;
        archives: string[];
        records: number;
        duplicatesRemoved: number;
        invalidLocation: number;
      };
      gyeonggi: { source: string; records: number; calls: number };
    };
    /** 실제로 수집된 지표 (키가 없어 빠진 지표를 UI에 알리기 위함) */
    availableMetrics: string[];
    missingMetrics: string[];
  };
}

interface RawBundle {
  meta: AppData["meta"];
  pctKeys: MetricKey[];
  axisWeights: Record<AxisName, AxisWeight[]>;
  dongs: DongMeta[];
  graph: SubwayGraph;
  bus?: BusNetwork;
  residential?: ResidentialAccess;
  scores: Record<string, DongScore>;
}

/**
 * 앱 데이터를 한 번에 받는다.
 *
 * Worker의 /api/data 는 KV에 스냅샷이 있으면 그걸, 없으면 정적 자산을 준다.
 * 덕분에 데이터만 갱신할 때는 재배포 없이 KV만 갈아끼우면 된다.
 */
export async function loadAppData(signal?: AbortSignal): Promise<AppData> {
  const res = await fetch("/api/data", { signal });
  if (!res.ok) {
    throw new Error(`데이터를 불러오지 못했습니다 (HTTP ${res.status})`);
  }
  const raw: RawBundle = await res.json();
  assertValidBundle(raw);
  return {
    dongs: raw.dongs,
    graph: raw.graph,
    bus: raw.bus,
    residential: raw.residential,
    scores: new Map(Object.entries(raw.scores)),
    pctKeys: raw.pctKeys ?? [],
    axisWeights: raw.axisWeights ?? { safety: [], price: [], convenience: [] },
    meta: raw.meta,
  };
}

/**
 * `/api/data` 응답은 네트워크를 거쳐 온 값이라 타입 캐스팅만으로는 실제
 * 형태를 보장하지 못한다 — 이 자리가 클라이언트가 데이터를 신뢰하기
 * 직전의 마지막 경계다. scripts/5-seed-kv.mjs 도 KV에 올리기 전에
 * 비슷한 검사를 하지만(행정동 수·역 존재·점수 개수), 그건 "업로드 시점"
 * 검사라 이후 KV가 손상되거나 수동으로 잘못 갈아끼워지는 경우까지는
 * 못 잡는다. 여기서 걸러야 하위 컴포넌트들이 `undefined.map()` 같은
 * 알아보기 힘든 에러 대신 원인이 분명한 메시지로 죽는다.
 *
 * 점수·그래프의 기본 구조뿐 아니라 브라우저 계산이 인덱스로 직접 참조하는
 * 버스 노선·거주 접근 튜플도 생성기·시드와 같은 공용 검증기로 깊게 확인한다.
 */
export function assertValidBundle(raw: RawBundle): void {
  if (!Array.isArray(raw?.dongs) || raw.dongs.length < 400) {
    throw new Error(`데이터가 손상되었습니다 — 행정동 수 이상 (${raw?.dongs?.length ?? "없음"})`);
  }
  if (!Array.isArray(raw.graph?.stations) || raw.graph.stations.length === 0) {
    throw new Error("데이터가 손상되었습니다 — 지하철 그래프가 비어 있습니다");
  }
  if (!raw.scores || typeof raw.scores !== "object") {
    throw new Error("데이터가 손상되었습니다 — 점수 데이터가 없습니다");
  }
  const scoreCount = Object.keys(raw.scores).length;
  if (scoreCount !== raw.dongs.length) {
    throw new Error(
      `데이터가 손상되었습니다 — 점수 개수 불일치 (동 ${raw.dongs.length}개, 점수 ${scoreCount}개)`
    );
  }
  if (!raw.meta?.scoreVersion) {
    throw new Error("데이터가 손상되었습니다 — 버전 정보가 없습니다");
  }
  const rentPeriod = raw.meta.rentPeriod;
  if (
    !rentPeriod ||
    !/^\d{8}$/.test(rentPeriod.startDate) ||
    !/^\d{8}$/.test(rentPeriod.endDate) ||
    rentPeriod.startDate > rentPeriod.endDate ||
    rentPeriod.contractType !== "신규" ||
    !Array.isArray(rentPeriod.defaultTypes) ||
    rentPeriod.defaultTypes.join("+") !== SCORE_BASE_RENT_SELECTION.types.join("+") ||
    !Number.isFinite(rentPeriod.seoul?.records) ||
    rentPeriod.seoul.records < 0 ||
    !Number.isFinite(rentPeriod.gyeonggi?.records) ||
    rentPeriod.gyeonggi.records < 0
  ) {
    throw new Error("데이터가 손상되었습니다 — 월세 집계기간 정보가 올바르지 않습니다");
  }
  const expectedRentKeys = [...RENT_COMBO_KEYS].sort();
  for (const dong of raw.dongs) {
    const score = raw.scores[dong.code];
    for (const mode of ["converted", "raw"] as const) {
      const actualKeys = Object.keys(score?.rentVariants?.[mode] ?? {}).sort();
      if (
        actualKeys.length !== expectedRentKeys.length ||
        actualKeys.some((key, index) => key !== expectedRentKeys[index])
      ) {
        throw new Error(
          `데이터가 손상되었습니다 — 월세 선택값 누락 (${dong.code} ${mode} ${actualKeys.length}/15)`
        );
      }
    }
    const defaultVariant =
      score.rentVariants?.converted[SCORE_BASE_RENT_SELECTION.types.join("+")];
    if (
      defaultVariant?.medianMan !== score.raw?.monthlyRentMan ||
      defaultVariant?.pct !== score.price
    ) {
      throw new Error(`데이터가 손상되었습니다 — 기본 월세 점수 불일치 (${dong.code})`);
    }
  }
  assertValidCommuteBundle(raw);
}
