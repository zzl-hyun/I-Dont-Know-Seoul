import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import type { DongMeta } from "../types";
import type { AxisName, AxisWeight, DongScore, MetricKey } from "../types";

/**
 * 빌드 타임(Node)에서 `data/dist/*.json` 을 읽는다.
 *
 * `scripts/*.mjs` 파이프라인과 같은 산출물을 그대로 쓴다 — 여기서 재계산하지
 * 않는다. "백분위는 파이프라인 값만 쓴다"는 이 저장소의 원칙(`CLAUDE.md`)이
 * 빌드 타임 생성기에도 그대로 적용된다.
 */

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const DATA_DIR = join(ROOT, "data/dist");

function readJson<T>(name: string): T {
  const path = join(DATA_DIR, name);
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

export interface DongMetaFile {
  version: string;
  source: string;
  generatedAt: string;
  count: number;
  dongs: DongMeta[];
}

export interface ScoresFile {
  version: string;
  generatedAt: string;
  rentPeriod: unknown;
  pctKeys: MetricKey[];
  axisWeights: Record<AxisName, AxisWeight[]>;
  axes: Record<AxisName, string[]>;
  unavailableAxes: AxisName[];
  scores: Record<string, DongScore>;
}

export interface SeoData {
  dongMeta: DongMetaFile;
  scoresFile: ScoresFile;
  /** code → DongMeta, 조회 편의용 */
  metaByCode: Map<string, DongMeta>;
  /** code → DongScore */
  scoreByCode: Map<string, DongScore>;
}

let cached: SeoData | null = null;

export function loadSeoData(): SeoData {
  if (cached) return cached;

  const dongMeta = readJson<DongMetaFile>("dong-meta.json");
  const scoresFile = readJson<ScoresFile>("scores.json");

  const metaByCode = new Map(dongMeta.dongs.map((d) => [d.code, d]));
  const scoreByCode = new Map(Object.entries(scoresFile.scores));

  cached = { dongMeta, scoresFile, metaByCode, scoreByCode };
  return cached;
}
