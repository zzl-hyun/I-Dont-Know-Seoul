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
  return {
    dongs: raw.dongs,
    graph: raw.graph,
    scores: new Map(Object.entries(raw.scores)),
    pctKeys: raw.pctKeys ?? [],
    axisWeights: raw.axisWeights ?? { safety: [], price: [], convenience: [] },
    meta: raw.meta,
  };
}
