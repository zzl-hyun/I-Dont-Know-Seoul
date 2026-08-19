/**
 * SEO 페이지 생성기 전역에서 쓰는 상수.
 *
 * `index.html`·`worker/index.ts` 등 기존 파일은 오리진을 하드코딩하고 있고
 * 이번 작업 범위가 아니라서 그대로 둔다. 여기 새로 만드는 페이지들만이라도
 * 한 곳에서 관리한다 — 30장 넘는 파일에 문자열을 흩뿌리면 도메인을 바꿀 때
 * (`CLAUDE.md` "자체 도메인" 항목) 절반을 놓친다.
 */
export const SITE_ORIGIN = "https://i-dont-know-seoul.cioud.workers.dev";
export const SITE_NAME = "I Don't Know Seoul";
