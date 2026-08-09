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
 *   CCTV 밀도                         서울 열린데이터   SEOUL_OPEN_DATA_KEY 필요
 *   5대범죄 (자치구)                   서울 열린데이터   SEOUL_OPEN_DATA_KEY 필요
 *   원룸 환산월세                      국토부 실거래가   DATA_GO_KR_KEY 필요
 *
 * 키가 없는 지표는 null로 남기고 4-score.mjs 가 가중치를 재분배한다.
 * 즉 키 없이도 지금 당장 돌아가고, 키를 넣으면 그만큼 정확해진다.
 *
 * 환경변수는 .env 파일이나 셸에서 전달한다:
 *   SEOUL_OPEN_DATA_KEY=... DATA_GO_KR_KEY=... npm run data:metrics
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { haversineM, pointInGeometry, bbox } from "./lib/geo.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
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
      { store: 0, food: 0, medical: 0, nightlife: 0, cctv: 0 },
    ])
  );

  /* ---- 1. OSM POI (키 불필요) ---- */
  console.log("\n[1/4] OSM POI 수집...");
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
  console.log("\n[2/4] 최근접 지하철역 도보시간...");
  const walkMin = new Map();
  for (const d of dongs) {
    let best = Infinity;
    for (const s of graph.stations) {
      const dist = haversineM(d.lat, d.lng, s.lat, s.lng);
      if (dist < best) best = dist;
    }
    // src/lib/constants.ts 와 동일한 보정: 직선거리 × 1.3 ÷ 67 m/분
    walkMin.set(d.code, (best * 1.3) / 67);
  }
  const walkVals = [...walkMin.values()].sort((a, b) => a - b);
  console.log(`  중앙값 ${walkVals[Math.floor(walkVals.length / 2)].toFixed(1)}분 · 최대 ${walkVals.at(-1).toFixed(1)}분`);

  /* ---- 3. CCTV (서울 열린데이터, 키 필요) ---- */
  console.log("\n[3/4] CCTV 밀도...");
  const seoulKey = process.env.SEOUL_OPEN_DATA_KEY;
  let cctvOk = false;
  if (seoulKey) {
    try {
      const points = await fetchSeoulCctv(seoulKey);
      for (const { lat, lng } of points) {
        const code = index.lookup(lng, lat);
        if (code) counts.get(code).cctv++;
      }
      cctvOk = true;
      console.log(`  CCTV ${points.length.toLocaleString()}대 배정`);
    } catch (err) {
      console.log(`  건너뜀 — ${err.message}`);
    }
  } else {
    console.log("  건너뜀 — SEOUL_OPEN_DATA_KEY 없음");
  }

  /* ---- 4. 원룸 환산월세 (국토부, 키 필요) ---- */
  console.log("\n[4/4] 원룸 환산월세...");
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
      cctvPerKm2: cctvOk ? round2(c.cctv / area) : null,
      crimePer1k: null, // 자치구 단위 — 키가 생기면 여기에 채운다
      monthlyRentMan: r?.median ?? null,
      rentSamples: r?.samples ?? 0,
      walkToStationMin: round2(walkMin.get(d.code)),
    };
  });

  const available = ["storePerKm2", "foodPerKm2", "medicalPerKm2", "nightlifePerKm2", "walkToStationMin"];
  const missing = [];
  if (!cctvOk) missing.push("cctvPerKm2");
  if (rent.size === 0) missing.push("monthlyRentMan");
  missing.push("crimePer1k");
  if (cctvOk) available.push("cctvPerKm2");
  if (rent.size > 0) available.push("monthlyRentMan");

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

/* ---- 서울 열린데이터광장: 안심이 CCTV ---- */

async function fetchSeoulCctv(key) {
  const points = [];
  const PAGE = 1000;
  for (let start = 1; start <= 20000; start += PAGE) {
    const url = `http://openapi.seoul.go.kr:8088/${key}/json/safeOpenCCTV/${start}/${start + PAGE - 1}/`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`서울 열린데이터 HTTP ${res.status}`);
    const data = await res.json();
    const body = data.safeOpenCCTV;
    if (!body?.row?.length) break;
    for (const row of body.row) {
      const lat = Number(row.WGSXPT ?? row.LATITUDE ?? row.Y_COORD);
      const lng = Number(row.WGSYPT ?? row.LONGITUDE ?? row.X_COORD);
      // 서울 범위 안의 값만 받는다 (컬럼명이 데이터셋 개정마다 바뀐다)
      if (lat > 37.4 && lat < 37.72 && lng > 126.7 && lng < 127.25) {
        points.push({ lat, lng });
      } else if (lng > 37.4 && lng < 37.72 && lat > 126.7 && lat < 127.25) {
        points.push({ lat: lng, lng: lat }); // 위경도가 뒤바뀐 경우
      }
    }
    if (body.row.length < PAGE) break;
  }
  if (points.length === 0) throw new Error("좌표를 해석하지 못했습니다 (컬럼명 변경 가능성)");
  return points;
}

/* ---- 국토교통부: 단독/다가구 + 오피스텔 전월세 실거래가 ---- */

/**
 * 전월세 → 환산월세.
 * 보증금을 전월세전환율로 월세 환산해 더한다. 서울 기준 약 5.5%.
 */
const CONVERSION_RATE = 0.055;
const toMonthly = (depositMan, monthlyMan) =>
  monthlyMan + (depositMan * CONVERSION_RATE) / 12;

async function fetchRent(key, dongs) {
  // 국토부 API는 **법정동** 기준이라 행정동으로 바로 못 붙인다.
  // 자치구(5자리 코드) 단위로 받아 동 이름으로 매칭하고, 못 붙인 건은
  // 자치구 중앙값으로 대체한다 (4-score.mjs 에서 dataQuality=low 로 표시).
  const guCodes = [...new Set(dongs.map((d) => d.guCode))];
  const now = new Date();
  const months = [];
  for (let i = 1; i <= 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(`${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}`);
  }

  const ENDPOINTS = [
    "https://apis.data.go.kr/1613000/RTMSDataSvcSHRent/getRTMSDataSvcSHRent",
    "https://apis.data.go.kr/1613000/RTMSDataSvcOffiRent/getRTMSDataSvcOffiRent",
  ];

  /** guCode → 법정동명 → 환산월세 배열 */
  const byGuDong = new Map();
  let calls = 0;

  for (const gu of guCodes) {
    for (const ym of months) {
      for (const ep of ENDPOINTS) {
        const url = `${ep}?serviceKey=${encodeURIComponent(key)}&LAWD_CD=${gu}&DEAL_YMD=${ym}&numOfRows=1000&pageNo=1&_type=json`;
        const res = await fetch(url);
        calls++;
        if (!res.ok) continue;
        const text = await res.text();
        let items;
        try {
          items = JSON.parse(text)?.response?.body?.items?.item ?? [];
        } catch {
          continue; // XML 오류 응답 (키 미승인 등)
        }
        for (const it of [].concat(items)) {
          const area = Number(String(it.excluUseAr ?? it.totalFloorAr ?? 0));
          // 원룸/1.5룸 범위만 (전용 20~40㎡)
          if (!(area >= 20 && area <= 40)) continue;
          const deposit = Number(String(it.deposit ?? "0").replace(/,/g, ""));
          const monthly = Number(String(it.monthlyRent ?? "0").replace(/,/g, ""));
          if (monthly <= 0) continue; // 순수 전세는 제외
          const dongName = String(it.umdNm ?? "").trim();
          if (!dongName) continue;
          const k = `${gu}|${dongName}`;
          if (!byGuDong.has(k)) byGuDong.set(k, []);
          byGuDong.get(k).push(toMonthly(deposit, monthly));
        }
      }
    }
    process.stdout.write(`\r  실거래 조회 ${gu} (${calls} calls)   `);
  }
  process.stdout.write("\n");

  // 법정동명 → 행정동 매칭. 행정동명이 법정동명으로 시작하면 같은 계열로 본다
  // (예: 법정동 "신림동" → 행정동 "신림동","서원동"... 은 못 붙지만
  //  법정동 "봉천동" → 행정동 "은천동" 등도 마찬가지. 이름이 일치하는 것만 붙인다)
  const out = new Map();
  for (const d of dongs) {
    const exact = byGuDong.get(`${d.guCode}|${d.dong}`);
    if (exact && exact.length >= 5) {
      out.set(d.code, { median: round2(median(exact)), samples: exact.length });
    }
  }

  // 못 붙은 동은 자치구 중앙값으로 채운다
  const byGu = new Map();
  for (const [k, arr] of byGuDong) {
    const gu = k.split("|")[0];
    if (!byGu.has(gu)) byGu.set(gu, []);
    byGu.get(gu).push(...arr);
  }
  for (const d of dongs) {
    if (out.has(d.code)) continue;
    const arr = byGu.get(d.guCode);
    if (arr?.length >= 5) {
      out.set(d.code, { median: round2(median(arr)), samples: 0 }); // samples 0 = 대체값
    }
  }

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
