import { useEffect, useRef, useState, type ReactNode } from "react";
import "./Landing.css";
import DestinationSearch from "./DestinationSearch";
import WeightPlayground from "./WeightPlayground";
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
        <HeroImage priority />
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
            서버에 아무것도 저장하지 않습니다
          </p>
        </div>

        <div className="scroll-cue" aria-hidden="true">
          <span />
        </div>
      </header>

      <StatBand />

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

        {/* ---------------- 실제 화면 ---------------- */}
        <Reveal>
          <section className="landing-section">
            <h2>이게 실제 화면입니다</h2>
            <p className="landing-note">
              합성이나 컨셉 이미지가 아니라, 강남역을 목적지로 두고 실행한
              화면을 그대로 찍은 것입니다.
            </p>

            <figure className="app-shot">
              <div className="app-shot-frame">
                <picture>
                  <source
                    type="image/webp"
                    srcSet="/shots/app-full-sm.webp 1200w, /shots/app-full.webp 2200w"
                    sizes="(max-width: 880px) 100vw, min(1180px, 100vw - 40px)"
                  />
                  <img
                    src="/shots/app-full.jpg"
                    alt="강남역을 목적지로 둔 실행 화면. 서울 지도가 초록·노랑·빨강으로 칠해져 있고 오른쪽에 조건·가중치 패널과 추천 동네 목록이 있다."
                    width={2200}
                    height={1095}
                    loading="lazy"
                    decoding="async"
                  />
                </picture>

                {/*
                  마커는 번호만 찍고 설명은 아래 목록에 둔다. 라벨을 이미지에
                  직접 붙이면 좁은 화면에서 서로 겹치거나 프레임 밖으로
                  넘치는데, 번호 점만 있으면 어느 폭에서도 안 깨진다.
                */}
                {SHOT_MARKS.map((m, i) => (
                  <span
                    key={m.title}
                    className="app-mark"
                    style={{ left: `${m.x}%`, top: `${m.y}%` }}
                    aria-hidden="true"
                  >
                    {i + 1}
                  </span>
                ))}
              </div>
            </figure>

            <ol className="app-mark-list" data-stagger>
              {SHOT_MARKS.map((m, i) => (
                <li key={m.title}>
                  <span className="app-mark-no">{i + 1}</span>
                  <div>
                    <b>{m.title}</b>
                    <span>{m.body}</span>
                  </div>
                </li>
              ))}
            </ol>
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
              {MODE_SHOTS.map((s) => (
                <picture key={s.mode}>
                  <source
                    type="image/webp"
                    srcSet={`/shots/mode-${s.mode}-sm.webp 1000w, /shots/mode-${s.mode}.webp 1800w`}
                    sizes="(max-width: 880px) calc(100vw - 40px), 840px"
                  />
                  <img
                    src={`/shots/mode-${s.mode}.jpg`}
                    alt={s.alt}
                    data-on={mode === s.mode}
                    loading="lazy"
                    decoding="async"
                    width={1800}
                    height={1350}
                  />
                </picture>
              ))}
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
                  <b style={{ color: GRADE_COLOR.normal }}>69</b>
                </div>
                <div className="bar">
                  <div style={{ width: "68.8%", background: GRADE_COLOR.normal }} />
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
                  <div className="formula">치안 68.8 = 66×0.38 + 86×0.46 + 24×0.15</div>
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
                서울 427개 동 중 <b>48위</b> · 상위 11%
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
              없습니다. 아래에서 직접 옮겨보세요.
            </p>

            <WeightPlayground />

            <p className="landing-note">
              여기 쓰인 점수는 예시가 아니라 <b>실제 산출물</b>입니다. 계산도
              앱과 같은 코드를 씁니다 — 슬라이더를 끝까지 밀면 1등이 바뀌는데,
              그게 이 도구가 하는 일의 전부입니다.
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
                <b>146</b>
                <span>강남역만</span>
              </div>
              <div className="count-arrow" aria-hidden="true">
                →
              </div>
              <div className="count-box narrowed">
                <b>76</b>
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
        <HeroImage className="cta-bg" />
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
        경계 © 통계청 SGIS · 지하철·버스 정류장 © OpenStreetMap contributors ·
        상가업소 © 소상공인시장진흥공단 · 월세 © 국토교통부 실거래가
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */

/**
 * 히어로·마무리 CTA 의 배경 지도.
 *
 * CSS `background-image` 가 아니라 **진짜 `<img>`** 를 쓴다. 배경으로 두면
 * 브라우저가 화면 폭에 맞는 파일을 고를 수단이 없어서, 휴대폰에도 2000px
 * 짜리를 그대로 내려받게 된다. `srcset` 을 쓰려면 이미지여야 한다.
 *
 * 히어로 배경은 첫 화면에서 가장 큰 요소(LCP)라 `fetchpriority="high"` 로
 * 우선순위를 올린다. 반대로 CTA 쪽은 스크롤을 한참 내려야 나오므로
 * `loading="lazy"` 로 미룬다.
 *
 * **3200px 짜리를 두는 이유.** 이 사진은 화면 전체를 덮으므로 필요한
 * 픽셀이 `뷰포트 폭 × dpr` 이다. QHD(2560) 에 dpr 2 면 5120px 이라,
 * 2000px 만 두면 2.5배로 늘어나 눈에 띄게 뭉갠다. 원본을 MapLibre 캔버스에서
 * 4096px 로 뽑아 3200px 까지 만들어 뒀다.
 *
 * alt 를 비워둔 건 장식이기 때문이다 — 이 사진이 전하는 내용은 바로 옆
 * h1 과 등급 범례가 글로 이미 말하고 있어서, 읽어주면 중복이 된다.
 */
function HeroImage({
  priority = false,
  className = "",
}: {
  priority?: boolean;
  className?: string;
}) {
  return (
    <div className={`hero-bg ${className}`.trim()}>
      <picture>
        <source
          type="image/webp"
          srcSet="/shots/hero-map-sm.webp 1200w, /shots/hero-map.webp 2000w, /shots/hero-map-xl.webp 3200w"
          sizes="100vw"
        />
        {/* webp 를 못 읽는 브라우저용 폴백. 폴백이므로 해상도를 낮게 잡았다 */}
        <img
          src="/shots/hero-map.jpg"
          alt=""
          width={3200}
          height={1866}
          decoding="async"
          loading={priority ? "eager" : "lazy"}
          fetchPriority={priority ? "high" : "low"}
        />
      </picture>
    </div>
  );
}

/**
 * 히어로 바로 아래 숫자 띠.
 *
 * 원래 이 수치들은 히어로 맨 아래 11.5px 회색 한 줄에 묻혀 있었다.
 * 그런데 "외부 길찾기 API 호출 0회"는 이 서비스에서 가장 설명하기 어려운
 * 동시에 가장 내세울 만한 사실이다 — 통근시간을 직접 계산하기 때문에
 * 무료로 돌아가고, 조건을 바꿔도 즉시 다시 계산된다. 작게 흘리면 아무도
 * 안 읽는다.
 */
function StatBand() {
  return (
    <div className="stat-band">
      <dl className="stat-band-inner">
        {STATS.map((s) => (
          <div className="stat" key={s.label}>
            <dt>
              <CountUp to={s.value} />
              <i>{s.unit}</i>
            </dt>
            <dd>{s.label}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/**
 * 화면에 들어오면 0 에서 목표값까지 세어 올린다.
 *
 * `prefers-reduced-motion` 이면 세지 않고 바로 최종값을 쓴다. 그리고
 * 애니메이션 여부와 무관하게 **최종값은 항상 DOM 에 있다** — 중간값이
 * 스크린리더로 계속 읽히지 않도록 aria-hidden 으로 가리고, 실제로 읽히는
 * 값은 따로 둔다.
 */
function CountUp({ to, ms = 1100 }: { to: number; ms?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [n, setN] = useState(to);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const still =
      typeof matchMedia === "undefined" ||
      matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (still || typeof IntersectionObserver === "undefined" || to === 0) return;

    setN(0);
    let raf = 0;
    const io = new IntersectionObserver(
      ([e]) => {
        if (!e.isIntersecting) return;
        io.disconnect();
        const t0 = performance.now();
        const tick = (t: number) => {
          const p = Math.min(1, (t - t0) / ms);
          // ease-out — 끝에서 천천히 멈춰야 숫자가 또렷하게 읽힌다
          setN(Math.round(to * (1 - Math.pow(1 - p, 3))));
          if (p < 1) raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
      },
      { rootMargin: "0px 0px -10% 0px" }
    );
    io.observe(el);
    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [to, ms]);

  return (
    <span ref={ref}>
      <span aria-hidden="true">{n.toLocaleString("ko-KR")}</span>
      <span className="sr-only">{to.toLocaleString("ko-KR")}</span>
    </span>
  );
}

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
 * (public/data/bundle.json 에 explainAxis/summarize/gradeAll/buildRoute 를
 * 그대로 돌려 뽑았다). 지어낸 값이 아니다.
 *
 * **데이터를 갱신하면 반드시 다시 뽑아야 한다.** 실제로 유흥업소 지표를
 * OSM 에서 소상공인 분류로 바꿨을 때 이 값들이 통째로 낡았었다 —
 * 치안 58.7→68.8, 유흥업소 백분위 40→66, 통근권 138→146 개.
 * 화면에는 그럴듯한 숫자가 그대로 떠 있어서 눈으로는 안 잡힌다.
 */
const WHY_ROWS = [
  {
    label: "유흥업소 밀도",
    value: "0.61개/km²",
    median: "1.81개/km²",
    rank: "상위 34%",
    point: 66,
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

/*
 * 앱은 구간마다 반올림하고 0분이 된 구간은 지운다(DongDetail 의 filter).
 * 그래서 마지막 "목적지까지 도보"(0.0분)는 여기서도 없다 — 넣으면 실제
 * 화면에 없는 줄이 소개에만 생긴다.
 *
 * 구간 합(30분)이 머리의 31분과 1분 다른 건 반올림 때문이고 앱도 똑같다.
 * 실제 합은 8.03 + 3 + 13.25 + 5 + 1.41 = 30.69 분이다.
 */
const ROUTE_LEGS = [
  { kind: "walk", min: 8, text: "노들역까지 도보" },
  { kind: "wait", min: 3, text: "승차 대기" },
  { kind: "ride", min: 13, text: "9호선 7정거장 · 노들 → 신논현" },
  { kind: "transfer", min: 5, text: "신논현역 환승 · 9호선 → 신분당선" },
  { kind: "ride", min: 1, text: "신분당선 1정거장 · 신논현 → 강남" },
];

/*
 * 지도 색 기준 두 가지를 보여주는 스크린샷 한 쌍.
 *
 * **같은 화면에서 mode 만 바꿔 찍은 것**이라 프레이밍이 정확히 겹친다.
 * 전환할 때 지도가 흔들리지 않고 색만 바뀌어야 두 모드의 차이가 보인다.
 * (강남역 목적지 · 통근 45분 · 가중치 35/30/35 기준)
 */
const MODE_SHOTS = [
  { mode: "grade", alt: "등급 모드 — 초록·노랑·빨강으로 칠해진 서울 지도" },
  { mode: "commute", alt: "통근시간 모드 — 강남역에서 멀어질수록 옅어지는 파랑 지도" },
] as const;

/*
 * 히어로 아래 숫자 띠.
 *
 * 427·623·9 는 파이프라인 산출물과 대조한 값이다(bundle.json 의 dongs
 * 427개, graph.stations 623개, meta.availableMetrics 9개). 데이터가 바뀌면
 * 같이 고쳐야 한다.
 *
 * "0" 은 계산이 아니라 설계다. 목적지 하나를 잡으면 427개 동의 통근시간이
 * 전부 필요한데, 길찾기 API 로 하면 요청 한 번에 427콜이라 무료 한도로는
 * 하루 두 명도 못 받는다. 그래서 지하철 그래프를 직접 들고 브라우저에서
 * 탐색한다.
 */
const STATS = [
  { value: 427, unit: "개", label: "행정동을 전부 등급화" },
  { value: 623, unit: "역", label: "지하철 21개 노선" },
  { value: 9, unit: "개", label: "등급에 쓰는 공공데이터 지표" },
  { value: 0, unit: "회", label: "외부 길찾기 API 호출" },
];

/*
 * 실행 화면(public/shots/app-full.*) 위에 찍는 번호 마커.
 * x·y 는 이미지 박스 기준 백분율이라 어느 폭에서도 같은 지점을 가리킨다.
 * 이미지를 새로 찍으면 좌표도 다시 잡아야 한다.
 */
const SHOT_MARKS = [
  {
    x: 88,
    y: 6,
    title: "목적지",
    body: "회사·학교를 검색하거나 지도의 역을 눌러 넣습니다. 최대 3곳.",
  },
  {
    x: 88,
    y: 29,
    title: "조건과 가중치",
    body: "통근 한계·월세 상한을 정하고, 무엇을 중요하게 볼지 비중을 옮깁니다.",
  },
  {
    x: 57,
    y: 26,
    title: "등급 아이콘",
    body: "행정동마다 Best·Normal·Bad 를 점으로 찍습니다. 조건을 바꾸면 즉시 다시 칠해집니다.",
  },
  {
    x: 43.5,
    y: 62,
    title: "통근 경로",
    body: "고른 동네에서 목적지까지 실제로 어떤 경로인지 점선으로 그립니다.",
  },
  {
    x: 20,
    y: 58,
    title: "지하철 노선도",
    body: "623개 역과 21개 노선을 깔아둡니다. 노선별로 끄고 켤 수 있습니다.",
  },
  {
    x: 95,
    y: 55,
    title: "추천 목록",
    body: "조건을 만족하는 동네를 점수 순으로 세웁니다. 누르면 상세가 열립니다.",
  },
];

/* README 상단의 기능 목록을 그대로 옮긴 것 */
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
