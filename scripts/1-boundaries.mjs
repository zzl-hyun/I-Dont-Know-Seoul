/**
 * 1-boundaries.mjs — 행정동 경계 준비
 *
 * 입력: data/raw/hangjeongdong_20260701.geojson  (전국 3,558개 행정동, 34MB)
 * 출력:
 *   public/dong.geojson         지도 렌더용 (547개, 위상보존 단순화)
 *   data/dist/dong-meta.json    동별 메타 (내부점 좌표, 면적, 자치구)
 *
 * 왜 mapshaper인가: 인접한 폴리곤을 각각 독립적으로 단순화하면(turf/simplify 등)
 * 경계선이 어긋나 동 사이에 틈과 겹침이 생긴다. mapshaper는 공유 아크를 함께
 * 단순화하므로 코로플레스 지도에서 틈이 생기지 않는다.
 *
 * 내부점(inner point)을 따로 뽑는 이유: 등급 아이콘을 찍을 위치가 필요한데
 * 단순 무게중심은 오목한 동/여러 조각으로 나뉜 동에서 폴리곤 바깥으로 벗어난다.
 * mapshaper의 `-points inner` 는 반드시 폴리곤 내부에 있는 점을 계산한다.
 */
import { mkdir, readFile, writeFile, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import mapshaper from "mapshaper";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(ROOT, "data/raw/hangjeongdong_20260701.geojson");
const OUT_GEO = join(ROOT, "public/dong.geojson");
const OUT_META = join(ROOT, "data/dist/dong-meta.json");

// 행정동 경계는 매년 바뀐다. 버전을 고정해두고, 바꿀 때는 의식적으로 바꾼다.
const BOUNDARY_VERSION = "20260701";

/**
 * 대상 지역. 서울 전체 + 신분당선 축의 경기 3개 시.
 *
 * 시도 코드 하나로 자르던 것을 시군구 화이트리스트로 바꿨다. 경기도를 통째로
 * 넣으면 560개 동이 더 붙어 번들이 2배가 되는데, 실제로 필요한 건 신분당선이
 * 지나는 축이기 때문이다.
 *
 * **용인 처인구(41461)는 일부러 뺐다.** 신분당선 역이 하나도 없고(동천·
 * 수지구청·성복·상현이 전부 수지구), 용인경전철이 지하철 그래프에 없어서
 * 13개 동이 전부 통근 불가로 나온다. 면적도 468km² 로 나머지 9개 구를 합친
 * 것보다 큰데 대부분 읍·면이라, 넣으면 개/km² 밀도 지표의 분포가 왜곡되고
 * 통합 상대평가라 서울 동들의 백분위까지 밀린다.
 */
const SEOUL_SIDO = "11";
const GYEONGGI_SGG = [
  "41111", "41113", "41115", "41117", // 수원 장안·권선·팔달·영통
  "41131", "41133", "41135",          // 성남 수정·중원·분당
  "41463", "41465",                   // 용인 기흥·수지 (처인 41461 제외)
];

/** mapshaper -filter 에 그대로 넣을 식 */
const AREA_FILTER =
  `sido === "${SEOUL_SIDO}" || ` +
  `[${GYEONGGI_SGG.map((c) => `"${c}"`).join(",")}].indexOf(String(adm_cd2).substr(0,5)) > -1`;

// EPSG:5179 (Korea 2000 / Unified CS). 면적을 m² 로 얻으려면 투영이 필요하다.
// WGS84 상태에서 계산하면 "제곱 도(degree²)"가 나와 아무 의미가 없다.
const KOREA_2000 =
  "+proj=tmerc +lat_0=38 +lon_0=127.5 +k=0.9996 +x_0=1000000 +y_0=2000000 +ellps=GRS80 +units=m +no_defs";

/**
 * 기하 단순화는 하지 않는다.
 *
 * 원본 34MB는 도형이 복잡해서가 아니라 좌표 소수점이 17자리라서 크다.
 * 실제 정점은 서울 전체 18,817개(평균 44점/동)로 이미 충분히 일반화되어 있다.
 * 여기서 더 단순화하면(6%면 평균 7점/동) 동 모양이 알아볼 수 없게 뭉개지는데,
 * 정밀도만 1e-5(≈1m)로 낮춰도 454KB / gzip 82KB라 아낄 이유가 없다.
 */
const COORD_PRECISION = 0.00001;

async function main() {
  await assertSourceExists();
  await mkdir(dirname(OUT_GEO), { recursive: true });
  await mkdir(dirname(OUT_META), { recursive: true });

  console.log("[1/3] 서울 필터 + 좌표 정밀도 축소...");
  await mapshaper.runCommands(
    [
      `-i "${SRC}"`,
      `-filter '${AREA_FILTER}'`,
      // 원본에 있을 수 있는 자기교차/슬리버를 정리한다.
      `-clean`,
      // 지도에 필요한 필드만 남긴다. 원본의 adm_cd/sgg 등은 메타 파일로 간다.
      `-filter-fields adm_cd2,adm_nm,sggnm`,
      // 1e-5 ≈ 약 1m. 그 이상은 화면에서 의미가 없고 용량만 먹는다.
      `-o "${OUT_GEO}" precision=${COORD_PRECISION} format=geojson`,
    ].join(" ")
  );

  console.log("[2/3] 내부점 + 면적 계산...");
  // 면적은 원본(단순화 전) 기준으로 계산한다. 단순화된 도형으로 면적을 재면
  // 밀도 지표(개/km²)에 미세한 왜곡이 들어간다.
  const metaJson = await mapshaper.applyCommands(
    [
      `-i "${SRC}"`,
      `-filter '${AREA_FILTER}'`,
      `-proj "${KOREA_2000}"`,
      `-each 'area_km2 = Math.round(this.area / 1e6 * 10000) / 10000'`,
      // inner: 반드시 폴리곤 내부에 떨어지는 대표점(아이콘 위치용)
      `-points inner`,
      // 대표점을 다시 경위도로 되돌린다.
      `-proj wgs84`,
      `-each 'lng = Math.round(this.x * 1e6) / 1e6, lat = Math.round(this.y * 1e6) / 1e6'`,
      `-filter-fields adm_cd2,adm_nm,sggnm,sgg,area_km2,lng,lat`,
      `-o out.json format=json`,
    ].join(" "),
    {}
  );

  // mapshaper는 출력 포맷에 따라 string 또는 Buffer를 준다. 둘 다 받는다.
  const out = metaJson["out.json"];
  const rows = JSON.parse(typeof out === "string" ? out : new TextDecoder().decode(out));

  console.log("[3/3] 검증 및 저장...");
  const meta = rows.map((r) => ({
    code: String(r.adm_cd2),
    // "서울특별시 종로구 사직동" → "종로구 사직동"
    // "경기도 성남시분당구 정자1동" → "성남시 분당구 정자1동"
    name: displayName(r.adm_nm),
    dong: String(r.adm_nm).split(" ").pop(), // "사직동" / "정자1동"
    gu: splitCity(r.sggnm), // "종로구" / "성남시 분당구"
    guCode: String(r.sgg),
    areaKm2: r.area_km2,
    lng: r.lng,
    lat: r.lat,
  }));

  verify(meta);

  await writeFile(
    OUT_META,
    JSON.stringify(
      {
        version: BOUNDARY_VERSION,
        source: "통계청 SGIS / vuski/admdongkor (CC BY 4.0)",
        generatedAt: new Date().toISOString(),
        count: meta.length,
        dongs: meta,
      },
      null,
      2
    ) + "\n"
  );

  const geoSize = (await stat(OUT_GEO)).size;
  const metaSize = (await stat(OUT_META)).size;
  console.log(`\n✓ ${meta.length}개 행정동`);
  console.log(`  ${OUT_GEO}  ${fmtKB(geoSize)}`);
  console.log(`  ${OUT_META}  ${fmtKB(metaSize)}`);
  console.log(`  자치구 ${new Set(meta.map((d) => d.gu)).size}개`);
}

/**
 * 원본의 시군구명은 서울이 "종로구" 인데 경기 특례시는 "성남시분당구" 처럼
 * 시와 구가 붙어 나온다. 그대로 두면 화면에 "성남시분당구 정자1동" 이 찍힌다.
 * 시와 구 사이를 띄워 "성남시 분당구" 로 만든다.
 */
function splitCity(sggnm) {
  return String(sggnm).replace(/^(.+?시)(.+구)$/, "$1 $2");
}

/** "경기도 성남시분당구 정자1동" → "성남시 분당구 정자1동" (시도명 제거) */
function displayName(admNm) {
  const parts = String(admNm).split(" ");
  const dong = parts.pop();
  const sgg = parts.pop(); // 시도명은 버린다
  return `${splitCity(sgg)} ${dong}`;
}

/** 조용히 틀리는 것을 막기 위한 방어. 여기서 걸리면 이후 전부가 잘못된다. */
function verify(meta) {
  const problems = [];

  // 서울 427 + 경기 3개 시 120 = 547. 경계 버전이 바뀌면 몇 개는 움직인다.
  if (meta.length < 520 || meta.length > 570) {
    problems.push(`행정동 수가 이상함: ${meta.length} (서울 427 + 경기 120 = 547 근처여야 함)`);
  }

  // 서울 25개 구 + 경기 9개 구(수원 4 · 성남 3 · 용인 2) = 34
  const guCount = new Set(meta.map((d) => d.gu)).size;
  if (guCount !== 34) {
    problems.push(`자치구 수가 34가 아님: ${guCount} — ${[...new Set(meta.map((d) => d.gu))].join(", ")}`);
  }

  // 처인구가 섞여 들어오면 밀도 지표가 통째로 왜곡된다. 코드로 못박아 막는다.
  const cheoin = meta.filter((d) => d.guCode === "41461");
  if (cheoin.length) {
    problems.push(`용인 처인구가 포함됨(${cheoin.length}개) — 의도적으로 제외한 지역이다`);
  }

  const dupes = meta.map((d) => d.code).filter((c, i, a) => a.indexOf(c) !== i);
  if (dupes.length) problems.push(`행정동 코드 중복: ${dupes.join(", ")}`);

  // 서울(북위 37.70)부터 수원 남단(37.20)까지, 강화 쪽 126.7 ~ 용인 동단 127.25
  const outOfBounds = meta.filter(
    (d) => d.lng < 126.7 || d.lng > 127.25 || d.lat < 37.15 || d.lat > 37.72
  );
  if (outOfBounds.length) {
    problems.push(
      `대표점이 대상 범위 밖: ${outOfBounds.map((d) => `${d.name}(${d.lng},${d.lat})`).join(", ")}`
    );
  }

  // 서울 최대는 20km² 대인데 경기는 성남 운중동 18 · 용인 기흥동 12 수준이라
  // 60km² 기준을 그대로 쓴다. 처인구를 뺐으므로 여기 걸리는 동이 없어야 한다.
  const badArea = meta.filter((d) => !(d.areaKm2 > 0) || d.areaKm2 > 60);
  if (badArea.length) {
    problems.push(`면적 이상: ${badArea.map((d) => `${d.name}=${d.areaKm2}km²`).join(", ")}`);
  }

  if (problems.length) {
    console.error("\n✗ 검증 실패:");
    for (const p of problems) console.error("  - " + p);
    process.exit(1);
  }

  const totalArea = meta.reduce((s, d) => s + d.areaKm2, 0);
  /*
   * 서울 605.2 + 수원 121.1 + 성남 141.7 + 용인 기흥 81.7·수지 42.2 = 약 992 km².
   * 여기서 크게 벗어나면 투영이나 필터가 잘못된 것이다 (처인구가 섞이면 +468).
   */
  const EXPECTED_AREA = 992;
  console.log(`  총면적 ${totalArea.toFixed(1)} km² (기대 약 ${EXPECTED_AREA} km²)`);
  if (Math.abs(totalArea - EXPECTED_AREA) > 50) {
    console.error(`✗ 총면적이 기대와 너무 다름 — 투영 설정이나 지역 필터를 의심할 것`);
    process.exit(1);
  }
}

async function assertSourceExists() {
  try {
    await stat(SRC);
  } catch {
    console.error(`✗ 원본 파일이 없습니다: ${SRC}`);
    console.error(`  다음 명령으로 받으세요:`);
    console.error(
      `  curl -L "https://raw.githubusercontent.com/vuski/admdongkor/master/ver${BOUNDARY_VERSION}/HangJeongDong_ver${BOUNDARY_VERSION}.geojson" -o "${SRC}"`
    );
    process.exit(1);
  }
}

const fmtKB = (b) => `${(b / 1024).toFixed(0)} KB`;

await main();
