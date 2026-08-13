import { useMemo, useState } from "react";
import { compositeScore, rebalanceWeights } from "../lib/score";
import { DEFAULT_WEIGHTS } from "../lib/constants";
import type { Weights } from "../types";

/**
 * 랜딩에서 가중치 슬라이더를 직접 만져보는 데모.
 *
 * 이 도구의 핵심 주장은 "무엇이 중요한지는 사람마다 다르니 순위도 달라야
 * 한다"인데, 글로 설명하면 안 와닿는다. 실제로 슬라이더를 끌어서 순위가
 * 뒤집히는 걸 보면 한 번에 이해된다.
 *
 * **점수는 지어낸 게 아니라 실제 산출물이다.** public/data/bundle.json 의
 * 축 점수를 그대로 옮겼고, 계산도 앱과 같은 `compositeScore` 를 쓴다.
 * 그래서 여기서 나온 순위는 앱에서 같은 가중치로 봤을 때와 일치한다
 * (통근권 필터를 안 걸었을 때 이 6개 동 사이의 상대 순서 기준).
 *
 * 번들 전체(약 8MB)를 랜딩에서 받지 않으려고 6개만 손으로 담았다. 소개
 * 페이지에서 그만큼을 내려받게 하면 첫 화면이 느려지고, 6개면 순위가
 * 뒤집히는 걸 보여주는 데 충분하다.
 */

/** 화면 폭에 따라 달라지므로 CSS 변수(--row-h)와 반드시 같이 움직인다 */
interface Row {
  dong: string;
  gu: string;
  /** 강남역까지 지하철 통근시간(분). computeCommute 산출값 */
  commuteMin: number;
  /** 만원. 원지표 그대로 */
  rentMan: number;
  safety: number;
  price: number;
  convenience: number;
}

/*
 * 강남역 기준으로 뽑은 실제 값(2026-08-13 번들, 수도권 547개 동).
 *
 * 아무 동이나 고르면 슬라이더를 움직여도 순위가 안 바뀌어 데모가 안 된다.
 * 세 축 각각에서 1위가 서로 다르도록 골랐다 —
 *   치안 100% → 안암동, 가격 100% → 공릉1동, 편의 100% → 창신1동.
 * 데이터를 갱신하면 이 표도 다시 뽑아야 한다.
 */
const ROWS: Row[] = [
  { dong: "공릉1동", gu: "노원구", commuteMin: 49, rentMan: 44.58, safety: 57.7, price: 76.2, convenience: 85.8 },
  { dong: "안암동", gu: "성북구", commuteMin: 43, rentMan: 54.58, safety: 86.3, price: 35.6, convenience: 62.1 },
  { dong: "창신1동", gu: "종로구", commuteMin: 36, rentMan: 46.38, safety: 3.8, price: 71.2, convenience: 97.5 },
  { dong: "신림동", gu: "관악구", commuteMin: 27, rentMan: 50.75, safety: 12.1, price: 50.7, convenience: 97.0 },
  { dong: "상도1동", gu: "동작구", commuteMin: 32, rentMan: 54.58, safety: 71.3, price: 35.6, convenience: 69.8 },
  { dong: "옥수동", gu: "성동구", commuteMin: 25, rentMan: 61.58, safety: 75.2, price: 12.5, convenience: 29.3 },
];

const AXES = [
  { key: "safety", label: "치안" },
  { key: "price", label: "가격" },
  { key: "convenience", label: "생활편의" },
] as const;

/** 슬라이더를 여기까지 끌면 순위가 확실히 뒤집힌다 — "해보세요" 대신 눌러보게 한다 */
const PRESETS: Array<{ label: string; w: Weights }> = [
  { label: "기본", w: DEFAULT_WEIGHTS },
  { label: "치안이 제일 중요", w: { safety: 0.7, price: 0.15, convenience: 0.15 } },
  { label: "무조건 싸게", w: { safety: 0.15, price: 0.7, convenience: 0.15 } },
  { label: "생활이 편한 곳", w: { safety: 0.15, price: 0.15, convenience: 0.7 } },
];

export default function WeightPlayground() {
  const [w, setW] = useState<Weights>({ ...DEFAULT_WEIGHTS });

  /*
   * 정렬된 배열을 새로 만들어 렌더하면 DOM 순서가 바뀌어 애니메이션을 못 건다.
   * 대신 **DOM 순서는 고정**하고 각 행에 순위(rank)만 넘겨, CSS 가
   * translateY 로 자리를 잡게 한다. 그러면 순위가 바뀔 때 자리 이동이
   * 공짜로 전환된다.
   */
  const ranked = useMemo(() => {
    const scored = ROWS.map((r) => ({ r, v: compositeScore(r, w) }));
    const order = [...scored].sort((a, b) => b.v - a.v || a.r.dong.localeCompare(b.r.dong));
    const rankOf = new Map(order.map((x, i) => [x.r.dong, i]));
    const top = order[0].v;
    return scored.map(({ r, v }) => ({
      row: r,
      score: v,
      rank: rankOf.get(r.dong)!,
      /* 1위 대비 상대 길이 — 절대 점수로 채우면 가중치를 바꿔도 막대가 거의 안 움직인다 */
      bar: top > 0 ? (v / top) * 100 : 0,
    }));
  }, [w]);

  const set = (key: keyof Weights, value: number) =>
    setW(rebalanceWeights(w, key, value / 100));

  const pct = (v: number) => Math.round(v * 100);

  return (
    <div className="wp">
      <div className="wp-controls">
        <div className="wp-presets">
          {PRESETS.map((p) => {
            /* 반올림해서 비교한다 — rebalance 가 부동소수 꼬리를 남긴다 */
            const on = AXES.every(({ key }) => pct(w[key]) === pct(p.w[key]));
            return (
              <button
                key={p.label}
                type="button"
                data-active={on}
                onClick={() => setW({ ...p.w })}
              >
                {p.label}
              </button>
            );
          })}
        </div>

        {AXES.map(({ key, label }) => (
          <label className="wp-slider" key={key}>
            <span className="wp-slider-label">{label}</span>
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              value={pct(w[key])}
              onChange={(e) => set(key, Number(e.target.value))}
              aria-label={`${label} 비중`}
            />
            <b>{pct(w[key])}%</b>
          </label>
        ))}
      </div>

      {/*
        높이를 고정해야 절대 배치한 행들이 부모 높이를 만든다.
        --row-h 는 CSS 쪽에 있고 좁은 화면에서 값이 바뀐다 — JS 로 재지 않으므로
        미디어 쿼리만 고치면 따라온다.
      */}
      <ol
        className="wp-list"
        style={{ "--n": ROWS.length } as React.CSSProperties}
      >
        {ranked.map(({ row, score, rank, bar }) => (
          <li
            key={row.dong}
            className="wp-row"
            style={{ "--i": rank } as React.CSSProperties}
            data-top={rank === 0}
          >
            <span className="wp-rank">{rank + 1}</span>
            <span className="wp-name">
              <b>{row.dong}</b>
              <i>{row.gu}</i>
            </span>
            <span className="wp-bar">
              <span style={{ width: `${bar}%` }} />
            </span>
            <span className="wp-score">{score.toFixed(1)}</span>
            <span className="wp-meta">
              월세 {Math.round(row.rentMan)}만 · 강남역 {row.commuteMin}분
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
