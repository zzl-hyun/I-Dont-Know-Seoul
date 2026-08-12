#!/usr/bin/env node

import { createHash } from "node:crypto";
import {
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  assignPopulationCell,
  createPopulationAssignment,
  decodePopulationCsvBuffer,
  finalizePopulationSnapshot,
  visitPopulationCsv,
} from "./lib/sgis-population.mjs";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, "..");
const DEFAULT_SOURCE_DIR = join(REPO_ROOT, "data/raw/_census_reqdoc_1786503689774");
const DEFAULT_OUTPUT_PATH = join(REPO_ROOT, "data/raw/grid-population-100m-2024.json");
const DONG_GEOJSON_PATH = join(REPO_ROOT, "public/dong.geojson");
const REQUIRED_PREFIXES = ["다바", "다사", "라사"];

function absoluteCliPath(value, fallback) {
  return value ? resolve(process.cwd(), value) : fallback;
}

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function findSourceFiles(sourceDir) {
  if (!statSync(sourceDir).isDirectory()) throw new Error(`원본 경로가 디렉터리가 아닙니다: ${sourceDir}`);
  const csvNames = readdirSync(sourceDir)
    .filter((name) => name.toLocaleLowerCase("en-US").endsWith(".csv"))
    .sort((a, b) => a.normalize("NFC").localeCompare(b.normalize("NFC"), "ko"));

  const byPrefix = new Map();
  for (const name of csvNames) {
    const normalized = name.normalize("NFC");
    const matchingPrefixes = REQUIRED_PREFIXES.filter((prefix) => normalized.includes(prefix));
    if (matchingPrefixes.length !== 1) {
      throw new Error(`파일명에서 SGIS 격자 접두사를 하나로 판별할 수 없습니다: ${name}`);
    }
    const prefix = matchingPrefixes[0];
    if (byPrefix.has(prefix)) throw new Error(`${prefix} 원본 CSV가 둘 이상입니다.`);
    byPrefix.set(prefix, join(sourceDir, name));
  }

  for (const prefix of REQUIRED_PREFIXES) {
    if (!byPrefix.has(prefix)) throw new Error(`${prefix} 원본 CSV가 없습니다: ${sourceDir}`);
  }
  if (csvNames.length !== REQUIRED_PREFIXES.length) {
    throw new Error(`예상 CSV는 3개인데 ${csvNames.length}개를 찾았습니다: ${sourceDir}`);
  }
  return REQUIRED_PREFIXES.map((prefix) => ({ prefix, path: byPrefix.get(prefix) }));
}

function main() {
  const sourceDir = absoluteCliPath(process.argv[2], DEFAULT_SOURCE_DIR);
  const outputPath = absoluteCliPath(process.argv[3], DEFAULT_OUTPUT_PATH);
  const geojsonBuffer = readFileSync(DONG_GEOJSON_PATH);
  const geojson = JSON.parse(geojsonBuffer.toString("utf8"));
  const assignment = createPopulationAssignment(geojson);
  const sourceFiles = [];

  for (const source of findSourceFiles(sourceDir)) {
    const buffer = readFileSync(source.path);
    const text = decodePopulationCsvBuffer(buffer);
    const stats = visitPopulationCsv(
      text,
      {
        expectedPrefix: source.prefix,
        sourceLabel: source.path,
      },
      (cell) => assignPopulationCell(assignment, cell),
    );
    sourceFiles.push({
      name: source.path.slice(sourceDir.length + 1).normalize("NFC"),
      prefix: source.prefix,
      sha256: sha256(buffer),
      ...stats,
    });
    console.log(
      `[population] ${source.prefix}: ${stats.acceptedCellCount.toLocaleString("ko-KR")}개 양수 셀`,
    );
  }

  const snapshot = finalizePopulationSnapshot(assignment, {
    source: { files: sourceFiles },
    boundary: {
      path: "public/dong.geojson",
      sha256: sha256(geojsonBuffer),
    },
  });

  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(snapshot)}\n`, "utf8");
  const outputBytes = statSync(outputPath).size;
  const { coverage } = snapshot;
  console.log(
    `[population] 대상 배정: ${coverage.assignedCellCount.toLocaleString("ko-KR")}개 셀 / ` +
      `${coverage.assignedPopulation.toLocaleString("ko-KR")}명`,
  );
  console.log(
    `[population] 행정동 커버리지: ${coverage.populatedDongCount}/${coverage.dongCount}, ` +
      `인구 셀 없음 ${coverage.noPopulationDongCount}개, 경계 중첩 ${coverage.ambiguousCellCount}개`,
  );
  if (coverage.dongsWithoutPopulation.length > 0) {
    console.log(
      `[population] 인구 셀 없는 동: ${coverage.dongsWithoutPopulation
        .map(([code, name]) => `${name}(${code})`)
        .join(", ")}`,
    );
  }
  console.log(`[population] 출력: ${outputPath} (${outputBytes.toLocaleString("ko-KR")} bytes)`);
}

main();
