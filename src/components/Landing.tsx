import { useEffect, useRef, useState, type ReactNode } from "react";
import "./Landing.css";
import DestinationSearch from "./DestinationSearch";
import SearchGuide from "./SearchGuide";
import WeightPlayground from "./WeightPlayground";
import type { Theme } from "./MapView";
import type { Destination } from "../types";
import type { LandingVariant } from "../lib/landingVariants";
import type { GeographicSuggestion } from "../lib/geographicNames";
import { LocaleSwitcher, useI18n } from "../lib/i18n";
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
  variant: LandingVariant;
  geographicSuggestions: GeographicSuggestion[];
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
export default function Landing({
  onPick,
  onSkip,
  theme,
  onToggleTheme,
  variant,
  geographicSuggestions,
}: Props) {
  const { locale, tr, minutes, rent, number } = useI18n();
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
          <div className="hero-actions">
            <LocaleSwitcher />
            <button
              type="button"
              className="hero-theme"
              onClick={onToggleTheme}
              title={theme === "dark" ? tr("밝게 보기") : tr("어둡게 보기")}
              aria-label={theme === "dark" ? tr("밝게 보기") : tr("어둡게 보기")}
            >
              <span aria-hidden="true">{theme === "dark" ? "☀" : "☾"}</span>{" "}
              <span className="hero-theme-label">
                {theme === "dark" ? tr("밝게") : tr("어둡게")}
              </span>
            </button>
          </div>
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
            {variant.heroTitle[0]}
            <br />
            {variant.heroTitle[1]}
          </h1>
          <p className="hero-lead">
            {variant.heroLead[0]}
            <br />
            {variant.heroLead[1]}
          </p>

          <div className="hero-search">
            <DestinationSearch
              onPick={onPick}
              geographicSuggestions={geographicSuggestions}
            />
          </div>

          <button type="button" className="link-btn" onClick={onSkip}>
            {tr("목적지 없이 지도부터 볼게요")}
          </button>

          <p className="hero-stats">{tr("서버에 아무것도 저장하지 않습니다")}</p>
        </div>

        <div className="scroll-cue" aria-hidden="true">
          <span />
        </div>
      </header>

      <StatBand />

      <div className="landing-inner">
        <Reveal>
          <SearchGuide variant={variant} />
        </Reveal>

        {/* ---------------- 기능 ---------------- */}
        <Reveal>
          <section className="landing-section">
            <h2>{tr("무엇을 해주는가")}</h2>
            <div className="feature-grid" data-stagger>
              {FEATURES.map((f) => (
                <div className="feature" key={f.title}>
                  <b>{tr(f.title)}</b>
                  <span>{tr(f.body)}</span>
                </div>
              ))}
            </div>
          </section>
        </Reveal>

        {/* ---------------- 실제 화면 ---------------- */}
        <Reveal>
          <section className="landing-section">
            <h2>{tr("이게 실제 화면입니다")}</h2>
            <p className="landing-note">
              {tr("합성이나 컨셉 이미지가 아니라, 강남역을 목적지로 두고 실행한 화면을 그대로 찍은 것입니다.")}
            </p>

            <figure className="app-shot">
              <div className="app-shot-frame">
                <picture>
                  <source
                    type="image/webp"
                    srcSet={`${shotPath("app-full-sm.webp", locale)} 1200w, ${shotPath("app-full.webp", locale)} 2200w`}
                    sizes="(max-width: 880px) 100vw, min(1180px, 100vw - 40px)"
                  />
                  <img
                    src={shotPath("app-full.jpg", locale)}
                    alt={tr("강남역을 목적지로 둔 실행 화면. 서울 지도가 초록·노랑·빨강으로 칠해져 있고 오른쪽에 조건·가중치 패널과 추천 동네 목록이 있다.")}
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
                    <b>{tr(m.title)}</b>
                    <span>{tr(m.body)}</span>
                  </div>
                </li>
              ))}
            </ol>
          </section>
        </Reveal>

        {/* ---------------- 지도 두 모드 ---------------- */}
        <Reveal>
          <section className="landing-section">
            <h2>{tr("지도를 두 가지로 봅니다")}</h2>

            <div className="mode-switch shot-switch">
              <button
                type="button"
                data-active={mode === "grade"}
                onClick={() => setMode("grade")}
              >
                {tr("등급")}
              </button>
              <button
                type="button"
                data-active={mode === "commute"}
                onClick={() => setMode("commute")}
              >
                {tr("통근시간")}
              </button>
            </div>

            <div className="shot-stack">
              {MODE_SHOTS.map((s) => (
                <picture key={s.mode}>
                  <source
                    type="image/webp"
                    srcSet={`${shotPath(`mode-${s.mode}-sm.webp`, locale)} 1000w, ${shotPath(`mode-${s.mode}.webp`, locale)} 1800w`}
                    sizes="(max-width: 880px) calc(100vw - 40px), 840px"
                  />
                  <img
                    src={shotPath(`mode-${s.mode}.jpg`, locale)}
                    alt={tr(s.alt)}
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
                      {tr(b.label)}
                    </span>
                  ))}
            </div>

            <p className="landing-note">
              {tr("두 모드의 색 계열을 다르게 둔 이유는, 같은 계열이면 “빨간 동네가 나쁜 건지 먼 건지” 구분이 안 되기 때문입니다.")}
            </p>
          </section>
        </Reveal>

        {/* ---------------- 근거 공개 ---------------- */}
        <Reveal>
          <section className="landing-section split" data-stagger>
            <div className="split-text">
              <h2>{tr("왜 그 등급인지 전부 보여줍니다")}</h2>
              <p className="landing-note">
                {tr("점수만 던지지 않습니다. 원지표가 전체 중앙값 대비 어디쯤인지, 백분위가 몇 점인지, 가중치가 얼마인지, 그게 어떻게 합산됐는지 마지막 덧셈까지 펼쳐서 보여줍니다.")}
              </p>
              <p className="landing-note">
                <b>{tr("믿으라고 하지 않고, 검산할 수 있게 둡니다.")}</b>
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
                  <span>{tr("치안")}</span>
                  <b style={{ color: GRADE_COLOR.normal }}>65</b>
                </div>
                <div className="bar">
                  <div style={{ width: "65.3%", background: GRADE_COLOR.normal }} />
                </div>
                <div className="why-mock">
                  <span className="why-summary">▾ {locale === "ko" ? "계산 과정" : locale === "ja" ? "計算過程" : "Calculation"}</span>
                  {WHY_ROWS.map((r) => (
                    <div className="metric-row" key={r.label}>
                      <div className="metric-row-head">
                        <span>{tr(r.label)}</span>
                        <b>{metricDisplay(locale, r.value)}</b>
                      </div>
                      <div className="metric-row-note">
                        {locale === "en"
                          ? `Overall median ${metricDisplay(locale, r.median)} · this neighborhood ${rankDisplay(locale, r.rank)} `
                          : locale === "ja"
                            ? `全体中央値 ${metricDisplay(locale, r.median)}・この地域は${rankDisplay(locale, r.rank)} `
                            : `전체 중앙값 ${r.median} · 이 동은 ${r.rank} `}
                        <b>({locale === "en" ? `${r.point} pts` : locale === "ja" ? `${r.point}点` : `${r.point}점`})</b>{" "}
                        · {locale === "en" ? "weight" : locale === "ja" ? "重み" : "가중치"} {r.weight}
                      </div>
                    </div>
                  ))}
                  <div className="formula">{tr("치안")} 65.3 = 61×0.38 + 84×0.46 + 20×0.15</div>
                </div>
              </div>
            </div>
          </section>
        </Reveal>

        {/* ---------------- 통근 경로 ---------------- */}
        <Reveal>
          <section className="landing-section split reverse" data-stagger>
            <div className="split-text">
              <h2>{tr("통근시간을 직접 계산합니다")}</h2>
              <p className="landing-note">
                {tr("외부 길찾기 API를 부르지 않습니다. 지하철 그래프를 브라우저에서 직접 탐색하기 때문에, 조건을 바꿔도 네트워크 왕복 없이 즉시 다시 계산됩니다.")}
              </p>
              <p className="landing-note">
                {tr("몇 분이 걸리는지만이 아니라 어느 역에서 타고 어디서 갈아타는지까지 구간별로 나옵니다.")}
              </p>
            </div>
            <div className="panel-mock">
              <div className="detail-head">
                <h3>{locale === "en" ? "Dongjak-gu Noryangjin 1-dong" : locale === "ja" ? "トンジャク区 ノリャンジン1洞" : "동작구 노량진1동"}</h3>
                <span className="badge">
                  <i className="grade-dot best" />
                  {GRADE_LABEL.best}
                </span>
              </div>
              <p className="rank-line">
                {locale === "en" ? "#" : ""}<b>{locale === "en" ? "10 of 556" : locale === "ja" ? "556地域中10位" : "수도권 556개 동 중 10위"}</b> · {locale === "en" ? "top 2%" : locale === "ja" ? "上位2%" : "상위 2%"}
              </p>
              <p className="summary">
                {locale === "en"
                  ? `Crime is low and rent is affordable at ${rent(47)}, but traffic-accident hotspots are numerous.`
                  : locale === "ja"
                    ? `犯罪が少なく家賃は${rent(47)}と安い一方、交通事故多発地点が多い地域です。`
                    : "범죄가 적고 월세는 47만원으로 싸지만, 교통사고 다발지점이 많습니다."}
              </p>
              <div className="route-total">
                <b>{minutes(34)}</b>
                <span>{locale === "en" ? "1 transfer" : locale === "ja" ? "乗り換え1回" : "환승 1회"}</span>
              </div>
              <ol className="route-legs">
                {ROUTE_LEGS.map((l, i) => (
                  <li key={i} className={`leg leg-${l.kind}`}>
                    <span className="leg-time">{minutes(l.min)}</span>
                    <span className="leg-text">{tr(l.text)}</span>
                  </li>
                ))}
              </ol>
            </div>
          </section>
        </Reveal>

        {/* ---------------- 기준 ---------------- */}
        <Reveal>
          <section className="landing-section">
            <h2>{tr("무엇을 보고 매기는가")}</h2>

            <table className="axis-table">
              <thead>
                <tr>
                  <th>{tr("축")}</th>
                  <th>{tr("무엇을 보는가")}</th>
                  <th>{tr("기본")}</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>{tr("치안")}</td>
                  <td>{tr("유흥업소 밀도, 5대범죄(자치구), 교통사고 다발지역")}</td>
                  <td>{pct(DEFAULT_WEIGHTS.safety)}%</td>
                </tr>
                <tr>
                  <td>{tr("가격")}</td>
                  <td>{tr("선택한 주택유형의 월세 중앙값 (기본: 단독·다가구 환산월세)")}</td>
                  <td>{pct(DEFAULT_WEIGHTS.price)}%</td>
                </tr>
                <tr>
                  <td>{tr("생활편의")}</td>
                  <td>{tr("편의점·마트, 음식점, 병원·약국, 교통 접근성")}</td>
                  <td>{pct(DEFAULT_WEIGHTS.convenience)}%</td>
                </tr>
              </tbody>
            </table>

            <p className="landing-note">
              {locale === "en"
                ? "Choose any of 15 non-empty combinations across four housing types, including row and multiplex housing, in either monthly-payment-only or deposit-adjusted mode. The default is deposit-adjusted detached and multi-family housing."
                : locale === "ja"
                  ? "連立・多世帯住宅を含む4種類・15通りの組み合わせと、月額のみ／保証金換算モードを選べます。既定は戸建て・多世帯住宅の保証金換算家賃です。"
                  : "월세는 연립·다세대까지 네 유형의 15개 조합과 순수/환산 모드를 선택할 수 있습니다. 기본은 단독·다가구 환산월세입니다."}
            </p>

            <p className="landing-note">
              {tr("이 비중은 슬라이더로 직접 바꿉니다. 월세가 제일 중요한 사람과 조용한 동네가 제일 중요한 사람에게 같은 순위를 강요할 근거가 없습니다. 아래에서 직접 옮겨보세요.")}
            </p>

            <WeightPlayground />

            <p className="landing-note">
              {locale === "en"
                ? "These are real outputs, not illustrative scores. The playground uses the same calculation as the app; move a slider to an extreme and the top-ranked neighborhood changes."
                : locale === "ja"
                  ? "ここで使う点数は例ではなく実際の算出結果です。アプリと同じ計算を使うため、スライダーを端まで動かすと1位の街が変わります。"
                  : "여기 쓰인 점수는 예시가 아니라 실제 산출물입니다. 계산도 앱과 같은 코드를 씁니다 — 슬라이더를 끝까지 밀면 1등이 바뀌는데, 그게 이 도구가 하는 일의 전부입니다."}
            </p>

            <p className="summary">
              {locale === "en"
                ? `Grades are relative within the coverage area, not absolute: the top ${pct(GRADE_CUT.best)}% are Best and the bottom ${pct(1 - GRADE_CUT.normal)}% are Bad. “Bad” means lower-ranked under the same conditions, not unlivable.`
                : locale === "ja"
                  ? `評価は絶対評価ではなく対象地域内の相対評価です。上位${pct(GRADE_CUT.best)}%がBest、下位${pct(1 - GRADE_CUT.normal)}%がBadです。「Bad」は住めない地域という意味ではなく、同じ条件で比較したときに下位という意味です。`
                  : `등급은 절대 평가가 아니라 대상 지역 안에서의 상대 평가입니다. 상위 ${pct(GRADE_CUT.best)}%가 Best, 하위 ${pct(1 - GRADE_CUT.normal)}%가 Bad입니다. “Bad”는 살 수 없는 동네라는 뜻이 아니라, 같은 조건에서 비교했을 때 하위권이라는 뜻입니다.`}
            </p>
          </section>
        </Reveal>

        {/* ---------------- 다중 목적지 ---------------- */}
        <Reveal>
          <section className="landing-section">
            <h2>{tr("둘 다 가까운 동네도 찾습니다")}</h2>
            <p className="landing-note">
              {locale === "en"
                ? "Couples working at different offices, or anyone balancing work and classes, often need a neighborhood within 40 minutes of both. Add up to three destinations to keep only areas that satisfy every one."
                : locale === "ja"
                  ? "別々の会社へ通うカップルや、会社とスクールの両方へ通う人には「どちらも40分以内」の街が必要です。目的地を最大3か所追加すると、すべてを満たす地域だけが残ります。"
                  : "커플이 각자 다른 회사에 다니거나 회사 + 학원처럼, “둘 다 40분 이내인 동네”를 찾는 건 흔한 니즈입니다. 목적지를 최대 3곳까지 더하면 모두 만족하는 지역만 남습니다."}
            </p>
            <div className="count-compare" data-stagger>
              <div className="count-box">
                <b>{number(146)}</b>
                <span>{locale === "en" ? "Gangnam Station only" : locale === "ja" ? "カンナム駅のみ" : "강남역만"}</span>
              </div>
              <div className="count-arrow" aria-hidden="true">
                →
              </div>
              <div className="count-box narrowed">
                <b>{number(76)}</b>
                <span>{locale === "en" ? "Gangnam + Yeouido" : locale === "ja" ? "カンナム駅＋ヨイド駅" : "강남역 + 여의도역"}</span>
              </div>
            </div>
            <p className="landing-note">
              {tr("판정은 가장 오래 걸리는 쪽 기준입니다. 평균이나 합을 쓰면 “한 명은 20분, 다른 한 명은 90분”인 동네가 통과해버립니다.")}
            </p>
          </section>
        </Reveal>
      </div>

      {/* ---------------- 마무리 ---------------- */}
      <section className="landing-cta">
        <HeroImage className="cta-bg" />
        <div className="hero-scrim" />
        <div className="cta-body">
          <h2>{variant.ctaTitle}</h2>
          <div className="hero-search">
            <DestinationSearch
              onPick={onPick}
              geographicSuggestions={geographicSuggestions}
            />
          </div>
        </div>
      </section>

      <p className="disclaimer landing-foot">
        {tr("등급은 공공·공개 데이터로 계산한 대상 지역 내 상대 평가이며, 특정 지역에 대한 가치판단이 아닙니다. 통근시간은 정적 지하철·버스 모델 추정치이며 실시간 교통상황에 따라 달라질 수 있습니다.")}
        <br />
        {locale === "en"
          ? "Boundaries © SGIS/vuski · 100 m population (2024) © SGIS · subway and convenience-stop data © OpenStreetMap contributors · commute bus routes © Seoul & Gyeonggi · businesses © SEMAS · rent © Seoul Open Data Plaza & MOLIT"
          : locale === "ja"
            ? "境界 © SGIS/vuski・100m人口(2024) © SGIS・地下鉄／利便施設 © OpenStreetMap contributors・通勤バス路線 © ソウル特別市／京畿道・店舗 © 小商工人市場振興公団・家賃 © ソウル開かれたデータ広場／国土交通部"
            : "경계 © SGIS/vuski · 100m 인구(2024) © 국가데이터처 SGIS · 지하철·편의지표 정류장 © OpenStreetMap contributors · 통근 버스노선 © 서울특별시·경기도 · 상가업소 © 소상공인시장진흥공단 · 월세 © 서울특별시 열린데이터광장·국토교통부 실거래가"}
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function shotPath(file: string, locale: "ko" | "en" | "ja"): string {
  if (locale === "ko") return `/shots/${file}`;
  const dot = file.lastIndexOf(".");
  return `/shots/${file.slice(0, dot)}-${locale}${file.slice(dot)}`;
}

function metricDisplay(locale: "ko" | "en" | "ja", value: string): string {
  if (locale === "ko") return value;
  if (value.includes("개/km²")) {
    return locale === "ja" ? value.replace("개/km²", "件/km²") : value.replace("개/km²", "/km²");
  }
  if (value.includes("건/km²")) {
    return locale === "ja" ? value.replace("건/km²", "件/km²") : value.replace("건/km²", "/km²");
  }
  if (value.includes("건/천명")) {
    return locale === "ja"
      ? value.replace("건/천명", "件/千人")
      : value.replace("건/천명", " per 1,000 people");
  }
  return value;
}

function rankDisplay(locale: "ko" | "en" | "ja", value: string): string {
  if (locale === "ko") return value;
  const amount = value.match(/\d+%/)?.[0] ?? value;
  const isTop = value.startsWith("상위");
  if (locale === "ja") return `${isTop ? "上位" : "下位"}${amount}`;
  return `${isTop ? "top" : "bottom"} ${amount}`;
}

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
  const { locale, tr } = useI18n();
  return (
    <div className="stat-band">
      <dl className="stat-band-inner">
        {STATS.map((s) => (
          <div className="stat" key={s.label}>
            <dt>
              <CountUp to={s.value} />
              <i>{statUnit(locale, s.unit)}</i>
            </dt>
            <dd>{tr(s.label)}</dd>
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
  const { number } = useI18n();
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
      <span aria-hidden="true">{number(n)}</span>
      <span className="sr-only">{number(to)}</span>
    </span>
  );
}

function statUnit(locale: "ko" | "en" | "ja", unit: string): string {
  if (locale === "ko") return unit;
  if (unit === "역") return locale === "ja" ? "駅" : " stations";
  if (unit === "회") return locale === "ja" ? "回" : " calls";
  return locale === "ja" ? "件" : "";
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
    rank: "상위 39%",
    point: 61,
    weight: "0.38",
  },
  {
    label: "5대범죄",
    value: "6.6건/천명",
    median: "8.4건/천명",
    rank: "상위 16%",
    point: 84,
    weight: "0.46",
  },
  {
    label: "교통사고 다발지역",
    value: "63.9건/km²",
    median: "29.7건/km²",
    rank: "하위 20%",
    point: 20,
    weight: "0.15",
  },
];

/*
 * 앱은 구간마다 반올림하고 0분이 된 구간은 지운다(DongDetail 의 filter).
 * 그래서 마지막 "목적지까지 도보"(0.0분)는 여기서도 없다 — 넣으면 실제
 * 화면에 없는 줄이 소개에만 생긴다.
 *
 * 구간 합(33분)이 머리의 34분과 1분 다른 건 반올림 때문이고 앱도 똑같다.
 * 실제 합은 11 + 3 + 13.25 + 5 + 1.41 = 33.66분이다.
 */
const ROUTE_LEGS = [
  { kind: "walk", min: 11, text: "노들역까지 도보" },
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
 * 556·624·9 는 파이프라인 산출물과 대조한 값이다(bundle.json 의 dongs
 * 556개, graph.stations 624개, meta.availableMetrics 9개). 데이터가 바뀌면
 * 같이 고쳐야 한다.
 *
 * "0" 은 계산이 아니라 설계다. 목적지 하나를 잡으면 556개 동의 통근시간이
 * 전부 필요한데, 길찾기 API 로 하면 요청 한 번에 556콜이라 무료 한도로는
 * 하루 한 명도 못 받는다. 그래서 지하철 그래프를 직접 들고 브라우저에서
 * 탐색한다.
 */
const STATS = [
  { value: 556, unit: "개", label: "행정동을 전부 등급화" },
  { value: 624, unit: "역", label: "지하철 22개 노선" },
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
    body: "624개 역과 22개 노선을 깔아둡니다. 노선별로 끄고 켤 수 있습니다.",
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
    title: "556개 행정동 등급화",
    body: "서울과 신분당선 축(수원·성남·용인), GTX-A 축(화성 동탄)을 Best / Normal / Bad 로 나눕니다.",
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
    body: "624개 역, 22개 노선 오버레이 — 노선별로 켜고 끕니다.",
  },
  {
    title: "링크 공유",
    body: "찾은 결과를 그대로 링크로 보냅니다. 다크/라이트 지원.",
  },
];
