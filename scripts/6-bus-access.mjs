#!/usr/bin/env node

import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildResidentialAccess } from "./lib/bus-access.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const POPULATION = join(ROOT, "data/raw/grid-population-100m-2024.json");
const GRAPH = join(ROOT, "data/dist/subway-graph.json");
const BUS = join(ROOT, "data/dist/bus-network.json");
const OUTPUT = join(ROOT, "data/dist/residential-access.json");

async function main() {
  const [population, graph, bus] = await Promise.all(
    [POPULATION, GRAPH, BUS].map(async (path) => JSON.parse(await readFile(path, "utf8"))),
  );
  const { residential, stats } = buildResidentialAccess(population, graph, bus);
  if (stats.dongCount !== population.coverage?.dongCount) {
    throw new Error(
      `거주 접근 동 수 불일치: ${stats.dongCount}/${population.coverage?.dongCount}`,
    );
  }
  if (Object.values(residential.byDong).some((profiles) => profiles.length === 0)) {
    throw new Error("접근 프로필이 비어 있는 행정동이 있습니다.");
  }
  for (const [code, profiles] of Object.entries(residential.byDong)) {
    if (profiles.length > residential.maxProfilesPerDong) {
      throw new Error(
        `${code} 대표 프로필 상한 초과: ${profiles.length}/${residential.maxProfilesPerDong}`,
      );
    }
    const weightSum = profiles.reduce((sum, [weight]) => {
      if (!Number.isInteger(weight) || weight <= 0) {
        throw new Error(`${code} 대표 프로필 가중치가 올바르지 않습니다: ${weight}`);
      }
      return sum + weight;
    }, 0);
    if (weightSum !== residential.weightScale) {
      throw new Error(
        `${code} 대표 프로필 가중치 합 불일치: ${weightSum}/${residential.weightScale}`,
      );
    }
  }
  if (stats.profiles > stats.dongCount * residential.maxProfilesPerDong) {
    throw new Error(
      `전체 대표 프로필 상한 초과: ${stats.profiles}/` +
        `${stats.dongCount * residential.maxProfilesPerDong}`,
    );
  }

  await mkdir(dirname(OUTPUT), { recursive: true });
  await writeFile(OUTPUT, `${JSON.stringify(residential)}\n`, "utf8");
  const size = (await stat(OUTPUT)).size;
  console.log(
    `[access] ${stats.inputCells.toLocaleString()}개 100m 셀 · ` +
      `${stats.rawProfiles.toLocaleString()}개 원 프로필 → ` +
      `${stats.profiles.toLocaleString()}개 대표 프로필`,
  );
  console.log(
    `[access] 인구 ${stats.populationTotal.toLocaleString()}명 · ` +
      `버스 후보 포함 ${stats.busProfilePopulation.toLocaleString()}명`,
  );
  console.log(
    `[access] 동별 최대 ${stats.maxProfilesInDong}개 · ` +
      `출력 가중치 합 ${residential.weightScale.toLocaleString()}/동`,
  );
  console.log(`[access] 출력: ${OUTPUT} (${(size / 1024 / 1024).toFixed(2)} MiB)`);
}

await main();
