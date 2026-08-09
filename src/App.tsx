import { useEffect, useMemo, useState } from "react";
import MapView, { type DongView } from "./components/MapView";
import DestinationSearch from "./components/DestinationSearch";
import DongDetail from "./components/DongDetail";
import TopPicks, { type Pick } from "./components/TopPicks";
import { loadAppData, type AppData } from "./lib/data";
import { computeCommute } from "./lib/commute";
import { gradeAll, rebalanceWeights } from "./lib/score";
import {
  DEFAULT_MAX_COMMUTE_MIN,
  DEFAULT_WEIGHTS,
  GRADE_LABEL,
} from "./lib/constants";
import type { Destination, Weights } from "./types";

export default function App() {
  const [data, setData] = useState<AppData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [destination, setDestination] = useState<Destination | null>(null);
  const [maxCommute, setMaxCommute] = useState(DEFAULT_MAX_COMMUTE_MIN);
  const [weights, setWeights] = useState<Weights>({ ...DEFAULT_WEIGHTS });
  const [selectedCode, setSelectedCode] = useState<string | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    loadAppData(ctrl.signal)
      .then(setData)
      .catch((err) => {
        if (err.name !== "AbortError") setError(err.message);
      });
    return () => ctrl.abort();
  }, []);

  /*
   * 통근시간은 목적지가 바뀔 때만 계산한다 (Dijkstra 1회, 1ms 미만).
   * 슬라이더를 움직여도 여기는 다시 돌지 않는다.
   */
  const commute = useMemo(() => {
    if (!data || !destination) return null;
    return computeCommute(data.graph, data.dongs, destination);
  }, [data, destination]);

  /* 등급은 가중치가 바뀔 때만 다시 매긴다 (427회 곱셈 — 사실상 즉시). */
  const grades = useMemo(() => {
    if (!data) return null;
    return gradeAll(data.scores, weights);
  }, [data, weights]);

  /* 지도에 넘길 뷰 — 등급 + 통근 가능 여부 */
  const views = useMemo(() => {
    const map = new Map<string, DongView>();
    if (!data || !grades) return map;
    for (const dong of data.dongs) {
      const g = grades.get(dong.code);
      if (!g) continue;
      const c = commute?.get(dong.code);
      const reachable = c?.totalMin != null && c.totalMin <= maxCommute;
      map.set(dong.code, {
        grade: g.grade,
        score: g.score,
        commute: c ?? {
          totalMin: null,
          viaStation: null,
          walkMin: 0,
          transfers: 0,
          hasEstimatedLeg: false,
        },
        reachable,
      });
    }
    return map;
  }, [data, grades, commute, maxCommute]);

  /* 통근권 안에서 종합 점수가 높은 순 */
  const picks = useMemo<Pick[]>(() => {
    if (!data || !grades || !commute) return [];
    const out: Pick[] = [];
    for (const dong of data.dongs) {
      const c = commute.get(dong.code);
      const g = grades.get(dong.code);
      if (!g || c?.totalMin == null || c.totalMin > maxCommute) continue;
      out.push({ dong, grade: g.grade, score: g.score, commuteMin: c.totalMin });
    }
    out.sort((a, b) => b.score - a.score);
    return out;
  }, [data, grades, commute, maxCommute]);

  const selected = useMemo(() => {
    if (!data || !grades || !selectedCode) return null;
    const dong = data.dongs.find((d) => d.code === selectedCode);
    const score = data.scores.get(selectedCode);
    const g = grades.get(selectedCode);
    if (!dong || !score || !g) return null;
    // g 에도 score(종합 점수)가 있어 이름이 겹친다. 축 점수와 구분해서 꺼낸다.
    return {
      dong,
      score,
      grade: g.grade,
      rank: g.rank,
      total: g.total,
      commute: commute?.get(selectedCode),
    };
  }, [data, grades, commute, selectedCode]);

  const setWeight = (key: keyof Weights, value: number) =>
    setWeights((w) => rebalanceWeights(w, key, value));

  return (
    <div className="app">
      <div className="map-wrap">
        {data ? (
          <MapView
            dongs={data.dongs}
            views={views}
            destination={destination}
            selectedCode={selectedCode}
            onSelect={setSelectedCode}
            hasDestination={!!destination}
          />
        ) : (
          <div className="loading">
            {error ? `오류: ${error}` : "지도를 불러오는 중..."}
          </div>
        )}
      </div>

      <aside className="sidebar">
        <div className="brand">
          <h1>Oneday</h1>
          <p>
            회사나 학교를 검색하면, 통근 가능한 동네를 치안·월세·생활편의 등급으로
            한눈에 보여줍니다.
          </p>
        </div>

        <DestinationSearch onPick={setDestination} />

        {destination && (
          <>
            <div className="section">
              <p className="section-title">목적지</p>
              <div style={{ fontSize: 14, marginBottom: 2 }}>{destination.name}</div>
              <div className="metric-note">{destination.address}</div>
            </div>

            <div className="section">
              <p className="section-title">통근 한계</p>
              <div className="slider-row">
                <label htmlFor="commute">시간</label>
                <input
                  id="commute"
                  type="range"
                  min={15}
                  max={90}
                  step={5}
                  value={maxCommute}
                  onChange={(e) => setMaxCommute(Number(e.target.value))}
                />
                <output>{maxCommute}분</output>
              </div>
            </div>

            <div className="section">
              <p className="section-title">무엇이 중요한가요?</p>
              {(
                [
                  ["safety", "치안"],
                  ["price", "가격"],
                  ["convenience", "편의"],
                ] as const
              ).map(([key, label]) => (
                <div className="slider-row" key={key}>
                  <label htmlFor={key}>{label}</label>
                  <input
                    id={key}
                    type="range"
                    min={0}
                    max={100}
                    step={5}
                    value={Math.round(weights[key] * 100)}
                    onChange={(e) => setWeight(key, Number(e.target.value) / 100)}
                  />
                  <output>{Math.round(weights[key] * 100)}%</output>
                </div>
              ))}
              <div className="legend" style={{ marginTop: 12 }}>
                {(["best", "normal", "bad"] as const).map((g) => (
                  <span key={g}>
                    <i className={`grade-dot ${g}`} />
                    {GRADE_LABEL[g]}
                  </span>
                ))}
              </div>
            </div>

            <TopPicks picks={picks} selectedCode={selectedCode} onSelect={setSelectedCode} />
          </>
        )}

        {!destination && (
          <div className="empty">
            먼저 목적지를 정해주세요.
            <br />
            출근할 회사나 등교할 학교를 검색하면
            <br />
            통근 가능한 지역이 지도에 나타납니다.
          </div>
        )}

        {selected && (
          <DongDetail
            dong={selected.dong}
            score={selected.score}
            grade={selected.grade}
            rank={selected.rank}
            total={selected.total}
            commute={selected.commute}
          />
        )}

        <div className="disclaimer">
          등급은 공공·공개 데이터로 계산한 <b>서울 내 상대 평가</b>이며, 특정 지역에
          대한 가치판단이 아닙니다. 통근시간은 지하철 기준 추정치로 실제 소요시간과
          다를 수 있습니다.
          {data && (
            <>
              <br />
              데이터 기준 · 경계 {data.meta.boundaryVersion} · 지하철{" "}
              {data.meta.graphVersion} · 지표 {data.meta.scoreVersion}
              {data.meta.missingMetrics.length > 0 && (
                <>
                  <br />
                  <span style={{ color: "var(--normal)" }}>
                    미수집 지표: {data.meta.missingMetrics.join(", ")}
                  </span>
                </>
              )}
            </>
          )}
        </div>
      </aside>
    </div>
  );
}
