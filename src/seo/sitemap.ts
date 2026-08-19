import { SITE_ORIGIN } from "./site";
import type { AreaDef } from "./areas";
import { guideUrlPath } from "./slug";

export interface SitemapUrl {
  loc: string;
  lastmod: string; // YYYY-MM-DD
  changefreq: "weekly" | "monthly";
  priority: string;
}

/** `scores.generatedAt` (ISO) → 사이트맵 lastmod (YYYY-MM-DD). */
export function toLastmod(iso: string): string {
  return iso.slice(0, 10);
}

export function buildSitemapUrls(areas: AreaDef[], lastmod: string): SitemapUrl[] {
  return [
    { loc: `${SITE_ORIGIN}/`, lastmod, changefreq: "weekly", priority: "1.0" },
    ...areas.map((a) => ({
      loc: `${SITE_ORIGIN}${guideUrlPath(a.slug)}`,
      lastmod,
      changefreq: "monthly" as const,
      priority: "0.8",
    })),
  ];
}

export function renderSitemapXml(urls: SitemapUrl[]): string {
  const body = urls
    .map(
      (u) =>
        `  <url>\n    <loc>${u.loc}</loc>\n    <lastmod>${u.lastmod}</lastmod>\n    <changefreq>${u.changefreq}</changefreq>\n    <priority>${u.priority}</priority>\n  </url>`
    )
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
}
