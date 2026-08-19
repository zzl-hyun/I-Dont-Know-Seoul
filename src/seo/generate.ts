import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { AREA_DEFS } from "./areas";
import { loadSeoData } from "./data";
import { renderAreaPage } from "./areaPage";
import { buildSitemapUrls, renderSitemapXml, toLastmod } from "./sitemap";
import { guideUrlPath } from "./slug";
import { assertUniqueSlugs } from "./slug";
import { SUPPORTED_LOCALES, localeRoot } from "../lib/locale";
import { extractBuiltAssetTags, renderRootPage } from "./rootPage";

function outputDirectory(outDir: string, urlPath: string): string {
  const relative = urlPath.replace(/^\/+|\/+$/g, "");
  return relative ? join(outDir, relative) : outDir;
}

/**
 * `dist/` 빌드가 끝난 뒤(closeBundle) 호출된다.
 *
 * 검색어 저격 페이지(`dist/guide/<slug>/index.html`)와 사이트맵을 여기서
 * 만든다. React 를 부팅하지 않는 순수 HTML이라 앱 번들과 무관하다 — Vite의
 * 자산 파이프라인(해시·압축 등)을 거칠 필요가 없어 빌드가 끝난 뒤 파일로
 * 직접 쓴다.
 */
export function generateSeoPages(outDir: string): void {
  assertUniqueSlugs(AREA_DEFS.map((a) => a.slug));

  const data = loadSeoData();
  const builtRoot = readFileSync(join(outDir, "index.html"), "utf8");
  const assetTags = extractBuiltAssetTags(builtRoot);

  for (const locale of SUPPORTED_LOCALES) {
    const rootDir = outputDirectory(outDir, localeRoot(locale));
    mkdirSync(rootDir, { recursive: true });
    writeFileSync(join(rootDir, "index.html"), renderRootPage(locale, assetTags), "utf8");

    for (const area of AREA_DEFS) {
      const html = renderAreaPage(area, data, locale);
      const dir = outputDirectory(outDir, guideUrlPath(area.slug, locale));
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, "index.html"), html, "utf8");
    }
  }

  const lastmod = toLastmod(data.scoresFile.generatedAt);
  const urls = buildSitemapUrls(AREA_DEFS, lastmod);
  writeFileSync(join(outDir, "sitemap.xml"), renderSitemapXml(urls), "utf8");

  // eslint-disable-next-line no-console
  console.log(
    `[seo] ${AREA_DEFS.length * SUPPORTED_LOCALES.length} locale guide pages + ${
      SUPPORTED_LOCALES.length
    } locale roots + sitemap.xml(${urls.length} URLs) generated`
  );
}
