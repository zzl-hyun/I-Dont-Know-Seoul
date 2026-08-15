#!/usr/bin/env node
//
// 동 마커(등급 아이콘) 좌표를 폴리곤 기하학적 대표점에서 "동별 최대 인구
// 100m 셀" 중심으로 옮긴다. 산·녹지가 넓은 동(용인 동천동, 서초 양재2동 등)은
// mapshaper `-points inner` 대표점이 사람이 안 사는 산속에 찍혀서, 지도가
// 실제 생활권과 동떨어진 곳에 아이콘을 그리는 문제가 있었다.
//
// dong-meta.json 의 lng/lat 는 건드리지 않는다 — commute.ts 의 통근 계산
// 폴백, population-access.mjs 의 인구셀 폴백 등 여러 곳에서 "인구 데이터가
// 없거나 이상할 때" 쓰는 원점이라, 마커 좌표 자체를 인구 데이터로 덮어쓰면
// 폴백이 폴백 대상과 같아지는 순환이 생긴다. 대신 markerLng/markerLat 라는
// 새 필드를 추가해 지도(그리고 오직 지도)만 이걸 쓰게 한다.
//
// 셀→동 배정은 이미 prepare-population-grid.mjs 가 point-in-polygon 검증까지
// 마쳐 grid-population-100m-2024.json 에 커밋해 둔 결과다 — 여기서는 그
// 배정을 다시 하지 않고, 동별 셀 목록에서 인구가 가장 많은 셀 하나만 고른다.
// (update-population-walk-metric.mjs 와 같은 "이미 만들어진 산출물만 읽어
// dong-meta.json 을 패치하는" 패턴을 따른다.)

import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DONG_META = join(ROOT, "data/dist/dong-meta.json");
const POPULATION = join(ROOT, "data/raw/grid-population-100m-2024.json");

function haversineM(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/** 동 하나의 인구셀 목록에서 인구가 가장 많은 셀의 [lng, lat]을 고른다. */
export function pickMaxPopulationCell(cells) {
  if (!Array.isArray(cells) || cells.length === 0) return null;
  let best = cells[0];
  for (const cell of cells) {
    if (cell[2] > best[2]) best = cell;
  }
  return [best[0], best[1]];
}

async function main() {
  const [dongMeta, population] = await Promise.all(
    [DONG_META, POPULATION].map(async (path) => JSON.parse(await readFile(path, "utf8"))),
  );

  let patchedCount = 0;
  let fallbackCount = 0;
  const distancesM = [];

  for (const dong of dongMeta.dongs) {
    const cells = population.dongs?.[dong.code];
    const picked = pickMaxPopulationCell(cells);
    if (!picked) {
      // 이론상 0개(실측으로 556/556개 동에 인구셀 확인 완료)지만, 방어적으로
      // markerLng/markerLat 를 아예 안 넣어 클라이언트가 기존 lng/lat로
      // 자연스럽게 폴백하게 둔다.
      fallbackCount += 1;
      continue;
    }
    const [markerLng, markerLat] = picked;
    dong.markerLng = markerLng;
    dong.markerLat = markerLat;
    distancesM.push(haversineM(dong.lat, dong.lng, markerLat, markerLng));
    patchedCount += 1;
  }

  dongMeta.generatedAt = new Date().toISOString();
  dongMeta.markerSource = "SGIS 2024 100m 인구격자 중 동별 최대 인구 셀 중심";
  await writeFile(DONG_META, `${JSON.stringify(dongMeta, null, 2)}\n`, "utf8");

  const sorted = [...distancesM].sort((a, b) => a - b);
  const medianM = sorted[Math.floor(sorted.length / 2)] ?? 0;
  const maxM = sorted.at(-1) ?? 0;
  console.log(
    `[markers] ${patchedCount}개 동 마커 좌표 갱신 · 폴백(인구셀 없음) ${fallbackCount}개`,
  );
  console.log(
    `[markers] 대표점 대비 이동거리 중앙값 ${medianM.toFixed(0)}m · 최대 ${maxM.toFixed(0)}m`,
  );
}

await main();
