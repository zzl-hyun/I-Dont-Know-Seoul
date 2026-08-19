import type { Plugin } from "vite";
import { generateSeoPages } from "./generate";

/**
 * `vite build` 산출물(`dist/`)에 검색어 저격 페이지와 사이트맵을 덧붙이는
 * Vite 플러그인.
 *
 * `closeBundle` 은 Vite 가 `dist/` 에 모든 자산을 다 쓴 뒤 호출되므로, 여기서
 * 파일을 추가해도 앱 번들 해시나 매니페스트에 영향을 주지 않는다.
 */
export function seoPages(): Plugin {
  let outDir = "dist";
  return {
    name: "seo-pages",
    apply: "build",
    configResolved(config) {
      outDir = config.build.outDir;
    },
    closeBundle() {
      generateSeoPages(outDir);
    },
  };
}
