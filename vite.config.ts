import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "dist",
    // 경계 GeoJSON은 public/ 에서 그대로 복사된다. 인라인되면 안 되므로 0으로 둔다.
    assetsInlineLimit: 0,
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
