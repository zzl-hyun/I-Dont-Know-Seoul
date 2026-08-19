import type {
  AxisName,
  AxisWeight,
  CommuteResult,
  DongMeta,
  DongScore,
  Grade,
  MetricKey,
  RentByType,
  RentVariantStat,
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
import {
  isScoreBaseRentSelection,
  rentSelectionLabel,
  selectedRentVariant,
  type RentSelection,
} from "../lib/rent-selection";
import { localizedDongName, localizedStationName } from "../lib/geographicNames";
import { useI18n } from "../lib/i18n";
import { lineName as subwayLineName } from "../lib/subwayLines";
import type { Locale } from "../lib/locale";

export interface ExplainContext {
  pctKeys: MetricKey[];
  axisWeights: Record<AxisName, AxisWeight[]>;
  dists: Map<MetricKey, MetricDistribution>;
  weights: Weights;
  cuts: { best: number; normal: number };
}

/** 목적지 하나에 대한 통근 결과 + 복원된 경로 */
export interface CommuteLeg {
  destName: string;
  result: CommuteResult;
  route: RouteLeg[];
}

interface Props {
  dong: DongMeta;
  score: DongScore;
  grade: Grade;
  rank: number;
  total: number;
  /**
   * 이 동의 worstMin. `undefined`=목적지 미선택(Φ 항 안 보여줌), `null`=목적지는
   * 있는데 도달 불가(Φ=0), 숫자=실제 통근시간. `explainComposite`로 그대로
   * 전달해 화면 수식이 `gradeAll`의 등급 계산과 어긋나지 않게 한다.
   */
  commuteMin?: number | null;
  /** 목적지별 통근. 목적지가 없으면 빈 배열 */
  commutes: CommuteLeg[];
  ctx: ExplainContext;
  /** 가격 축 계산에 쓰인 주택유형·환산모드 선택. 라벨·값 표시에만 쓴다(계산은 이미 score.price에 반영돼 있다). */
  rentSelection: RentSelection;
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
  commuteMin,
  commutes,
  ctx,
  rentSelection,
}: Props) {
  const { locale, tr, minutes, number, rank: formatRank } = useI18n();
  const isBaseRent = isScoreBaseRentSelection(rentSelection);
  const rentVariant = selectedRentVariant(score, rentSelection);
  const summary = summarize(
    score,
    ctx.pctKeys,
    grade,
    ctx.weights,
    ctx.axisWeights,
    rentVariant
      ? { monthlyRentMan: { pct: rentVariant.pct, value: rentVariant.medianMan } }
      : undefined,
    locale
  );
  const composite = explainComposite(
    score,
    ctx.weights,
    grade,
    rank,
    total,
    ctx.cuts,
    commuteMin,
    locale
  );
  const axes = AXES.map(({ key, label }) => ({
    key,
    label,
    explanation: explainAxis(
      key,
      score,
      ctx.pctKeys,
      ctx.axisWeights[key] ?? [],
      ctx.dists,
      locale
    ),
  }));

  // 가격 축은 번들 기준 조합(3종 전체+환산)이 아니면 rentVariants에서 직접 조회해
  // 보여준다 — score.pct/raw.monthlyRentMan은 선택과 무관하게 항상 번들 기준
  // 조합 기준이라, 선택을 반영하려면 이 조회가 필요하다(score.price 자체는
  // 이미 App.tsx의 applyRentSelection이 선택된 값으로 덮어써 뒀다).
  return (
    <div className="section detail">
      <div className="detail-head">
        <h2>{localizedDongName(dong, locale)}</h2>
        <span className="badge">
          <i className={`grade-dot ${grade}`} />
          {GRADE_LABEL[grade]}
        </span>
      </div>
      <p className="rank-line">{formatRank(rank, total)}</p>

      <p className="summary">{summary}</p>

      <div className="score-overview">
        <div className="total-score">
          <span>{tr("종합 점수")}</span>
          <div>
            <b>{composite.total.toFixed(1)}</b>
            <small>/ 100</small>
          </div>
        </div>
        <div className="axis-overview">
          {axes.map(({ key, label, explanation }) => (
            <div className="metric" key={key}>
              <div className="metric-head">
                <span>{tr(label)}</span>
                <b style={{ color: barColor(explanation.score) }}>
                  {Math.round(explanation.score)}
                </b>
              </div>
              <div className="bar">
                <div
                  style={{
                    width: `${explanation.score}%`,
                    background: barColor(explanation.score),
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/*
        key를 동 코드로 줘서 동을 바꿀 때마다 리마운트시킨다. <details>는 React
        상태가 아니라 DOM 자체가 열림 여부를 들고 있는 uncontrolled 엘리먼트라,
        key 없이 open만 주면 첫 렌더에만 적용되고 이후 동을 바꿔도 React가 같은
        DOM 노드를 재사용해서 사용자가 이전 동에서 접어둔 상태가 그대로 이어진다.
      */}
      <details className="why calculation" key={dong.code} open>
        <summary>
          <span>{tr("계산 근거 전체 보기")}</span>
          <small>{tr("원지표 · 백분위 · 가중치 · 등급 컷")}</small>
        </summary>
        <div className="calculation-body">
          {axes.map(({ key, label, explanation }) => (
            <section className="calculation-axis" key={key}>
              <div className="calculation-axis-head">
                <h3>{tr(label)}</h3>
                <b style={{ color: barColor(explanation.score) }}>
                  {formatScore(locale, explanation.score)}
                </b>
              </div>
              {key === "price" && !isBaseRent ? (
                <PriceVariantRow selection={rentSelection} variant={rentVariant} />
              ) : explanation.metrics.length === 0 ? (
                <div className="metric-note">
                  {tr("수집된 데이터가 없어 전 동 50점으로 둡니다.")}
                </div>
              ) : (
                <>
                  {explanation.metrics.map((m) => (
                    <MetricRow key={m.key} m={m} single={explanation.singleMetric} />
                  ))}
                  {!explanation.singleMetric && (
                    <div className="formula">
                      {tr(label)} {explanation.score.toFixed(1)} ={" "}
                      {explanation.metrics
                        .map((m) => `${(m.pct ?? 50).toFixed(0)}×${m.weight.toFixed(2)}`)
                        .join(" + ")}
                    </div>
                  )}
                </>
              )}
              {key === "price" && isBaseRent && score.dataQuality === "low" && (
                <p className="metric-note warn">
                  {locale === "ko" ? (
                    <>실거래 표본이 부족해 월세를 <b>자치구 중앙값</b>으로 대체했습니다.</>
                  ) : locale === "en" ? (
                    <>The rent uses the <b>district median</b> because there are too few transactions.</>
                  ) : (
                    <>取引サンプルが少ないため、家賃は<b>区の中央値</b>で補完しています。</>
                  )}
                </p>
              )}
              {key === "price" && !isBaseRent && rentVariant?.samples === 0 && (
                <p className="metric-note warn">
                  {tr("이 조합의 실거래 표본이 부족해 자치구 중앙값으로 대체했습니다.")}
                </p>
              )}
              {key === "price" && score.raw.rentByType && (
                <>
                  <p className="metric-note">
                    {tr(
                      isBaseRent
                        ? "위 월세는 단독·다가구+오피스텔+아파트 세 유형을 합친 중앙값입니다."
                        : "같은 소형 기준이어도 아파트가 대체로 더 비쌉니다."
                    )}
                  </p>
                  <RentByTypeDetails byType={score.raw.rentByType} isBaseRent={isBaseRent} />
                </>
              )}
            </section>
          ))}

          <section className="calculation-axis calculation-composite">
            <div className="calculation-axis-head">
              <h3>{tr("종합")}</h3>
              <b>{formatScore(locale, composite.total)}</b>
            </div>
            <div className="formula">
              {composite.axisTotal.toFixed(1)} ={" "}
              {composite.terms
                .map((t) => `${t.score.toFixed(0)}×${t.weight.toFixed(2)}`)
                .join(" + ")}
            </div>
            {composite.commute && (
              // Φ=1(목적지 미선택)일 땐 composite.commute 자체가 undefined라
              // 이 블록이 안 나온다 — "1을 곱한다"는 자명한 사실을 굳이 안 보여준다.
              <div className="formula formula-commute">
                {composite.commute === "unreachable" ? (
                  <>
                    × Φ({tr("도달 불가")}) = 0 → {formatScore(locale, composite.total)}
                  </>
                ) : (
                  <>
                    × Φ({tr("통근")} {minutes(composite.commute.min, 1)}) ={" "}
                    {composite.commute.phi.toFixed(2)} → {formatScore(locale, composite.total)}
                  </>
                )}
              </div>
            )}
            <div className="contrib">
              {composite.terms.map((t) => (
                <div key={t.axis} className="contrib-row">
                  <span>{t.label}</span>
                  <div className="contrib-bar">
                    <div
                      style={{
                        width: `${(t.contribution / Math.max(composite.axisTotal, 1)) * 100}%`,
                      }}
                    />
                  </div>
                  <span className="contrib-val">+{t.contribution.toFixed(1)}</span>
                </div>
              ))}
            </div>
            <div className="cutline">
              {gradeCutText(locale, composite.bestCut, composite.normalCut)}
            </div>
          </section>
        </div>
      </details>

      {commutes.length > 0 && (
        <div className="route detail-route">
          <p className="detail-section-title">{tr("통근 경로")}</p>
          {commutes.map(({ destName, result, route }, i) => (
            <div className="route-block" key={i}>
              {/* 목적지가 하나면 이름을 반복할 필요가 없다 */}
              {commutes.length > 1 && <p className="route-dest">→ {destName}</p>}
              {result.totalMin != null ? (
                <>
                  <div className="route-total">
                    <b>{minutes(Math.round(result.totalMin))}</b>
                    <span>
                      {result.transfers > 0
                        ? transferCount(locale, result.transfers, number)
                        : tr("환승 없음")}
                    </span>
                  </div>
                  <ol className="route-legs">
                    {/* 0분짜리 구간(목적지가 역 바로 앞)은 줄만 차지하므로 뺀다 */}
                    {route
                      .filter((leg) => Math.round(leg.minutes) > 0)
                      .map((leg, j) => (
                        <li key={j} className={`leg leg-${leg.kind}`}>
                          <span className="leg-time">{minutes(Math.round(leg.minutes))}</span>
                          <span className="leg-text">{legText(leg, locale)}</span>
                        </li>
                      ))}
                  </ol>
                </>
              ) : (
                <div className="route-total">
                  <b style={{ fontSize: 14, color: "var(--text-dim)" }}>{tr("도달 불가")}</b>
                </div>
              )}
            </div>
          ))}
          <p className="metric-note">
            {commuteMethodNote(locale)}
          </p>
        </div>
      )}

      {/*
        하단 경고는 "지금 화면에 쓰이는 기준"을 따라간다. score.dataQuality 는
        번들 기준 조합(3종 환산) 기준이라, 사용자가 다른 조합을 골랐을 땐 그
        조합이 실제로 대체됐는지와 어긋난다 — 실제로 기본 선택(단독·다가구)에서
        13개 동이 자치구 대체인데 하단 경고만 안 뜨는 상태였다.
      */}
      {(isBaseRent ? score.dataQuality === "low" : rentVariant?.samples === 0) && (
        <p className="metric-note warn">
          {locale === "ko" ? (
            <>이 동은 실거래 표본이 부족해 월세를 <b>자치구 중앙값</b>으로 대체했습니다.</>
          ) : locale === "en" ? (
            <>This neighborhood uses the <b>district median</b> because there are too few rent transactions.</>
          ) : (
            <>この地域は取引サンプルが少ないため、家賃を<b>区の中央値</b>で補完しています。</>
          )}
        </p>
      )}
    </div>
  );
}

/* ---------------- 지표 한 줄 ---------------- */

function MetricRow({ m, single }: { m: MetricExplanation; single: boolean }) {
  const { locale, tr, percent } = useI18n();
  const tiedPct = Math.round(m.tiedShare * 100);
  return (
    <div className="metric-row">
      <div className="metric-row-head">
        <span>{m.label}</span>
        <b>{m.value}</b>
      </div>
      <div className="metric-row-note">
        {tr("서울 중앙값")} {m.median}
        {/*
          백분위 수치를 함께 보여준다. 지표가 하나뿐인 축은 이 값이 곧 축 점수라,
          숫자가 없으면 "치안 78" 이 어디서 왔는지 연결이 끊긴다.
        */}
        {m.pct != null && (
          <>
            {" · "}
            {locale === "ko" ? "이 동은 " : ""}
            {pctPhrase(m.pct, locale)} <b>({formatScore(locale, m.pct)})</b>
          </>
        )}
        {!single && <> · {tr("가중치")} {m.weight.toFixed(2)}</>}
      </div>
      {/*
        동점이 많으면 백분위가 뭉친다. 유흥업소가 0개인데 100점이 아닌 이유가
        바로 이것이고, 이 줄이 없으면 계산이 틀린 것처럼 보인다.
      */}
      {tiedPct >= 10 && m.rawValue != null && (
        <div className="metric-row-note tied">
          {locale === "ko"
            ? `같은 값(${m.value})인 동이 서울의 ${percent(tiedPct)} — 동점이라 순위를 나눠 갖습니다`
            : locale === "en"
              ? `${percent(tiedPct)} of neighborhoods share the same value (${m.value}), so tied ranks are averaged`
              : `同じ値（${m.value}）の地域が${percent(tiedPct)}あり、同順位は平均順位で計算します`}
        </div>
      )}
    </div>
  );
}

/**
 * 가격 축이 번들 기준 조합(3종 전체+환산)이 아닐 때 쓰는 한 줄.
 *
 * 일반 `MetricRow`는 `score.pct`/`score.raw.monthlyRentMan`(항상 번들 기준 조합
 * 기준)을 읽으므로 그대로 쓰면 위에 보이는 점수(선택된 조합·모드 기준)와
 * 어긋난다. 여기서는 `rentVariants`에서 직접 조회한 값만 쓴다 — 서울
 * 중앙값·동점 비율은 조합별로 따로 만들지 않아(파이프라인이 556개 동
 * 전체를 조합마다 다시 정렬해야 해서 비용이 크다) 이 줄에는 없다.
 */
function PriceVariantRow({
  selection,
  variant,
}: {
  selection: RentSelection;
  variant: RentVariantStat | undefined;
}) {
  const { locale, tr, rent } = useI18n();
  return (
    <div className="metric-row">
      <div className="metric-row-head">
        <span>{rentSelectionLabel(selection, locale)}</span>
        <b>{variant?.medianMan != null ? rent(variant.medianMan) : tr("데이터 없음")}</b>
      </div>
      <div className="metric-row-note">
        {variant?.pct != null ? (
          <>
            {locale === "ko" ? "이 동은 " : ""}
            {pctPhrase(variant.pct, locale)} <b>({formatScore(locale, variant.pct)})</b>
          </>
        ) : (
          <>{tr("이 조합·모드는 표본이 서울 전체에서 없어 전 동 50점으로 둡니다")}</>
        )}
      </div>
    </div>
  );
}

/* ---------------- 헬퍼 ---------------- */

const RENT_TYPE_LABEL: Record<keyof RentByType, string> = {
  house: "단독·다가구",
  rowhouse: "연립·다세대",
  officetel: "오피스텔",
  apartment: "아파트",
};

/**
 * 4유형(단독·다가구/연립·다세대/오피스텔/아파트) 실측치 — 접어 둔다.
 *
 * 한 줄 join(옛 rentByTypeText)은 유형이 늘수록 읽기 어려워져서 라벨·중앙값·
 * 표본수 3열 그리드로 바꿨다. isBaseRent 여부와 무관하게 항상 4유형 전부를
 * 보여준다 — 3종 합산 기준일 때도 빠진 연립·다세대를 참고할 수 있어야 한다.
 */
function RentByTypeDetails({
  byType,
  isBaseRent,
}: {
  byType: RentByType;
  isBaseRent: boolean;
}) {
  const { tr, rent, number } = useI18n();
  return (
    <details className="rent-by-type">
      <summary>{tr(isBaseRent ? "네 유형별 참고값 보기" : "네 유형별 실측치 보기")}</summary>
      <div className="rent-by-type-body">
        {(Object.keys(RENT_TYPE_LABEL) as Array<keyof RentByType>).map((key) => {
          const stat = byType[key];
          return (
            <div className="rent-by-type-row" key={key}>
              <span>{tr(RENT_TYPE_LABEL[key])}</span>
              <b>{stat.samples > 0 ? rent(stat.medianMan!) : tr("표본 없음")}</b>
              <small>{stat.samples > 0 ? sampleCount(number(stat.samples), tr) : ""}</small>
            </div>
          );
        })}
      </div>
    </details>
  );
}

function legText(leg: RouteLeg, locale: Locale): string {
  switch (leg.kind) {
    case "walk":
      if (leg.toType === "destination") {
        return locale === "en" ? "Walk to destination" : locale === "ja" ? "目的地まで徒歩" : "목적지까지 도보";
      }
      if (leg.toType === "busStop") {
        return locale === "en"
          ? `Walk to ${leg.to} bus stop`
          : locale === "ja"
            ? `${leg.to}バス停まで徒歩`
            : `${leg.to} 정류장까지 도보`;
      }
      return locale === "en"
        ? `Walk to ${localizedStationName(leg.to, locale)} Station`
        : locale === "ja"
          ? `${localizedStationName(leg.to, locale)}駅まで徒歩`
          : `${leg.to}역까지 도보`;
    case "wait":
      if (leg.vehicle !== "bus") {
        return locale === "en" ? "Wait for subway" : locale === "ja" ? "地下鉄の乗車待ち" : "지하철 승차 대기";
      }
      return locale === "en"
        ? `Wait for ${leg.routeName ?? "bus"} · ${leg.at}`
        : locale === "ja"
          ? `${leg.routeName ?? "バス"}の乗車待ち・${leg.at}`
          : `${leg.routeName ?? "버스"} 승차 대기 · ${leg.at}`;
    case "bus":
      return `${leg.routeName} ${leg.stops > 0 ? `${stopCount(locale, leg.stops, "bus")} · ` : ""}${leg.from} → ${leg.to}`;
    case "ride":
      return `${lineName(leg.line, locale)} ${stopCount(locale, leg.stops, "subway")} · ${localizedStationName(leg.from, locale)} → ${localizedStationName(leg.to, locale)}`;
    case "transfer":
      return locale === "en"
        ? `Transfer at ${localizedStationName(leg.at, locale)} Station · ${lineName(leg.fromLine, locale)} → ${lineName(leg.toLine, locale)}`
        : locale === "ja"
          ? `${localizedStationName(leg.at, locale)}駅で乗換・${lineName(leg.fromLine, locale)} → ${lineName(leg.toLine, locale)}`
          : `${leg.at}역 환승 · ${lineName(leg.fromLine)} → ${lineName(leg.toLine)}`;
  }
}

/** 그래프의 노선 식별자를 사람이 읽는 이름으로 */
export function lineName(line: string, locale: Locale = "ko"): string {
  return subwayLineName(line, locale);
}

function formatScore(locale: Locale, value: number): string {
  const amount = value.toFixed(1);
  if (locale === "en") return `${amount} pts`;
  return `${amount}${locale === "ja" ? "点" : "점"}`;
}

function gradeCutText(locale: Locale, best: number, normal: number): string {
  if (locale === "en") {
    return `Grade thresholds — Best at ${best.toFixed(1)} pts or above · Normal at ${normal.toFixed(1)} pts or above (ties are resolved by rank)`;
  }
  if (locale === "ja") {
    return `評価基準 — ${best.toFixed(1)}点以上がBest・${normal.toFixed(1)}点以上がNormal（同点は順位で判定）`;
  }
  return `등급 컷 — ${best.toFixed(1)}점 이상 Best · ${normal.toFixed(1)}점 이상 Normal (동점이면 순위로 가릅니다)`;
}

function transferCount(locale: Locale, count: number, format: (value: number) => string): string {
  const amount = format(count);
  if (locale === "en") return `${amount} ${count === 1 ? "transfer" : "transfers"}`;
  if (locale === "ja") return `乗換${amount}回`;
  return `환승 ${amount}회`;
}

function stopCount(locale: Locale, count: number, vehicle: "bus" | "subway"): string {
  if (locale === "en") return `${count} ${vehicle === "bus" ? "stops" : count === 1 ? "stop" : "stops"}`;
  if (locale === "ja") return `${count}${vehicle === "bus" ? "停留所" : "駅"}`;
  return `${count}${vehicle === "bus" ? "정류장" : "정거장"}`;
}

function sampleCount(amount: string, tr: (source: string) => string): string {
  const unit = tr("건");
  return unit.startsWith(" ") ? `${amount}${unit}` : `${amount}${unit}`;
}

function commuteMethodNote(locale: Locale): string {
  if (locale === "en") {
    return "Commute times use the median representative living area for each neighborhood, derived from Statistics Korea SGIS 2024 100 m population grids. Walk access over 15 minutes is replaced by a bus estimate only when the same route connects nearby stops, using stop distance and headway; live traffic is not included. Home coordinates are not disclosed, so the map omits the line from home to the first station or stop. Subway travel times are also estimates based on distance and line characteristics.";
  }
  if (locale === "ja") {
    return "通勤時間は、統計庁SGISの2024年100m人口分布から行政洞ごとの代表生活圏を集約した中央値です。徒歩15分を超えるアクセスは、同一路線が実際につながる場合に限り、バス停間距離と運行間隔からバス所要時間を推定します。リアルタイム交通状況は反映しません。居住地点は公開しないため、自宅から最初の駅・停留所までの線は地図に表示しません。地下鉄の駅間時間も距離と路線特性に基づく推定値です。";
  }
  return "국가데이터처 SGIS 2024년 100m 인구 분포를 동별 대표 생활권으로 집약한 중앙 통근시간 기준입니다. 도보 15분 초과 접근은 실제 같은 노선이 이어질 때 버스 정류장 간 거리·배차간격으로 환산하며, 실시간 교통상황은 반영하지 않습니다. 거주 좌표는 공개하지 않아 거주지에서 첫 역·정류장까지의 지도선은 생략합니다. 지하철 역간 시간도 거리와 노선 특성 기반 추정치입니다.";
}

/** 점수대별 색 — 등급 색과 같은 팔레트를 써서 지도와 시각적으로 이어준다. */
function barColor(v: number): string {
  if (v >= 70) return GRADE_COLOR.best;
  if (v >= 40) return GRADE_COLOR.normal;
  return GRADE_COLOR.bad;
}
