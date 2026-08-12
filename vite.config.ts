import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

const html = (relativePath: string) =>
  fileURLToPath(new URL(relativePath, import.meta.url));

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "dist",
    // 경계 GeoJSON은 public/ 에서 그대로 복사된다. 인라인되면 안 되므로 0으로 둔다.
    assetsInlineLimit: 0,
    // 검색어별 HTML이 고유 메타데이터를 가진 채 같은 React 앱을 공유한다.
    rollupOptions: {
      input: {
        main: html("index.html"),
        pangyo: html("guide/pangyo-commute/index.html"),
        gangnam: html("guide/gangnam-commute/index.html"),
        sinbundang: html("guide/sinbundang/index.html"),
      },
    },
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
