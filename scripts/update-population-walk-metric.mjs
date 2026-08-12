#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { populationWalkByDong } from "./lib/population-access.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const METRICS = join(ROOT, "data/dist/metrics.json");

async function main() {
  const [metrics, dongs, graph, population] = await Promise.all(
    [
      METRICS,
      join(ROOT, "data/dist/dong-meta.json"),
      join(ROOT, "data/dist/subway-graph.json"),
      join(ROOT, "data/raw/grid-population-100m-2024.json"),
    ].map(async (path) => JSON.parse(await readFile(path, "utf8"))),
  );
  const result = populationWalkByDong(
    dongs.dongs,
    graph.stations,
    population.dongs,
    0.5,
  );
  for (const row of metrics.dongs) {
    const value = result.values.get(row.code);
    if (!Number.isFinite(value)) throw new Error(`${row.name}: 역 도보시간 계산 실패`);
    row.walkToStationMin = Math.round(value * 100) / 100;
  }
  metrics.generatedAt = new Date().toISOString();
  metrics.sources = {
    ...metrics.sources,
    walkToStation:
      "SGIS 2024 100m population-weighted median direct walk to nearest subway station",
  };
  await writeFile(METRICS, `${JSON.stringify(metrics, null, 2)}\n`, "utf8");
  const sorted = [...result.values.values()].sort((a, b) => a - b);
  console.log(
    `[metric] 100m 인구격자 ${result.cellCount.toLocaleString()}개 · ` +
      `동 ${result.values.size}개 · 폴백 ${result.fallbackCount}개`,
  );
  console.log(
    `[metric] 최근접역 도보 중앙값 ${sorted[Math.floor(sorted.length / 2)].toFixed(1)}분 · ` +
      `최대 ${sorted.at(-1).toFixed(1)}분`,
  );
}

await main();
