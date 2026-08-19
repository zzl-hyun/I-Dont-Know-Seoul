import { describe, expect, it } from "vitest";
import { AREA_DEFS } from "./areas";
import { loadSeoData } from "./data";
import { renderAreaPage } from "./areaPage";
import { buildSitemapUrls, renderSitemapXml, toLastmod } from "./sitemap";
import { guideUrlPath, assertUniqueSlugs, assertValidSlug } from "./slug";
import { resolveByDongCodes, resolveByGuNames } from "./pick";

/**
 * 검색어 저격 페이지(`src/seo/`)의 데이터 무결성을 잠근다.
 *
 * 실제 `vite build` 를 돌리지 않고 소스 데이터(`data/dist/*.json`)와 렌더
 * 함수를 직접 검증한다 — 여기서 잡아야 할 실수는 "존재하지 않는 동 코드를
 * 페이지에 매핑했다" 류이지, 번들링 자체가 아니다.
 */

const data = loadSeoData();

describe("area slugs", () => {
  it("전부 유효하고 서로 중복되지 않는다", () => {
    for (const a of AREA_DEFS) expect(() => assertValidSlug(a.slug)).not.toThrow();
    expect(() => assertUniqueSlugs(AREA_DEFS.map((a) => a.slug))).not.toThrow();
  });

  it("기존 3개 가이드는 색인된 URL을 그대로 유지한다", () => {
    const slugs = AREA_DEFS.map((a) => a.slug);
    expect(slugs).toContain("gangnam-commute");
    expect(slugs).toContain("pangyo-commute");
    expect(slugs).toContain("sinbundang");
  });
});

describe("동 매핑", () => {
  it("match.dongCodes 는 전부 data/dist/dong-meta.json 에 실재하는 코드다", () => {
    for (const a of AREA_DEFS) {
      if (!a.match?.dongCodes) continue;
      const resolved = resolveByDongCodes(data, a.match.dongCodes);
      expect(
        resolved.length,
        `"${a.slug}" 의 dongCodes 중 ${a.match.dongCodes.length - resolved.length}개가 dong-meta 에 없다`
      ).toBe(a.match.dongCodes.length);
    }
  });

  it("match.guNames 는 전부 최소 1개 동에 매칭된다", () => {
    for (const a of AREA_DEFS) {
      if (!a.match?.guNames) continue;
      for (const gu of a.match.guNames) {
        const resolved = resolveByGuNames(data, [gu]);
        expect(resolved.length, `"${a.slug}" 의 guNames "${gu}" 가 하나도 안 걸린다`).toBeGreaterThan(0);
      }
    }
  });

  it("모든 권역이 최소 1개 동을 담는다", () => {
    for (const a of AREA_DEFS) {
      if (!a.match) continue; // pick 기반(조건형)은 전체 556개 동에서 고르므로 별도 검증 불필요
      const codes = [
        ...(a.match.guNames ? resolveByGuNames(data, a.match.guNames) : []),
        ...(a.match.dongCodes ? resolveByDongCodes(data, a.match.dongCodes) : []),
      ];
      expect(codes.length, `"${a.slug}" 에 매핑된 동이 없다`).toBeGreaterThan(0);
    }
  });
});

function bodyText(html: string): string {
  const body = html.match(/<body[^>]*>([\s\S]*)<\/body>/)?.[1] ?? "";
  return body
    .replace(/<script[\s\S]*?<\/script>/g, "")
    .replace(/<style[\s\S]*?<\/style>/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

describe("렌더된 페이지", () => {
  it("모든 권역 페이지가 본문 1000자 이상을 담는다 (JS 없이 크롤러가 읽는 양)", () => {
    for (const a of AREA_DEFS) {
      const html = renderAreaPage(a, data);
      const text = bodyText(html);
      expect(text.length, `"${a.slug}" 본문이 너무 짧다 (${text.length}자)`).toBeGreaterThanOrEqual(
        1000
      );
    }
  });

  it("<title>과 description이 area 정의와 일치한다", () => {
    const area = AREA_DEFS[0];
    const html = renderAreaPage(area, data);
    expect(html).toContain(`<title>${area.title}</title>`);
    expect(html).toContain(`content="${area.seoDescription}"`);
  });

  it("JSON-LD가 유효한 JSON이고 FAQPage를 포함한다", () => {
    for (const a of AREA_DEFS) {
      const html = renderAreaPage(a, data);
      const raw = html.match(/<script type="application\/ld\+json">\s*([\s\S]*?)\s*<\/script>/)?.[1];
      expect(raw, `"${a.slug}" 에 JSON-LD가 없다`).toBeDefined();
      const parsed = JSON.parse(raw!) as { "@graph": Array<{ "@type": string }> };
      const types = parsed["@graph"].map((n) => n["@type"]);
      expect(types).toContain("WebPage");
      expect(types).toContain("BreadcrumbList");
      expect(types).toContain("FAQPage");
    }
  });

  it("React를 부팅하지 않는다 — <script type=module> 이 없다", () => {
    for (const a of AREA_DEFS) {
      const html = renderAreaPage(a, data);
      expect(html).not.toContain('type="module"');
    }
  });
});

describe("sitemap", () => {
  it("루트 + 모든 권역 페이지가 정확히 한 번씩 들어간다", () => {
    const urls = buildSitemapUrls(AREA_DEFS, toLastmod(data.scoresFile.generatedAt));
    expect(urls.length).toBe(AREA_DEFS.length + 1);

    const xml = renderSitemapXml(urls);
    for (const a of AREA_DEFS) {
      const loc = `<loc>https://i-dont-know-seoul.cioud.workers.dev${guideUrlPath(a.slug)}</loc>`;
      expect(xml.split(loc)).toHaveLength(2);
    }
  });
});
