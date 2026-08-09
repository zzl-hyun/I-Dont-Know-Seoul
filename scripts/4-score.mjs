/**
 * 4-score.mjs — 원지표 → 축 점수(백분위) → 앱 번들
 *
 * 입력: data/dist/metrics.json, dong-meta.json, subway-graph.json
 * 출력: data/dist/scores.json, public/data/bundle.json
 *
 * 정규화 방식:
 *   각 원지표를 서울 427개 동 내 **백분위 순위**로 바꾼다 (0~100).
 *   평균/표준편차 정규화는 강남 월세 같은 이상치 하나에 전체 분포가 끌려가고,
 *   min-max 정규화도 마찬가지다. 백분위는 이상치에 영향받지 않고, 단위가
 *   서로 다른 지표(대/km², 만원, 분)를 그대로 섞을 수 있다.
 *
 * 결측 처리:
 *   수집 안 된 지표는 축 내부 가중치에서 빼고 나머지로 재분배한다.
 *   축 전체에 데이터가 없으면 모든 동을 50점으로 채운다 — 그러면 그 축은
 *   순위에 영향을 주지 않으므로, 사용자가 슬라이더를 올려도 결과가 왜곡되지 않는다.
 */
import { mkdir, readFile, writeFile, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_SCORES = join(ROOT, "data/dist/scores.json");
const OUT_BUNDLE = join(ROOT, "public/data/bundle.json");

/**
 * 축별 구성 지표와 방향.
 *   dir: +1 = 높을수록 좋음, -1 = 높을수록 나쁨
 */
const AXES = {
  safety: [
    { key: "cctvPerKm2", weight: 0.35, dir: +1, label: "CCTV 밀도" },
    { key: "nightlifePerKm2", weight: 0.35, dir: -1, label: "유흥업소 밀도" },
    { key: "crimePer1k", weight: 0.3, dir: -1, label: "5대범죄" },
  ],
  price: [
    { key: "monthlyRentMan", weight: 1.0, dir: -1, label: "원룸 환산월세" },
  ],
  /*
   * 교통(역 도보 + 버스)의 합은 0.25 로 유지하고 그 안에서 7:3 으로 나눈다.
   *
   * 지하철에 비중을 더 주는 이유: 서울에서 지하철이 정시성·속도 모두 우위이고,
   * 무엇보다 이 앱의 통근시간 계산 자체가 지하철만 쓴다. 버스 정류장 밀도는
   * 독립적인 교통 지표라기보다 "지하철이 안 닿는 동네의 보완재" 성격이다.
   *
   * "교통 접근성" 중첩 지표를 만들지 않고 가중치를 쪼갠 이유: AXES 는 평평한
   * (key, weight, dir) 목록이고 explain.ts 의 계산 과정 표시도 그 구조를 전제한다.
   * 중첩을 넣으면 파이프라인·타입·설명 UI가 전부 한 단계 깊어지는데,
   * 쪼개 넣으면 결과가 수학적으로 동일하다.
   */
  convenience: [
    { key: "storePerKm2", weight: 0.3, dir: +1, label: "편의점·마트 밀도" },
    { key: "foodPerKm2", weight: 0.25, dir: +1, label: "음식점 밀도" },
    { key: "medicalPerKm2", weight: 0.2, dir: +1, label: "병원·약국 밀도" },
    { key: "walkToStationMin", weight: 0.175, dir: -1, label: "최근접역 도보" },
    { key: "busStopPerKm2", weight: 0.075, dir: +1, label: "버스 정류장 밀도" },
  ],
};

/** 실거래 표본이 이보다 적으면 대체값으로 보고 dataQuality=low 로 표시한다. */
const MIN_RENT_SAMPLES = 5;

async function main() {
  const metrics = JSON.parse(await readFile(join(ROOT, "data/dist/metrics.json"), "utf8"));
  const dongMeta = JSON.parse(await readFile(join(ROOT, "data/dist/dong-meta.json"), "utf8"));
  const graph = JSON.parse(await readFile(join(ROOT, "data/dist/subway-graph.json"), "utf8"));

  const rows = metrics.dongs;
  console.log(`행정동 ${rows.length}개`);

  /* ---- 1. 지표별 백분위 계산 ---- */
  const pct = new Map(); // metricKey → Map(code → 0~100)
  const availableKeys = new Set();

  for (const parts of Object.values(AXES)) {
    for (const { key, dir } of parts) {
      const values = rows
        .map((r) => ({ code: r.code, v: r[key] }))
        .filter((x) => typeof x.v === "number" && Number.isFinite(x.v));

      if (values.length < rows.length * 0.5) {
        console.log(`  ${key.padEnd(18)} 결측 (${values.length}/${rows.length}) → 제외`);
        continue;
      }
      availableKeys.add(key);
      pct.set(key, percentileRank(values, dir));
      console.log(`  ${key.padEnd(18)} OK (${values.length}/${rows.length})`);
    }
  }

  /* ---- 2. 축 점수 ---- */
  const scores = {};
  const unavailableAxes = [];

  for (const [axis, parts] of Object.entries(AXES)) {
    const usable = parts.filter((p) => availableKeys.has(p.key));
    if (usable.length === 0) {
      unavailableAxes.push(axis);
      continue;
    }
    const wSum = usable.reduce((s, p) => s + p.weight, 0);
    for (const r of rows) {
      let v = 0;
      for (const p of usable) v += (pct.get(p.key).get(r.code) ?? 50) * (p.weight / wSum);
      (scores[r.code] ??= {})[axis] = Math.round(v * 10) / 10;
    }
    const dropped = parts.filter((p) => !availableKeys.has(p.key)).map((p) => p.label);
    console.log(
      `\n  ${axis}: ${usable.map((p) => p.label).join(" + ")}` +
        (dropped.length ? `  (제외: ${dropped.join(", ")})` : "")
    );
  }

  // 데이터가 전혀 없는 축은 전 동 50점 — 순위에 영향을 주지 않는다
  for (const axis of unavailableAxes) {
    for (const r of rows) (scores[r.code] ??= {})[axis] = 50;
    console.log(`\n  ${axis}: 데이터 없음 → 전 동 50점 (순위에 영향 없음)`);
  }

  /*
   * ---- 3. 지표별 백분위를 함께 싣는다 ----
   *
   * 이게 없으면 UI가 "치안 78점"만 보여줄 뿐 그 78이 어디서 왔는지 설명할 수
   * 없다. 실제로 유흥업소가 0개인데 78점인 동(신림동)이 있는데, 서울 동의
   * 상당수가 0개라 동점 평균 순위가 매겨진 결과다. 백분위가 없으면 이게
   * 버그처럼 보인다.
   *
   * 객체가 아니라 **고정 순서 배열**로 저장한다. 키 이름을 427번 반복하면
   * 약 85KB가 늘지만 배열이면 20KB 안쪽이다. 순서는 문서의 pctKeys 가 정한다.
   */
  const pctKeys = [...availableKeys];
  for (const r of rows) {
    scores[r.code].pct = pctKeys.map((k) => {
      const v = pct.get(k)?.get(r.code);
      return v == null ? null : Math.round(v * 10) / 10;
    });
  }

  /* ---- 4. 원지표를 함께 실어 UI에서 근거로 보여준다 ---- */
  for (const r of rows) {
    const s = scores[r.code];
    s.raw = {
      monthlyRentMan: r.monthlyRentMan,
      rentSamples: r.rentSamples ?? 0,
      cctvPerKm2: r.cctvPerKm2,
      nightlifePerKm2: r.nightlifePerKm2,
      crimePer1k: r.crimePer1k,
      storePerKm2: r.storePerKm2,
      foodPerKm2: r.foodPerKm2,
      medicalPerKm2: r.medicalPerKm2,
      busStopPerKm2: r.busStopPerKm2,
      walkToStationMin: r.walkToStationMin,
    };
    s.dataQuality =
      r.monthlyRentMan != null && (r.rentSamples ?? 0) < MIN_RENT_SAMPLES ? "low" : "ok";
  }

  verify(scores, rows);

  /* ---- 5. 저장 ---- */

  /*
   * 축 내부 구성을 그대로 내보낸다. UI가 "치안 78 = 유흥업소 78 × 1.00" 처럼
   * 축 점수가 어떻게 합성됐는지 보여주려면 하위 지표의 가중치와 방향이 필요하다.
   * 가중치는 사용 가능한 지표들로 재정규화한 값을 싣는다 — 결측 지표가 빠지면
   * 나머지로 재분배되므로, 원래 상수를 그대로 보내면 UI 계산식이 안 맞는다.
   */
  const axisWeights = {};
  for (const [axis, parts] of Object.entries(AXES)) {
    const usable = parts.filter((p) => availableKeys.has(p.key));
    const wSum = usable.reduce((s, p) => s + p.weight, 0) || 1;
    axisWeights[axis] = usable.map((p) => ({
      key: p.key,
      label: p.label,
      dir: p.dir,
      w: Math.round((p.weight / wSum) * 1000) / 1000,
    }));
  }

  const scoreDoc = {
    version: new Date().toISOString().slice(0, 10),
    generatedAt: new Date().toISOString(),
    pctKeys,
    axisWeights,
    axes: Object.fromEntries(
      Object.entries(AXES).map(([axis, parts]) => [
        axis,
        parts.filter((p) => availableKeys.has(p.key)).map((p) => p.label),
      ])
    ),
    unavailableAxes,
    scores,
  };
  await mkdir(dirname(OUT_SCORES), { recursive: true });
  await writeFile(OUT_SCORES, JSON.stringify(scoreDoc, null, 2) + "\n");

  const bundle = {
    meta: {
      boundaryVersion: dongMeta.version,
      graphVersion: graph.version,
      scoreVersion: scoreDoc.version,
      availableMetrics: metrics.available,
      missingMetrics: metrics.missing,
    },
    pctKeys,
    axisWeights,
    unavailableAxes,
    dongs: dongMeta.dongs,
    graph,
    scores,
  };
  await mkdir(dirname(OUT_BUNDLE), { recursive: true });
  await writeFile(OUT_BUNDLE, JSON.stringify(bundle));

  const size = (await stat(OUT_BUNDLE)).size;
  console.log(`\n✓ ${OUT_SCORES}`);
  console.log(`✓ ${OUT_BUNDLE}  ${(size / 1024).toFixed(0)} KB`);
  printDistribution(scores, rows);
}

/**
 * 백분위 순위 (0~100).
 * 동점은 평균 순위를 부여해 임의의 순서 때문에 점수가 갈리지 않게 한다.
 */
function percentileRank(values, dir) {
  const sorted = [...values].sort((a, b) => a.v - b.v);
  const n = sorted.length;
  const out = new Map();

  let i = 0;
  while (i < n) {
    let j = i;
    while (j + 1 < n && sorted[j + 1].v === sorted[i].v) j++;
    // i..j 가 동점 구간 → 평균 순위
    const avgRank = (i + j) / 2;
    const p = n === 1 ? 50 : (avgRank / (n - 1)) * 100;
    for (let k = i; k <= j; k++) {
      out.set(sorted[k].code, dir > 0 ? p : 100 - p);
    }
    i = j + 1;
  }
  return out;
}

function verify(scores, rows) {
  const problems = [];
  for (const r of rows) {
    const s = scores[r.code];
    if (!s) {
      problems.push(`점수 누락: ${r.name}`);
      continue;
    }
    for (const axis of Object.keys(AXES)) {
      const v = s[axis];
      if (typeof v !== "number" || !Number.isFinite(v) || v < 0 || v > 100) {
        problems.push(`${r.name} ${axis} 값 이상: ${v}`);
      }
    }
  }
  if (problems.length) {
    console.error("\n✗ 검증 실패:");
    for (const p of problems.slice(0, 10)) console.error("  - " + p);
    process.exit(1);
  }
}

function printDistribution(scores, rows) {
  const composite = rows.map((r) => ({
    name: r.name,
    v: scores[r.code].safety * 0.4 + scores[r.code].price * 0.35 + scores[r.code].convenience * 0.25,
  }));
  composite.sort((a, b) => b.v - a.v);
  console.log("\n  기본 가중치(치안40/가격35/편의25) 기준 상위 5개:");
  for (const c of composite.slice(0, 5)) console.log(`    ${c.v.toFixed(1)}  ${c.name}`);
  console.log("  하위 5개:");
  for (const c of composite.slice(-5)) console.log(`    ${c.v.toFixed(1)}  ${c.name}`);
}

await main();
