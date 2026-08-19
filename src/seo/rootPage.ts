import { getLandingVariant } from "../lib/landingVariants";
import {
  LOCALE_META,
  SUPPORTED_LOCALES,
  localeRoot,
  translate,
  type Locale,
} from "../lib/locale";
import { AREA_DEFS } from "./areas";
import { escapeHtml } from "./layout";
import { localizeAreaDef } from "./localize";
import { guideUrlPath } from "./slug";
import { SITE_NAME, SITE_ORIGIN } from "./site";

interface RootCopy {
  title: string;
  description: string;
  ogDescription: string;
  imageAlt: string;
  appDescription: string;
  features: string[];
  faqs: Array<{ question: string; answer: string }>;
}

const ROOT_COPY: Record<Locale, RootCopy> = {
  ko: {
    title: "서울 자취 동네 추천 | I Don't Know Seoul",
    description:
      "회사·학교를 기준으로 서울·성남·수원·용인 수지·기흥·화성 동탄의 자취 동네를 통근시간·월세·치안·생활편의로 비교하세요.",
    ogDescription:
      "회사·학교를 검색하고 서울·성남·수원·용인 수지·기흥·화성 동탄의 자취 동네를 통근시간·월세·치안·생활편의로 비교하세요.",
    imageAlt: "출퇴근시간과 자취 조건을 비교하는 I Don't Know Seoul 지도",
    appDescription:
      "회사나 학교를 검색하고 통근시간·월세·치안·생활편의를 비교해 자취 동네를 추천받는 무료 웹 지도",
    features: [
      "서울·성남·수원·용인 수지·기흥·화성 동탄 자취 동네 비교",
      "강남·판교 등 목적지별 통근시간 계산",
      "월세 상한과 치안·가격·생활편의 가중치 설정",
      "공공·공개 데이터 기반 추천 근거 공개",
    ],
    faqs: [
      {
        question: "서울 자취 추천 지역을 어떻게 고르나요?",
        answer:
          "회사나 학교를 목적지로 검색한 뒤 통근시간과 월세 상한을 정하고 치안·가격·생활편의 가중치를 조절하면 조건에 맞는 행정동을 순서대로 비교할 수 있습니다.",
      },
      {
        question: "판교나 강남 출근에 맞는 동네도 찾을 수 있나요?",
        answer:
          "판교역이나 강남역, 실제 회사 주소를 목적지로 넣으면 지하철·도보·버스를 합산한 예상 통근시간으로 서울과 인접 경기 지역의 후보를 좁힐 수 있습니다.",
      },
      {
        question: "월세 예산을 정해서 추천받을 수 있나요?",
        answer:
          "월세 상한을 설정하면 예산을 넘는 동네를 추천 목록에서 제외하고, 남은 지역의 환산월세와 가격 점수를 비교할 수 있습니다.",
      },
      {
        question: "어느 지역까지 비교하나요?",
        answer:
          "서울 전체와 성남, 수원, 용인 수지구·기흥구, 화성 동탄의 행정동을 같은 평가 기준과 통근 조건으로 한 지도에서 비교합니다.",
      },
    ],
  },
  en: {
    title: "Where to live near Seoul | I Don't Know Seoul",
    description:
      "Compare neighborhoods in Seoul, Seongnam, Suwon, Suji and Giheung in Yongin, and Dongtan by commute time, measured rent, safety, and convenience.",
    ogDescription:
      "Search for a workplace or school and compare neighborhoods around Seoul by commute time, measured rent, safety, and convenience.",
    imageAlt: "I Don't Know Seoul map comparing commute time and rental-home priorities",
    appDescription:
      "A free web map for comparing commute time, measured rent, safety, and convenience to find a neighborhood near Seoul.",
    features: [
      "Compare neighborhoods in Seoul, Seongnam, Suwon, Yongin, and Dongtan",
      "Estimate commute time to destinations such as Gangnam and Pangyo",
      "Set a rent cap and safety, price, and convenience weights",
      "Inspect the public and open-data evidence behind each result",
    ],
    faqs: [
      {
        question: "How do I choose a neighborhood near Seoul?",
        answer:
          "Search for a workplace or school, set commute and rent limits, then adjust safety, price, and convenience weights to compare matching administrative neighborhoods.",
      },
      {
        question: "Can I find neighborhoods for commuting to Pangyo or Gangnam?",
        answer:
          "Yes. Enter Pangyo Station, Gangnam Station, or an exact company address to narrow candidates using estimated subway, walking, and eligible bus travel time.",
      },
      {
        question: "Can I filter by monthly-rent budget?",
        answer:
          "Yes. A rent cap removes neighborhoods above the selected median-rent basis, and housing type and deposit-conversion mode can be changed.",
      },
      {
        question: "Which areas are covered?",
        answer:
          "The map compares all of Seoul plus Seongnam, Suwon, Suji-gu and Giheung-gu in Yongin, and Dongtan in Hwaseong using the same scoring and commute model.",
      },
    ],
  },
  ja: {
    title: "ソウル周辺の一人暮らし街選び | I Don't Know Seoul",
    description:
      "勤務先・学校を基準に、ソウル・ソンナム・スウォン・ヨンイン市スジ区／キフン区・ファソン市トンタンの街を通勤時間・家賃・治安・生活利便性で比較できます。",
    ogDescription:
      "勤務先や学校を検索し、ソウル周辺の街を通勤時間・実取引家賃・治安・生活利便性で比較できます。",
    imageAlt: "通勤時間と一人暮らしの条件を比較するI Don't Know Seoulの地図",
    appDescription:
      "勤務先や学校を検索し、通勤時間・家賃・治安・生活利便性を比較して街を探せる無料ウェブ地図",
    features: [
      "ソウル・ソンナム・スウォン・ヨンイン・トンタンの街を比較",
      "カンナム・パンギョなど目的地別の通勤時間を推定",
      "家賃上限と治安・価格・生活利便性の重みを設定",
      "公開データに基づく評価根拠を確認",
    ],
    faqs: [
      {
        question: "ソウル周辺で住む街はどう選びますか？",
        answer:
          "勤務先や学校を検索し、通勤時間と家賃上限を設定して、治安・価格・生活利便性の重みを調整すると、条件に合う行政洞を比較できます。",
      },
      {
        question: "パンギョやカンナムへの通勤に合う街も探せますか？",
        answer:
          "はい。パンギョ駅、カンナム駅、または会社の住所を入力すると、地下鉄・徒歩・利用可能なバス区間を合わせた推定時間で候補を絞れます。",
      },
      {
        question: "家賃予算で絞り込めますか？",
        answer:
          "はい。家賃上限を超える地域を除外でき、住宅タイプと保証金換算の方法も変更できます。",
      },
      {
        question: "どの地域を比較できますか？",
        answer:
          "ソウル全域、ソンナム、スウォン、ヨンイン市スジ区・キフン区、ファソン市トンタンを同じ評価基準と通勤モデルで比較します。",
      },
    ],
  },
};

function jsonLd(value: unknown): string {
  return JSON.stringify(value, null, 2).replace(/</g, "\\u003c");
}

/** Vite가 만든 해시 JS/CSS 태그만 뽑아 locale별 HTML shell에서 재사용한다. */
export function extractBuiltAssetTags(html: string): string {
  return [...html.matchAll(/<(?:script|link)\b[^>]*(?:><\/script>|\/?>)/g)]
    .map((match) => match[0])
    .filter((tag) => tag.includes("/assets/"))
    .join("\n    ");
}

export function renderRootPage(locale: Locale, assetTags: string): string {
  const copy = ROOT_COPY[locale];
  const path = localeRoot(locale);
  const url = `${SITE_ORIGIN}${path}`;
  const imageName = locale === "ko" ? "og-image.jpg" : `og-image-${locale}.jpg`;
  const imageUrl = `${SITE_ORIGIN}/${imageName}`;
  const variant = getLandingVariant(path, locale);
  const guides = AREA_DEFS.slice(0, 5).map((area) => localizeAreaDef(area, locale));
  const alternates = SUPPORTED_LOCALES.map(
    (candidate) =>
      `    <link rel="alternate" hreflang="${candidate}" href="${SITE_ORIGIN}${localeRoot(candidate)}" />`
  ).join("\n");
  const ogAlternates = SUPPORTED_LOCALES.filter((candidate) => candidate !== locale)
    .map(
      (candidate) =>
        `    <meta property="og:locale:alternate" content="${LOCALE_META[candidate].ogLocale}" />`
    )
    .join("\n");
  const languageLinks = SUPPORTED_LOCALES.map(
    (candidate) =>
      `<a href="${localeRoot(candidate)}" hreflang="${candidate}" lang="${
        LOCALE_META[candidate].htmlLang
      }">${LOCALE_META[candidate].nativeLabel}</a>`
  ).join(" ");
  const graph = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite",
        "@id": `${url}#website`,
        name: SITE_NAME,
        alternateName: SITE_NAME,
        url,
        inLanguage: LOCALE_META[locale].htmlLang,
        description: copy.description,
      },
      {
        "@type": "WebApplication",
        "@id": `${url}#app`,
        name: SITE_NAME,
        url,
        applicationCategory: "LifestyleApplication",
        operatingSystem: "Any",
        isAccessibleForFree: true,
        inLanguage: LOCALE_META[locale].htmlLang,
        description: copy.appDescription,
        featureList: copy.features,
      },
      {
        "@type": "FAQPage",
        "@id": `${url}#faq`,
        mainEntity: copy.faqs.map((faq) => ({
          "@type": "Question",
          name: faq.question,
          acceptedAnswer: { "@type": "Answer", text: faq.answer },
        })),
      },
    ],
  };

  return `<!doctype html>
<html lang="${LOCALE_META[locale].htmlLang}">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
    <title>${escapeHtml(copy.title)}</title>
    <meta name="description" content="${escapeHtml(copy.description)}" />
    <link rel="canonical" href="${url}" />
${alternates}
    <link rel="alternate" hreflang="x-default" href="${SITE_ORIGIN}/" />
    <meta name="google-site-verification" content="5IrQ4DJT2yyBHBUNR_AOlLUOGhzvMFm1Ulic5vpKuGQ" />
    <meta name="naver-site-verification" content="5605cf1728d1bffbfe802932a44558a54772319e" />
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="${SITE_NAME}" />
    <meta property="og:locale" content="${LOCALE_META[locale].ogLocale}" />
${ogAlternates}
    <meta property="og:url" content="${url}" />
    <meta property="og:title" content="${escapeHtml(copy.title)}" />
    <meta property="og:description" content="${escapeHtml(copy.ogDescription)}" />
    <meta property="og:image" content="${imageUrl}" />
    <meta property="og:image:alt" content="${escapeHtml(copy.imageAlt)}" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${escapeHtml(copy.title)}" />
    <meta name="twitter:description" content="${escapeHtml(copy.ogDescription)}" />
    <meta name="twitter:image" content="${imageUrl}" />
    <meta name="twitter:image:alt" content="${escapeHtml(copy.imageAlt)}" />
    <meta name="theme-color" content="#16181d" media="(prefers-color-scheme: dark)" />
    <meta name="theme-color" content="#f4f5f7" media="(prefers-color-scheme: light)" />
    <link rel="icon" href="/favicon.ico" sizes="32x32" />
    <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
    <link rel="icon" href="/icon-96.png" type="image/png" sizes="96x96" />
    <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
    <script type="application/ld+json">
${jsonLd(graph)}
    </script>
    <style>
      .initial-guide { max-width: 760px; margin: 0 auto; padding: 72px 20px; font-family: system-ui, sans-serif; line-height: 1.75; }
      .initial-guide nav { display: flex; flex-wrap: wrap; gap: 12px; }
      .initial-guide a { color: inherit; }
    </style>
    ${assetTags}
  </head>
  <body>
    <div id="root">
      <main class="initial-guide">
        <nav aria-label="${escapeHtml(translate(locale, "언어"))}">${languageLinks}</nav>
        <h1>${escapeHtml(variant.heroTitle.join(" "))}</h1>
        <p>${escapeHtml(variant.heroLead.join(" "))}</p>
        <h2>${escapeHtml(variant.guideTitle)}</h2>
        <p>${escapeHtml(variant.guideLead)}</p>
        <nav aria-label="${escapeHtml(translate(locale, "검색어별 자취 추천 가이드"))}">
          ${guides
            .map(
              (area) =>
                `<a href="${guideUrlPath(area.slug, locale)}">${escapeHtml(area.keyword)}</a>`
            )
            .join("\n          ")}
        </nav>
      </main>
    </div>
  </body>
</html>\n`;
}
