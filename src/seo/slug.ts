import { localizePath, type Locale } from "../lib/locale";

/**
 * 이 파일이 다루는 슬러그는 전부 로마자(영문)다 — Phase 1 권역 페이지는
 * `hongdae`·`suwon` 처럼 검색어를 로마자로 옮긴 URL을 쓴다. 한글 경로는
 * Phase 3(행정동 556장)에서 다루며, 그때는 유니코드 정규화(NFC)가 필요하다
 * (계획 문서의 "함정" 참고). 여기서는 아스키만 다루므로 그 문제가 없다.
 */

const SLUG_RE = /^[a-z][a-z0-9-]*[a-z0-9]$/;

export function assertValidSlug(slug: string): void {
  if (!SLUG_RE.test(slug)) {
    throw new Error(
      `잘못된 슬러그: "${slug}" — 소문자·숫자·하이픈만, 하이픈으로 시작/끝 불가`
    );
  }
}

/** 슬러그 목록에 중복이 있으면 에러를 던진다. seo.test.ts 가 같은 검사를 한다. */
export function assertUniqueSlugs(slugs: string[]): void {
  const seen = new Set<string>();
  for (const s of slugs) {
    if (seen.has(s)) throw new Error(`중복 슬러그: "${s}"`);
    seen.add(s);
  }
}

export function guideUrlPath(slug: string, locale: Locale = "ko"): string {
  return localizePath(`/guide/${slug}/`, locale);
}
