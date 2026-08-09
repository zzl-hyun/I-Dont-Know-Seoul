import type {
  AxisName,
  AxisWeight,
  CommuteResult,
  DongMeta,
  DongScore,
  Grade,
  MetricKey,
  RouteLeg,
  Weights,
} from "../types";
import { GRADE_COLOR, GRADE_LABEL } from "../lib/constants";
import {
  explainAxis,
  explainComposite,
  pctPhrase,
  summarize,
  type MetricDistribution,
  type MetricExplanation,
} from "../lib/explain";

export interface ExplainContext {
  pctKeys: MetricKey[];
  axisWeights: Record<AxisName, AxisWeight[]>;
  dists: Map<MetricKey, MetricDistribution>;
  weights: Weights;
  cuts: { best: number; normal: number };
}

interface Props {
  dong: DongMeta;
  score: DongScore;
  grade: Grade;
  rank: number;
  total: number;
  commute: CommuteResult | undefined;
  route: RouteLeg[];
  ctx: ExplainContext;
}

const AXES: Array<{ key: AxisName; label: string }> = [
  { key: "safety", label: "치안" },
  { key: "price", label: "가격" },
  { key: "convenience", label: "생활편의" },
];

/**
 * 동 상세 패널.
 *
 * 등급만 보여주면 특정 동네를 근거 없이 낙인찍는 셈이 되고, 원시 수치만
 * 나열하면 그게 많은지 적은지 알 수 없다. 그래서
 * `원지표 → 서울 내 백분위 → 축 점수 → 가중합 → 등급컷` 사슬을 전부 드러내되,
 * 계산 과정은 접어두어 기본 화면은 읽기 편하게 유지한다.
 */
export default function DongDetail({
  dong,
  score,
  grade,
  rank,
  total,
  commute,
  route,
  ctx,
}: Props) {
  const summary = summarize(score, ctx.pctKeys, grade, ctx.weights, ctx.axisWeights);
  const composite = explainComposite(score, ctx.weights, grade, rank, total, ctx.cuts);
  const topPct = Math.max(1, Math.round((rank / total) * 100));

  return (
    <div className="section detail">
      <div className="detail-head">
        <h2>{dong.name}</h2>
        <span className="badge">
          <i className={`grade-dot ${grade}`} />
          {GRADE_LABEL[grade]}
        </span>
      </div>
      <p className="rank-line">
        서울 {total}개 동 중 <b>{rank}위</b> · 상위 {topPct}%
      </p>

      <p className="summary">{summary}</p>

      {commute?.totalMin != null ? (
        <div className="route">
          <div className="route-total">
            <b>{Math.round(commute.totalMin)}분</b>
            <span>
              {commute.transfers > 0 ? `환승 ${commute.transfers}회` : "환승 없음"}
            </span>
          </div>
          <ol className="route-legs">
            {/* 0분짜리 구간(목적지가 역 바로 앞)은 줄만 차지하므로 뺀다 */}
            {route
              .filter((leg) => Math.round(leg.minutes) > 0)
              .map((leg, i) => (
                <li key={i} className={`leg leg-${leg.kind}`}>
                  <span className="leg-time">{Math.round(leg.minutes)}분</span>
                  <span className="leg-text">{legText(leg)}</span>
                </li>
              ))}
          </ol>
          <p className="metric-note">
            지하철 기준 추정치입니다. 역간 소요시간은 실측이 아니라 거리와 노선
            특성으로 계산한 값입니다.
          </p>
        </div>
      ) : (
        <div className="route">
          <div className="route-total">
            <b style={{ fontSize: 14, color: "var(--text-dim)" }}>통근 시간 밖</b>
          </div>
        </div>
      )}

      {AXES.map(({ key, label }) => {
        const ax = explainAxis(key, score, ctx.pctKeys, ctx.axisWeights[key] ?? [], ctx.dists);
        return (
          <div className="metric" key={key}>
            <div className="metric-head">
              <span>{label}</span>
              <b style={{ color: barColor(ax.score) }}>{Math.round(ax.score)}</b>
            </div>
            <div className="bar">
              <div style={{ width: `${ax.score}%`, background: barColor(ax.score) }} />
            </div>

            {ax.metrics.length === 0 ? (
              <div className="metric-note">수집된 데이터가 없어 전 동 50점으로 둡니다.</div>
            ) : (
              <details className="why">
                <summary>계산 과정</summary>
                {ax.metrics.map((m) => (
                  <MetricRow key={m.key} m={m} single={ax.singleMetric} />
                ))}
                {!ax.singleMetric && (
                  <div className="formula">
                    {label} {ax.score.toFixed(1)} ={" "}
                    {ax.metrics
                      .map((m) => `${(m.pct ?? 50).toFixed(0)}×${m.weight.toFixed(2)}`)
                      .join(" + ")}
                  </div>
                )}
              </details>
            )}
          </div>
        );
      })}

      <div className="composite">
        <div className="metric-head">
          <span>종합</span>
          <b>{composite.total.toFixed(1)}</b>
        </div>
        <details className="why">
          <summary>계산 과정</summary>
          <div className="formula">
            {composite.total.toFixed(1)} ={" "}
            {composite.terms
              .map((t) => `${t.score.toFixed(0)}×${t.weight.toFixed(2)}`)
              .join(" + ")}
          </div>
          <div className="contrib">
            {composite.terms.map((t) => (
              <div key={t.axis} className="contrib-row">
                <span>{t.label}</span>
                <div className="contrib-bar">
                  <div
                    style={{
                      width: `${(t.contribution / Math.max(composite.total, 1)) * 100}%`,
                    }}
                  />
                </div>
                <span className="contrib-val">+{t.contribution.toFixed(1)}</span>
              </div>
            ))}
          </div>
          <div className="cutline">
            등급 컷 — {composite.bestCut.toFixed(1)}점 이상 Best ·{" "}
            {composite.normalCut.toFixed(1)}점 이상 Normal
          </div>
        </details>
      </div>

      {score.dataQuality === "low" && (
        <p className="metric-note warn">
          이 동은 원룸 실거래 표본이 부족해 월세를 <b>자치구 중앙값</b>으로 대체했습니다.
        </p>
      )}
    </div>
  );
}

/* ---------------- 지표 한 줄 ---------------- */

function MetricRow({ m, single }: { m: MetricExplanation; single: boolean }) {
  const tiedPct = Math.round(m.tiedShare * 100);
  return (
    <div className="metric-row">
      <div className="metric-row-head">
        <span>{m.label}</span>
        <b>{m.value}</b>
      </div>
      <div className="metric-row-note">
        서울 중앙값 {m.median}
        {/*
          백분위 수치를 함께 보여준다. 지표가 하나뿐인 축은 이 값이 곧 축 점수라,
          숫자가 없으면 "치안 78" 이 어디서 왔는지 연결이 끊긴다.
        */}
        {m.pct != null && (
          <>
            {" · "}이 동은 {pctPhrase(m.pct)} <b>({m.pct.toFixed(0)}점)</b>
          </>
        )}
        {!single && <> · 가중치 {m.weight.toFixed(2)}</>}
      </div>
      {/*
        동점이 많으면 백분위가 뭉친다. 유흥업소가 0개인데 100점이 아닌 이유가
        바로 이것이고, 이 줄이 없으면 계산이 틀린 것처럼 보인다.
      */}
      {tiedPct >= 10 && m.rawValue != null && (
        <div className="metric-row-note tied">
          같은 값({m.value})인 동이 서울의 {tiedPct}% — 동점이라 순위를 나눠 갖습니다
        </div>
      )}
    </div>
  );
}

/* ---------------- 헬퍼 ---------------- */

function legText(leg: RouteLeg): string {
  switch (leg.kind) {
    case "walk":
      return leg.to === "목적지" ? "목적지까지 도보" : `${leg.to}역까지 도보`;
    case "wait":
      return "승차 대기";
    case "ride":
      return `${lineName(leg.line)} ${leg.stops}정거장 · ${leg.from} → ${leg.to}`;
    case "transfer":
      return `${leg.at}역 환승 · ${lineName(leg.fromLine)} → ${lineName(leg.toLine)}`;
  }
}

/** 그래프의 노선 식별자를 사람이 읽는 이름으로 */
export function lineName(line: string): string {
  if (/^\d+$/.test(line)) return `${line}호선`;
  const alias: Record<string, string> = {
    W: "우이신설선",
    Silim: "신림선",
    AREX: "공항철도",
    인천1: "인천 1호선",
    I2: "인천 2호선",
  };
  return alias[line] ?? `${line}선`.replace(/선선$/, "선");
}

/** 점수대별 색 — 등급 색과 같은 팔레트를 써서 지도와 시각적으로 이어준다. */
function barColor(v: number): string {
  if (v >= 70) return GRADE_COLOR.best;
  if (v >= 40) return GRADE_COLOR.normal;
  return GRADE_COLOR.bad;
}
