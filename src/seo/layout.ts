import { SITE_NAME, SITE_ORIGIN } from "./site";
import {
  LOCALE_META,
  SUPPORTED_LOCALES,
  localizePath,
  stripLocalePrefix,
  type Locale,
} from "../lib/locale";

/** HTML 텍스트 컨텍스트 이스케이프. 실거래 단지명 등 원 데이터에 `<`·`&` 가 섞여 들어올 수 있다. */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** JSON-LD `<script>` 안에 들어갈 문자열. `</script>` 조기 종료를 막는다. */
function jsonLd(obj: unknown): string {
  return JSON.stringify(obj, null, 2).replace(/</g, "\\u003c");
}

export interface BreadcrumbItem {
  name: string;
  path: string; // "/" 또는 "/guide/xxx/"
}

export interface PageMeta {
  path: string; // "/guide/xxx/"
  locale: Locale;
  title: string;
  description: string;
  breadcrumbs: BreadcrumbItem[];
}

export interface FaqEntry {
  question: string;
  answer: string;
}

/**
 * 검색 유입 페이지 공통 `<head>`.
 *
 * 기존 `index.html`·`guide/*` 소스가 손으로 맞춰 온 관례(og:image, 파비콘,
 * theme-color, JSON-LD `@graph`)를 그대로 따른다 — 크롤러 신호를 페이지마다
 * 다르게 주면 안 된다.
 */
export function renderHead(meta: PageMeta, faqs: FaqEntry[]): string {
  const url = `${SITE_ORIGIN}${meta.path}`;
  const basePath = stripLocalePrefix(meta.path);
  const alternateLinks = SUPPORTED_LOCALES.map((locale) => {
    const href = `${SITE_ORIGIN}${localizePath(basePath, locale)}`;
    return `    <link rel="alternate" hreflang="${locale}" href="${href}" />`;
  }).join("\n");
  const alternateLocales = SUPPORTED_LOCALES.filter((locale) => locale !== meta.locale)
    .map(
      (locale) =>
        `    <meta property="og:locale:alternate" content="${LOCALE_META[locale].ogLocale}" />`
    )
    .join("\n");
  const localeRoot = localizePath("/", meta.locale);
  const ogImage = meta.locale === "ko" ? "og-image.jpg" : `og-image-${meta.locale}.jpg`;
  const graph: unknown[] = [
    {
      "@type": "WebPage",
      "@id": `${url}#webpage`,
      url,
      name: meta.title,
      description: meta.description,
      inLanguage: LOCALE_META[meta.locale].htmlLang,
      isPartOf: { "@id": `${SITE_ORIGIN}${localeRoot}#website` },
    },
    {
      "@type": "BreadcrumbList",
      "@id": `${url}#breadcrumb`,
      itemListElement: meta.breadcrumbs.map((b, i) => ({
        "@type": "ListItem",
        position: i + 1,
        name: b.name,
        item: `${SITE_ORIGIN}${b.path}`,
      })),
    },
  ];
  if (faqs.length > 0) {
    graph.push({
      "@type": "FAQPage",
      "@id": `${url}#faq`,
      mainEntity: faqs.map((f) => ({
        "@type": "Question",
        name: f.question,
        acceptedAnswer: { "@type": "Answer", text: f.answer },
      })),
    });
  }

  return `<!doctype html>
<html lang="${LOCALE_META[meta.locale].htmlLang}">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
    <title>${escapeHtml(meta.title)}</title>
    <meta name="description" content="${escapeHtml(meta.description)}" />
    <link rel="canonical" href="${url}" />
${alternateLinks}
    <link rel="alternate" hreflang="x-default" href="${SITE_ORIGIN}${basePath}" />

    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="${escapeHtml(SITE_NAME)}" />
    <meta property="og:locale" content="${LOCALE_META[meta.locale].ogLocale}" />
${alternateLocales}
    <meta property="og:url" content="${url}" />
    <meta property="og:title" content="${escapeHtml(meta.title)}" />
    <meta property="og:description" content="${escapeHtml(meta.description)}" />
    <meta property="og:image" content="${SITE_ORIGIN}/${ogImage}" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />

    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${escapeHtml(meta.title)}" />
    <meta name="twitter:description" content="${escapeHtml(meta.description)}" />
    <meta name="twitter:image" content="${SITE_ORIGIN}/${ogImage}" />

    <meta name="theme-color" content="#16181d" media="(prefers-color-scheme: dark)" />
    <meta name="theme-color" content="#f4f5f7" media="(prefers-color-scheme: light)" />
    <link rel="icon" href="/favicon.ico" sizes="32x32" />
    <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
    <link rel="icon" href="/icon-96.png" type="image/png" sizes="96x96" />
    <link rel="apple-touch-icon" href="/apple-touch-icon.png" />

    <script type="application/ld+json">
${jsonLd({ "@context": "https://schema.org", "@graph": graph })}
    </script>
    <style>${PAGE_CSS}</style>
  </head>`;
}

/**
 * 인라인 CSS. 별도 CSS 파일을 링크하면 요청이 하나 늘고, 이 페이지들은
 * 애초에 앱 번들(1.37MB)을 받지 않는 게 목적이라 few KB 인라인이 낫다.
 */
const PAGE_CSS = `
  :root { color-scheme: light dark; }
  body { max-width: 760px; margin: 0 auto; padding: 0 20px 96px; font-family: system-ui, -apple-system, "Apple SD Gothic Neo", sans-serif; line-height: 1.75; color: #1c1e22; background: #fff; }
  @media (prefers-color-scheme: dark) { body { color: #e7e8ea; background: #16181d; } }
  header.crumbs { padding: 20px 0 8px; font-size: 13px; opacity: .7; }
  header.crumbs a { color: inherit; }
  nav.locales { display: flex; gap: 6px; margin: 0 0 24px; font-size: 12px; }
  nav.locales a { padding: 3px 9px; border: 1px solid rgba(128,128,128,.3); border-radius: 999px; color: inherit; text-decoration: none; }
  nav.locales a[aria-current="page"] { border-color: #2563eb; font-weight: 700; }
  h1 { font-size: 28px; line-height: 1.35; margin: 8px 0 20px; }
  h2 { font-size: 20px; margin: 40px 0 12px; }
  h3 { font-size: 16px; margin: 20px 0 6px; }
  p { margin: 0 0 12px; }
  table { width: 100%; border-collapse: collapse; margin: 12px 0 24px; font-size: 14px; }
  th, td { text-align: left; padding: 8px 10px; border-bottom: 1px solid rgba(128,128,128,.25); }
  th { font-weight: 600; opacity: .75; }
  .dong-list { list-style: none; margin: 0 0 24px; padding: 0; display: grid; gap: 14px; }
  .dong-list li { padding: 14px 16px; border: 1px solid rgba(128,128,128,.25); border-radius: 10px; }
  .dong-list .dong-name { font-weight: 600; margin-bottom: 4px; }
  .dong-list .dong-rank { font-size: 12px; opacity: .65; margin-left: 6px; font-weight: 400; }
  .dong-list .dong-summary { font-size: 14px; opacity: .9; }
  .faq { display: grid; gap: 16px; margin-bottom: 24px; }
  .faq h3 { margin: 0 0 4px; }
  .note { font-size: 13px; opacity: .65; margin-top: 40px; }
  .cta { display: block; margin: 32px 0; padding: 16px 20px; border-radius: 10px; background: #2563eb; color: #fff; text-decoration: none; font-weight: 600; text-align: center; }
  nav.related { display: flex; flex-wrap: wrap; gap: 10px; margin: 24px 0; }
  nav.related a { font-size: 13px; padding: 6px 12px; border: 1px solid rgba(128,128,128,.3); border-radius: 999px; color: inherit; text-decoration: none; }
`;

export function renderBreadcrumbNav(items: BreadcrumbItem[]): string {
  const parts = items.map((b, i) =>
    i === items.length - 1
      ? `<span>${escapeHtml(b.name)}</span>`
      : `<a href="${b.path}">${escapeHtml(b.name)}</a>`
  );
  return `<header class="crumbs">${parts.join(" · ")}</header>`;
}

export function renderLocaleNav(path: string, current: Locale): string {
  const basePath = stripLocalePrefix(path);
  const links = SUPPORTED_LOCALES.map((locale) => {
    const currentAttribute = locale === current ? ' aria-current="page"' : "";
    return `<a href="${localizePath(basePath, locale)}" hreflang="${locale}" lang="${
      LOCALE_META[locale].htmlLang
    }"${currentAttribute}>${LOCALE_META[locale].nativeLabel}</a>`;
  }).join("");
  return `<nav class="locales" aria-label="${escapeHtml(
    translateLocaleLabel(current)
  )}">${links}</nav>`;
}

function translateLocaleLabel(locale: Locale): string {
  if (locale === "en") return "Language";
  if (locale === "ja") return "言語";
  return "언어";
}
