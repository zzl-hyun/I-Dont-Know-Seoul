import type { CommuteResult, DongMeta, DongScore, Grade } from "../types";
import { GRADE_COLOR, GRADE_LABEL } from "../lib/constants";

interface Props {
  dong: DongMeta;
  score: DongScore;
  grade: Grade;
  rank: number;
  total: number;
  commute: CommuteResult | undefined;
}

/**
 * 동 상세 패널.
 *
 * 등급만 보여주고 끝내면 "왜 Bad인지" 알 수 없고, 특정 동네를 근거 없이
 * 낙인찍는 셈이 된다. 등급 옆에는 항상 근거가 되는 실제 수치를 함께 둔다.
 */
export default function DongDetail({ dong, score, grade, rank, total, commute }: Props) {
  return (
    <div className="section">
      <div className="detail-head">
        <h2>{dong.name}</h2>
        <span className="badge">
          <i className={`grade-dot ${grade}`} />
          {GRADE_LABEL[grade]}
        </span>
      </div>

      {commute?.totalMin != null ? (
        <div className="commute-line">
          <b>{Math.round(commute.totalMin)}분</b>
          <small>
            {commute.viaStation}역까지 도보 {Math.round(commute.walkMin)}분
            {commute.transfers > 0 ? ` · 환승 ${commute.transfers}회` : " · 환승 없음"}
          </small>
        </div>
      ) : (
        <div className="commute-line">
          <b style={{ fontSize: 14, color: "var(--text-dim)" }}>통근 시간 밖</b>
        </div>
      )}

      <Metric
        label="치안"
        value={score.safety}
        note={safetyNote(score)}
      />
      <Metric
        label="가격"
        value={score.price}
        note={priceNote(score)}
      />
      <Metric
        label="생활편의"
        value={score.convenience}
        note={convenienceNote(score)}
      />

      <p className="metric-note" style={{ marginTop: 12 }}>
        서울 {total}개 행정동 중 <b>{rank}위</b>
        {score.dataQuality === "low" && (
          <> · <span style={{ color: "var(--normal)" }}>표본 부족으로 일부 지표를 인근 지역 값으로 대체</span></>
        )}
      </p>
    </div>
  );
}

function Metric({ label, value, note }: { label: string; value: number; note: string }) {
  return (
    <div className="metric">
      <div className="metric-head">
        <span>{label}</span>
        <b style={{ color: barColor(value) }}>{Math.round(value)}</b>
      </div>
      <div className="bar">
        <div style={{ width: `${value}%`, background: barColor(value) }} />
      </div>
      {note && <div className="metric-note">{note}</div>}
    </div>
  );
}

/** 점수대별 색 — 등급 색과 같은 팔레트를 써서 지도와 시각적으로 이어준다. */
function barColor(v: number): string {
  if (v >= 70) return GRADE_COLOR.best;
  if (v >= 40) return GRADE_COLOR.normal;
  return GRADE_COLOR.bad;
}

/* ---------- 근거 문구: 항상 실제 수치를 노출한다 ---------- */

function safetyNote(s: DongScore): string {
  const parts: string[] = [];
  const { cctvPerKm2, nightlifePerKm2, crimePer1k } = s.raw;
  if (cctvPerKm2 != null) parts.push(`CCTV ${fmt(cctvPerKm2)}대/km²`);
  if (nightlifePerKm2 != null) parts.push(`유흥업소 ${fmt(nightlifePerKm2)}개/km²`);
  if (crimePer1k != null) parts.push(`5대범죄 ${crimePer1k.toFixed(1)}건/천명(자치구)`);
  return parts.join(" · ") || "데이터 없음";
}

function priceNote(s: DongScore): string {
  const { monthlyRentMan, rentSamples } = s.raw;
  if (monthlyRentMan == null) return "실거래 데이터 없음";
  return `원룸 환산월세 중앙값 ${monthlyRentMan.toFixed(0)}만원 · 실거래 ${rentSamples}건`;
}

function convenienceNote(s: DongScore): string {
  const parts: string[] = [];
  const { storePerKm2, foodPerKm2, medicalPerKm2, walkToStationMin } = s.raw;
  if (storePerKm2 != null) parts.push(`편의점·마트 ${fmt(storePerKm2)}개/km²`);
  if (foodPerKm2 != null) parts.push(`음식점 ${fmt(foodPerKm2)}개/km²`);
  if (medicalPerKm2 != null) parts.push(`병원·약국 ${fmt(medicalPerKm2)}개/km²`);
  if (walkToStationMin != null) parts.push(`최근접역 도보 ${Math.round(walkToStationMin)}분`);
  return parts.join(" · ") || "데이터 없음";
}

const fmt = (v: number) => (v >= 100 ? v.toFixed(0) : v.toFixed(1));
