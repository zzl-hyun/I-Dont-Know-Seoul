import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { seoPages } from "./src/seo/plugin";

export default defineConfig({
  plugins: [react(), seoPages()],
  build: {
    outDir: "dist",
    // 경계 GeoJSON은 public/ 에서 그대로 복사된다. 인라인되면 안 되므로 0으로 둔다.
    assetsInlineLimit: 0,
    // 검색어 저격 페이지(`/guide/*`)는 React를 부팅하지 않는 순수 문서라
    // 여기 rollupOptions.input 에 넣지 않는다 — `seoPages()` 플러그인이
    // closeBundle 에서 dist/ 에 직접 써 넣는다(`src/seo/generate.ts`).
  },
  server: {
    // `vite dev` 단독 실행 시 /api 는 `wrangler dev`(8787)로 넘긴다.
    // 통합 실행은 `npm run cf:dev` 를 쓰는 편이 실환경에 가깝다.
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8787",
        changeOrigin: true,
      },
    },
  },
});
