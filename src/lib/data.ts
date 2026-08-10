import type {
  AxisName,
  AxisWeight,
  DongMeta,
  DongScore,
  MetricKey,
  SubwayGraph,
} from "../types";

export interface AppData {
  dongs: DongMeta[];
  graph: SubwayGraph;
  scores: Map<string, DongScore>;
  /** `DongScore.pct` 배열의 순서를 정하는 지표 키 목록 */
  pctKeys: MetricKey[];
  /** 축을 구성하는 하위 지표와 가중치 — 계산 과정을 화면에 보여주는 데 쓴다 */
  axisWeights: Record<AxisName, AxisWeight[]>;
  meta: {
    boundaryVersion: string;
    graphVersion: string;
    scoreVersion: string;
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
 * 모든 필드를 깊게 검증하지는 않는다 — 파이프라인 자체 검증(verify())을
 * 신뢰하고, 여기서는 나머지 코드가 곧바로 의존하는 최상위 구조만 본다.
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
}
