import type { AxisName, DongMeta, DongScore, Grade, MetricKey } from "../types";
import { compositeScore, gradeAll } from "../lib/score";
import { DEFAULT_WEIGHTS } from "../lib/constants";
import type { SeoData } from "./data";
import type { ConditionPick } from "./areas";

/**
 * 권역 페이지가 다룰 동 목록을 고르고 순위를 매기는 순수 함수 모음.
 *
 * 여기서 하는 계산은 전부 기존 라이브러리(`src/lib/score.ts`)를 그대로
 * 재사용한다 — 등급·순위 계산 로직을 여기 또 만들면 화면 계산과 어긋날 수
 * 있다는 게 CLAUDE.md가 반복해서 경고하는 함정이다.
 *
 * 등급·순위는 항상 **대상 556개 동 전체**(`gradeAll`, 기본 가중치, 통근 제약
 * 없음) 기준이다. 목적지를 아직 고르지 않은 검색 유입 페이지이므로 앱의
 * 기본 화면과 같은 기준을 쓴다 — 페이지마다 다른 계산을 하면 "왜 이 페이지의
 * 등급이 지도랑 다르지"가 생긴다.
 */

export interface RankedDong {
  meta: DongMeta;
  score: DongScore;
  composite: number;
  grade: Grade;
  /** 대상 556개 동 전체 안에서의 순위 (1-based) */
  overallRank: number;
  overallTotal: number;
}

let gradeCache: ReturnType<typeof gradeAll> | null = null;

function grades(data: SeoData) {
  if (gradeCache) return gradeCache;
  gradeCache = gradeAll(data.scoreByCode, DEFAULT_WEIGHTS);
  return gradeCache;
}

function toRanked(data: SeoData, codes: string[]): RankedDong[] {
  const g = grades(data);
  const out: RankedDong[] = [];
  for (const code of codes) {
    const meta = data.metaByCode.get(code);
    const score = data.scoreByCode.get(code);
    const info = g.byDong.get(code);
    if (!meta || !score || !info) continue; // 매핑 오류를 조용히 건너뛰지 않기 위해 seo.test.ts가 코드 실재를 별도로 검증한다
    out.push({
      meta,
      score,
      composite: compositeScore(score, DEFAULT_WEIGHTS),
      grade: info.grade,
      overallRank: info.rank,
      overallTotal: info.total,
    });
  }
  return out;
}

/** `guNames` 에 속한 모든 동 코드를 반환한다 (구/시 단위 매칭). */
export function resolveByGuNames(data: SeoData, guNames: string[]): string[] {
  const set = new Set(guNames);
  return data.dongMeta.dongs.filter((d) => set.has(d.gu)).map((d) => d.code);
}

/** 코드를 그대로 쓰되, 실재하지 않는 코드는 제외한다(테스트가 이걸 별도로 잠근다). */
export function resolveByDongCodes(data: SeoData, codes: string[]): string[] {
  return codes.filter((c) => data.metaByCode.has(c));
}

/** 종합점수(기본 가중치) 내림차순. */
export function rankByComposite(data: SeoData, codes: string[]): RankedDong[] {
  return toRanked(data, codes).sort((a, b) => b.composite - a.composite);
}

/** 특정 축 점수(0~100, 이미 백분위) 내림차순. */
export function rankByAxis(data: SeoData, codes: string[], axis: AxisName): RankedDong[] {
  return toRanked(data, codes).sort((a, b) => b.score[axis] - a.score[axis]);
}

/**
 * 원지표 오름/내림차순. `requireOk` 를 켜면 표본 부족으로 자치구 대체값을 쓴
 * 동(`dataQuality: "low"`)을 뺀다 — "월세 싼 동네" 랭킹에 대체값이 섞이면
 * 실제로 싼 게 아니라 표본이 없어서 싸 보이는 동이 낄 수 있다.
 */
export function rankByRawMetric(
  data: SeoData,
  codes: string[],
  key: MetricKey,
  direction: "asc" | "desc",
  requireOk = false
): RankedDong[] {
  const ranked = toRanked(data, codes).filter((r) => {
    if (requireOk && r.score.dataQuality !== "ok") return false;
    const v = r.score.raw[key as keyof typeof r.score.raw];
    return typeof v === "number" && Number.isFinite(v);
  });
  ranked.sort((a, b) => {
    const av = a.score.raw[key as keyof typeof a.score.raw] as number;
    const bv = b.score.raw[key as keyof typeof b.score.raw] as number;
    return direction === "asc" ? av - bv : bv - av;
  });
  return ranked;
}

/**
 * "가성비" 랭킹 — 월세가 대상 지역 중앙값보다 싼 동들 중에서 종합점수가 높은
 * 순. 비싸면서 점수만 높은 동(예: 강남 한복판)을 가성비로 부르면 거짓말이라
 * 가격을 먼저 거른다.
 */
export function rankByValueForMoney(data: SeoData, codes: string[]): RankedDong[] {
  const ranked = toRanked(data, codes).filter(
    (r) => r.score.dataQuality === "ok" && typeof r.score.raw.monthlyRentMan === "number"
  );
  const rents = ranked
    .map((r) => r.score.raw.monthlyRentMan as number)
    .sort((a, b) => a - b);
  if (rents.length === 0) return [];
  const median = rents[Math.floor(rents.length / 2)];
  return ranked
    .filter((r) => (r.score.raw.monthlyRentMan as number) <= median)
    .sort((a, b) => b.composite - a.composite);
}

/** 코드 목록을 자치구(`gu`)별로 묶어 중앙값 지표를 낸다 — "구 비교" 표용. */
export interface GuSummary {
  gu: string;
  dongCount: number;
  medianRentMan: number | null;
  medianWalkMin: number | null;
  medianCrimePer1k: number | null;
}

export function summarizeByGu(data: SeoData, codes: string[]): GuSummary[] {
  const byGu = new Map<string, RankedDong[]>();
  for (const r of toRanked(data, codes)) {
    const list = byGu.get(r.meta.gu) ?? [];
    list.push(r);
    byGu.set(r.meta.gu, list);
  }
  const median = (vals: number[]) => {
    if (vals.length === 0) return null;
    const sorted = [...vals].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)];
  };
  return [...byGu.entries()]
    .map(([gu, rows]) => ({
      gu,
      dongCount: rows.length,
      medianRentMan: median(
        rows
          .map((r) => r.score.raw.monthlyRentMan)
          .filter((v): v is number => typeof v === "number")
      ),
      medianWalkMin: median(
        rows
          .map((r) => r.score.raw.walkToStationMin)
          .filter((v): v is number => typeof v === "number")
      ),
      medianCrimePer1k: median(
        rows.map((r) => r.score.raw.crimePer1k).filter((v): v is number => typeof v === "number")
      ),
    }))
    .sort((a, b) => a.gu.localeCompare(b.gu, "ko"));
}

/** 대상 556개 동 전체 코드. 조건형 그룹(특정 지역이 아니라 전체에서 고르는 페이지)이 쓴다. */
export function allDongCodes(data: SeoData): string[] {
  return [...data.scoreByCode.keys()];
}

/** `AreaDef.pick` 값을 실제 랭킹 함수로 매핑한다. */
export function rankByCondition(data: SeoData, by: ConditionPick): RankedDong[] {
  const codes = allDongCodes(data);
  switch (by) {
    case "cheapRent":
      return rankByRawMetric(data, codes, "monthlyRentMan", "asc", true);
    case "valueForMoney":
      return rankByValueForMoney(data, codes);
    case "convenience":
      return rankByAxis(data, codes, "convenience");
    case "safety":
      return rankByAxis(data, codes, "safety");
  }
}
