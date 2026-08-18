/**
 * 전월세전환율 실측 — 한국부동산원(R-ONE) 공표 통계에서 유형·지역별 연 전환율을
 * 뽑는다. 파이프라인이 아니라 `calibrate-walk.mjs` 와 같은 성격의 일회성
 * 측정이다. **결과를 자동으로 반영하지 않는다** — 사람이 읽고
 * `scripts/lib/rent.mjs` 의 `RENT_CONVERSION_RATE` 에 옮겨 적는다.
 *
 * 자동 반영하지 않는 이유는 `WALK_DETOUR_FACTOR` 와 같다: 계수가 바뀌면 환산월세
 * 분포가 통째로 움직여 556개 동의 가격 백분위와 등급이 재배치된다. 파이프라인이
 * 매번 외부 API 값을 집어오면 같은 커밋에서 같은 산출물이 안 나온다.
 *
 *   npm run data:calibrate-rent-conversion
 *
 * 왜 필요한가: 원래 전국 단일 5.5% 를 썼는데 근거가 어디에도 없었다. 실측하니
 * 유형·지역별로 4.6~8.1% 로 흩어져 있고, 특히 **경기가 서울보다 뚜렷하게 높다**
 * (단독주택 8.1% 대 6.6%). 단일 상수를 쓰면 경기 환산월세가 체계적으로
 * 과소평가되는데, 서울과 경기를 한 상대 척도에 올려 비교하는 이 앱에서는
 * 단순 오차가 아니라 지역 간 편향이다.
 *
 * 집계 구간은 우리 실거래 수집 구간(2023-01~2025-12)과 맞춘다. "지금 시세"가
 * 아니라 "우리가 환산하려는 그 계약들이 맺어지던 시기"의 전환율이어야 내부
 * 정합성이 맞기 때문이다.
 *
 * 한계: 한국부동산원은 단독주택·연립다세대·오피스텔을 **시도까지만** 공표한다.
 * 아파트만 시군구 단위가 있어서 그것만 구별로 쓴다. 규모별 표도 있지만
 * (`규모별 전월세 전환율_*`) 시도 단위라, 우리가 고치려는 지역 편향과 상충해서
 * 안 쓴다 — 즉 소형 평형 보정은 미반영이다.
 */
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { RENT_TYPES } from "./lib/rent.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const R_ONE_URL = "https://www.reb.or.kr/r-one/openapi/SttsApiTblData.do";
const PAGE_SIZE = 1000;
/** 실거래 수집 구간과 맞춘다 (scripts/lib/seoul-rent.mjs 의 SEOUL_RENT_*_DATE). */
const START = "202301";
const END = "202512";

/**
 * 유형별 통계표. 오피스텔만 2024-01 을 기준으로 표가 갈려 둘을 이어 붙인다.
 * `groupIsRegion` 인 표는 지역이 GRP_*, 규모가 CLS_* 에 들어간다.
 */
const TABLES = {
  house: [{ id: "A_2024_00158" }],
  rowhouse: [{ id: "A_2024_00157" }],
  apartment: [{ id: "A_2024_00156" }],
  officetel: [
    { id: "A_2024_00634", groupIsRegion: true, sizeClass: "40㎡이하" },
    { id: "T241163133546529", groupIsRegion: true, sizeClass: "40㎡이하" },
  ],
};

/**
 * R-ONE 지역명 → 우리 guCode.
 *
 * 서울 자치구는 번들의 `gu`/`guCode` 에서 그대로 끌어온다 — 25개를 손으로
 * 적으면 우리 데이터와 어긋날 여지가 생긴다. 경기는 R-ONE 표기가 우리
 * `gu`("성남시 분당구")와 계층이 달라("경기>성남시>분당구") 손으로 잇는다.
 * 화성시는 R-ONE 에 구 구분이 없어 시 값을 동탄구에 쓴다.
 */
const GYEONGGI_GU_BY_R_ONE_NAME = {
  "경기>수원시>장안구": "41111",
  "경기>수원시>권선구": "41113",
  "경기>수원시>팔달구": "41115",
  "경기>수원시>영통구": "41117",
  "경기>성남시>수정구": "41131",
  "경기>성남시>중원구": "41133",
  "경기>성남시>분당구": "41135",
  "경기>용인시>기흥구": "41463",
  "경기>용인시>수지구": "41465",
  "경기>화성시": "41597",
};

/** 번들에서 "서울>강남구" 같은 R-ONE 표기 → guCode 를 만든다. */
async function seoulGuByROneName() {
  const bundle = JSON.parse(await readFile(join(ROOT, "public/data/bundle.json"), "utf8"));
  const out = {};
  for (const dong of bundle.dongs) {
    if (!dong.guCode.startsWith("11")) continue;
    out[`서울>${dong.gu}`] = dong.guCode;
  }
  return out;
}

async function fetchTable({ id, groupIsRegion = false, sizeClass = null }) {
  const key = process.env.REB_API_KEY;
  const rows = [];
  for (let pIndex = 1; ; pIndex++) {
    const url =
      `${R_ONE_URL}?STATBL_ID=${id}&DTACYCLE_CD=MM&Type=json` +
      `&START_WRTTIME=${START}&END_WRTTIME=${END}` +
      `&pIndex=${pIndex}&pSize=${PAGE_SIZE}${key ? `&Key=${encodeURIComponent(key)}` : ""}`;
    const payload = await (await fetch(url)).json();
    if (payload?.RESULT?.CODE && payload.RESULT.CODE !== "INFO-000") {
      throw new Error(`R-ONE ${id} 오류 ${payload.RESULT.CODE}: ${payload.RESULT.MESSAGE}`);
    }
    const page = payload?.SttsApiTblData?.[1]?.row ?? [];
    for (const row of page) {
      if (sizeClass && String(row.CLS_NM ?? "").trim() !== sizeClass) continue;
      const region = String((groupIsRegion ? row.GRP_FULLNM : row.CLS_FULLNM) ?? "").trim();
      const value = Number(row.DTA_VAL);
      // 표본이 없는 달은 0 으로 내려온다. 평균에 넣으면 전환율이 통째로 눌린다.
      if (!region || !Number.isFinite(value) || value <= 0) continue;
      rows.push({ region, value });
    }
    if (page.length < PAGE_SIZE) break;
  }
  return rows;
}

const mean = (values) => values.reduce((a, b) => a + b, 0) / values.length;

async function main() {
  if (!process.env.REB_API_KEY) {
    console.warn("REB_API_KEY 가 없습니다 — R-ONE 이 응답을 5건으로 조용히 자릅니다.\n");
  }

  const guByROneName = { ...GYEONGGI_GU_BY_R_ONE_NAME, ...(await seoulGuByROneName()) };

  const result = {};
  for (const type of RENT_TYPES) {
    const rows = [];
    for (const table of TABLES[type]) rows.push(...(await fetchTable(table)));

    const byRegion = new Map();
    for (const { region, value } of rows) {
      if (!byRegion.has(region)) byRegion.set(region, []);
      byRegion.get(region).push(value);
    }

    const rates = {};
    const put = (code, region) => {
      const values = byRegion.get(region);
      if (values?.length) rates[code] = Number((mean(values) / 100).toFixed(4));
    };
    put("11", "서울");
    put("41", "경기");
    // 아파트만 시군구 단위가 공표된다.
    if (type === "apartment") {
      for (const [region, code] of Object.entries(guByROneName)) put(code, region);
    }
    result[type] = Object.fromEntries(Object.entries(rates).sort(([a], [b]) => a.localeCompare(b)));
  }

  console.log(`전월세전환율 실측 (${START}~${END} 평균, 한국부동산원)\n`);
  for (const type of RENT_TYPES) {
    const rates = result[type];
    const seoul = rates["11"];
    const gyeonggi = rates["41"];
    console.log(
      `${type.padEnd(10)} 서울 ${(seoul * 100).toFixed(2)}%  경기 ${(gyeonggi * 100).toFixed(2)}%` +
        (type === "apartment" ? `  (+ 시군구 ${Object.keys(rates).length - 2}개)` : "  (시도 단위만 공표)")
    );
  }

  console.log("\n─────── scripts/lib/rent.mjs 에 옮겨 적을 값 ───────\n");
  console.log(JSON.stringify(result, null, 2));
}

await main();
