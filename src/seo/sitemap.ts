import { SITE_ORIGIN } from "./site";
import type { AreaDef } from "./areas";
import {
  SUPPORTED_LOCALES,
  localizePath,
  type Locale,
} from "../lib/locale";
import { guideUrlPath } from "./slug";

export interface SitemapAlternate {
  hreflang: Locale | "x-default";
  href: string;
}

export interface SitemapUrl {
  loc: string;
  lastmod: string; // YYYY-MM-DD
  changefreq: "weekly" | "monthly";
  priority: string;
  alternates: SitemapAlternate[];
}

/** `scores.generatedAt` (ISO) → 사이트맵 lastmod (YYYY-MM-DD). */
export function toLastmod(iso: string): string {
  return iso.slice(0, 10);
}

function alternateCluster(basePath: string): SitemapAlternate[] {
  return [
    ...SUPPORTED_LOCALES.map((locale) => ({
      hreflang: locale,
      href: `${SITE_ORIGIN}${localizePath(basePath, locale)}`,
    })),
    { hreflang: "x-default", href: `${SITE_ORIGIN}${basePath}` },
  ];
}

export function buildSitemapUrls(areas: AreaDef[], lastmod: string): SitemapUrl[] {
  const pages = [
    { basePath: "/", changefreq: "weekly" as const, priority: "1.0" },
    ...areas.map((area) => ({
      basePath: guideUrlPath(area.slug),
      changefreq: "monthly" as const,
      priority: "0.8",
    })),
  ];

  return pages.flatMap((page) =>
    SUPPORTED_LOCALES.map((locale) => ({
      loc: `${SITE_ORIGIN}${localizePath(page.basePath, locale)}`,
      lastmod,
      changefreq: page.changefreq,
      priority: page.priority,
      alternates: alternateCluster(page.basePath),
    }))
  );
}

export function renderSitemapXml(urls: SitemapUrl[]): string {
  const body = urls
    .map((url) => {
      const alternates = url.alternates
        .map(
          (alternate) =>
            `    <xhtml:link rel="alternate" hreflang="${alternate.hreflang}" href="${alternate.href}" />`
        )
        .join("\n");
      return `  <url>\n    <loc>${url.loc}</loc>\n${alternates}\n    <lastmod>${url.lastmod}</lastmod>\n    <changefreq>${url.changefreq}</changefreq>\n    <priority>${url.priority}</priority>\n  </url>`;
    })
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${body}\n</urlset>\n`;
}
