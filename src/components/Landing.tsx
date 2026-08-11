import { useEffect, useRef, useState, type ReactNode } from "react";
import DestinationSearch from "./DestinationSearch";
import type { Theme } from "./MapView";
import type { Destination } from "../types";
import {
  COMMUTE_BANDS,
  DEFAULT_WEIGHTS,
  GRADE_COLOR,
  GRADE_CUT,
  GRADE_LABEL,
} from "../lib/constants";

interface Props {
  /** 목적지를 고르면 곧장 도구로 넘어간다 */
  onPick: (dest: Destination) => void;
  /** 목적지 없이 지도부터 보고 싶은 사람 */
  onSkip: () => void;
  theme: Theme;
  onToggleTheme: () => void;
}

/**
 * 첫 방문자를 위한 소개 페이지.
 *
 * 설명을 글로 늘어놓는 대신 **실제 화면**을 앞세운다. 이 서비스의 설득력은
 * "지도가 색으로 칠해진다"와 "계산 과정이 다 보인다"인데, 둘 다 글보다
 * 그림이 훨씬 빠르다.
 *
 * 화면을 두 방식으로 나눠 담았다:
 *   - 지도는 `public/shots/` 의 스크린샷. MapLibre 가 WebGL 캔버스로 그려서
 *     벡터로는 못 뽑는다. 실행 중인 앱을 찍은 것이고 합성이 아니다.
 *   - 계산 과정·통근 경로 패널은 **실제 마크업**(.panel-mock). 작은 글씨가
 *     많아 이미지로 넣으면 고해상도 화면에서 뭉개지고, 테마 전환도 못 따라온다.
 *     앱과 같은 클래스를 쓰므로 둘 다 공짜로 해결된다.
 *
 * 문구는 README 에서 옮겨왔다. 수치(가중치 40/35/25, 등급 컷 30%)는 문장에
 * 박지 않고 constants 에서 계산한다 — 상수를 바꿨는데 소개만 옛말을 하는
 * 사고를 막는다.
 *
 * 테마 토글을 여기에 또 두는 이유: 원래 토글은 `.map-controls` 안, 즉 지도
 * 위에 있는데 소개 페이지에는 지도가 없어서 그대로면 토글이 사라진다.
 */
export default function Landing({ onPick, onSkip, theme, onToggleTheme }: Props) {
  const pct = (v: number) => Math.round(v * 100);
  const [mode, setMode] = useState<"grade" | "commute">("grade");

  return (
    <div className="landing">
      {/* ---------------- 히어로 ---------------- */}
      <header className="hero">
        <div className="hero-bg" />
        <div className="hero-scrim" />

        <div className="hero-nav">
          <span className="landing-mark">I Don&rsquo;t Know Seoul</span>
          <button
            type="button"
            className="hero-theme"
            onClick={onToggleTheme}
            title={theme === "dark" ? "밝게 보기" : "어둡게 보기"}
          >
            {theme === "dark" ? "☀ 밝게" : "☾ 어둡게"}
          </button>
        </div>

        <div className="hero-body">
          <div className="hero-legend">
            {(["best", "normal", "bad"] as const).map((g) => (
              <span key={g}>
                <i className={`grade-dot ${g}`} />
                {GRADE_LABEL[g]}
              </span>
            ))}
          </div>

          <h1>
            어디 살아야<br />할지 모르겠다면
          </h1>
          <p className="hero-lead">
            회사나 학교를 검색하면, 통근 가능한 서울 동네가
            <br />
            평판 등급으로 칠해진 지도가 나옵니다.
          </p>

          <div className="hero-search">
            <DestinationSearch onPick={onPick} />
          </div>

          <button type="button" className="link-btn" onClick={onSkip}>
            목적지 없이 지도부터 볼게요
          </button>

          <p className="hero-stats">
            행정동 427개 · 지하철 623역 · 외부 길찾기 API 호출 0회 · 서버에
            아무것도 저장하지 않습니다
          </p>
        </div>

        <div className="scroll-cue" aria-hidden="true">
          <span />
        </div>
      </header>

      <div className="landing-inner">
        {/* ---------------- 기능 ---------------- */}
        <Reveal>
          <section className="landing-section">
            <h2>무엇을 해주는가</h2>
            <div className="feature-grid" data-stagger>
              {FEATURES.map((f) => (
                <div className="feature" key={f.title}>
                  <b>{f.title}</b>
                  <span>{f.body}</span>
                </div>
              ))}
            </div>
          </section>
        </Reveal>

        {/* ---------------- 지도 두 모드 ---------------- */}
        <Reveal>
          <section className="landing-section">
            <h2>지도를 두 가지로 봅니다</h2>

            <div className="mode-switch shot-switch">
              <button
                type="button"
                data-active={mode === "grade"}
                onClick={() => setMode("grade")}
              >
                등급
              </button>
              <button
                type="button"
                data-active={mode === "commute"}
                onClick={() => setMode("commute")}
              >
                통근시간
              </button>
            </div>

            <div className="shot-stack">
              <img
                src="/shots/mode-grade.jpg"
                alt="등급 모드 — 초록·노랑·빨강으로 칠해진 서울 지도"
                data-on={mode === "grade"}
                loading="lazy"
                width={1010}
                height={758}
              />
              <img
                src="/shots/mode-commute.jpg"
                alt="통근시간 모드 — 파랑 농담으로 칠해진 서울 지도"
                data-on={mode === "commute"}
                loading="lazy"
                width={1010}
                height={758}
              />
            </div>

            <div className="legend shot-legend">
              {mode === "grade"
                ? (["best", "normal", "bad"] as const).map((g) => (
                    <span key={g}>
                      <i className={`grade-dot ${g}`} />
                      {GRADE_LABEL[g]}
                    </span>
                  ))
                : COMMUTE_BANDS.map((b) => (
                    <span key={b.label}>
                      <i className="grade-dot" style={{ background: b.color }} />
                      {b.label}
                    </span>
                  ))}
            </div>

            <p className="landing-note">
              두 모드의 색 계열을 다르게 둔 이유는, 같은 계열이면 &ldquo;빨간
              동네가 나쁜 건지 먼 건지&rdquo; 구분이 안 되기 때문입니다.
            </p>
          </section>
        </Reveal>

        {/* ---------------- 근거 공개 ---------------- */}
        <Reveal>
          <section className="landing-section split" data-stagger>
            <div className="split-text">
              <h2>왜 그 등급인지 전부 보여줍니다</h2>
              <p className="landing-note">
                점수만 던지지 않습니다. 원지표가 서울 중앙값 대비 어디쯤인지,
                백분위가 몇 점인지, 가중치가 얼마인지, 그게 어떻게 합산됐는지
                마지막 덧셈까지 펼쳐서 보여줍니다.
              </p>
              <p className="landing-note">
                <b>믿으라고 하지 않고, 검산할 수 있게 둡니다.</b>
              </p>
            </div>
            {/*
              스크린샷이 아니라 실제 마크업이다. 앱과 같은 클래스를 써서
              테마 전환이 따라오고, 어느 해상도에서도 흐려지지 않는다.
              수치는 강남역 기준 노량진1동의 실제 산출물이다.
            */}
            <div className="panel-mock">
              <div className="metric">
                <div className="metric-head">
                  <span>치안</span>
                  <b style={{ color: GRADE_COLOR.normal }}>59</b>
                </div>
                <div className="bar">
                  <div style={{ width: "58.7%", background: GRADE_COLOR.normal }} />
                </div>
                <div className="why-mock">
                  <span className="why-summary">▾ 계산 과정</span>
                  {WHY_ROWS.map((r) => (
                    <div className="metric-row" key={r.label}>
                      <div className="metric-row-head">
                        <span>{r.label}</span>
                        <b>{r.value}</b>
                      </div>
                      <div className="metric-row-note">
                        서울 중앙값 {r.median} · 이 동은 {r.rank} <b>({r.point}점)</b> ·
                        가중치 {r.weight}
                      </div>
                    </div>
                  ))}
                  <div className="formula">치안 58.7 = 40×0.38 + 86×0.46 + 24×0.15</div>
                </div>
              </div>
            </div>
          </section>
        </Reveal>

        {/* ---------------- 통근 경로 ---------------- */}
        <Reveal>
          <section className="landing-section split reverse" data-stagger>
            <div className="split-text">
              <h2>통근시간을 직접 계산합니다</h2>
              <p className="landing-note">
                외부 길찾기 API를 부르지 않습니다. 지하철 그래프를 브라우저에서
                직접 탐색하기 때문에, 조건을 바꿔도 네트워크 왕복 없이 즉시
                다시 계산됩니다.
              </p>
              <p className="landing-note">
                몇 분이 걸리는지만이 아니라 <b>어느 역에서 타고 어디서
                갈아타는지</b>까지 구간별로 나옵니다.
              </p>
            </div>
            <div className="panel-mock">
              <div className="detail-head">
                <h3>동작구 노량진1동</h3>
                <span className="badge">
                  <i className="grade-dot best" />
                  {GRADE_LABEL.best}
                </span>
              </div>
              <p className="rank-line">
                서울 427개 동 중 <b>25위</b> · 상위 6%
              </p>
              <p className="summary">
                월세가 60만원으로 싸고 범죄는 적지만, 교통사고 다발지점이 많습니다.
              </p>
              <div className="route-total">
                <b>31분</b>
                <span>환승 1회</span>
              </div>
              <ol className="route-legs">
                {ROUTE_LEGS.map((l, i) => (
                  <li key={i} className={`leg leg-${l.kind}`}>
                    <span className="leg-time">{l.min}분</span>
                    <span className="leg-text">{l.text}</span>
                  </li>
                ))}
              </ol>
            </div>
          </section>
        </Reveal>

        {/* ---------------- 기준 ---------------- */}
        <Reveal>
          <section className="landing-section">
            <h2>무엇을 보고 매기는가</h2>

            <table className="axis-table">
              <thead>
                <tr>
                  <th>축</th>
                  <th>무엇을 보는가</th>
                  <th>기본</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>치안</td>
                  <td>유흥업소 밀도, 5대범죄(자치구), 교통사고 다발지역</td>
                  <td>{pct(DEFAULT_WEIGHTS.safety)}%</td>
                </tr>
                <tr>
                  <td>가격</td>
                  <td>환산월세 중앙값 (단독·다가구·오피스텔·소형아파트)</td>
                  <td>{pct(DEFAULT_WEIGHTS.price)}%</td>
                </tr>
                <tr>
                  <td>생활편의</td>
                  <td>편의점·마트, 음식점, 병원·약국, 교통 접근성</td>
                  <td>{pct(DEFAULT_WEIGHTS.convenience)}%</td>
                </tr>
              </tbody>
            </table>

            <p className="landing-note">
              이 비중은 <b>슬라이더로 직접 바꿉니다.</b> 월세가 제일 중요한
              사람과 조용한 동네가 제일 중요한 사람에게 같은 순위를 강요할 근거가
              없습니다.
            </p>

            <p className="summary">
              등급은 절대 평가가 아니라 서울 안에서의 상대 평가입니다. 상위{" "}
              {pct(GRADE_CUT.best)}%가 Best, 하위 {pct(1 - GRADE_CUT.normal)}%가
              Bad입니다. &ldquo;Bad&rdquo;는 살 수 없는 동네라는 뜻이 아니라,
              같은 조건에서 비교했을 때 서울 하위권이라는 뜻입니다.
            </p>
          </section>
        </Reveal>

        {/* ---------------- 다중 목적지 ---------------- */}
        <Reveal>
          <section className="landing-section">
            <h2>둘 다 가까운 동네도 찾습니다</h2>
            <p className="landing-note">
              커플이 각자 다른 회사에 다니거나 회사 + 학원처럼,{" "}
              <b>&ldquo;둘 다 40분 이내인 동네&rdquo;</b>를 찾는 건 흔한
              니즈입니다. 목적지를 최대 3곳까지 더하면 모두 만족하는 지역만
              남습니다.
            </p>
            <div className="count-compare" data-stagger>
              <div className="count-box">
                <b>138</b>
                <span>강남역만</span>
              </div>
              <div className="count-arrow" aria-hidden="true">
                →
              </div>
              <div className="count-box narrowed">
                <b>73</b>
                <span>강남역 + 여의도역</span>
              </div>
            </div>
            <p className="landing-note">
              판정은 가장 오래 걸리는 쪽 기준입니다. 평균이나 합을 쓰면
              &ldquo;한 명은 20분, 다른 한 명은 90분&rdquo;인 동네가
              통과해버립니다.
            </p>
          </section>
        </Reveal>
      </div>

      {/* ---------------- 마무리 ---------------- */}
      <section className="landing-cta">
        <div className="hero-bg cta-bg" />
        <div className="hero-scrim" />
        <div className="cta-body">
          <h2>어디로 출근하세요?</h2>
          <div className="hero-search">
            <DestinationSearch onPick={onPick} />
          </div>
        </div>
      </section>

      <p className="disclaimer landing-foot">
        등급은 공공·공개 데이터로 계산한 <b>서울 내 상대 평가</b>이며, 특정
        지역에 대한 가치판단이 아닙니다. 통근시간은 지하철 기준 추정치로 실제
        소요시간과 다를 수 있습니다.
        <br />
        경계 © 통계청 SGIS · 지하철·POI © OpenStreetMap contributors · 월세 ©
        국토교통부 실거래가
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */

/**
 * 스크롤해서 화면에 들어오면 한 번 나타난다.
 *
 * 한 번 보이면 관찰을 끊는다 — 위아래로 스크롤할 때마다 다시 사라졌다
 * 나타나면 읽는 데 방해가 된다. `prefers-reduced-motion` 은 CSS 쪽에서
 * 전환을 죽이므로 여기서는 클래스만 붙인다.
 */
function Reveal({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // IntersectionObserver 가 없는 환경(구형 브라우저)에서는 그냥 보여준다
    if (typeof IntersectionObserver === "undefined") {
      setShown(true);
      return;
    }
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setShown(true);
          io.disconnect();
        }
      },
      { rootMargin: "0px 0px -12% 0px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div ref={ref} className="reveal" data-shown={shown}>
      {children}
    </div>
  );
}

/*
 * 아래 수치는 전부 목적지를 강남역으로 뒀을 때의 실제 산출물이다
 * (public/data/bundle.json 에 computeMultiCommute/buildRoute/summarize 를
 * 돌려 뽑았다). 지어낸 값이 아니며, 데이터를 갱신하면 다시 뽑아야 한다.
 */
const WHY_ROWS = [
  {
    label: "유흥업소 밀도",
    value: "1.23개/km²",
    median: "0.36개/km²",
    rank: "하위 40%",
    point: 40,
    weight: "0.38",
  },
  {
    label: "5대범죄",
    value: "6.6건/천명",
    median: "8.4건/천명",
    rank: "상위 14%",
    point: 86,
    weight: "0.46",
  },
  {
    label: "교통사고 다발지역",
    value: "63.9건/km²",
    median: "29.7건/km²",
    rank: "하위 24%",
    point: 24,
    weight: "0.15",
  },
];

const ROUTE_LEGS = [
  { kind: "walk", min: 7, text: "노들역까지 도보" },
  { kind: "wait", min: 3, text: "승차 대기" },
  { kind: "ride", min: 13, text: "9호선 7정거장 · 노들 → 신논현" },
  { kind: "transfer", min: 5, text: "신논현역 환승 · 9호선 → 신분당선" },
  { kind: "ride", min: 1, text: "신분당선 1정거장 · 신논현 → 강남" },
  { kind: "walk", min: 1, text: "목적지까지 도보" },
];

/* README 8-15행의 기능 목록을 그대로 옮긴 것 */
const FEATURES = [
  {
    title: "427개 행정동 등급화",
    body: "서울 전체를 Best / Normal / Bad 로 나눕니다.",
  },
  {
    title: "가중치 조절",
    body: "치안·가격·생활편의 비중을 옮기면 즉시 재계산됩니다.",
  },
  {
    title: "목적지 여러 개",
    body: "“우리 둘 다 40분 이내인 동네” — 최대 3곳까지.",
  },
  {
    title: "예산 필터",
    body: "월세 상한을 넘는 동네를 지도에서 걸러냅니다.",
  },
  {
    title: "지하철 노선도",
    body: "623개 역, 21개 노선 오버레이 — 노선별로 켜고 끕니다.",
  },
  {
    title: "링크 공유",
    body: "찾은 결과를 그대로 링크로 보냅니다. 다크/라이트 지원.",
  },
];
