/**
 * 3-metrics.mjs — 행정동별 원지표 수집
 *
 * 출력: data/dist/metrics.json  (동별 원시 수치 — 정규화 전)
 *
 * 지표별 출처와 키 필요 여부:
 *
 *   생활편의 (편의점·마트·음식점·병원)  OSM Overpass    키 불필요 ✔
 *   유흥업소 밀도                      OSM Overpass    키 불필요 ✔
 *   최근접역 도보시간                  자체 그래프      키 불필요 ✔
 *   CCTV 밀도                         서울 열린데이터   SEOUL_OPEN_DATA_KEY 필요(원 데이터셋 폐기로 현재 비활성)
 *   5대범죄 (자치구)                   경찰청+행안부    키 불필요 (data/raw/ CSV 스냅샷)
 *   교통사고 다발지역                  도로교통공단     키 불필요 (data/raw/ CSV 스냅샷)
 *   환산월세                          국토부 실거래가   DATA_GO_KR_KEY 필요
 *
 * 키/데이터가 없는 지표는 null로 남기고 4-score.mjs 가 가중치를 재분배한다.
 * 즉 아무것도 없어도 지금 당장 돌아가고, 채울수록 그만큼 정확해진다.
 *
 * 환경변수는 .env 파일이나 셸에서 전달한다:
 *   DATA_GO_KR_KEY=... npm run data:metrics
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { haversineM, pointInGeometry, bbox, walkMinutes } from "./lib/geo.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * .env 에서 API 키를 읽어 process.env 에 넣는다.
 * 이미 셸에 설정된 값이 있으면 그쪽을 우선한다.
 * (.env 는 .gitignore 로 제외되어 있다 — 저장소가 공개라 반드시 유지할 것)
 */
async function loadEnv() {
  let text;
  try {
    text = await readFile(join(ROOT, ".env"), "utf8");
  } catch {
    return;
  }
  for (const line of text.split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    const [, key, rawValue] = m;
    if (process.env[key]) continue;
    process.env[key] = rawValue.replace(/^["']|["']$/g, "");
  }
}
await loadEnv();
const OUT = join(ROOT, "data/dist/metrics.json");
const POI_CACHE = join(ROOT, "data/raw/osm-poi.json");

const SEOUL_BBOX = "37.41,126.75,37.72,127.20";

const OVERPASS_MIRRORS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
];

/**
 * POI 분류.
 *
 * OSM 서울 커버리지 실측: 편의점 7,132개(실제 약 9,000개의 79%),
 * 음식점 42,797개. 절대 개수는 실제보다 적지만 모든 지표를 동 간
 * **백분위**로 환산해 쓰므로, 커버리지가 지역에 고르게 분포하는 한
 * 상대 비교에는 문제가 없다.
 *
 * 다만 매핑 활동이 활발한 지역(홍대·이태원 등)이 과대 대표될 수 있다는
 * 편향은 남는다. 이건 4-score.mjs 의 출처 표기와 UI 면책 문구로 알린다.
 */
const POI_GROUPS = {
  store: {
    shop: ["convenience", "supermarket", "department_store", "greengrocer"],
  },
  food: {
    amenity: ["restaurant", "fast_food", "cafe"],
  },
  medical: {
    amenity: ["pharmacy", "clinic", "hospital", "doctors"],
  },
  nightlife: {
    amenity: ["bar", "pub", "nightclub"],
  },
  /*
   * 버스 정류장 (서울 약 14,600개).
   *
   * 편의 축이 지하철 도보시간만 보면 편향이 생긴다 — 노원·은평·강북 일부는 역이
   * 멀어도 버스가 촘촘해 실제 교통 접근성은 훨씬 낫다.
   *
   * 한계: 이건 "정류장이 많다"를 재는 것이지 "노선이 다양하다"를 재지 않는다.
   * 한 노선만 여러 번 서는 동네도 밀도가 높게 나온다. 노선 다양성을 보려면
   * 정류장→노선 매핑(서울 1,005개 노선)이 필요해 비용이 크게 뛴다.
   */
  busStop: {
    highway: ["bus_stop"],
  },
};

async function main() {
  const dongMeta = JSON.parse(
    await readFile(join(ROOT, "data/dist/dong-meta.json"), "utf8")
  );
  const boundaries = JSON.parse(
    await readFile(join(ROOT, "public/seoul-dong.geojson"), "utf8")
  );
  const graph = JSON.parse(
    await readFile(join(ROOT, "data/dist/subway-graph.json"), "utf8")
  );

  const dongs = dongMeta.dongs;
  console.log(`행정동 ${dongs.length}개`);

  const index = buildSpatialIndex(boundaries, dongs);

  /** code → { store, food, medical, nightlife, ... } */
  const counts = new Map(
    dongs.map((d) => [
      d.code,
      { store: 0, food: 0, medical: 0, nightlife: 0, busStop: 0, cctv: 0, trafficAccident: 0 },
    ])
  );

  /* ---- 1. OSM POI (키 불필요) ---- */
  console.log("\n[1/6] OSM POI 수집...");
  const pois = await fetchPois();
  let assigned = 0;
  let outside = 0;
  for (const p of pois) {
    const lat = p.lat ?? p.center?.lat;
    const lng = p.lon ?? p.center?.lon;
    if (lat == null || lng == null) continue;
    const group = classify(p.tags);
    if (!group) continue;
    const code = index.lookup(lng, lat);
    if (!code) {
      outside++;
      continue;
    }
    counts.get(code)[group]++;
    assigned++;
  }
  console.log(`  POI ${pois.length.toLocaleString()}개 중 ${assigned.toLocaleString()}개를 행정동에 배정 (서울 밖 ${outside.toLocaleString()}개 제외)`);
  for (const g of Object.keys(POI_GROUPS)) {
    const total = [...counts.values()].reduce((s, c) => s + c[g], 0);
    console.log(`    ${g.padEnd(10)} ${total.toLocaleString()}개`);
  }

  /* ---- 2. 최근접역 도보시간 (자체 그래프) ---- */
  console.log("\n[2/6] 최근접 지하철역 도보시간...");
  const walkMin = new Map();
  for (const d of dongs) {
    let best = Infinity;
    for (const s of graph.stations) {
      const dist = haversineM(d.lat, d.lng, s.lat, s.lng);
      if (dist < best) best = dist;
    }
    // 보정 계수는 geo.mjs 한 곳에서만 정의한다 — 여기 숫자를 다시 적으면
    // 상수를 바꿀 때 이쪽만 남아 지표와 모델이 어긋난다.
    walkMin.set(d.code, walkMinutes(best));
  }
  const walkVals = [...walkMin.values()].sort((a, b) => a - b);
  console.log(`  중앙값 ${walkVals[Math.floor(walkVals.length / 2)].toFixed(1)}분 · 최대 ${walkVals.at(-1).toFixed(1)}분`);

  /* ---- 3. CCTV — 데이터 출처가 없어졌다 ---- */
  console.log("\n[3/6] CCTV 밀도...");
  /*
   * 서울 열린데이터광장의 "안심이 CCTV 연계 현황"(OA-20923)은 2026-02-10 자로
   * 폐기됐다("안심주소에 IP 노출로 국정원 지적"). 현재 API는 ERROR-500 을 준다.
   *
   * 대안을 검토했으나 쓸 만한 게 없다:
   *   - OSM man_made=surveillance: 서울 875개. 실제 공공 CCTV 약 8만대의 1% —
   *     밀도 비교에 쓰면 지역 간 차이가 매핑 활동 편차를 반영할 뿐이다.
   *
   * 따라서 치안 축은 유흥업소 밀도만으로 계산한다. 새 출처가 생기면
   * counts.get(code).cctv 를 채우고 cctvOk 를 true 로 만들면 된다.
   */
  const cctvOk = false;
  console.log("  건너뜀 — 원 데이터셋(안심이 CCTV)이 2026-02-10 폐기됨");

  /* ---- 4. 5대범죄 (자치구, CSV 스냅샷) ---- */
  console.log("\n[4/6] 5대범죄...");
  let crimeByGu = new Map();
  try {
    crimeByGu = await loadCrimePer1k();
    console.log(`  자치구 ${crimeByGu.size}개 계산됨`);
  } catch (err) {
    console.log(`  건너뜀 — ${err.message}`);
  }

  /* ---- 5. 교통사고 다발지역 (점 데이터, 기존 공간 인덱스 재사용) ---- */
  console.log("\n[5/6] 교통사고 다발지역...");
  let accidentOk = false;
  try {
    const spots = await loadTrafficAccidents();
    let hit = 0;
    for (const { lat, lng, count } of spots) {
      const code = index.lookup(lng, lat);
      if (!code) continue; // 서울 밖으로 판정되면 자연히 걸러진다 — OSM POI와 동일 패턴
      counts.get(code).trafficAccident += count;
      hit++;
    }
    console.log(`  ${spots.length}개 지점 중 ${hit}개가 동에 배정됨`);
    accidentOk = true;
  } catch (err) {
    console.log(`  건너뜀 — ${err.message}`);
  }

  /* ---- 6. 환산월세: 단독/다가구 + 오피스텔 + 소형아파트 (국토부, 키 필요) ---- */
  console.log("\n[6/6] 환산월세...");
  const molitKey = process.env.DATA_GO_KR_KEY;
  let rent = new Map();
  if (molitKey) {
    try {
      rent = await fetchRent(molitKey, dongs);
      console.log(`  ${rent.size}개 동에서 실거래 표본 확보`);
    } catch (err) {
      console.log(`  건너뜀 — ${err.message}`);
    }
  } else {
    console.log("  건너뜀 — DATA_GO_KR_KEY 없음");
  }

  /* ---- 조합 ---- */
  const rows = dongs.map((d) => {
    const c = counts.get(d.code);
    const area = d.areaKm2;
    const r = rent.get(d.code);
    return {
      code: d.code,
      name: d.name,
      gu: d.gu,
      areaKm2: area,
      storePerKm2: round2(c.store / area),
      foodPerKm2: round2(c.food / area),
      medicalPerKm2: round2(c.medical / area),
      nightlifePerKm2: round2(c.nightlife / area),
      busStopPerKm2: round2(c.busStop / area),
      cctvPerKm2: cctvOk ? round2(c.cctv / area) : null,
      // 자치구 단위 — 같은 구 안의 동들은 전부 같은 값을 갖는다. 월세의
      // 법정동 해상도 한계(자치구 중앙값 대체)와 같은 성격의 제약이다.
      crimePer1k: crimeByGu.get(d.gu) ?? null,
      trafficAccidentPerKm2: accidentOk ? round2(c.trafficAccident / area) : null,
      monthlyRentMan: r?.median ?? null,
      rentSamples: r?.samples ?? 0,
      walkToStationMin: round2(walkMin.get(d.code)),
    };
  });

  const available = [
    "storePerKm2",
    "foodPerKm2",
    "medicalPerKm2",
    "nightlifePerKm2",
    "busStopPerKm2",
    "walkToStationMin",
  ];
  const missing = [];
  if (!cctvOk) missing.push("cctvPerKm2");
  if (rent.size === 0) missing.push("monthlyRentMan");
  if (crimeByGu.size === 0) missing.push("crimePer1k");
  if (!accidentOk) missing.push("trafficAccidentPerKm2");
  if (cctvOk) available.push("cctvPerKm2");
  if (rent.size > 0) available.push("monthlyRentMan");
  if (crimeByGu.size > 0) available.push("crimePer1k");
  if (accidentOk) available.push("trafficAccidentPerKm2");

  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(
    OUT,
    JSON.stringify(
      {
        version: new Date().toISOString().slice(0, 10),
        generatedAt: new Date().toISOString(),
        sources: {
          poi: "OpenStreetMap (ODbL)",
          cctv: cctvOk ? "서울 열린데이터광장" : null,
          crime: crimeByGu.size > 0 ? "경찰청 범죄 발생 지역별 통계 + 행안부 주민등록인구" : null,
          trafficAccident: accidentOk ? "도로교통공단 전국교통사고다발지역표준데이터" : null,
          rent: rent.size > 0 ? "국토교통부 실거래가" : null,
        },
        available,
        missing,
        dongs: rows,
      },
      null,
      2
    ) + "\n"
  );

  console.log(`\n✓ ${OUT}`);
  console.log(`  수집된 지표: ${available.join(", ")}`);
  if (missing.length) {
    console.log(`  미수집 지표: ${missing.join(", ")}`);
    console.log(`  → API 키를 설정하면 채워집니다 (README 참고)`);
  }
}

/* ------------------------------------------------------------------ */
/* 공간 인덱스 — 427개 폴리곤에 6만 개 POI를 배정하려면 필요하다.        */
/* 격자 버킷으로 후보를 줄인 뒤 point-in-polygon 을 돌린다.             */
/* ------------------------------------------------------------------ */

function buildSpatialIndex(boundaries, dongs) {
  const CELL = 0.01; // 약 1km
  const byCode = new Map(dongs.map((d) => [d.code, d]));
  const cells = new Map();
  const geoms = [];

  for (const f of boundaries.features) {
    const code = String(f.properties.adm_cd2);
    if (!byCode.has(code)) continue;
    const gi = geoms.length;
    const bb = bbox(f.geometry);
    geoms.push({ code, geometry: f.geometry, bb });

    const [minX, minY, maxX, maxY] = bb;
    for (let x = Math.floor(minX / CELL); x <= Math.floor(maxX / CELL); x++) {
      for (let y = Math.floor(minY / CELL); y <= Math.floor(maxY / CELL); y++) {
        const key = `${x},${y}`;
        if (!cells.has(key)) cells.set(key, []);
        cells.get(key).push(gi);
      }
    }
  }

  return {
    lookup(lng, lat) {
      const key = `${Math.floor(lng / CELL)},${Math.floor(lat / CELL)}`;
      const candidates = cells.get(key);
      if (!candidates) return null;
      for (const gi of candidates) {
        const g = geoms[gi];
        if (lng < g.bb[0] || lng > g.bb[2] || lat < g.bb[1] || lat > g.bb[3]) continue;
        if (pointInGeometry(lng, lat, g.geometry)) return g.code;
      }
      return null;
    },
  };
}

function classify(tags) {
  if (!tags) return null;
  for (const [group, rules] of Object.entries(POI_GROUPS)) {
    for (const [key, values] of Object.entries(rules)) {
      if (tags[key] && values.includes(tags[key])) return group;
    }
  }
  return null;
}

/* ------------------------------------------------------------------ */

async function fetchPois() {
  try {
    const cached = await readFile(POI_CACHE, "utf8");
    console.log("  OSM POI 캐시 사용 (다시 받으려면 data/raw/osm-poi.json 삭제)");
    return JSON.parse(cached).elements;
  } catch {
    /* 캐시 없음 */
  }

  const filters = [];
  for (const rules of Object.values(POI_GROUPS)) {
    for (const [key, values] of Object.entries(rules)) {
      filters.push(`nwr["${key}"~"^(${values.join("|")})$"](${SEOUL_BBOX});`);
    }
  }
  const query = `[out:json][timeout:300];(${filters.join("")});out center tags;`;

  const json = await overpass(query);
  await mkdir(dirname(POI_CACHE), { recursive: true });
  await writeFile(POI_CACHE, JSON.stringify(json));
  return json.elements;
}

async function overpass(query) {
  let lastError = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    for (const mirror of OVERPASS_MIRRORS) {
      const host = new URL(mirror).host;
      process.stdout.write(`  Overpass (${attempt}/3) ${host} ... `);
      try {
        const res = await fetch(mirror, {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            "User-Agent": "oneday-data-pipeline/0.1 (Seoul neighborhood map)",
          },
          body: query,
        });
        if (!res.ok) {
          console.log(`실패 (HTTP ${res.status})`);
          lastError = new Error(`HTTP ${res.status}`);
          continue;
        }
        const json = await res.json();
        console.log(`성공 (${json.elements.length.toLocaleString()}개)`);
        return json;
      } catch (err) {
        console.log(`실패 (${err.message})`);
        lastError = err;
      }
    }
    if (attempt < 3) await new Promise((r) => setTimeout(r, attempt * 15000));
  }
  throw new Error(`Overpass 실패: ${lastError?.message}`);
}

/* ---- 경찰청 5대범죄 + 행안부 인구 (자치구, 연 1회 CSV 스냅샷) ---- */

const CRIME_CSV = join(ROOT, "data/raw/police-crime-by-gu-20241231.csv");
const POPULATION_CSV = join(ROOT, "data/raw/population-by-gu-20260630.csv");

/**
 * "5대범죄"(살인·강도·강간강제추행·절도·폭력)에 대응하는 원본 CSV의
 * 범죄대분류. 원본(경찰청_범죄 발생 지역별 통계)은 사기·기타범죄 등
 * 39개 세부 항목을 전부 담고 있는데, 그대로 다 합치면 사기(지능범죄)가
 * 폭력·절도보다 커져 "동네 체감 치안"과 무관한 신호가 된다. 표준 5대범죄
 * 정의를 따라 세 대분류(강력범죄=살인·강도·강간강제추행·방화,
 * 절도범죄, 폭력범죄)만 합산한다.
 */
const CRIME_CATEGORIES = ["강력범죄", "절도범죄", "폭력범죄"];

/**
 * 이 프로젝트가 받는 정부 CSV는 필드에 콤마·따옴표가 없어 단순 분리로
 * 충분하다. 단, 원본이 Windows 줄바꿈(\r\n)이라 각 줄의 마지막 필드에
 * \r 이 붙는다 — 숫자는 Number()가 알아서 무시하지만 문자열(자치구명)은
 * 그대로 비교하면 안 맞는다. trim()으로 필드마다 제거한다.
 */
function parseCsv(text) {
  return text
    .trim()
    .split(/\r?\n/)
    .map((line) => line.split(",").map((field) => field.trim()));
}

/**
 * 자치구별 인구 1천명당 5대범죄 건수.
 *
 * 두 CSV 모두 data.go.kr 파일데이터(인증키 불필요, 연 1회 갱신)를 서울분만
 * 추출해 UTF-8로 재저장한 스냅샷이다 — 원본은 전국 데이터에 CP949
 * 인코딩이라(정부 CSV 흔한 함정) 그대로 커밋하지 않고 이 단계에서 이미
 * 변환해뒀다.
 */
async function loadCrimePer1k() {
  const [crimeText, popText] = await Promise.all([
    readFile(CRIME_CSV, "utf8"),
    readFile(POPULATION_CSV, "utf8"),
  ]);

  const [crimeHeader, ...crimeRows] = parseCsv(crimeText);
  const guNames = crimeHeader.slice(2); // 범죄대분류, 범죄중분류 다음부터 자치구명

  const crimeByGu = new Map(guNames.map((gu) => [gu, 0]));
  for (const [major, , ...counts] of crimeRows) {
    if (!CRIME_CATEGORIES.includes(major)) continue;
    guNames.forEach((gu, i) => crimeByGu.set(gu, crimeByGu.get(gu) + Number(counts[i] || 0)));
  }

  const [, ...popRows] = parseCsv(popText);
  const popByGu = new Map(popRows.map(([gu, pop]) => [gu, Number(pop)]));

  const result = new Map();
  for (const [gu, crimeCount] of crimeByGu) {
    const pop = popByGu.get(gu);
    if (!pop) continue; // 이름이 안 맞는 구는 건너뛴다 — 호출부의 개수 로그로 드러난다
    result.set(gu, round2((crimeCount / pop) * 1000));
  }
  return result;
}

/* ---- 전국교통사고다발지역표준데이터: 서울 취약계층 사고다발지점 (점 데이터) ---- */

const TRAFFIC_CSV = join(ROOT, "data/raw/traffic-accident-hotspots-seoul-2012-2024.csv");

/**
 * "사고지역위치명" 일부 필드에 콤마가 섞여 있어(3건 확인됨) 위 parseCsv로는
 * 컬럼이 밀린다. 최소한의 quoted-field 처리가 있는 파서.
 */
function parseCsvQuoted(text) {
  return text
    .trim()
    .split(/\r?\n/)
    .map((line) => {
      const out = [];
      let cur = "";
      let inQuotes = false;
      for (const c of line) {
        if (c === '"') inQuotes = !inQuotes;
        else if (c === "," && !inQuotes) {
          out.push(cur.trim());
          cur = "";
        } else cur += c;
      }
      out.push(cur.trim());
      return out;
    });
}

/**
 * 서울 교통사고 취약계층(스쿨존어린이·보행어린이·보행노인·자전거) 다발지점.
 *
 * 원본은 전국교통사고다발지역표준데이터(data.go.kr 15029185, 2012~2024
 * 누적)에서 서울분만 추출한 스냅샷이다 — 사전조사 결과 이 4개 유형만
 * 포함되어 있었다(차대차 등 다른 유형은 이 다운로드에 없음). 여러 해에
 * 걸쳐 반복 지정된 지점은 그만큼 누적되는데 의도한 동작이다 — 여러 해
 * 계속 위험지점으로 지정됐다는 건 구조적으로 위험하다는 뜻이다.
 *
 * 지점 개수가 아니라 "사고건수"(그 지점·연도의 실제 사고 건수)를 더해서
 * 집계한다 — 단순 다발지점 지정 여부가 아니라 실제 사고 규모를 반영한다.
 */
async function loadTrafficAccidents() {
  const text = await readFile(TRAFFIC_CSV, "utf8");
  const [header, ...rows] = parseCsvQuoted(text);
  const idx = Object.fromEntries(header.map((h, i) => [h, i]));

  return rows.map((r) => ({
    lat: Number(r[idx["위도"]]),
    lng: Number(r[idx["경도"]]),
    count: Number(r[idx["사고건수"]] || 0),
  }));
}

/* ---- 국토교통부: 단독/다가구 + 오피스텔 + 아파트 전월세 실거래가 ---- */

/**
 * 전월세 → 환산월세.
 * 보증금을 전월세전환율로 월세 환산해 더한다. 서울 기준 약 5.5%.
 * 이렇게 해야 "보증금 5000/월 53" 과 "보증금 1000/월 75" 를 같은 축에서 비교할 수 있다.
 */
const CONVERSION_RATE = 0.055;
const toMonthly = (depositMan, monthlyMan) =>
  monthlyMan + (depositMan * CONVERSION_RATE) / 12;

/**
 * 원룸으로 볼 전용면적 범위(㎡).
 * 실제 데이터를 보면 오피스텔 원룸이 16㎡대에 몰려 있다. 하한을 20㎡로 잡으면
 * 정작 1인 가구가 사는 방이 통째로 빠진다. 상한 40㎡ 위로는 투룸이 섞인다.
 */
const AREA_MIN = 10;
const AREA_MAX = 40;

/**
 * 아파트는 단독/다가구·오피스텔과 같은 상한(40㎡)을 쓰면 표본이 0에 수렴한다.
 * 서울 아파트는 전용 40㎡ 이하가 거의 없다 — 실질적인 최소 평형대가
 * 59㎡(18평형)에 몰려 있다. 60으로 잡아 초소형 아파트까지만 받는다.
 * 가설값이므로 1차 실행 후 실제 ㎡ 분포를 보고 조정할 것.
 */
const AREA_MAX_APT = 60;

/** 이 미만이면 표본 부족으로 보고 상위 단위 값으로 대체한다. */
const MIN_SAMPLES = 5;

/** 최근 몇 개월치를 볼 것인가. 짧으면 표본이 부족하고 길면 시세가 흐려진다. */
const MONTHS_BACK = 12;

/**
 * 동시 요청 수.
 * 6으로 돌렸더니 약 110건째부터 600건 끝까지 전부 실패했다(속도 제한).
 * 2로 낮추고 요청 사이에 간격을 두면 안정적으로 통과한다.
 */
const CONCURRENCY = 2;

/** 요청 간 최소 간격(ms). 속도 제한 회피용. */
const REQUEST_GAP_MS = 120;

/** 실패한 요청 재시도 횟수 (지수 백오프). */
const MAX_RETRY = 4;

/*
 * 아파트 엔드포인트(RTMSDataSvcAptRent)는 기존 두 개와 같은 1613000
 * 서비스 패밀리의 명명 규칙을 그대로 따른 것이다. 정확한 URL은 기술문서가
 * hwp라 자동으로 확인 못 했다 — 활용신청이 안 돼 있거나 이름이 다르면
 * runJob이 다른 두 엔드포인트처럼 개별 실패로 처리하고 넘어간다(전체가
 * 죽지 않는다). 실행 로그에 실패율이 튀면 여기부터 의심할 것.
 */
const ENDPOINTS = [
  { url: "https://apis.data.go.kr/1613000/RTMSDataSvcSHRent/getRTMSDataSvcSHRent", areaMax: AREA_MAX },
  { url: "https://apis.data.go.kr/1613000/RTMSDataSvcOffiRent/getRTMSDataSvcOffiRent", areaMax: AREA_MAX },
  { url: "https://apis.data.go.kr/1613000/RTMSDataSvcAptRent/getRTMSDataSvcAptRent", areaMax: AREA_MAX_APT },
];

/**
 * 행정동 이름에서 대응 가능한 법정동 이름 후보를 만든다.
 *
 * 실거래가 API는 **법정동**(umdNm) 기준이라 행정동에 바로 못 붙는다.
 * 다행히 서울 행정동 상당수는 법정동명에 번호를 붙인 형태다.
 *   "구로4동"   → 법정동 "구로동"
 *   "성내3동"   → 법정동 "성내동"
 *   "상계6·7동" → 법정동 "상계동"
 * 반면 이름이 아예 다른 경우(법정동 봉천동 → 행정동 은천동·청룡동…)는
 * 이 규칙으로 못 붙고 자치구 중앙값으로 대체된다.
 */
function legalDongCandidates(dongName) {
  const out = new Set([dongName]);
  // 숫자/중점이 붙은 형태를 벗겨 기본 법정동명을 만든다
  const stripped = dongName.replace(/[\d·・．.]+(?=동$)/, "");
  if (stripped !== dongName && stripped.length > 1) out.add(stripped);
  // "종로1·2·3·4가동" → "종로1가" 처럼 '가' 로 끝나는 법정동은 규칙이 달라 제외
  return [...out];
}

async function fetchRent(key, dongs) {
  const guCodes = [...new Set(dongs.map((d) => d.guCode))];
  const now = new Date();
  const months = [];
  for (let i = 1; i <= MONTHS_BACK; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(`${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}`);
  }

  // 요청 목록을 미리 펼쳐놓고 제한된 동시성으로 소화한다
  const jobs = [];
  for (const gu of guCodes) {
    for (const ym of months) {
      for (const ep of ENDPOINTS) jobs.push({ gu, ym, ep });
    }
  }

  /** `${guCode}|${법정동명}` → 환산월세 배열 */
  const byLegal = new Map();
  let done = 0;
  let failed = 0;
  let records = 0;

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  /** 한 요청을 처리한다. 실패하면 지수 백오프로 재시도한다. */
  const runJob = async ({ gu, ym, ep }) => {
    const url =
      `${ep.url}?serviceKey=${encodeURIComponent(key)}` +
      `&LAWD_CD=${gu}&DEAL_YMD=${ym}&numOfRows=1000&pageNo=1&_type=json`;

    for (let attempt = 0; attempt <= MAX_RETRY; attempt++) {
      if (attempt > 0) await sleep(500 * 2 ** attempt); // 1s, 2s, 4s, 8s
      try {
        const res = await fetch(url);
        const text = await res.text();
        let body;
        try {
          body = JSON.parse(text)?.response;
        } catch {
          continue; // 인증 실패·속도 제한은 XML 로 온다 → 재시도
        }
        if (body?.header?.resultCode !== "000") continue;

        const items = [].concat(body?.body?.items?.item ?? []);
        for (const it of items) {
          const area = Number(String(it.excluUseAr ?? it.totalFloorAr ?? 0));
          if (!(area >= AREA_MIN && area <= ep.areaMax)) continue;
          const deposit = Number(String(it.deposit ?? "0").replace(/,/g, ""));
          const monthly = Number(String(it.monthlyRent ?? "0").replace(/,/g, ""));
          if (!(monthly > 0)) continue; // 순수 전세 제외 (월세 시세가 아니다)
          const legal = String(it.umdNm ?? "").trim();
          if (!legal) continue;
          const k = `${gu}|${legal}`;
          if (!byLegal.has(k)) byLegal.set(k, []);
          byLegal.get(k).push(toMonthly(deposit, monthly));
          records++;
        }
        return true;
      } catch {
        /* 네트워크 오류 → 재시도 */
      }
    }
    failed++;
    return false;
  };

  // 제한된 동시성 + 요청 간 간격으로 실행
  let cursor = 0;
  const startedAt = Date.now();
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      while (cursor < jobs.length) {
        const job = jobs[cursor++];
        await runJob(job);
        done++;
        if (done % 20 === 0 || done === jobs.length) {
          const el = Math.round((Date.now() - startedAt) / 1000);
          process.stdout.write(
            `\r  실거래 조회 ${done}/${jobs.length} · 표본 ${records.toLocaleString()}건 · 실패 ${failed} · ${el}초   `
          );
        }
        await sleep(REQUEST_GAP_MS);
      }
    })
  );
  process.stdout.write("\n");

  if (records === 0) {
    throw new Error(
      `표본을 하나도 받지 못했습니다 (요청 ${jobs.length}건 중 ${failed}건 실패). ` +
        `DATA_GO_KR_KEY 가 "일반 인증키(Decoding)" 값인지 확인하세요 — ` +
        `%2B, %3D 가 들어간 인코딩 값을 넣으면 이중 인코딩되어 인증에 실패합니다.`
    );
  }

  /* --- 법정동 → 행정동 배분 --- */
  const out = new Map();
  let matched = 0;

  for (const d of dongs) {
    const pool = [];
    for (const cand of legalDongCandidates(d.dong)) {
      const arr = byLegal.get(`${d.guCode}|${cand}`);
      if (arr) pool.push(...arr);
    }
    if (pool.length >= MIN_SAMPLES) {
      out.set(d.code, { median: round2(median(pool)), samples: pool.length });
      matched++;
    }
  }

  // 못 붙은 동은 자치구 중앙값으로 채우고 samples=0 으로 표시한다
  // (4-score.mjs 가 이를 dataQuality="low" 로 UI에 노출한다)
  const byGu = new Map();
  for (const [k, arr] of byLegal) {
    const gu = k.split("|")[0];
    if (!byGu.has(gu)) byGu.set(gu, []);
    byGu.get(gu).push(...arr);
  }
  let filled = 0;
  for (const d of dongs) {
    if (out.has(d.code)) continue;
    const arr = byGu.get(d.guCode);
    if (arr?.length >= MIN_SAMPLES) {
      out.set(d.code, { median: round2(median(arr)), samples: 0 });
      filled++;
    }
  }

  console.log(
    `  실거래 ${records.toLocaleString()}건 · 법정동 직접 매칭 ${matched}개 동 · 자치구 중앙값 대체 ${filled}개 동`
  );
  if (failed) console.log(`  (요청 ${jobs.length}건 중 ${failed}건 실패 — 해당 월/구는 표본에서 빠짐)`);

  return out;
}

/* ------------------------------------------------------------------ */

function median(arr) {
  const s = [...arr].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

const round2 = (v) => (v == null ? null : Math.round(v * 100) / 100);

await main();
