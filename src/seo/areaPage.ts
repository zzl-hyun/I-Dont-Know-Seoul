import { DEFAULT_WEIGHTS, GRADE_LABEL } from "../lib/constants";
import { summarize, formatMetric } from "../lib/explain";
import {
  formatMinutes,
  formatNeighborhoodCount,
  formatNumber,
  formatPercent,
  formatRentMan,
  localeRoot,
  translate,
  type Locale,
} from "../lib/locale";
import {
  localizedDistrictName,
  localizedDongName,
  localizedDongShortName,
} from "../lib/geographicNames";
import type { AreaDef } from "./areas";
import { AREA_DEFS } from "./areas";
import type { SeoData } from "./data";
import {
  escapeHtml,
  renderBreadcrumbNav,
  renderHead,
  renderLocaleNav,
  type BreadcrumbItem,
} from "./layout";
import { localizeAreaDef } from "./localize";
import {
  allDongCodes,
  rankByCondition,
  rankByComposite,
  resolveByDongCodes,
  resolveByGuNames,
  summarizeByGu,
  type RankedDong,
} from "./pick";
import { guideUrlPath } from "./slug";
import { SITE_ORIGIN } from "./site";

/** 목적지를 URL 로 — `src/lib/shareUrl.ts` 의 `to` 형식과 동일 (`이름@lat,lng`). */
function ctaHref(anchor: AreaDef["anchor"], locale: Locale): string {
  if (!anchor) return localeRoot(locale);
  const round5 = (value: number) => Math.round(value * 1e5) / 1e5;
  const params = new URLSearchParams();
  params.set("to", `${anchor.name}@${round5(anchor.lat)},${round5(anchor.lng)}`);
  return `${localeRoot(locale)}?${params.toString()}`;
}

const rentFmt = (value: number | null, locale: Locale) =>
  value == null ? translate(locale, "표본 없음") : formatRentMan(locale, value);
const minFmt = (value: number | null, locale: Locale) =>
  value == null ? "—" : formatMinutes(locale, value, 1);
const crimeFmt = (value: number | null, locale: Locale) =>
  value == null ? "—" : formatMetric("crimePer1k", value, locale);

function densityFmt(value: number | null, locale: Locale): string {
  if (value == null) return "—";
  const amount = formatNumber(locale, value, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  if (locale === "en") return `${amount} /km²`;
  return `${amount}${locale === "ja" ? "件" : "개"}/km²`;
}

function localizedRank(locale: Locale, topPct: number): string {
  if (locale === "en") return `top ${formatPercent(locale, topPct)}`;
  if (locale === "ja") return `上位${formatPercent(locale, topPct)}`;
  return `상위 ${formatPercent(locale, topPct)}`;
}

function renderDongList(rows: RankedDong[], data: SeoData, locale: Locale): string {
  const items = rows
    .slice(0, 15)
    .map((row) => {
      const topPct = Math.max(1, Math.round((row.overallRank / row.overallTotal) * 100));
      const sentence = summarize(
        row.score,
        data.scoresFile.pctKeys,
        row.grade,
        DEFAULT_WEIGHTS,
        data.scoresFile.axisWeights,
        {},
        locale
      );
      const rentLabel =
        row.score.raw.monthlyRentMan == null
          ? ""
          : ` · ${translate(locale, "환산월세")} ${rentFmt(row.score.raw.monthlyRentMan, locale)}${
              row.score.dataQuality === "low"
                ? locale === "en"
                  ? " (district estimate)"
                  : locale === "ja"
                    ? "（区の補完値）"
                    : "(자치구 대체값)"
                : ""
            }`;
      return `<li>
        <div class="dong-name">${escapeHtml(localizedDongName(row.meta, locale))}<span class="dong-rank">${localizedRank(locale, topPct)} · ${GRADE_LABEL[row.grade]}${rentLabel}</span></div>
        <div class="dong-summary">${escapeHtml(sentence)}</div>
      </li>`;
    })
    .join("\n");
  return `<ul class="dong-list">${items}</ul>`;
}

/** 좁은 권역은 동별 원지표 전체를 표로 펼쳐 정적 페이지에도 실측 근거를 남긴다. */
function renderRawMetricsTable(rows: RankedDong[], locale: Locale): string {
  if (rows.length === 0 || rows.length > 4) return "";
  const metrics: Array<{ label: string; get: (row: RankedDong) => string }> = [
    {
      label: "단독·다가구 월세",
      get: (row) => rentFmt(row.score.raw.rentByType?.house.medianMan ?? null, locale),
    },
    {
      label: "연립·다세대 월세",
      get: (row) => rentFmt(row.score.raw.rentByType?.rowhouse.medianMan ?? null, locale),
    },
    {
      label: "오피스텔 월세",
      get: (row) => rentFmt(row.score.raw.rentByType?.officetel.medianMan ?? null, locale),
    },
    {
      label: "소형아파트 월세",
      get: (row) => rentFmt(row.score.raw.rentByType?.apartment.medianMan ?? null, locale),
    },
    { label: "5대범죄", get: (row) => crimeFmt(row.score.raw.crimePer1k, locale) },
    {
      label: "유흥업소 밀도",
      get: (row) => densityFmt(row.score.raw.nightlifePerKm2, locale),
    },
    {
      label: "편의점·마트 밀도",
      get: (row) => densityFmt(row.score.raw.storePerKm2, locale),
    },
    { label: "음식점 밀도", get: (row) => densityFmt(row.score.raw.foodPerKm2, locale) },
    {
      label: "병원·약국 밀도",
      get: (row) => densityFmt(row.score.raw.medicalPerKm2, locale),
    },
    { label: "최근접역 도보", get: (row) => minFmt(row.score.raw.walkToStationMin, locale) },
  ];
  const metricHeader = locale === "en" ? "Metric" : locale === "ja" ? "指標" : "지표";
  const header = `<tr><th>${metricHeader}</th>${rows
    .map((row) => `<th>${escapeHtml(localizedDongShortName(row.meta, locale))}</th>`)
    .join("")}</tr>`;
  const body = metrics
    .map(
      (metric) =>
        `<tr><td>${escapeHtml(translate(locale, metric.label))}</td>${rows
          .map((row) => `<td>${metric.get(row)}</td>`)
          .join("")}</tr>`
    )
    .join("\n");
  return `
    <h2>${escapeHtml(translate(locale, "동별 실측 지표"))}</h2>
    <table>
      <thead>${header}</thead>
      <tbody>${body}</tbody>
    </table>`;
}

function renderGuTable(data: SeoData, codes: string[], locale: Locale): string {
  const rows = summarizeByGu(data, codes);
  if (rows.length <= 1) return "";
  const body = rows
    .map(
      (row) =>
        `<tr><td>${escapeHtml(localizedDistrictName(row.gu, locale))}</td><td>${formatNeighborhoodCount(
          locale,
          row.dongCount
        )}</td><td>${rentFmt(row.medianRentMan, locale)}</td><td>${minFmt(
          row.medianWalkMin,
          locale
        )}</td><td>${crimeFmt(row.medianCrimePer1k, locale)}</td></tr>`
    )
    .join("\n");
  return `
    <h2>${escapeHtml(translate(locale, "지역별 비교"))}</h2>
    <table>
      <thead><tr><th>${escapeHtml(translate(locale, "지역"))}</th><th>${escapeHtml(
        translate(locale, "동 수")
      )}</th><th>${escapeHtml(translate(locale, "환산월세 중앙값"))}</th><th>${escapeHtml(
        translate(locale, "최근접역 도보")
      )}</th><th>${escapeHtml(translate(locale, "5대범죄"))}</th></tr></thead>
      <tbody>${body}</tbody>
    </table>`;
}

function renderRelatedNav(sourceArea: AreaDef, locale: Locale): string {
  const related = AREA_DEFS.filter(
    (area) => area.group === sourceArea.group && area.slug !== sourceArea.slug
  ).slice(0, 6);
  if (related.length === 0) return "";
  const links = related
    .map((source) => {
      const area = localizeAreaDef(source, locale);
      return `<a href="${guideUrlPath(area.slug, locale)}">${escapeHtml(area.keyword)}</a>`;
    })
    .join("\n");
  return `<nav class="related" aria-label="${escapeHtml(
    translate(locale, "관련 자취 추천")
  )}">${links}</nav>`;
}

function scopeNote(locale: Locale, isCondition: boolean): string {
  if (locale === "en") {
    return isCondition
      ? "This ranking is calculated across all 556 administrative neighborhoods in Seoul, Seongnam, Suwon, Suji and Giheung in Yongin, and Dongtan in Hwaseong. Grades are relative within the coverage area, not absolute judgments."
      : "Best, Normal, and Bad are relative grades across the 556-neighborhood coverage area. This page uses the default weights (safety 40, price 35, convenience 25) without commute time; adding a destination on the map recalculates the ranking with commute time.";
  }
  if (locale === "ja") {
    return isCondition
      ? "この順位は、ソウル・ソンナム・スウォン・ヨンイン市スジ区／キフン区・ファソン市トンタンの全556行政洞を対象に算出しています。評価は絶対評価ではなく、対象地域内での相対評価です。"
      : "Best・Normal・Badは対象556行政洞内での相対評価です。このページは通勤時間を含まない基本の重み（治安40・価格35・生活利便性25）を使い、地図で目的地を追加すると通勤時間を反映して再計算します。";
  }
  return isCondition
    ? "이 순위는 서울·성남·수원·용인 수지·기흥·화성 동탄 전체 556개 행정동 중에서 계산했습니다. 등급은 절대평가가 아니라 대상 지역 안에서의 상대평가입니다."
    : "등급(Best/Normal/Bad)은 대상 지역 556개 행정동 안에서의 상대평가입니다. 통근시간을 반영하지 않은 기본 가중치(치안 40·가격 35·생활편의 25) 기준이며, 지도에서 목적지를 넣으면 통근시간까지 반영한 순위로 다시 계산됩니다.";
}

function anchorCta(area: AreaDef, locale: Locale): string {
  if (!area.anchor) {
    return `<a class="cta" href="${localeRoot(locale)}">${escapeHtml(
      translate(locale, "지도에서 내 조건으로 비교하기 →")
    )}</a>`;
  }
  const label =
    locale === "en"
      ? `Compare from ${area.anchor.name} on the map →`
      : locale === "ja"
        ? `${area.anchor.name}を基準に地図で比較する →`
        : `${area.anchor.name} 기준으로 지도에서 직접 비교하기 →`;
  return `<a class="cta" href="${ctaHref(area.anchor, locale)}">${escapeHtml(label)}</a>`;
}

/** 권역 페이지 하나의 전체 HTML 문서를 만든다. React 를 부팅하지 않는 순수 문서다. */
export function renderAreaPage(sourceArea: AreaDef, data: SeoData, locale: Locale = "ko"): string {
  const area = localizeAreaDef(sourceArea, locale);
  const path = guideUrlPath(sourceArea.slug, locale);
  const breadcrumbs: BreadcrumbItem[] = [
    { name: translate(locale, "홈"), path: localeRoot(locale) },
    { name: area.keyword, path },
  ];

  const codes = sourceArea.match
    ? [
        ...(sourceArea.match.guNames ? resolveByGuNames(data, sourceArea.match.guNames) : []),
        ...(sourceArea.match.dongCodes ? resolveByDongCodes(data, sourceArea.match.dongCodes) : []),
      ]
    : allDongCodes(data);

  const ranked = sourceArea.pick
    ? rankByCondition(data, sourceArea.pick)
    : rankByComposite(data, codes);
  const introHtml = area.intro.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join("\n");
  const faqHtml = area.faqs
    .map(
      (faq) =>
        `<article><h3>${escapeHtml(faq.question)}</h3><p>${escapeHtml(faq.answer)}</p></article>`
    )
    .join("\n");

  const body = `<body>
    ${renderBreadcrumbNav(breadcrumbs)}
    ${renderLocaleNav(path, locale)}
    <main>
      <h1>${escapeHtml(area.h1)}</h1>
      ${introHtml}
      ${anchorCta(area, locale)}
      <h2>${escapeHtml(translate(locale, "동네별 요약"))}</h2>
      ${renderDongList(ranked, data, locale)}
      ${renderRawMetricsTable(ranked, locale)}
      ${renderGuTable(data, codes, locale)}
      <h2>${escapeHtml(translate(locale, "자주 묻는 질문"))}</h2>
      <div class="faq">${faqHtml}</div>
      ${renderRelatedNav(sourceArea, locale)}
      <p><a href="${localeRoot(locale)}">← ${escapeHtml(
        translate(locale, "전체 자취 추천 지도로 돌아가기")
      )}</a></p>
      <p class="note">${escapeHtml(scopeNote(locale, Boolean(sourceArea.pick)))}</p>
    </main>
  </body>
</html>`;

  const head = renderHead(
    { path, locale, title: area.title, description: area.seoDescription, breadcrumbs },
    area.faqs
  );

  return `${head}\n${body}`;
}

export function areaCanonicalUrl(area: AreaDef, locale: Locale = "ko"): string {
  return `${SITE_ORIGIN}${guideUrlPath(area.slug, locale)}`;
}
