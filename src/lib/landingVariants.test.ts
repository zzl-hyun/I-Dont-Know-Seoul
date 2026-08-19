import { describe, expect, it } from "vitest";
import { getLandingVariant, LANDING_VARIANTS } from "./landingVariants";

/**
 * 예전에는 검색어별 경로(`/guide/pangyo-commute/` 등)마다 이 React 앱을
 * 다른 변형으로 부팅했다. 지금은 그 페이지들이 `src/seo/`(React 를 부팅하지
 * 않는 순수 문서)로 옮겨갔으므로, 이 파일이 다루는 건 루트(`/`) 화면 하나뿐이다
 * — 정적 HTML·사이트맵 대조는 `src/seo/seo.test.ts` 로 옮겼다.
 */
describe("landing variant", () => {
  it("어떤 경로를 넣어도 기본 랜딩을 반환한다", () => {
    expect(getLandingVariant("/")).toBe(LANDING_VARIANTS.default);
    expect(getLandingVariant("/guide/pangyo-commute/")).toBe(LANDING_VARIANTS.default);
    expect(getLandingVariant("/anything")).toBe(LANDING_VARIANTS.default);
  });

  it("EN/JA 루트 문구와 경로를 locale별로 반환한다", () => {
    expect(getLandingVariant("/en/", "en").path).toBe("/en/");
    expect(getLandingVariant("/en/", "en").heroTitle.join(" ")).not.toMatch(/[가-힣]/);
    expect(getLandingVariant("/ja/", "ja").path).toBe("/ja/");
    expect(getLandingVariant("/ja/", "ja").heroTitle.join(" ")).not.toMatch(/[가-힣]/);
  });
});
