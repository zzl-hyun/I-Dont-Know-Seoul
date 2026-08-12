import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  getLandingVariant,
  LANDING_NAV_ITEMS,
  LANDING_VARIANTS,
  type LandingVariantKey,
} from "./landingVariants";

const ORIGIN = "https://i-dont-know-seoul.cioud.workers.dev";
const HTML_SOURCES: readonly [LandingVariantKey, string][] = [
  ["default", "../../index.html"],
  ["pangyo", "../../guide/pangyo-commute/index.html"],
  ["gangnam", "../../guide/gangnam-commute/index.html"],
  ["sinbundang", "../../guide/sinbundang/index.html"],
];

function readSource(relativePath: string) {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");
}

function structuredFaqs(html: string) {
  const source = html.match(
    /<script type="application\/ld\+json">\s*([\s\S]*?)\s*<\/script>/
  )?.[1];
  expect(source).toBeDefined();

  const graph = JSON.parse(source!) as {
    "@graph": Array<{
      "@type": string;
      mainEntity?: Array<{
        name: string;
        acceptedAnswer: { text: string };
      }>;
    }>;
  };
  return graph["@graph"].find((item) => item["@type"] === "FAQPage")?.mainEntity;
}

describe("landing variants", () => {
  it.each([
    ["/", "default"],
    ["/guide/pangyo-commute/", "pangyo"],
    ["/guide/pangyo-commute", "pangyo"],
    ["/guide/gangnam-commute/", "gangnam"],
    ["/guide/sinbundang/", "sinbundang"],
  ])("%s 경로를 %s 랜딩으로 해석한다", (path, key) => {
    expect(getLandingVariant(path).key).toBe(key);
  });

  it("알 수 없는 SPA 경로는 일반 랜딩으로 안전하게 폴백한다", () => {
    expect(getLandingVariant("/not-a-guide")).toBe(LANDING_VARIANTS.default);
  });

  it("검색 랜딩 경로와 핵심 문구는 서로 중복되지 않는다", () => {
    expect(new Set(LANDING_NAV_ITEMS.map((item) => item.path)).size).toBe(4);
    expect(new Set(LANDING_NAV_ITEMS.map((item) => item.guideTitle)).size).toBe(4);
    expect(new Set(LANDING_NAV_ITEMS.map((item) => item.seoTitle)).size).toBe(4);
    expect(LANDING_VARIANTS.pangyo.guideTitle).toContain("판교");
    expect(LANDING_VARIANTS.gangnam.guideTitle).toContain("강남");
    expect(LANDING_VARIANTS.sinbundang.guideTitle).toContain("신분당선");
  });

  it.each(HTML_SOURCES)("%s 정적 HTML과 화면 문구가 일치한다", (key, sourcePath) => {
    const variant = LANDING_VARIANTS[key];
    const html = readSource(sourcePath);
    const title = html.match(/<title>([^<]+)<\/title>/)?.[1];
    const description = html.match(
      /<meta\s+name="description"\s+content="([^"]+)"/s
    )?.[1];
    const canonical = html.match(/<link rel="canonical" href="([^"]+)"/s)?.[1];

    expect(title).toBe(variant.seoTitle);
    expect(description).toBe(variant.seoDescription);
    expect(canonical).toBe(`${ORIGIN}${variant.path}`);
    expect(html).toContain('<script type="module" src="/src/main.tsx"></script>');
    expect(structuredFaqs(html)).toEqual(
      variant.faqs.map((faq) => ({
        "@type": "Question",
        name: faq.question,
        acceptedAnswer: { "@type": "Answer", text: faq.answer },
      }))
    );

    if (key !== "default") {
      expect(html).toContain(`<h1>${variant.heroTitle.join(" ")}</h1>`);
    }
  });

  it("사이트맵에 모든 정식 URL이 한 번씩 들어간다", () => {
    const sitemap = readSource("../../public/sitemap.xml");

    for (const variant of LANDING_NAV_ITEMS) {
      const loc = `<loc>${ORIGIN}${variant.path}</loc>`;
      expect(sitemap.split(loc)).toHaveLength(2);
    }
  });
});
