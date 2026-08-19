import type { AreaDef } from "./areas";
import type { SeoData } from "./data";
import {
  allDongCodes,
  rankByCondition,
  rankByComposite,
  resolveByDongCodes,
  resolveByGuNames,
  summarizeByGu,
  type RankedDong,
} from "./pick";
import { summarize } from "../lib/explain";
import { DEFAULT_WEIGHTS, GRADE_LABEL } from "../lib/constants";
import { escapeHtml, renderBreadcrumbNav, renderHead, type BreadcrumbItem } from "./layout";
import { guideUrlPath } from "./slug";
import { SITE_ORIGIN } from "./site";
import { AREA_DEFS } from "./areas";

/** 목적지를 URL 로 — `src/lib/shareUrl.ts` 의 `to` 형식과 동일 (`이름@lat,lng`). */
function ctaHref(anchor: AreaDef["anchor"]): string {
  if (!anchor) return "/";
  const round5 = (v: number) => Math.round(v * 1e5) / 1e5;
  const p = new URLSearchParams();
  p.set("to", `${anchor.name}@${round5(anchor.lat)},${round5(anchor.lng)}`);
  return `/?${p.toString()}`;
}

const rentFmt = (v: number | null) => (v == null ? "표본 없음" : `${Math.round(v)}만원`);
const minFmt = (v: number | null) => (v == null ? "—" : `${v.toFixed(1)}분`);
const crimeFmt = (v: number | null) => (v == null ? "—" : `${v.toFixed(1)}건/천명`);

function renderDongList(rows: RankedDong[], data: SeoData): string {
  const items = rows
    .slice(0, 15)
    .map((r) => {
      const topPct = Math.max(1, Math.round((r.overallRank / r.overallTotal) * 100));
      const sentence = summarize(
        r.score,
        data.scoresFile.pctKeys,
        r.grade,
        DEFAULT_WEIGHTS,
        data.scoresFile.axisWeights
      );
      const rentLabel =
        r.score.raw.monthlyRentMan == null
          ? ""
          : ` · 환산월세 ${rentFmt(r.score.raw.monthlyRentMan)}${
              r.score.dataQuality === "low" ? "(자치구 대체값)" : ""
            }`;
      return `<li>
        <div class="dong-name">${escapeHtml(r.meta.name)}<span class="dong-rank">상위 ${topPct}% · ${GRADE_LABEL[r.grade]}${rentLabel}</span></div>
        <div class="dong-summary">${escapeHtml(sentence)}</div>
      </li>`;
    })
    .join("\n");
  return `<ul class="dong-list">${items}</ul>`;
}

/**
 * 동이 4개 이하인 좁은 권역(홍대·건대·흑석 같은)은 "동네별 요약" 목록만으로는
 * 얇다. 그런 페이지는 동별 원지표 전체를 표로 펼친다 — 다른 어떤 블로그도
 * 못 가진 실측 수치라 좁은 권역일수록 오히려 이 표가 핵심 콘텐츠가 된다.
 */
function renderRawMetricsTable(rows: RankedDong[]): string {
  if (rows.length === 0 || rows.length > 4) return "";
  const fmtRent = (v: number | null | undefined) => (v == null ? "—" : `${Math.round(v)}만원`);
  const metrics: Array<{ label: string; get: (r: RankedDong) => string }> = [
    { label: "단독·다가구 월세", get: (r) => fmtRent(r.score.raw.rentByType?.house.medianMan) },
    { label: "연립·다세대 월세", get: (r) => fmtRent(r.score.raw.rentByType?.rowhouse.medianMan) },
    { label: "오피스텔 월세", get: (r) => fmtRent(r.score.raw.rentByType?.officetel.medianMan) },
    { label: "소형아파트 월세", get: (r) => fmtRent(r.score.raw.rentByType?.apartment.medianMan) },
    {
      label: "5대범죄",
      get: (r) => crimeFmt(r.score.raw.crimePer1k),
    },
    {
      label: "유흥업소 밀도",
      get: (r) => (r.score.raw.nightlifePerKm2 == null ? "—" : `${r.score.raw.nightlifePerKm2.toFixed(1)}개/km²`),
    },
    {
      label: "편의점·마트 밀도",
      get: (r) => (r.score.raw.storePerKm2 == null ? "—" : `${r.score.raw.storePerKm2.toFixed(1)}개/km²`),
    },
    {
      label: "음식점 밀도",
      get: (r) => (r.score.raw.foodPerKm2 == null ? "—" : `${r.score.raw.foodPerKm2.toFixed(1)}개/km²`),
    },
    {
      label: "병원·약국 밀도",
      get: (r) => (r.score.raw.medicalPerKm2 == null ? "—" : `${r.score.raw.medicalPerKm2.toFixed(1)}개/km²`),
    },
    { label: "최근접역 도보", get: (r) => minFmt(r.score.raw.walkToStationMin) },
  ];
  const header = `<tr><th>지표</th>${rows.map((r) => `<th>${escapeHtml(r.meta.dong)}</th>`).join("")}</tr>`;
  const body = metrics
    .map((m) => `<tr><td>${m.label}</td>${rows.map((r) => `<td>${m.get(r)}</td>`).join("")}</tr>`)
    .join("\n");
  return `
    <h2>동별 실측 지표</h2>
    <table>
      <thead>${header}</thead>
      <tbody>${body}</tbody>
    </table>`;
}

function renderGuTable(data: SeoData, codes: string[]): string {
  const rows = summarizeByGu(data, codes);
  if (rows.length <= 1) return "";
  const body = rows
    .map(
      (r) =>
        `<tr><td>${escapeHtml(r.gu)}</td><td>${r.dongCount}개 동</td><td>${rentFmt(
          r.medianRentMan
        )}</td><td>${minFmt(r.medianWalkMin)}</td><td>${crimeFmt(r.medianCrimePer1k)}</td></tr>`
    )
    .join("\n");
  return `
    <h2>지역별 비교</h2>
    <table>
      <thead><tr><th>지역</th><th>동 수</th><th>환산월세 중앙값</th><th>최근접역 도보</th><th>5대범죄</th></tr></thead>
      <tbody>${body}</tbody>
    </table>`;
}

function renderRelatedNav(area: AreaDef): string {
  const related = AREA_DEFS.filter((a) => a.group === area.group && a.slug !== area.slug).slice(
    0,
    6
  );
  if (related.length === 0) return "";
  const links = related
    .map((a) => `<a href="${guideUrlPath(a.slug)}">${escapeHtml(a.keyword)}</a>`)
    .join("\n");
  return `<nav class="related" aria-label="관련 자취 추천">${links}</nav>`;
}

/** 권역 페이지 하나의 전체 HTML 문서를 만든다. React 를 부팅하지 않는 순수 문서다. */
export function renderAreaPage(area: AreaDef, data: SeoData): string {
  const path = guideUrlPath(area.slug);
  const breadcrumbs: BreadcrumbItem[] = [
    { name: "홈", path: "/" },
    { name: area.keyword, path },
  ];

  const codes = area.match
    ? [
        ...(area.match.guNames ? resolveByGuNames(data, area.match.guNames) : []),
        ...(area.match.dongCodes ? resolveByDongCodes(data, area.match.dongCodes) : []),
      ]
    : allDongCodes(data);

  const ranked = area.pick ? rankByCondition(data, area.pick) : rankByComposite(data, codes);

  const introHtml = area.intro.map((p) => `<p>${escapeHtml(p)}</p>`).join("\n");
  const faqHtml = area.faqs
    .map(
      (f) =>
        `<article><h3>${escapeHtml(f.question)}</h3><p>${escapeHtml(f.answer)}</p></article>`
    )
    .join("\n");

  const cta = area.anchor
    ? `<a class="cta" href="${ctaHref(area.anchor)}">${escapeHtml(
        area.anchor.name
      )} 기준으로 지도에서 직접 비교하기 →</a>`
    : `<a class="cta" href="/">지도에서 내 조건으로 비교하기 →</a>`;

  const scopeNote = area.pick
    ? `<p class="note">이 순위는 서울·성남·수원·용인 수지·기흥·화성 동탄 전체 556개 행정동 중에서 계산했습니다. 등급은 절대평가가 아니라 대상 지역 안에서의 상대평가입니다.</p>`
    : `<p class="note">등급(Best/Normal/Bad)은 대상 지역 556개 행정동 안에서의 상대평가입니다. 통근시간을 반영하지 않은 기본 가중치(치안 40·가격 35·생활편의 25) 기준이며, 지도에서 목적지를 넣으면 통근시간까지 반영한 순위로 다시 계산됩니다.</p>`;

  const body = `<body>
    ${renderBreadcrumbNav(breadcrumbs)}
    <main>
      <h1>${escapeHtml(area.h1)}</h1>
      ${introHtml}
      ${cta}
      <h2>동네별 요약</h2>
      ${renderDongList(ranked, data)}
      ${renderRawMetricsTable(ranked)}
      ${renderGuTable(data, codes)}
      <h2>자주 묻는 질문</h2>
      <div class="faq">${faqHtml}</div>
      ${renderRelatedNav(area)}
      <p><a href="/">← 전체 자취 추천 지도로 돌아가기</a></p>
      ${scopeNote}
    </main>
  </body>
</html>`;

  const head = renderHead(
    { path, title: area.title, description: area.seoDescription, breadcrumbs },
    area.faqs
  );

  return `${head}\n${body}`;
}

export function areaCanonicalUrl(area: AreaDef): string {
  return `${SITE_ORIGIN}${guideUrlPath(area.slug)}`;
}
