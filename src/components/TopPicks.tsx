import type { DongMeta, Grade } from "../types";
import { GRADE_LABEL } from "../lib/constants";

export interface Pick {
  dong: DongMeta;
  grade: Grade;
  score: number;
  commuteMin: number;
}

interface Props {
  picks: Pick[];
  selectedCode: string | null;
  emptyReason: "commute" | "budget";
  canExpandCommute: boolean;
  onSelect: (code: string) => void;
  onExpandCommute: () => void;
  onResetBudget: () => void;
}

/**
 * 추천 목록.
 *
 * 정렬 기준은 "종합 점수"다. 통근시간은 이미 슬라이더로 걸러진 뒤이므로,
 * 통근 가능한 곳들 중 살기 좋은 순으로 보여주는 게 사용자의 실제 판단 순서와 맞다.
 */
export default function TopPicks({
  picks,
  selectedCode,
  emptyReason,
  canExpandCommute,
  onSelect,
  onExpandCommute,
  onResetBudget,
}: Props) {
  if (picks.length === 0) {
    const commuteMessage = canExpandCommute
      ? "현재 통근 시간 안에 드는 지역이 없습니다."
      : "통근 한계를 최대로 늘려도 조건에 맞는 지역이 없습니다.";

    return (
      <div className="section top-picks">
        <p className="section-title">추천 지역 · 통근권 0개 동</p>
        <div className="picks-empty">
          <p className="metric-note" role="status">
            {emptyReason === "budget"
              ? "현재 월세 상한과 통근 조건을 함께 만족하는 지역이 없습니다."
              : commuteMessage}
          </p>
          {emptyReason === "budget" ? (
            <button type="button" className="picks-empty-action" onClick={onResetBudget}>
              월세 제한 해제
            </button>
          ) : (
            canExpandCommute && (
              <button
                type="button"
                className="picks-empty-action"
                onClick={onExpandCommute}
              >
                통근 한계 15분 늘리기
              </button>
            )
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="section top-picks">
      <p className="section-title">추천 지역 · 통근권 {picks.length}개 동</p>
      <ul className="picks">
        {picks.slice(0, 10).map((p, i) => (
          <li key={p.dong.code}>
            <button
              type="button"
              className="pick"
              data-selected={p.dong.code === selectedCode}
              onClick={() => onSelect(p.dong.code)}
              title={`${p.dong.name} · ${GRADE_LABEL[p.grade]}`}
            >
              <span className="rank">{i + 1}</span>
              <span className="name">
                <i className={`grade-dot ${p.grade}`} />
                <b>{p.dong.dong}</b>
                <small>{p.dong.gu}</small>
              </span>
              <span className="time">{Math.round(p.commuteMin)}분</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
