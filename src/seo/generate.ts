import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { AREA_DEFS } from "./areas";
import { loadSeoData } from "./data";
import { renderAreaPage } from "./areaPage";
import { buildSitemapUrls, renderSitemapXml, toLastmod } from "./sitemap";
import { guideUrlPath } from "./slug";
import { assertUniqueSlugs } from "./slug";

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

  for (const area of AREA_DEFS) {
    const html = renderAreaPage(area, data);
    const dir = join(outDir, guideUrlPath(area.slug));
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "index.html"), html, "utf8");
  }

  const lastmod = toLastmod(data.scoresFile.generatedAt);
  const urls = buildSitemapUrls(AREA_DEFS, lastmod);
  writeFileSync(join(outDir, "sitemap.xml"), renderSitemapXml(urls), "utf8");

  // eslint-disable-next-line no-console
  console.log(
    `[seo] ${AREA_DEFS.length}개 권역 페이지 + sitemap.xml(${urls.length} URL) 생성 완료`
  );
}
