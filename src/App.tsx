import { useEffect, useMemo, useState } from "react";
import MapView, {
  type DongView,
  type MapMode,
  type RouteSegment,
  type Theme,
} from "./components/MapView";
import DestinationSearch from "./components/DestinationSearch";
import DongDetail, { type CommuteLeg, type ExplainContext } from "./components/DongDetail";
import TopPicks, { type Pick } from "./components/TopPicks";
import Landing from "./components/Landing";
import { loadAppData, type AppData } from "./lib/data";
import { buildRoute, computeMultiCommute } from "./lib/commute";
import { gradeAll, rebalanceWeights } from "./lib/score";
import { buildDistributions, summarize } from "./lib/explain";
import { buildSubwayLayers, LINE_COLOR, lineName } from "./lib/subwayLines";
import { decodeShareState, encodeShareState } from "./lib/shareUrl";
import {
  BUDGET_MIN,
  BUDGET_OFF,
  COMMUTE_BANDS,
  commuteBand,
  GRADE_LABEL,
  MAX_DESTINATIONS,
} from "./lib/constants";
import type { CommuteResult, Destination, Weights } from "./types";

/**
 * 범례에 넣을 노선. 그래프에는 21개 노선이 있지만 전부 나열하면 지도를 덮는다.
 * 서울 안에서 자취 후보지를 가르는 주요 노선만 고른다.
 */
const MAIN_LINES = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "신분당", "경의·중앙", "수인·분당"];

/**
 * 월세 상한 판정.
 * 실거래 표본이 없는 동은 걸러내지 않는다 — 데이터가 없다고 비싸다고 볼 근거가 없다.
 */
function withinBudget(rent: number | null, limit: number): boolean {
  if (limit >= BUDGET_OFF) return true;
  if (rent == null) return true;
  return rent <= limit;
}

const NO_COMMUTE: CommuteResult = {
  totalMin: null,
  viaStation: null,
  walkMin: 0,
  transfers: 0,
  hasEstimatedLeg: false,
  viaNodeId: -1,
};

export default function App() {
  const [data, setData] = useState<AppData | null>(null);
  const [error, setError] = useState<string | null>(null);

  // 링크로 들어온 경우 그 상태에서 시작한다 (최초 1회만 읽는다)
  const [initial] = useState(() => decodeShareState(window.location.search));

  /**
   * 소개 페이지를 보여줄지. **마운트 시 1회만** 판정한다.
   *
   * `destinations.length === 0` 을 그대로 조건으로 쓰면 도구에서 목적지를 다
   * 지운 순간 소개로 튕겨나간다 — 지우는 건 "다시 고르겠다"는 뜻이지 "소개를
   * 다시 읽겠다"는 뜻이 아니다. 그래서 초기 URL 상태로만 정하고, 이후에는
   * 사용자의 명시적 행동(검색·둘러보기)으로만 내린다.
   *
   * 쿼리스트링 유무가 아니라 **목적지 유무**로 가른다. utm 같은 유입 파라미터가
   * 붙은 링크(랜딩을 가장 보여줘야 할 유입)까지 도구로 보내면 안 되고, 반대로
   * 목적지 없는 `?w=...` 링크를 도구로 보내면 빈 지도만 남는다.
   *
   * 경로가 아니라 상태로 가르는 이유: 이미 뿌려진 공유 링크가 전부 `/?to=...`
   * 형태라, `/app` 같은 새 경로를 만들면 그 링크들이 전부 소개로 떨어져
   * 목적지가 복원되지 않는다.
   */
  const [showLanding, setShowLanding] = useState(initial.destinations.length === 0);

  const [destinations, setDestinations] = useState<Destination[]>(initial.destinations);
  const [maxCommute, setMaxCommute] = useState(initial.maxCommute);
  const [weights, setWeights] = useState<Weights>(initial.weights);
  const [selectedCode, setSelectedCode] = useState<string | null>(null);
  const [showSubway, setShowSubway] = useState(initial.showSubway);
  /** 꺼둔 노선. 비어 있으면 전부 표시 (기본값) */
  const [hiddenLines, setHiddenLines] = useState<Set<string>>(
    () => new Set(initial.hiddenLines)
  );
  /** 월세 상한(만원). BUDGET_OFF 면 제한 없음 */
  const [budget, setBudget] = useState(initial.budget);
  const [mapMode, setMapMode] = useState<MapMode>(initial.mapMode);
  const [copied, setCopied] = useState(false);
  /**
   * 테마. 저장된 선택이 있으면 그걸, 없으면 OS 설정을 따른다.
   * (URL 에는 싣지 않는다 — 받는 사람의 취향을 덮어쓸 이유가 없다)
   */
  const [theme, setTheme] = useState<Theme>(() => {
    const saved = localStorage.getItem("oneday.theme");
    if (saved === "light" || saved === "dark") return saved;
    return window.matchMedia?.("(prefers-color-scheme: light)").matches ? "light" : "dark";
  });

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("oneday.theme", theme);

    /*
     * 모바일 브라우저 상단바 색을 맞춘다.
     *
     * index.html 의 theme-color 는 prefers-color-scheme 으로만 갈리는데, 여기서는
     * 사용자가 토글로 OS 설정을 거스를 수 있다. 그 경우 상단바만 반대 색으로
     * 남으므로 직접 갱신한다. media 속성이 붙은 태그는 지우고 하나만 남긴다.
     */
    document
      .querySelectorAll('meta[name="theme-color"][media]')
      .forEach((el) => el.remove());
    let tag = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]:not([media])');
    if (!tag) {
      tag = document.createElement("meta");
      tag.name = "theme-color";
      document.head.appendChild(tag);
    }
    tag.content = theme === "dark" ? "#16181d" : "#f4f5f7";
  }, [theme]);

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
    if (!data || destinations.length === 0) return null;
    return computeMultiCommute(data.graph, data.dongs, destinations);
  }, [data, destinations]);

  /* 등급은 가중치가 바뀔 때만 다시 매긴다 (427회 곱셈 — 사실상 즉시). */
  const graded = useMemo(() => {
    if (!data) return null;
    return gradeAll(data.scores, weights);
  }, [data, weights]);

  /* 지표별 서울 분포 — 데이터가 바뀔 때 한 번만 만든다 */
  const dists = useMemo(() => {
    if (!data) return null;
    return buildDistributions(data.scores, data.pctKeys);
  }, [data]);

  /* 지하철 노선도 — 그래프는 세션 내내 불변이라 한 번만 만든다 */
  const subway = useMemo(() => {
    if (!data) return null;
    return buildSubwayLayers(data.graph);
  }, [data]);

  const explainCtx = useMemo<ExplainContext | null>(() => {
    if (!data || !graded || !dists) return null;
    return {
      pctKeys: data.pctKeys,
      axisWeights: data.axisWeights,
      dists,
      weights,
      cuts: graded.cuts,
    };
  }, [data, graded, dists, weights]);

  /* 지도에 넘길 뷰 — 등급 + 통근 가능 여부 + 한 줄 이유 */
  const views = useMemo(() => {
    const map = new Map<string, DongView>();
    if (!data || !graded) return map;
    for (const dong of data.dongs) {
      const g = graded.byDong.get(dong.code);
      const s = data.scores.get(dong.code);
      if (!g || !s) continue;
      const c = commute?.byDong.get(dong.code);
      const inTime = c?.worstMin != null && c.worstMin <= maxCommute;
      const inBudget = withinBudget(s.raw.monthlyRentMan, budget);
      const reachable = inTime && inBudget;
      // worstMin을 만든 그 목적지의 결과를 같이 써야 툴팁에 시간·역이
      // 서로 다른 목적지를 가리키는 일이 없다.
      const worst = c?.per.reduce((a, b) => ((b.totalMin ?? -1) > (a.totalMin ?? -1) ? b : a));
      map.set(dong.code, {
        grade: g.grade,
        score: g.score,
        band: c?.worstMin != null ? commuteBand(c.worstMin) : -1,
        commute: worst ?? NO_COMMUTE,
        worstMin: c?.worstMin ?? null,
        reachable,
        overBudget: inTime && !inBudget,
        // 툴팁용이라 통근권 안인 동만 만든다 (427개 전부 만들 필요 없다)
        reason: reachable
          ? summarize(s, data.pctKeys, g.grade, weights, data.axisWeights)
          : "",
      });
    }
    return map;
  }, [data, graded, commute, maxCommute, weights, budget]);

  /* 통근권 안에서 종합 점수가 높은 순 */
  const picks = useMemo<Pick[]>(() => {
    if (!data || !graded || !commute) return [];
    const out: Pick[] = [];
    for (const dong of data.dongs) {
      const c = commute.byDong.get(dong.code);
      const g = graded.byDong.get(dong.code);
      const s = data.scores.get(dong.code);
      if (!g || !s || c?.worstMin == null || c.worstMin > maxCommute) continue;
      if (!withinBudget(s.raw.monthlyRentMan, budget)) continue;
      out.push({ dong, grade: g.grade, score: g.score, commuteMin: c.worstMin });
    }
    out.sort((a, b) => b.score - a.score);
    return out;
  }, [data, graded, commute, maxCommute, budget]);

  const selected = useMemo(() => {
    if (!data || !graded || !selectedCode) return null;
    const dong = data.dongs.find((d) => d.code === selectedCode);
    const score = data.scores.get(selectedCode);
    const g = graded.byDong.get(selectedCode);
    if (!dong || !score || !g) return null;
    // 경로는 선택된 동 하나만, 목적지별로 되짚는다
    const c = commute?.byDong.get(selectedCode);
    const commutes: CommuteLeg[] =
      commute && c
        ? commute.contexts.map((ctx, i) => ({
            destName: destinations[i]?.name ?? `목적지 ${i + 1}`,
            result: c.per[i],
            route: buildRoute(data.graph, ctx, c.per[i], dong),
          }))
        : [];
    return { dong, score, grade: g.grade, rank: g.rank, total: g.total, commutes };
  }, [data, graded, commute, selectedCode, destinations]);

  /**
   * 선택된 동의 경로를 지도에 그릴 선분들.
   *
   * 지하철과 도보를 구분해서 넘긴다 — MapLibre 의 line-dasharray 는
   * data-driven 이 아니라 한 레이어에서 점선 모양을 나눌 수 없어서,
   * MapView 가 kind 로 레이어를 갈라 그린다.
   */
  const routePath = useMemo<RouteSegment[]>(() => {
    if (!selected) return [];
    return selected.commutes.flatMap((c) =>
      c.route.flatMap((leg): RouteSegment[] => {
        if (leg.kind === "ride") return [{ kind: "ride", coords: leg.path }];
        if (leg.kind === "walk" && leg.path) return [{ kind: "walk", coords: leg.path }];
        return [];
      })
    );
  }, [selected]);

  /*
   * 상태를 URL 에 반영한다. pushState 를 쓰면 슬라이더를 움직일 때마다 히스토리가
   * 쌓여 뒤로가기가 망가지므로 replaceState 를 쓴다.
   */
  useEffect(() => {
    const qs = encodeShareState({
      destinations,
      maxCommute,
      weights,
      budget,
      mapMode,
      showSubway,
      hiddenLines: [...hiddenLines],
    });
    const url = qs ? `${window.location.pathname}?${qs}` : window.location.pathname;
    window.history.replaceState(null, "", url);
  }, [destinations, maxCommute, weights, budget, mapMode, showSubway, hiddenLines]);

  const copyShareLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // 클립보드 권한이 없으면 주소창에 이미 반영돼 있으니 그걸 복사하면 된다
      setCopied(false);
    }
  };

  const setWeight = (key: keyof Weights, value: number) =>
    setWeights((w) => rebalanceWeights(w, key, value));

  /**
   * 표시할 노선 목록. 아무것도 안 껐으면 null 을 넘겨 필터 자체를 걸지 않는다
   * (범례에 없는 비주요 노선까지 상태로 들고 있지 않기 위함).
   */
  const visibleLines = useMemo(() => {
    if (!data || hiddenLines.size === 0) return null;
    const all = new Set(data.graph.nodes.map((n) => n.line));
    return [...all].filter((l) => !hiddenLines.has(l));
  }, [data, hiddenLines]);

  const toggleLine = (line: string) =>
    setHiddenLines((prev) => {
      const next = new Set(prev);
      if (next.has(line)) next.delete(line);
      else next.add(line);
      return next;
    });

  /**
   * 목적지 추가. 상한은 3개 — 그 이상은 max 판정상 조건을 만족하는 동이
   * 사실상 사라져 의미가 없다. 같은 좌표는 중복으로 넣지 않는다.
   */
  const addDestination = (d: Destination) =>
    setDestinations((prev) => {
      if (prev.length >= MAX_DESTINATIONS) return prev;
      if (prev.some((p) => p.lat === d.lat && p.lng === d.lng)) return prev;
      return [...prev, d];
    });

  /** 소개 페이지의 검색에서 목적지를 고르면 곧장 도구로 넘어간다 */
  const startWithDestination = (d: Destination) => {
    addDestination(d);
    setShowLanding(false);
  };

  const removeDestination = (i: number) =>
    setDestinations((prev) => prev.filter((_, j) => j !== i));

  /** 지도의 역을 클릭 → 목적지로 추가 */
  const pickStation = (s: { name: string; lat: number; lng: number }) =>
    addDestination({ name: s.name, address: "지하철역", lat: s.lat, lng: s.lng });

  /*
   * 소개 페이지는 `.app` 그리드(지도 1fr + 사이드바 380px)를 통째로 대체한다.
   * 그 안에 넣으면 380px 칼럼에 갇혀 풀블리드 섹션을 못 만든다.
   * 데이터 로딩(loadAppData)은 그대로 두는 게 낫다 — 소개를 읽는 동안 받아두면
   * 검색 직후 지도가 곧바로 뜬다.
   */
  if (showLanding) {
    return (
      <Landing
        onPick={startWithDestination}
        onSkip={() => setShowLanding(false)}
        theme={theme}
        onToggleTheme={() => setTheme(theme === "dark" ? "light" : "dark")}
      />
    );
  }

  return (
    <div className="app">
      <div className="map-wrap">
        {data && subway ? (
          <>
            <MapView
              dongs={data.dongs}
              views={views}
              destinations={destinations}
              selectedCode={selectedCode}
              onSelect={setSelectedCode}
              hasDestination={destinations.length > 0}
              routePath={routePath}
              subway={subway}
              showSubway={showSubway}
              visibleLines={visibleLines}
              mapMode={mapMode}
              theme={theme}
              onPickStation={pickStation}
            />
            <div className="map-controls">
              <button
                type="button"
                className="map-toggle theme-toggle"
                onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                title={theme === "dark" ? "밝게 보기" : "어둡게 보기"}
              >
                {theme === "dark" ? "☀" : "☾"}
                {theme === "dark" ? "밝게" : "어둡게"}
              </button>
              <label className="map-toggle">
                <input
                  type="checkbox"
                  checked={showSubway}
                  onChange={(e) => setShowSubway(e.target.checked)}
                />
                지하철 노선도
              </label>
              {showSubway && (
                <details className="line-legend">
                  <summary>
                    노선 {hiddenLines.size > 0 && `· ${hiddenLines.size}개 숨김`}
                  </summary>
                  <div className="line-legend-body">
                    {/* 범례를 그대로 토글로 쓴다 — 별도 UI를 만들 필요가 없다 */}
                    {MAIN_LINES.map((l) => (
                      <button
                        key={l}
                        type="button"
                        data-off={hiddenLines.has(l)}
                        onClick={() => toggleLine(l)}
                        title={hiddenLines.has(l) ? "켜기" : "끄기"}
                      >
                        <i style={{ background: LINE_COLOR[l] }} />
                        {lineName(l)}
                      </button>
                    ))}
                  </div>
                  {hiddenLines.size > 0 && (
                    <button
                      type="button"
                      className="legend-reset"
                      onClick={() => setHiddenLines(new Set())}
                    >
                      전부 다시 켜기
                    </button>
                  )}
                </details>
              )}
            </div>
          </>
        ) : (
          <div className="loading">
            {error ? `오류: ${error}` : "지도를 불러오는 중..."}
          </div>
        )}
      </div>

      <aside className="sidebar">
        <div className="brand">
          <h1>I Don&rsquo;t Know Seoul</h1>
          <p>
            회사나 학교를 검색하면, 통근 가능한 동네를 치안·월세·생활편의 등급으로
            한눈에 보여줍니다.
          </p>
        </div>

        <DestinationSearch
          onPick={addDestination}
          disabled={destinations.length >= MAX_DESTINATIONS}
          placeholder={
            destinations.length === 0
              ? "회사나 학교를 검색하세요 (예: 강남역, 서울대학교)"
              : "목적지 추가 (예: 룸메이트 회사)"
          }
        />

        {destinations.length > 0 && (
          <>
            <div className="section">
              <p className="section-title">
                목적지 {destinations.length > 1 && `· 모두 만족하는 지역`}
              </p>
              <ul className="dest-list">
                {destinations.map((d, i) => (
                  <li key={`${d.lat},${d.lng}`}>
                    <span className="dest-name">{d.name}</span>
                    <span className="dest-addr">{d.address}</span>
                    <button
                      type="button"
                      onClick={() => removeDestination(i)}
                      aria-label={`${d.name} 제거`}
                      title="제거"
                    >
                      ✕
                    </button>
                  </li>
                ))}
              </ul>
              {destinations.length < MAX_DESTINATIONS ? (
                <p className="metric-note">
                  검색하거나 지도의 역을 클릭해 목적지를 더할 수 있습니다
                  (최대 {MAX_DESTINATIONS}개).
                </p>
              ) : (
                <p className="metric-note">목적지는 최대 {MAX_DESTINATIONS}개까지입니다.</p>
              )}
            </div>

            <div className="section">
              <p className="section-title">조건</p>
              <div className="slider-row">
                <label htmlFor="commute">통근</label>
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
              <div className="slider-row">
                <label htmlFor="budget">월세</label>
                <input
                  id="budget"
                  type="range"
                  min={BUDGET_MIN}
                  max={BUDGET_OFF}
                  step={5}
                  value={budget}
                  onChange={(e) => setBudget(Number(e.target.value))}
                />
                <output>{budget >= BUDGET_OFF ? "제한 없음" : `${budget}만원`}</output>
              </div>
              {budget < BUDGET_OFF && (
                <p className="metric-note">
                  환산월세(보증금을 월세로 환산한 값) 기준입니다. 단독·다가구·오피스텔·
                  소형아파트 실거래를 포함합니다. 표본이 없는 동은 거르지 않습니다.
                </p>
              )}
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
              <div className="mode-switch" role="group" aria-label="지도 색 기준">
                {(
                  [
                    ["grade", "등급"],
                    ["commute", "통근시간"],
                  ] as const
                ).map(([m, label]) => (
                  <button
                    key={m}
                    type="button"
                    data-active={mapMode === m}
                    onClick={() => setMapMode(m)}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {mapMode === "grade" ? (
                <>
                  <div className="legend">
                    {(["best", "normal", "bad"] as const).map((g) => (
                      <span key={g}>
                        <i className={`grade-dot ${g}`} />
                        {GRADE_LABEL[g]}
                      </span>
                    ))}
                  </div>
                  <p className="metric-note" style={{ marginTop: 8 }}>
                    등급은 서울 전체 분포 기준 상대 평가입니다 — 상위 30%가 Best,
                    하위 30%가 Bad입니다.
                  </p>
                </>
              ) : (
                <>
                  <div className="legend">
                    {COMMUTE_BANDS.map((b) => (
                      <span key={b.label}>
                        <i
                          className="grade-dot"
                          style={{ background: b.color }}
                        />
                        {b.label}
                      </span>
                    ))}
                  </div>
                  <p className="metric-note" style={{ marginTop: 8 }}>
                    목적지가 여럿이면 <b>가장 오래 걸리는 쪽</b> 기준입니다.
                  </p>
                </>
              )}
            </div>

            <div className="section share-row">
              <button type="button" className="share-btn" onClick={copyShareLink}>
                {copied ? "링크가 복사됐습니다" : "이 결과 링크 복사"}
              </button>
              <p className="metric-note">
                목적지·조건·가중치가 주소에 담깁니다. 받은 사람은 같은 화면을 그대로 봅니다.
              </p>
            </div>

            <TopPicks picks={picks} selectedCode={selectedCode} onSelect={setSelectedCode} />
          </>
        )}

        {destinations.length === 0 && (
          <div className="empty">
            먼저 목적지를 정해주세요.
            <br />
            출근할 회사나 등교할 학교를 검색하면
            <br />
            통근 가능한 지역이 지도에 나타납니다.
          </div>
        )}

        {selected && explainCtx && (
          <DongDetail
            dong={selected.dong}
            score={selected.score}
            grade={selected.grade}
            rank={selected.rank}
            total={selected.total}
            commutes={selected.commutes}
            ctx={explainCtx}
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
